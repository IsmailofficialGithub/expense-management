import { describe, expect, test } from 'vitest';
import { auth, covers, createGroup, createUser, db, getApp, redis, sentMails } from './helpers.js';

covers(
  'POST /auth/signup', 'GET /auth/verify-email', 'POST /auth/login', 'POST /auth/refresh', 'POST /auth/logout',
  'POST /auth/otp', 'POST /auth/verify-otp', 'PATCH /auth/password', 'GET /auth/leave-group', 'POST /auth/leave-group/code',
  'POST /auth/leave-group', 'GET /auth/me', 'POST /auth/delete-account/code', 'POST /auth/delete-account',
);

const lastCode = (to: string) => sentMails.filter((m) => m.to === to).at(-1)?.html.match(/<b>(\d{6})<\/b>/)?.[1];
// Strict routes allow 10 requests / 15 min per IP; give each test its own address.
let ipN = 0;
const ip = () => `10.1.0.${++ipN}`;

describe('signup / verify / login', () => {
  test('signup -> verify-email -> login, with failures', async () => {
    const app = await getApp();
    const remoteAddress = ip();
    const email = `new-${Date.now()}@test.local`;
    expect((await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress, payload: { email: 'bad', password: 'x' } })).statusCode).toBe(400);
    const s = await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress, payload: { email, password: 'secret123', full_name: 'New' } });
    expect(s.statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress, payload: { email, password: 'secret123', full_name: 'New' } })).statusCode).toBe(409);

    expect((await app.inject({ method: 'POST', url: '/auth/login', remoteAddress, payload: { email, password: 'secret123' } })).statusCode).toBe(403);
    const token = sentMails.filter((m) => m.to === email).at(-1)!.html.match(/token=([a-f0-9]{64})/)![1];
    expect((await app.inject({ method: 'GET', url: '/auth/verify-email?token=nope' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `/auth/verify-email?token=${'0'.repeat(64)}` })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `/auth/verify-email?token=${token}` })).statusCode).toBe(302);

    expect((await app.inject({ method: 'POST', url: '/auth/login', remoteAddress, payload: { email, password: 'wrong' } })).statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/auth/login', remoteAddress, payload: { email, password: 'secret123' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().accessToken).toBeTruthy();
  });

  test('login accepts pending invitations and activates a pending membership', async () => {
    const app = await getApp();
    const owner = await createUser();
    const invitee = await createUser();
    const g = await createGroup(owner, [], { pending: [invitee] });
    await db.query('insert into group_invitations (group_id, invited_by, invited_email) values ($1, $2, $3)', [g, owner.id, invitee.email]);
    const r = await app.inject({ method: 'POST', url: '/auth/login', remoteAddress: ip(), payload: { email: invitee.email, password: invitee.password } });
    expect(r.statusCode).toBe(200);
    const { rows } = await db.query('select 1 from group_members where group_id = $1 and user_id = $2', [g, invitee.id]);
    expect(rows).toHaveLength(1);
  });

  test('signup claims a placeholder (invited) account', async () => {
    const app = await getApp();
    const email = `ph-${Date.now()}@test.local`;
    await db.query(`insert into users (email, password_hash) values ($1, '!')`, [email]);
    const r = await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress: ip(), payload: { email, password: 'secret123', full_name: 'Ph' } });
    expect(r.statusCode).toBe(201);
  });
});

describe('tokens', () => {
  test('refresh rotates; logout revokes', async () => {
    const app = await getApp();
    const u = await createUser();
    const remoteAddress = ip();
    const { refreshToken } = (await app.inject({ method: 'POST', url: '/auth/login', remoteAddress, payload: { email: u.email, password: u.password } })).json();
    expect((await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: 'x' } })).statusCode).toBe(400);
    const r = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
    expect(r.statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } })).statusCode).toBe(401);
    const next = r.json().refreshToken;
    expect((await app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken: next } })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: next } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken: 5 } })).statusCode).toBe(400);
  });

  test('GET /auth/me', async () => {
    const app = await getApp();
    const u = await createUser();
    expect((await app.inject({ method: 'GET', url: '/auth/me' })).statusCode).toBe(401);
    const r = await app.inject({ method: 'GET', url: '/auth/me', headers: auth(u) });
    expect(r.statusCode).toBe(200);
    expect(r.json().profile.id).toBe(u.id);
  });
});

