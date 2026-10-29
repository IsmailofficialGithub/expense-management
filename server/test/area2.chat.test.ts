import { describe, expect, test } from 'vitest';
import { auth, covers, createGroup, createUser, db, getApp, type TestUser } from './helpers.js';

covers(
  'GET /conversations', 'GET /conversations/:id', 'POST /conversations/individual', 'POST /conversations/group',
  'GET /conversations/:id/messages', 'POST /conversations/:id/messages', 'GET /messages/:id', 'POST /messages/:id/read',
  'POST /conversations/:id/read', 'PUT /conversations/:id/typing', 'GET /conversations/:id/typing',
  'DELETE /messages/:id', 'POST /messages/:id/hide',
);

type M = 'GET' | 'POST' | 'PUT' | 'DELETE';
const call = async (u: TestUser | null, method: M, url: string, payload?: unknown) =>
  (await getApp()).inject({ method, url, payload: payload as any, headers: u ? auth(u) : {} });
const Z = '00000000-0000-0000-0000-000000000000';
const ROUTES: [M, string][] = [
  ['GET', '/conversations'], ['GET', `/conversations/${Z}`], ['POST', '/conversations/individual'], ['POST', '/conversations/group'],
  ['GET', `/conversations/${Z}/messages`], ['POST', `/conversations/${Z}/messages`], ['GET', `/messages/${Z}`],
  ['POST', `/messages/${Z}/read`], ['POST', `/conversations/${Z}/read`], ['PUT', `/conversations/${Z}/typing`],
  ['GET', `/conversations/${Z}/typing`], ['DELETE', `/messages/${Z}`], ['POST', `/messages/${Z}/hide`],
];

test.each(ROUTES)('%s %s rejects requests without a token', async (method, url) => {
  expect((await call(null, method, url)).statusCode).toBe(401);
});

test.each(ROUTES.filter(([, u]) => u.includes(Z)))('%s %s rejects a malformed id / 404s an unknown one', async (method, url) => {
  const u = await createUser();
  const body = method === 'PUT' ? { is_typing: true } : method === 'POST' ? {} : undefined;
  expect((await call(u, method, url.replace(Z, 'bad'), body)).statusCode).toBe(400);
  expect((await call(u, method, url, body)).statusCode).toBe(404);
});

