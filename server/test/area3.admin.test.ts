import { beforeAll, describe, expect, test, vi } from 'vitest';
import { auth, covers, createGroup, createUser, db, flushAuditLogs, getApp, type TestUser } from './helpers.js';

covers(
  'GET /admin/stats', 'POST /admin/users', 'POST /admin/users/:id/delete', 'DELETE /admin/users/:id',
  'POST /admin/expenses', 'PATCH /admin/expenses/:id', 'POST /admin/chats/:id/messages', 'PATCH /admin/messages/:id',
  'POST /admin/outbound/:id/resend', 'GET /admin/whatsapp/status', 'POST /admin/whatsapp/connect', 'POST /admin/whatsapp/disconnect',
  'POST /admin/reports/run', 'GET /admin/:resource', 'GET /admin/:resource/:id', 'POST /admin/:resource',
  'PATCH /admin/:resource/:id', 'DELETE /admin/:resource/:id',
);

// No real WhatsApp socket in tests.
vi.mock('../src/whatsapp.js', async (orig) => {
  const m = await orig<typeof import('../src/whatsapp.js')>();
  let status: any = { status: 'disconnected' };
  return {
    ...m,
    getStatus: () => status,
    connect: vi.fn(async () => { status = { status: 'connecting' }; }),
    disconnect: vi.fn(async () => { status = { status: 'disconnected' }; }),
    sendWhatsApp: vi.fn(async () => {}),
    isOnWhatsApp: vi.fn(async () => true),
  };
});

const ADMIN = 'area3-admin@test.local';
const Z = '00000000-0000-4000-8000-000000000000';
let admin: TestUser, adminNoClaim: TestUser, user: TestUser;

beforeAll(async () => {
  process.env.SUPER_ADMIN_EMAILS = `admin@test.local,${ADMIN}`;
  admin = await createUser({ email: ADMIN, adm: true });
  adminNoClaim = { ...admin, token: (await getApp()).jwt.sign({ sub: admin.id, email: admin.email }, { expiresIn: '15m' }) };
  user = await createUser({ adm: true }); // adm claim but not listed
});

const call = async (method: string, url: string, who?: TestUser, payload?: unknown) =>
  (await getApp()).inject({ method: method as any, url, headers: who ? auth(who) : {}, payload: payload as any });

const routes: [string, string][] = [
  ['GET', '/admin/stats'], ['POST', '/admin/users'], ['POST', `/admin/users/${Z}/delete`], ['DELETE', `/admin/users/${Z}`],
  ['POST', '/admin/expenses'], ['PATCH', `/admin/expenses/${Z}`], ['POST', `/admin/chats/${Z}/messages`], ['PATCH', `/admin/messages/${Z}`],
  ['POST', '/admin/outbound/1/resend'], ['GET', '/admin/whatsapp/status'], ['POST', '/admin/whatsapp/connect'],
  ['POST', '/admin/whatsapp/disconnect'], ['POST', '/admin/reports/run?type=daily'], ['GET', '/admin/hotels'],
  ['GET', `/admin/hotels/${Z}`], ['POST', '/admin/hotels'], ['PATCH', `/admin/hotels/${Z}`], ['DELETE', `/admin/hotels/${Z}`],
];

describe('admin auth gate', () => {
  test.each(routes)('%s %s: 401 / 403 / 403', async (method, url) => {
    expect((await call(method, url, undefined, {})).statusCode).toBe(401);
    expect((await call(method, url, { token: 'garbage' } as TestUser, {})).statusCode).toBe(401);
    expect((await call(method, url, user, {})).statusCode).toBe(403); // not listed
    expect((await call(method, url, adminNoClaim, {})).statusCode).toBe(403); // listed, no adm claim
  });
  test('removing the email from the list revokes immediately', async () => {
    const prev = process.env.SUPER_ADMIN_EMAILS;
    process.env.SUPER_ADMIN_EMAILS = 'admin@test.local';
    expect((await call('GET', '/admin/stats', admin)).statusCode).toBe(403);
    process.env.SUPER_ADMIN_EMAILS = prev;
    expect((await call('GET', '/admin/stats', admin)).statusCode).toBe(200);
  });
});

