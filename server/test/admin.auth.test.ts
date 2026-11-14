import { describe, expect, test } from 'vitest';
import { auth, covers, createUser, db, flushAuditLogs, getApp, sentMails, tokenFor } from './helpers.js';
import { requireSuperAdmin } from '../src/admin.js';

covers('POST /admin/login', 'POST /admin/verify', 'GET /health', 'POST /admin/users/:id/impersonate');

const lastCode = (to: string) => sentMails.filter((m) => m.to === to).at(-1)?.html.match(/<b>(\d{6})<\/b>/)?.[1];

describe('admin login', () => {
  test('password + email code issues an adm token; audit log redacts secrets', async () => {
    const app = await getApp();
    // Another file may already own this email; rename it away so ours is fresh.
    await db.query(`update users set email = 'old-' || id || '@test.local' where email = 'admin@test.local'`);
    await db.query(`update profiles set email = 'old-' || id || '@test.local' where email = 'admin@test.local'`);
    const admin = await createUser({ email: 'admin@test.local' });
    expect((await app.inject({ method: 'POST', url: '/admin/login', payload: { email: admin.email, password: 'wrong' } })).statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/admin/login', payload: { email: admin.email, password: admin.password } });
    expect(login.statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/admin/verify', payload: { email: admin.email, code: lastCode(admin.email) === '000000' ? '111111' : '000000' } })).statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/admin/verify', payload: { email: admin.email, code: lastCode(admin.email) } });
    expect(ok.statusCode).toBe(200);
    const { accessToken } = ok.json();
    const claims = app.jwt.decode<{ adm?: boolean; iat: number; exp: number }>(accessToken)!;
    expect(claims.adm).toBe(true);
    expect(claims.exp - claims.iat).toBe(24 * 60 * 60); // one email code per day, not every 15 minutes

    await flushAuditLogs();
    const { rows } = await db.query(`select * from audit_logs where route = '/admin/verify' and status = 200 and actor_email = 'admin@test.local' order by created_at desc limit 1`);
    expect(rows[0].message).toBe('admin@test.local logged in to the admin panel');
    expect(rows[0].request.body.code).toBe('[redacted]');
    expect(rows[0].response.accessToken).toBe('[redacted]');
  });

  test('non-listed email is rejected at login', async () => {
    const app = await getApp();
    const u = await createUser();
    expect((await app.inject({ method: 'POST', url: '/admin/login', payload: { email: u.email, password: u.password } })).statusCode).toBe(401);
    expect(sentMails.some((m) => m.to === u.email)).toBe(false);
  });

  test('requireSuperAdmin needs the adm claim and a listed email', async () => {
    const app = await getApp();
    const admin = await createUser({ email: 'admin2@test.local', adm: true });
    const listedNoClaim = await createUser({ email: 'admin3@test.local' });
    const run = async (token?: string) => {
      let status = 200;
      const reply = { code: (c: number) => { status = c; return { send: () => undefined }; } };
      const req = { jwtVerify: () => Promise.resolve(token ? app.jwt.verify(token) : Promise.reject(new Error('no token'))).then((u) => { (req as any).user = u; }) };
      await requireSuperAdmin(req as never, reply as never);
      return status;
    };
    expect(await run()).toBe(401);
    expect(await run(listedNoClaim.token)).toBe(403);
    expect(await run(admin.token)).toBe(403); // admin2 is not in SUPER_ADMIN_EMAILS
    const prev = process.env.SUPER_ADMIN_EMAILS;
    process.env.SUPER_ADMIN_EMAILS = 'admin@test.local,admin2@test.local';
    expect(await run(admin.token)).toBe(200);
    process.env.SUPER_ADMIN_EMAILS = prev;
  });

  test('admin can log in as a user: marked session, refresh keeps it, no admin rights, sensitive actions refused', async () => {
    const app = await getApp();
    const { rows: [row] } = await db.query(`select id, email from users where email = 'admin@test.local'`);
    const admin = row ? { ...row, token: await tokenFor(row, { adm: true }) } : await createUser({ email: 'admin@test.local', adm: true });
    const target = await createUser({ name: 'Early' });
    const url = `/admin/users/${target.id}/impersonate`;

    expect((await app.inject({ method: 'POST', url })).statusCode).toBe(401);
    expect([401, 403]).toContain((await app.inject({ method: 'POST', url, headers: auth(target) })).statusCode);
    expect((await app.inject({ method: 'POST', url: '/admin/users/00000000-0000-0000-0000-000000000000/impersonate', headers: auth(admin) })).statusCode).toBe(404);

    const r = await app.inject({ method: 'POST', url, headers: auth(admin) });
    expect(r.statusCode).toBe(200);
    const s = r.json();
    expect(s.user).toEqual({ id: target.id, email: target.email, imp: 'admin@test.local' });
    const as = { token: s.accessToken };
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: auth(as) })).json().profile.id).toBe(target.id);
    expect((await app.inject({ method: 'GET', url: '/admin/stats', headers: auth(as) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PATCH', url: '/auth/password', headers: auth(as), payload: { password: 'Newpass123!' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/auth/delete-account', headers: auth(as), payload: { code: '123456' } })).statusCode).toBe(403);

    const refreshed = (await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: s.refreshToken } })).json();
    expect(app.jwt.decode<{ imp?: string; sub: string }>(refreshed.accessToken)).toMatchObject({ imp: 'admin@test.local', sub: target.id });

    await flushAuditLogs();
    const { rows } = await db.query(`select actor_email, is_admin, message from audit_logs where route = '/admin/users/:id/impersonate' and status = 200 order by created_at desc limit 1`);
    expect(rows[0].message).toBe(`admin@test.local logged in as ${target.email}`);
    const { rows: [me] } = await db.query(`select actor_email, is_admin from audit_logs where route = '/auth/me' and actor_id = $1 order by created_at desc limit 1`, [target.id]);
    expect(me).toEqual({ actor_email: `admin@test.local as ${target.email}`, is_admin: true });
  });

  test('health', async () => {
    expect((await (await getApp()).inject({ url: '/health' })).json()).toEqual({ ok: true });
  });
});
