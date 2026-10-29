import { describe, expect, test } from 'vitest';
import { auth, covers, createGroup, createUser, db, getApp, type TestUser } from './helpers.js';

covers(
  'GET /profiles/search', 'GET /profiles/:id', 'PATCH /profiles/me',
  'GET /hotels', 'GET /hotels/:id', 'POST /hotels', 'GET /hotels/:id/menu-items',
  'POST /hotel-menu-items', 'PATCH /hotel-menu-items/:id', 'DELETE /hotel-menu-items/:id',
  'GET /users/:id/payment-methods', 'GET /groups/:id/payment-methods', 'POST /payment-methods',
  'PATCH /payment-methods/:id', 'POST /payment-methods/:id/default', 'DELETE /payment-methods/:id',
  'POST /invitations', 'GET /groups/:id/invitations', 'DELETE /invitations/:id', 'GET /invitations/pending',
  'POST /invitations/:id/:action',
  'POST /groups', 'GET /groups', 'GET /groups/:id', 'PATCH /groups/:id', 'DELETE /groups/:id',
  'POST /groups/:id/members', 'DELETE /groups/:id/members/:userId', 'GET /groups/:id/balances', 'GET /categories',
);

const NIL = '00000000-0000-0000-0000-000000000000';
async function call(u: TestUser | null, method: string, url: string, payload?: object) {
  const app = await getApp();
  return app.inject({ method: method as 'GET', url, payload, headers: u ? auth(u) : {} });
}
const membership = async (g: string, userId: string) =>
  (await db.query('select status, role from group_memberships where group_id = $1 and user_id = $2', [g, userId])).rows[0];

describe('auth required', () => {
  test.each([
    ['GET', '/profiles/search?q=a'], ['GET', '/hotels'], ['GET', '/categories'], ['GET', '/groups'],
    ['POST', '/groups'], ['POST', '/invitations'], ['GET', '/invitations/pending'], ['POST', '/payment-methods'],
  ])('%s %s -> 401', async (m, url) => {
    expect((await call(null, m, url, m === 'GET' ? undefined : {})).statusCode).toBe(401);
  });
});

describe('profiles', () => {
  test('search only partial-matches group mates; exact email finds anyone', async () => {
    const a = await createUser({ name: 'Zelda Alpha' });
    const mate = await createUser({ name: 'Zelda Mate' });
    const stranger = await createUser({ name: 'Zelda Stranger' });
    await createGroup(a, [mate]);
    const r = (await call(a, 'GET', '/profiles/search?q=Zelda')).json().map((p: any) => p.id);
    expect(r).toContain(mate.id);
    expect(r).not.toContain(stranger.id);
    expect((await call(a, 'GET', `/profiles/search?q=${encodeURIComponent(stranger.email)}`)).json()[0].id).toBe(stranger.id);
    expect((await call(a, 'GET', '/profiles/search?q=')).statusCode).toBe(400);
  });

  test('get profile hides private fields of others', async () => {
    const a = await createUser();
    const b = await createUser();
    await db.query(`update profiles set push_token = 'secret' where id = $1`, [b.id]);
    expect((await call(a, 'GET', `/profiles/${a.id}`)).json().id).toBe(a.id);
    const other = (await call(a, 'GET', `/profiles/${b.id}`)).json();
    expect(other.id).toBe(b.id);
    expect(other.push_token).toBeUndefined();
    expect((await call(a, 'GET', `/profiles/${NIL}`)).statusCode).toBe(404);
    expect((await call(a, 'GET', '/profiles/not-a-uuid')).statusCode).toBe(400);
  });

  test('patch me: phone_e164 clears the country prompt; bad input 400', async () => {
    const a = await createUser();
    await db.query('update profiles set phone_needs_country = true where id = $1', [a.id]);
    const r = await call(a, 'PATCH', '/profiles/me', { full_name: 'New Name', phone_e164: '+923001234567', report_daily: false });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ full_name: 'New Name', phone_e164: '+923001234567', phone_needs_country: false, report_daily: false });
    expect((await call(a, 'PATCH', '/profiles/me', { phone_e164: '03001234567' })).statusCode).toBe(400);
    expect((await call(a, 'PATCH', '/profiles/me', {})).statusCode).toBe(400);
    expect((await call(null, 'PATCH', '/profiles/me', { full_name: 'x' })).statusCode).toBe(401);
  });
});