describe('admin routes', () => {
  test('stats', async () => {
    const r = await call('GET', '/admin/stats', admin);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ users: expect.any(Number), whatsapp: { status: expect.any(String) }, logs: expect.any(Array) });
  });

  test('users: create, validate, delete (both forms) anonymises', async () => {
    expect((await call('POST', '/admin/users', admin, { email: 'nope', password: 'x' })).statusCode).toBe(400);
    const c = await call('POST', '/admin/users', admin, { email: 'Made@Test.Local', password: 'secret123', full_name: 'Made' });
    expect(c.statusCode).toBe(201);
    const made = c.json();
    expect(made).toMatchObject({ email: 'made@test.local', full_name: 'Made' });
    expect(made.push_token).toBeUndefined();
    expect((await call('POST', '/admin/users', admin, { email: 'made@test.local', password: 'secret123' })).statusCode).toBe(400); // dup

    expect((await call('POST', '/admin/users/not-a-uuid/delete', admin)).statusCode).toBe(400);
    expect((await call('POST', `/admin/users/${Z}/delete`, admin)).statusCode).toBe(404);
    expect((await call('POST', `/admin/users/${made.id}/delete`, admin)).statusCode).toBe(200);
    const { rows: [p] } = await db.query('select email from profiles where id = $1', [made.id]);
    expect(p?.email ?? null).not.toBe('made@test.local');

    const other = await createUser();
    expect((await call('DELETE', `/admin/users/${other.id}`, admin)).statusCode).toBe(200);
    await flushAuditLogs();
    const { rows: snaps } = await db.query(`select request from audit_logs where route = 'snapshot' and message like $1`, [`%${other.id}%`]);
    expect(snaps[0].request.email).toBe(other.email);
  });

  test('expenses: create + patch with split validation and notify', async () => {
    const m = await createUser();
    const g = await createGroup(admin, [m]);
    const base = { group_id: g, description: 'Dinner', paid_by: admin.id, split_type: 'equal' };
    expect((await call('POST', '/admin/expenses', admin, { ...base, amount: 10 })).statusCode).toBe(400); // no splits
    expect((await call('POST', '/admin/expenses', admin, {
      ...base, amount: 10, splits: [{ user_id: admin.id, amount: 3 }, { user_id: m.id, amount: 3 }] })).statusCode).toBe(400); // sum
    const outsider = await createUser();
    expect((await call('POST', '/admin/expenses', admin, {
      ...base, amount: 10, splits: [{ user_id: outsider.id, amount: 10 }] })).statusCode).toBe(400);
    const c = await call('POST', '/admin/expenses?notify=true', admin, {
      ...base, amount: 10, splits: [{ user_id: admin.id, amount: 5 }, { user_id: m.id, amount: 5 }] });
    expect(c.statusCode).toBe(201);
    const e = c.json();
    const { rows: notes } = await db.query(`select 1 from notifications where user_id = $1 and type = 'admin_update'`, [m.id]);
    expect(notes.length).toBe(1);

    expect((await call('PATCH', `/admin/expenses/${e.id}`, admin, { amount: 20 })).statusCode).toBe(400); // splits no longer sum
    expect((await call('PATCH', `/admin/expenses/${Z}`, admin, { description: 'x' })).statusCode).toBe(404);
    const p = await call('PATCH', `/admin/expenses/${e.id}`, admin, { amount: 20, splits: [{ user_id: m.id, amount: 20 }] });
    expect(p.statusCode).toBe(200);
    expect(Number(p.json().amount)).toBe(20);
  });

  test('chat messages: send and edit as a user, labelled', async () => {
    const { rows: [conv] } = await db.query(`insert into conversations (type, created_by) values ('individual', $1) returning id`, [admin.id]);
    expect((await call('POST', `/admin/chats/${conv.id}/messages`, admin, { sender_id: admin.id })).statusCode).toBe(400);
    expect((await call('POST', `/admin/chats/${Z}/messages`, admin, { sender_id: admin.id, text: 'hi' })).statusCode).toBe(400); // FK
    const s = await call('POST', `/admin/chats/${conv.id}/messages`, admin, { sender_id: admin.id, text: 'hi' });
    expect(s.statusCode).toBe(201);
    expect(s.json().admin_action).toBe('sent');
    expect((await call('PATCH', `/admin/messages/${s.json().id}`, admin, { text: '' })).statusCode).toBe(400);
    expect((await call('PATCH', `/admin/messages/${Z}`, admin, { text: 'x' })).statusCode).toBe(404);
    const ed = await call('PATCH', `/admin/messages/${s.json().id}`, admin, { text: 'edited' });
    expect(ed.json()).toMatchObject({ text: 'edited', is_edited: true, admin_action: 'edited' });
  });

  test('outbound resend', async () => {
    const { rows: [o] } = await db.query(
      `insert into outbound_messages (channel, to_addr, body, kind, status, attempts) values ('email', 'x@test.local', 'b', 'test', 'failed', 3) returning id`);
    expect((await call('POST', '/admin/outbound/abc/resend', admin)).statusCode).toBe(400);
    expect((await call('POST', '/admin/outbound/999999/resend', admin)).statusCode).toBe(404);
    expect((await call('POST', `/admin/outbound/${o.id}/resend`, admin)).json()).toEqual({ ok: true });
    const { rows: [after] } = await db.query('select status, attempts from outbound_messages where id = $1', [o.id]);
    expect(after.attempts).toBe(0);
  });

  test('whatsapp status / connect / disconnect', async () => {
    expect((await call('GET', '/admin/whatsapp/status', admin)).json()).toEqual({ status: 'disconnected' });
    expect((await call('POST', '/admin/whatsapp/connect', admin)).json()).toEqual({ status: 'connecting' });
    expect((await call('POST', '/admin/whatsapp/disconnect', admin)).json()).toEqual({ status: 'disconnected' });
  });

  test('reports run', async () => {
    expect((await call('POST', '/admin/reports/run?type=monthly', admin)).statusCode).toBe(400);
    const r = await call('POST', '/admin/reports/run?type=weekly', admin);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ sent: expect.any(Number) });
  });

  test('generic CRUD', async () => {
    expect((await call('GET', '/admin/nope', admin)).statusCode).toBe(404);
    expect((await call('GET', '/admin/hotels?limit=500', admin)).statusCode).toBe(400);
    expect((await call('POST', '/admin/hotels', admin, { location: 'x' })).statusCode).toBe(400); // missing name
    expect((await call('POST', '/admin/hotels', admin, { name: 'H', is_active: 'yes' })).statusCode).toBe(400);
    expect((await call('POST', '/admin/logs', admin, {})).statusCode).toBe(405);
    const c = await call('POST', '/admin/hotels', admin, { name: 'Hotel 100%_x', location: 'Town' });
    expect(c.statusCode).toBe(201);
    const h = c.json();

    const list = (await call('GET', `/admin/hotels?q=${encodeURIComponent('100%_')}&is_active=true`, admin)).json();
    expect(list.rows.map((r: any) => r.id)).toEqual([h.id]);
    expect((await call('GET', '/admin/hotels?q=zzz-none', admin)).json().total).toBe(0);
    const users = (await call('GET', `/admin/users?q=${encodeURIComponent(ADMIN)}`, admin)).json();
    expect(users.rows[0]).toMatchObject({ email: ADMIN, email_verified: true });
    expect('push_token' in users.rows[0]).toBe(false);

    expect((await call('GET', '/admin/hotels/bad', admin)).statusCode).toBe(400);
    expect((await call('GET', `/admin/hotels/${Z}`, admin)).statusCode).toBe(404);
    expect((await call('GET', `/admin/hotels/${h.id}`, admin)).json().name).toBe('Hotel 100%_x');

    expect((await call('PATCH', `/admin/hotels/${h.id}`, admin, {})).statusCode).toBe(400);
    expect((await call('PATCH', `/admin/hotels/${Z}`, admin, { name: 'x' })).statusCode).toBe(404);
    expect((await call('PATCH', `/admin/hotels/${h.id}`, admin, { name: 'Renamed' })).json().name).toBe('Renamed');

    // text-keyed resource with JSON value
    expect((await call('POST', '/admin/settings', admin, { key: 'area3', value: { a: 1 } })).statusCode).toBe(201);
    expect((await call('PATCH', '/admin/settings/area3', admin, { value: [1, 2] })).json().value).toEqual([1, 2]);
    expect((await call('DELETE', '/admin/settings/area3', admin)).statusCode).toBe(200);

    expect((await call('DELETE', `/admin/hotels/${Z}`, admin)).statusCode).toBe(404);
    expect((await call('DELETE', `/admin/hotels/${h.id}`, admin)).json()).toEqual({ ok: true });
    const { rowCount } = await db.query('select 1 from hotels where id = $1', [h.id]);
    expect(rowCount).toBe(0);
    await flushAuditLogs();
    const { rows: [snap] } = await db.query(`select * from audit_logs where route = 'snapshot' and message = $1`, [`Snapshot before delete: hotels ${h.id}`]);
    expect(snap).toMatchObject({ actor_id: admin.id, is_admin: true, request: expect.objectContaining({ name: 'Renamed' }) });
  });

  test('members resource respects pending/active via group_members view', async () => {
    const m = await createUser();
    const g = await createGroup(admin);
    const c = await call('POST', '/admin/members', admin, { group_id: g, user_id: m.id, status: 'pending' });
    expect(c.statusCode).toBe(201);
    const { rowCount } = await db.query('select 1 from group_members where group_id = $1 and user_id = $2', [g, m.id]);
    expect(rowCount).toBe(0);
    expect((await call('POST', '/admin/members', admin, { group_id: g, user_id: m.id })).statusCode).toBe(400); // unique
  });
});

describe('admin audit log', () => {
  test('admin requests are logged with is_admin and redaction', async () => {
    await call('POST', '/admin/users', admin, { email: 'audit3@test.local', password: 'topsecret', full_name: 'A' });
    await call('GET', '/admin/stats', user);
    await flushAuditLogs();
    const { rows: [ok] } = await db.query(`select * from audit_logs where route = '/admin/users' and status = 201 and request->'body'->>'email' = 'audit3@test.local'`);
    expect(ok).toMatchObject({ actor_id: admin.id, actor_email: ADMIN, is_admin: true, method: 'POST' });
    expect(ok.request.body.password).toBe('[redacted]');
    expect(JSON.stringify(ok)).not.toContain('topsecret');
    const { rows: [denied] } = await db.query(`select * from audit_logs where route = '/admin/stats' and status = 403 and actor_email = $1`, [user.email]);
    expect(denied).toBeTruthy();
  });
});
