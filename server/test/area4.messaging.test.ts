import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { auth, covers, createGroup, createUser, db, getApp, tokenFor, redis, sentMails, sentWhatsApps } from './helpers.js';
import { sendMail } from '../src/mail.js';
import { isOnWhatsApp } from '../src/whatsapp.js';
import { deliver, drainQueue, htmlToPlainText } from '../src/messaging.js';
import { reportTick, runReports } from '../src/reports.js';

covers('POST /admin/outbound/:id/resend', 'GET /admin/whatsapp/status', 'POST /admin/whatsapp/connect',
  'POST /admin/whatsapp/disconnect', 'POST /admin/reports/run');

// Controllable WhatsApp state; no real Baileys socket in tests.
const wa = vi.hoisted(() => ({ status: 'disconnected' as 'connected' | 'disconnected' }));
vi.mock('../src/whatsapp.js', async (orig) => {
  const { sentWhatsApps } = await import('./setup.js');
  return {
    ...(await orig<typeof import('../src/whatsapp.js')>()),
    getStatus: () => ({ status: wa.status }),
    connect: vi.fn(async () => { wa.status = 'connected'; }),
    disconnect: vi.fn(async () => { wa.status = 'disconnected'; }),
    sendWhatsApp: vi.fn(async (to: string, text: string) => { sentWhatsApps.push({ to, text }); }),
    isOnWhatsApp: vi.fn(async () => true),
  };
});

const outbound = async (userId: string) =>
  (await db.query('select * from outbound_messages where user_id = $1 order by id', [userId])).rows;

beforeEach(async () => {
  wa.status = 'connected';
  await redis.del('outbound:queue', 'outbound:retry');
  sentMails.length = 0;
  sentWhatsApps.length = 0;
});
afterEach(() => { vi.useRealTimers(); });

describe('deliver', () => {
  test('email + WhatsApp for an allowed kind and opted-in E.164 phone', async () => {
    const u = await createUser({ phone_e164: '+923001234567' });
    await deliver({ userId: u.id, email: u.email, kind: 'expense', subject: 'New expense', html: '<p>Rent <b>100</b></p>' });
    await drainQueue();
    expect(sentMails.filter((m) => m.to === u.email)).toHaveLength(1);
    expect(sentWhatsApps).toEqual([{ to: '+923001234567', text: '*New expense*\n\nRent *100*' }]);
    expect((await outbound(u.id)).map((m) => [m.channel, m.status])).toEqual([['email', 'sent'], ['whatsapp', 'sent']]);
  });

  test('WhatsApp skipped for phone_needs_country, opt-out, email-only kinds, and when disconnected', async () => {
    const legacy = await createUser({ phone_e164: '+923001111111' });
    await db.query('update profiles set phone_needs_country = true where id = $1', [legacy.id]);
    const optOut = await createUser({ phone_e164: '+923002222222' });
    await db.query('update profiles set whatsapp_opt_in = false where id = $1', [optOut.id]);
    const otp = await createUser({ phone_e164: '+923003333333' });
    const off = await createUser({ phone_e164: '+923004444444' });
    for (const u of [legacy, optOut]) await deliver({ userId: u.id, email: u.email, kind: 'expense', subject: 's', html: 'h' });
    await deliver({ userId: otp.id, email: otp.email, kind: 'otp', subject: 's', html: 'h' });
    wa.status = 'disconnected';
    await deliver({ userId: off.id, email: off.email, kind: 'expense', subject: 's', html: 'h' });
    await drainQueue();
    expect(sentWhatsApps).toEqual([]);
    for (const u of [legacy, optOut, otp, off]) expect((await outbound(u.id)).map((m) => m.channel)).toEqual(['email']);
  });

  test('number not on WhatsApp is marked failed without retry', async () => {
    const u = await createUser({ phone_e164: '+923005555555' });
    vi.mocked(isOnWhatsApp).mockResolvedValueOnce(false);
    await deliver({ userId: u.id, email: u.email, kind: 'invitation', subject: 's', html: 'h' });
    await drainQueue();
    const wam = (await outbound(u.id)).find((m) => m.channel === 'whatsapp');
    expect(wam).toMatchObject({ status: 'failed', attempts: 1, last_error: 'not on WhatsApp' });
    expect(await redis.zcard('outbound:retry')).toBe(0);
  });
});