describe('hotels and menu items', () => {
  test('crud with creator-only edits', async () => {
    const a = await createUser();
    const b = await createUser();
    expect((await call(a, 'POST', '/hotels', { name: '' })).statusCode).toBe(400);
    const h = (await call(a, 'POST', '/hotels', { name: 'Cafe', location: 'Here' })).json();
    expect(h.id).toBeTruthy();
    expect((await call(a, 'GET', '/hotels')).json().some((x: any) => x.id === h.id)).toBe(true);
    expect((await call(a, 'GET', `/hotels/${h.id}`)).json().name).toBe('Cafe');
    expect((await call(a, 'GET', `/hotels/${NIL}`)).statusCode).toBe(404);

    const item = { hotel_id: h.id, item_name: 'Tea', category: 'Drinks', price: 50 };
    expect((await call(b, 'POST', '/hotel-menu-items', item)).statusCode).toBe(403);
    expect((await call(a, 'POST', '/hotel-menu-items', { ...item, price: -1 })).statusCode).toBe(400);
    const m = (await call(a, 'POST', '/hotel-menu-items', item)).json();
    expect((await call(a, 'GET', `/hotels/${h.id}/menu-items`)).json()).toHaveLength(1);
    expect((await call(b, 'PATCH', `/hotel-menu-items/${m.id}`, { price: 60 })).statusCode).toBe(403);
    expect((await call(a, 'PATCH', `/hotel-menu-items/${m.id}`, {})).statusCode).toBe(400);
    expect(Number((await call(a, 'PATCH', `/hotel-menu-items/${m.id}`, { price: 60 })).json().price)).toBe(60);
    expect((await call(b, 'DELETE', `/hotel-menu-items/${m.id}`)).statusCode).toBe(403);
    expect((await call(a, 'DELETE', `/hotel-menu-items/${m.id}`)).statusCode).toBe(200);
    expect((await call(a, 'DELETE', `/hotel-menu-items/${m.id}`)).statusCode).toBe(404);
  });
});

describe('payment methods', () => {
  test('owner crud, default switching, visibility to group mates', async () => {
    const a = await createUser();
    const mate = await createUser();
    const stranger = await createUser();
    const g = await createGroup(a, [mate]);
    expect((await call(a, 'POST', '/payment-methods', { method_type: 'crypto' })).statusCode).toBe(400);
    const p1 = (await call(a, 'POST', '/payment-methods', { method_type: 'cash', is_visible_to_groups: true })).json();
    const p2 = (await call(a, 'POST', '/payment-methods', { method_type: 'bank', bank_name: 'X', is_visible_to_groups: false })).json();

    expect((await call(a, 'GET', `/users/${a.id}/payment-methods`)).json()).toHaveLength(2);
    expect((await call(mate, 'GET', `/users/${a.id}/payment-methods`)).json().map((x: any) => x.id)).toEqual([p1.id]);
    expect((await call(stranger, 'GET', `/users/${a.id}/payment-methods`)).json()).toHaveLength(0);
    expect((await call(mate, 'GET', `/groups/${g}/payment-methods`)).json().map((x: any) => x.id)).toEqual([p1.id]);
    expect((await call(stranger, 'GET', `/groups/${g}/payment-methods`)).statusCode).toBe(403);

    expect((await call(stranger, 'PATCH', `/payment-methods/${p1.id}`, { notes: 'x' })).statusCode).toBe(404);
    expect((await call(a, 'PATCH', `/payment-methods/${p1.id}`, { method_type: 'nope' })).statusCode).toBe(400);
    expect((await call(a, 'PATCH', `/payment-methods/${p1.id}`, { notes: 'hi' })).json().notes).toBe('hi');

    expect((await call(a, 'POST', `/payment-methods/${p2.id}/default`)).json().is_default).toBe(true);
    expect((await call(a, 'POST', `/payment-methods/${p1.id}/default`)).json().is_default).toBe(true);
    const { rows } = await db.query('select id from user_payment_methods where user_id = $1 and is_default', [a.id]);
    expect(rows.map((r) => r.id)).toEqual([p1.id]);
    expect((await call(stranger, 'POST', `/payment-methods/${p1.id}/default`)).statusCode).toBe(404);

    expect((await call(stranger, 'DELETE', `/payment-methods/${p2.id}`)).statusCode).toBe(404);
    expect((await call(a, 'DELETE', `/payment-methods/${p2.id}`)).statusCode).toBe(200);
  });
});