describe('individual conversations', () => {
  test('create is idempotent; messages, reads, typing, delete, hide', async () => {
    const a = await createUser();
    const b = await createUser();
    const outsider = await createUser();

    expect((await call(a, 'POST', '/conversations/individual', { other_user_email: 'nope' })).statusCode).toBe(400);
    expect((await call(a, 'POST', '/conversations/individual', { other_user_email: 'ghost@test.local' })).statusCode).toBe(404);
    expect((await call(a, 'POST', '/conversations/individual', { other_user_email: a.email })).statusCode).toBe(400);
    const c = (await call(a, 'POST', '/conversations/individual', { other_user_email: b.email.toUpperCase() })).json();
    expect(c.participants).toHaveLength(2);
    expect((await call(b, 'POST', '/conversations/individual', { other_user_email: a.email })).json().id).toBe(c.id);

    expect((await call(b, 'GET', `/conversations/${c.id}`)).json().id).toBe(c.id);
    expect((await call(outsider, 'GET', `/conversations/${c.id}`)).statusCode).toBe(403);
    expect((await call(outsider, 'GET', '/conversations')).json()).toEqual([]);

    expect((await call(a, 'POST', `/conversations/${c.id}/messages`, { message_type: 'video' })).statusCode).toBe(400);
    expect((await call(outsider, 'POST', `/conversations/${c.id}/messages`, { text: 'x' })).statusCode).toBe(403);
    const m1 = (await call(a, 'POST', `/conversations/${c.id}/messages`, { text: 'hello' })).json();
    expect(m1).toMatchObject({ text: 'hello', sender_id: a.id, read_count: 0, total_participants: 2 });
    expect(m1.sender.push_token).toBeUndefined();
    const m2 = (await call(a, 'POST', `/conversations/${c.id}/messages`, { text: 'again' })).json();

    const list = (await call(b, 'GET', `/conversations`)).json();
    expect(list[0]).toMatchObject({ id: c.id, unread_count: 2 });
    const page = (await call(b, 'GET', `/conversations/${c.id}/messages?limit=1`)).json();
    expect(page).toMatchObject({ hasMore: true, messages: [{ id: m2.id }] });
    expect((await call(b, 'GET', `/conversations/${c.id}/messages?limit=500`)).statusCode).toBe(400);
    expect((await call(outsider, 'GET', `/conversations/${c.id}/messages`)).statusCode).toBe(403);

    expect((await call(b, 'GET', `/messages/${m1.id}`)).json().id).toBe(m1.id);
    expect((await call(outsider, 'GET', `/messages/${m1.id}`)).statusCode).toBe(403);

    expect((await call(b, 'POST', `/messages/${m1.id}/read`)).json()).toEqual({ ok: true });
    expect((await call(outsider, 'POST', `/messages/${m1.id}/read`)).statusCode).toBe(403);
    expect((await call(b, 'GET', `/messages/${m1.id}`)).json().read_count).toBe(1);
    expect((await call(b, 'POST', `/conversations/${c.id}/read`)).json()).toEqual({ ok: true });
    expect((await call(outsider, 'POST', `/conversations/${c.id}/read`)).statusCode).toBe(403);
    expect((await call(b, 'GET', '/conversations')).json()[0].unread_count).toBe(0);

    expect((await call(a, 'PUT', `/conversations/${c.id}/typing`, { is_typing: 'yes' })).statusCode).toBe(400);
    expect((await call(outsider, 'PUT', `/conversations/${c.id}/typing`, { is_typing: true })).statusCode).toBe(403);
    await call(a, 'PUT', `/conversations/${c.id}/typing`, { is_typing: true });
    expect((await call(b, 'GET', `/conversations/${c.id}/typing`)).json().map((t: any) => t.user_id)).toEqual([a.id]);
    expect((await call(outsider, 'GET', `/conversations/${c.id}/typing`)).statusCode).toBe(403);

    expect((await call(b, 'DELETE', `/messages/${m1.id}`)).statusCode).toBe(403); // only the sender
    expect((await call(a, 'DELETE', `/messages/${m1.id}`)).json()).toEqual({ ok: true });
    expect((await call(a, 'DELETE', `/messages/${m1.id}`)).statusCode).toBe(400);
    expect((await call(b, 'GET', `/conversations/${c.id}/messages`)).json().messages.map((m: any) => m.id)).toEqual([m2.id]);

    expect((await call(outsider, 'POST', `/messages/${m2.id}/hide`)).statusCode).toBe(403);
    expect((await call(b, 'POST', `/messages/${m2.id}/hide`)).json()).toEqual({ ok: true });
    expect((await call(b, 'GET', `/conversations/${c.id}/messages`)).json().messages).toEqual([]);
    expect((await call(a, 'GET', `/conversations/${c.id}/messages`)).json().messages).toHaveLength(1); // hidden only for b
  });
});

describe('group conversations', () => {
  test('access follows group membership', async () => {
    const a = await createUser();
    const b = await createUser();
    const late = await createUser();
    const pending = await createUser();
    const g = await createGroup(a, [b], { pending: [pending] });

    expect((await call(a, 'POST', '/conversations/group', { group_id: 'x' })).statusCode).toBe(400);
    expect((await call(pending, 'POST', '/conversations/group', { group_id: g })).statusCode).toBe(403);
    const c = (await call(a, 'POST', '/conversations/group', { group_id: g })).json();
    expect(c.participants).toHaveLength(2);
    expect((await call(b, 'POST', '/conversations/group', { group_id: g })).json().id).toBe(c.id);

    // Joined after creation: gets access and a participant row on first use.
    await db.query('insert into group_memberships (group_id, user_id) values ($1, $2)', [g, late.id]);
    expect((await call(late, 'GET', '/conversations')).json().map((x: any) => x.id)).toEqual([c.id]);
    expect((await call(late, 'POST', `/conversations/${c.id}/messages`, { text: 'hi' })).statusCode).toBe(200);

    expect((await call(pending, 'GET', `/conversations/${c.id}`)).statusCode).toBe(403);
    // Leaving the group revokes access even though the participant row remains.
    await db.query(`update group_memberships set status = 'left' where group_id = $1 and user_id = $2`, [g, late.id]);
    expect((await call(late, 'GET', `/conversations/${c.id}/messages`)).statusCode).toBe(403);
    expect((await call(late, 'GET', '/conversations')).json()).toEqual([]);
  });
});