describe('retries', () => {
  test('1m / 10m / 1h backoff, then failed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const u = await createUser();
    vi.mocked(sendMail).mockRejectedValue(new Error('smtp down'));
    try {
      await deliver({ userId: u.id, email: u.email, kind: 'otp', subject: 's', html: 'h' });
      await drainQueue();
      expect((await outbound(u.id))[0]).toMatchObject({ status: 'queued', attempts: 1, last_error: 'smtp down' });
      const step = async (ms: number, attempts: number) => {
        vi.advanceTimersByTime(ms - 1000);
        await drainQueue(); // not due yet
        expect((await outbound(u.id))[0].attempts).toBe(attempts - 1);
        vi.advanceTimersByTime(1000);
        await drainQueue();
        expect((await outbound(u.id))[0].attempts).toBe(attempts);
      };
      await step(60_000, 2);
      await step(600_000, 3);
      await step(3_600_000, 4);
      expect((await outbound(u.id))[0].status).toBe('failed');
      expect(await redis.zcard('outbound:retry')).toBe(0);
    } finally {
      vi.mocked(sendMail).mockReset();
      vi.mocked(sendMail).mockImplementation(async (to: string, subject: string, html: string) => { sentMails.push({ to, subject, html }); });
    }
  });

  test('succeeds on a later retry', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const u = await createUser();
    vi.mocked(sendMail).mockRejectedValueOnce(new Error('blip'));
    await deliver({ userId: u.id, email: u.email, kind: 'otp', subject: 's', html: 'h' });
    await drainQueue();
    vi.advanceTimersByTime(60_000);
    await drainQueue();
    expect((await outbound(u.id))[0]).toMatchObject({ status: 'sent', attempts: 2, last_error: null });
  });
});

describe('reports', () => {
  // Thu 2026-10-29 / Fri 2026-10-30, 21:00 UTC (defaults: REPORT_TZ=UTC, DAILY_REPORT_HOUR=21, WEEKLY_REPORT_DAY=5).
  const THU = new Date('2026-10-29T21:00:00Z');
  const FRI = new Date('2026-10-30T21:00:00Z');

  async function withExpense(at: Date) {
    const a = await createUser({ phone_e164: '+923006666666' }), b = await createUser();
    const g = await createGroup(a, [b]);
    const { rows: [e] } = await db.query(
      `insert into expenses (group_id, description, amount, paid_by, created_at) values ($1, 'Rent', 100, $2, $3) returning id`, [g, a.id, at]);
    await db.query('insert into expense_splits (expense_id, user_id, amount) values ($1, $2, 50), ($1, $3, 50)', [e.id, a.id, b.id]);
    return { a, b };
  }

  test('daily skipped when no activity, sent when there is', async () => {
    const idle = await createUser();
    await createGroup(idle);
    const { a } = await withExpense(new Date(THU.getTime() - 3_600_000));
    await runReports('daily', THU);
    expect(await outbound(idle.id)).toEqual([]);
    const [m] = await outbound(a.id);
    expect(m).toMatchObject({ subject: 'Your daily expense summary', kind: 'daily_report' });
    expect(m.body).toContain('<b>₹50.00</b>');
    // Manual run from the admin panel (force) still reaches the idle user.
    await runReports('daily', THU, true);
    expect((await outbound(idle.id)).map((x) => x.kind)).toContain('daily_report');
    // One user only: nobody else gets one.
    const before = (await outbound(a.id)).length;
    expect(await runReports('daily', THU, true, idle.id)).toEqual({ sent: 1 });
    expect((await outbound(a.id)).length).toBe(before);
  });

  test('reportTick: daily on other days, weekly on WEEKLY_REPORT_DAY, nothing off-hour', async () => {
    const { a } = await withExpense(new Date(THU.getTime() - 3_600_000));
    expect(await reportTick(new Date('2026-10-29T20:00:00Z'))).toBeNull();
    expect(await reportTick(THU)).toBe('daily');
    expect(await reportTick(FRI)).toBe('weekly');
    const emails = (await outbound(a.id)).filter((m) => m.channel === 'email');
    expect(emails.map((m) => m.subject)).toEqual(['Your daily expense summary', 'Your weekly expense report']);
    expect(emails[1].body).toContain('By category');
  });

  test('Redis lock prevents a duplicate run for the same day', async () => {
    const at = new Date('2026-11-02T21:00:00Z');
    const { a } = await withExpense(new Date(at.getTime() - 3_600_000));
    const results = await Promise.all([reportTick(at), reportTick(at), reportTick(new Date(at.getTime() + 1_800_000))]);
    expect(results.filter(Boolean)).toEqual(['daily']);
    expect((await outbound(a.id)).filter((m) => m.channel === 'email')).toHaveLength(1);
  });

  // Bug: reports deliver kind 'daily_report'/'weekly_report' but messaging WA_KINDS has 'daily'/'weekly'.
  test('daily report also goes to WhatsApp for an opted-in phone', async () => {
    const at = new Date('2026-11-03T21:00:00Z');
    const { a } = await withExpense(new Date(at.getTime() - 3_600_000));
    await runReports('daily', at);
    const wa = (await outbound(a.id)).find((m) => m.channel === 'whatsapp');
    // Hand-written chat text, not the converted email (no table pipes, no footer).
    expect(wa?.body).toContain('📊 *Daily summary*');
    expect(wa?.body).toContain('💰 *Balances*');
    expect(wa?.body).not.toContain('|');
    expect(wa?.body).not.toContain('turn these reports off');
    if (process.env.SHOW_WA) console.log(wa?.body);
  });

  test('weekly report WhatsApp text', async () => {
    const at = new Date('2026-11-06T21:00:00Z');
    const { a } = await withExpense(new Date(at.getTime() - 3_600_000));
    await runReports('weekly', at);
    const wa = (await outbound(a.id)).find((m) => m.channel === 'whatsapp' && m.kind === 'weekly_report');
    expect(wa?.body).toContain('📅 *Weekly report*');
    expect(wa?.body).toContain('*By category*');
    if (process.env.SHOW_WA) console.log(wa?.body);
  });
});