describe('password reset', () => {
  test('otp -> verify-otp -> password without current password', async () => {
    const app = await getApp();
    const u = await createUser();
    const remoteAddress = ip();
    expect((await app.inject({ method: 'POST', url: '/auth/otp', remoteAddress, payload: { email: 'nope' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/auth/otp', remoteAddress, payload: { email: 'ghost@test.local' } })).json()).toEqual({ ok: true });
    expect(sentMails.some((m) => m.to === 'ghost@test.local')).toBe(false);
    expect((await app.inject({ method: 'POST', url: '/auth/otp', remoteAddress, payload: { email: u.email } })).statusCode).toBe(200);
    const code = lastCode(u.email)!;
    expect((await app.inject({ method: 'POST', url: '/auth/verify-otp', remoteAddress, payload: { email: u.email, code: 'abc' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/auth/verify-otp', remoteAddress, payload: { email: u.email, code: code === '000000' ? '111111' : '000000' } })).json().error).toBe('Invalid code');
    const v = await app.inject({ method: 'POST', url: '/auth/verify-otp', remoteAddress, payload: { email: u.email, code } });
    expect(v.statusCode).toBe(200);
    const token = v.json().accessToken;

    expect((await app.inject({ method: 'PATCH', url: '/auth/password', remoteAddress, payload: { password: 'newpass1' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'PATCH', url: '/auth/password', remoteAddress, headers: auth({ token }), payload: { password: 'x' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/auth/password', remoteAddress, headers: auth({ token }), payload: { password: 'newpass1' } })).statusCode).toBe(200);
    // Recovery is one-shot: next change needs the current password.
    expect((await app.inject({ method: 'PATCH', url: '/auth/password', remoteAddress, headers: auth({ token }), payload: { password: 'newpass2' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PATCH', url: '/auth/password', remoteAddress, headers: auth({ token }), payload: { password: 'newpass2', current_password: 'newpass1' } })).statusCode).toBe(200);
  });

  test('verify-otp locks out after 5 tries', async () => {
    const app = await getApp();
    const u = await createUser();
    await redis.set(`otp:${u.email}`, '123456', 'EX', 600);
    for (let i = 0; i < 5; i++) await app.inject({ method: 'POST', url: '/auth/verify-otp', remoteAddress: `10.2.0.${i}`, payload: { email: u.email, code: '000000' } });
    const r = await app.inject({ method: 'POST', url: '/auth/verify-otp', remoteAddress: ip(), payload: { email: u.email, code: '123456' } });
    expect(r.json().error).toBe('Code expired, request a new one');
  });
});

describe('leave group via invite token', () => {
  async function setup() {
    const owner = await createUser();
    const invitee = await createUser();
    const g = await createGroup(owner, [], { pending: [invitee], name: 'Flat <3>' });
    const { rows: [inv] } = await db.query(
      'insert into group_invitations (group_id, invited_by, invited_email) values ($1, $2, $3) returning invitation_token', [g, owner.id, invitee.email]);
    return { owner, invitee, g, token: inv.invitation_token as string };
  }

  test('page -> code -> leave marks the pending membership left', async () => {
    const app = await getApp();
    const { invitee, g, token } = await setup();
    const remoteAddress = ip();
    expect((await app.inject({ method: 'GET', url: '/auth/leave-group?token=bad' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `/auth/leave-group?token=${'a'.repeat(48)}` })).statusCode).toBe(400);
    const page = await app.inject({ method: 'GET', url: `/auth/leave-group?token=${token}` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Flat &#60;3&#62;');

    expect((await app.inject({ method: 'POST', url: '/auth/leave-group/code', remoteAddress, payload: { token: 'bad' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/auth/leave-group/code', remoteAddress, payload: { token } })).statusCode).toBe(200);
    const code = lastCode(invitee.email)!;
    expect((await app.inject({ method: 'POST', url: '/auth/leave-group', remoteAddress, payload: { token, code: 'x' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/auth/leave-group', remoteAddress, payload: { token, code: code === '000000' ? '111111' : '000000' } })).json().error).toBe('Invalid code');
    expect((await app.inject({ method: 'POST', url: '/auth/leave-group', remoteAddress, payload: { token, code } })).statusCode).toBe(200);

    const { rows: [m] } = await db.query('select status from group_memberships where group_id = $1 and user_id = $2', [g, invitee.id]);
    expect(m.status).toBe('left');
    // Link is dead now.
    expect((await app.inject({ method: 'GET', url: `/auth/leave-group?token=${token}` })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/auth/leave-group/code', remoteAddress, payload: { token } })).statusCode).toBe(400);
  });

  test('code is single use and tries are capped', async () => {
    const app = await getApp();
    const { token } = await setup();
    expect((await app.inject({ method: 'POST', url: '/auth/leave-group', remoteAddress: ip(), payload: { token, code: '123456' } })).json().error)
      .toBe('Code expired, request a new one');
    await redis.set(`leaveOtp:${token}`, '123456', 'EX', 600);
    for (let i = 0; i < 5; i++) await app.inject({ method: 'POST', url: '/auth/leave-group', remoteAddress: `10.3.0.${i}`, payload: { token, code: '000000' } });
    expect((await app.inject({ method: 'POST', url: '/auth/leave-group', remoteAddress: ip(), payload: { token, code: '123456' } })).statusCode).toBe(400);
  });
});

describe('delete account', () => {
  test('code -> delete anonymises; needs auth and a valid code', async () => {
    const app = await getApp();
    const u = await createUser();
    const remoteAddress = ip();
    expect((await app.inject({ method: 'POST', url: '/auth/delete-account/code', remoteAddress })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/auth/delete-account', remoteAddress, payload: { code: '123456' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/auth/delete-account/code', remoteAddress, headers: auth(u) })).statusCode).toBe(200);
    const code = lastCode(u.email)!;
    expect((await app.inject({ method: 'POST', url: '/auth/delete-account', remoteAddress, headers: auth(u), payload: { code: 'abc' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/auth/delete-account', remoteAddress, headers: auth(u), payload: { code: code === '000000' ? '111111' : '000000' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/auth/delete-account', remoteAddress, headers: auth(u), payload: { code } })).statusCode).toBe(200);
    const { rows: [p] } = await db.query('select full_name, email from profiles where id = $1', [u.id]);
    expect(p.full_name).toBe('Deleted user');
    expect((await app.inject({ method: 'POST', url: '/auth/login', remoteAddress, payload: { email: u.email, password: u.password } })).statusCode).toBe(401);
  });
});