describe('invitations (pending members)', () => {
  test('inviting an unregistered email creates a placeholder pending member; signup + login activates it', async () => {
    const owner = await createUser();
    const member = await createUser();
    const g = await createGroup(owner, [member]);
    const email = `inv-${Date.now()}@test.local`;
    expect((await call(member, 'POST', '/invitations', { group_id: g, invited_email: email })).statusCode).toBe(403);
    expect((await call(owner, 'POST', '/invitations', { group_id: g, invited_email: 'bad' })).statusCode).toBe(400);
    const r = await call(owner, 'POST', '/invitations', { group_id: g, invited_email: email.toUpperCase() });
    expect(r.statusCode).toBe(201);
    expect(r.json().invited_email).toBe(email);
    expect((await call(owner, 'POST', '/invitations', { group_id: g, invited_email: email })).statusCode).toBe(409);

    const { rows: [u] } = await db.query('select id, password_hash from users where email = $1', [email]);
    expect(u.password_hash).toBe('!');
    expect(await membership(g, u.id)).toMatchObject({ status: 'pending' });
    // Pending members show separately, not in members.
    const grp = (await call(owner, 'GET', `/groups/${g}`)).json();
    expect(grp.pending_members.map((m: any) => m.user_id)).toEqual([u.id]);
    expect(grp.members.some((m: any) => m.user_id === u.id)).toBe(false);
    expect((await call(member, 'GET', `/groups/${g}/invitations`)).json()).toHaveLength(1);

    const app = await getApp();
    expect((await app.inject({ method: 'POST', url: '/auth/signup', remoteAddress: '10.9.0.1', payload: { email, password: 'secret123', full_name: 'Inv' } })).statusCode).toBe(201);
    await db.query('update users set email_verified = true where email = $1', [email]);
    expect((await app.inject({ method: 'POST', url: '/auth/login', remoteAddress: '10.9.0.1', payload: { email, password: 'secret123' } })).statusCode).toBe(200);
    expect(await membership(g, u.id)).toMatchObject({ status: 'active' });
  });

  test('existing member -> 409; non-member cannot list invitations', async () => {
    const owner = await createUser();
    const member = await createUser();
    const stranger = await createUser();
    const g = await createGroup(owner, [member]);
    expect((await call(owner, 'POST', '/invitations', { group_id: g, invited_email: member.email })).statusCode).toBe(409);
    expect((await call(stranger, 'GET', `/groups/${g}/invitations`)).statusCode).toBe(403);
    expect((await call(owner, 'GET', '/groups/x/invitations')).statusCode).toBe(400);
  });

  test('registered invitee sees pending, accepts', async () => {
    const owner = await createUser();
    const invitee = await createUser();
    const g = await createGroup(owner);
    const inv = (await call(owner, 'POST', '/invitations', { group_id: g, invited_email: invitee.email })).json();
    expect(await membership(g, invitee.id)).toMatchObject({ status: 'pending' });
    expect((await call(invitee, 'GET', '/invitations/pending')).json().map((i: any) => i.id)).toEqual([inv.id]);
    expect((await call(owner, 'POST', `/invitations/${inv.id}/accept`)).statusCode).toBe(403);
    expect((await call(invitee, 'POST', `/invitations/${inv.id}/maybe`)).statusCode).toBe(400);
    expect((await call(invitee, 'POST', `/invitations/${inv.id}/accept`)).statusCode).toBe(200);
    expect(await membership(g, invitee.id)).toMatchObject({ status: 'active', role: 'member' });
    expect((await call(invitee, 'POST', `/invitations/${inv.id}/accept`)).statusCode).toBe(404);
  });

  test('reject marks pending member left; re-invite brings them back to pending', async () => {
    const owner = await createUser();
    const invitee = await createUser();
    const g = await createGroup(owner);
    const inv = (await call(owner, 'POST', '/invitations', { group_id: g, invited_email: invitee.email })).json();
    expect((await call(invitee, 'POST', `/invitations/${inv.id}/reject`)).statusCode).toBe(200);
    expect(await membership(g, invitee.id)).toMatchObject({ status: 'left' });
    expect((await call(owner, 'POST', '/invitations', { group_id: g, invited_email: invitee.email })).statusCode).toBe(201);
    expect(await membership(g, invitee.id)).toMatchObject({ status: 'pending' });
  });

  test('admin revokes: membership left, notification removed', async () => {
    const owner = await createUser();
    const member = await createUser();
    const invitee = await createUser();
    const g = await createGroup(owner, [member]);
    const inv = (await call(owner, 'POST', '/invitations', { group_id: g, invited_email: invitee.email })).json();
    expect((await db.query(`select 1 from notifications where user_id = $1 and type = 'group_invitation'`, [invitee.id])).rowCount).toBe(1);
    expect((await call(member, 'DELETE', `/invitations/${inv.id}`)).statusCode).toBe(403);
    expect((await call(owner, 'DELETE', '/invitations/nope')).statusCode).toBe(400);
    expect((await call(owner, 'DELETE', `/invitations/${inv.id}`)).statusCode).toBe(200);
    expect(await membership(g, invitee.id)).toMatchObject({ status: 'left' });
    expect((await db.query(`select 1 from notifications where user_id = $1 and type = 'group_invitation'`, [invitee.id])).rowCount).toBe(0);
    expect((await call(owner, 'DELETE', `/invitations/${inv.id}`)).statusCode).toBe(404);
  });
});