describe('admin routes', () => {
  // Only admin@test.local is listed; other files may have created it already.
  const getAdmin = async () => {
    const { rows: [u] } = await db.query(`select id, email from users where email = 'admin@test.local'`);
    return u ? { token: await tokenFor(u, { adm: true }) } : createUser({ email: 'admin@test.local', adm: true });
  };

  test('auth required', async () => {
    const app = await getApp();
    const u = await createUser();
    for (const [method, url] of [['POST', '/admin/outbound/1/resend'], ['GET', '/admin/whatsapp/status'], ['POST', '/admin/whatsapp/connect'],
      ['POST', '/admin/whatsapp/disconnect'], ['POST', '/admin/reports/run?type=daily']] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401);
      expect([401, 403]).toContain((await app.inject({ method, url, headers: auth(u) })).statusCode);
    }
  });

  test('whatsapp status / connect / disconnect', async () => {
    const app = await getApp();
    const admin = await getAdmin();
    wa.status = 'disconnected';
    expect((await app.inject({ method: 'GET', url: '/admin/whatsapp/status', headers: auth(admin) })).json()).toEqual({ status: 'disconnected' });
    expect((await app.inject({ method: 'POST', url: '/admin/whatsapp/connect', headers: auth(admin) })).json()).toEqual({ status: 'connected' });
    expect((await app.inject({ method: 'POST', url: '/admin/whatsapp/disconnect', headers: auth(admin) })).json()).toEqual({ status: 'disconnected' });
  });

  test('resend requeues a failed message', async () => {
    const app = await getApp();
    const admin = await getAdmin();
    const u = await createUser();
    const { rows: [m] } = await db.query(
      `insert into outbound_messages (channel, to_addr, subject, body, kind, user_id, status, attempts, last_error)
       values ('email', $1, 's', 'h', 'otp', $2, 'failed', 4, 'x') returning id`, [u.email, u.id]);
    expect((await app.inject({ method: 'POST', url: '/admin/outbound/abc/resend', headers: auth(admin) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/admin/outbound/999999999/resend', headers: auth(admin) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/admin/outbound/${m.id}/resend`, headers: auth(admin) })).json()).toEqual({ ok: true });
    await drainQueue();
    expect((await outbound(u.id))[0]).toMatchObject({ status: 'sent', attempts: 1, last_error: null });
  });

  test('reports/run validates type and runs', async () => {
    const app = await getApp();
    const admin = await getAdmin();
    expect((await app.inject({ method: 'POST', url: '/admin/reports/run?type=monthly', headers: auth(admin) })).statusCode).toBe(400);
    const r = await app.inject({ method: 'POST', url: '/admin/reports/run?type=weekly', headers: auth(admin) });
    expect(r.statusCode).toBe(200);
    expect(typeof r.json().sent).toBe('number');
  });
});

test('WhatsApp text keeps links from email buttons', () => {
  const text = htmlToPlainText('<p>Join us</p><p><a href="https://x.io/signup?email=a%40b.c" style="color:#fff"><b>Sign up</b></a><a href="https://x.io/login">Log in</a></p>');
  expect(text).toContain('Sign up: https://x.io/signup?email=a%40b.c');
  expect(text).toContain('Log in: https://x.io/login');
});