describe('groups', () => {
  test('create, list, get, patch, delete with role checks', async () => {
    const a = await createUser();
    const b = await createUser();
    const stranger = await createUser();
    expect((await call(a, 'POST', '/groups', { name: '' })).statusCode).toBe(400);
    const g = (await call(a, 'POST', '/groups', { name: 'Flat', member_ids: [b.id] })).json();
    expect(await membership(g.id, a.id)).toMatchObject({ role: 'admin', status: 'active' });
    expect(await membership(g.id, b.id)).toMatchObject({ role: 'member', status: 'active' });
    expect((await call(b, 'GET', '/groups')).json().map((x: any) => x.id)).toContain(g.id);
    expect((await call(stranger, 'GET', '/groups')).json().map((x: any) => x.id)).not.toContain(g.id);
    expect((await call(b, 'GET', `/groups/${g.id}`)).json().members).toHaveLength(2);
    expect((await call(stranger, 'GET', `/groups/${g.id}`)).statusCode).toBe(403);

    expect((await call(b, 'PATCH', `/groups/${g.id}`, { name: 'X' })).statusCode).toBe(403);
    expect((await call(a, 'PATCH', `/groups/${g.id}`, { name: '' })).statusCode).toBe(400);
    expect((await call(a, 'PATCH', `/groups/${g.id}`, { name: 'Renamed' })).json().name).toBe('Renamed');

    expect((await call(b, 'DELETE', `/groups/${g.id}`)).statusCode).toBe(403);
    expect((await call(a, 'DELETE', `/groups/${g.id}`)).statusCode).toBe(200);
    expect((await db.query('select 1 from groups where id = $1', [g.id])).rowCount).toBe(0);
  });

  test('members: add (reactivates pending), self-leave, admin remove', async () => {
    const a = await createUser();
    const b = await createUser();
    const c = await createUser();
    const p = await createUser();
    const g = await createGroup(a, [b], { pending: [p] });
    expect((await call(b, 'POST', `/groups/${g}/members`, { user_id: c.id })).statusCode).toBe(403);
    expect((await call(a, 'POST', `/groups/${g}/members`, { user_id: 'x' })).statusCode).toBe(400);
    expect((await call(a, 'POST', `/groups/${g}/members`, { user_id: c.id })).statusCode).toBe(201);
    expect((await call(a, 'POST', `/groups/${g}/members`, { user_id: p.id, role: 'admin' })).statusCode).toBe(201);
    expect(await membership(g, p.id)).toMatchObject({ status: 'active', role: 'admin' });

    expect((await call(b, 'DELETE', `/groups/${g}/members/${c.id}`)).statusCode).toBe(403);
    expect((await call(c, 'DELETE', `/groups/${g}/members/${c.id}`)).statusCode).toBe(200);
    expect(await membership(g, c.id)).toBeUndefined();
    expect((await call(a, 'DELETE', `/groups/${g}/members/${b.id}`)).statusCode).toBe(200);
    expect((await call(b, 'GET', `/groups/${g}`)).statusCode).toBe(403);
  });

  test('balances and categories', async () => {
    const a = await createUser();
    const stranger = await createUser();
    const g = await createGroup(a);
    expect((await call(a, 'GET', `/groups/${g}/balances`)).statusCode).toBe(200);
    expect((await call(stranger, 'GET', `/groups/${g}/balances`)).statusCode).toBe(403);
    expect((await call(a, 'GET', '/groups/x/balances')).statusCode).toBe(400);
    expect(Array.isArray((await call(a, 'GET', '/categories')).json())).toBe(true);
  });
});
