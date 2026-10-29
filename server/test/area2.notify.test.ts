import { describe, expect, test } from 'vitest';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { auth, covers, createGroup, createUser, db, getApp, type TestUser } from './helpers.js';

covers(
  'GET /notifications', 'GET /notifications/unread-count', 'POST /notifications', 'POST /notifications/expense/:expenseId',
  'PATCH /notifications/:id/read', 'PATCH /notifications/read-all', 'DELETE /notifications/:id',
  'GET /push-token', 'PUT /push-token', 'POST /push/:kind/:id', 'POST /uploads/:bucket',
);

type M = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const call = async (u: TestUser | null, method: M, url: string, payload?: unknown) =>
  (await getApp()).inject({ method, url, payload: payload as any, headers: u ? auth(u) : {} });
const Z = '00000000-0000-0000-0000-000000000000';

test.each([
  ['GET', '/notifications'], ['GET', '/notifications/unread-count'], ['POST', '/notifications'],
  ['POST', `/notifications/expense/${Z}`], ['PATCH', `/notifications/${Z}/read`], ['PATCH', '/notifications/read-all'],
  ['DELETE', `/notifications/${Z}`], ['GET', '/push-token'], ['PUT', '/push-token'], ['POST', `/push/group/${Z}`],
  ['POST', '/uploads/receipts'],
] as [M, string][])('%s %s rejects requests without a token', async (method, url) => {
  expect((await call(null, method, url)).statusCode).toBe(401);
});

const note = (u: TestUser, title = 'Hi') => ({ user_id: u.id, title, message: 'msg', type: 'test' });

describe('notifications', () => {
  test('create, list, count, read, read-all, delete', async () => {
    const a = await createUser();
    const b = await createUser();
    const stranger = await createUser();
    await createGroup(a, [b]);

    expect((await call(a, 'POST', '/notifications', { ...note(b), title: '' })).statusCode).toBe(400);
    expect((await call(a, 'POST', '/notifications', note(stranger))).statusCode).toBe(403);
    const n1 = await call(a, 'POST', '/notifications', note(b, 'one'));
    expect(n1.statusCode).toBe(201);
    await call(b, 'POST', '/notifications', note(b, 'two')); // self is always allowed

    expect((await call(b, 'GET', '/notifications?limit=1')).json()).toHaveLength(1);
    expect((await call(b, 'GET', '/notifications?limit=0')).statusCode).toBe(400);
    expect((await call(a, 'GET', '/notifications')).json()).toEqual([]);
    expect((await call(b, 'GET', '/notifications/unread-count')).json()).toEqual({ count: 2 });

    const id = n1.json().id;
    await call(a, 'PATCH', `/notifications/${id}/read`); // not a's: no-op
    expect((await call(b, 'GET', '/notifications/unread-count')).json().count).toBe(2);
    expect((await call(b, 'PATCH', `/notifications/${id}/read`)).json()).toEqual({ ok: true });
    expect((await call(b, 'GET', '/notifications/unread-count')).json().count).toBe(1);
    expect((await call(b, 'PATCH', '/notifications/read-all')).json()).toEqual({ ok: true });
    expect((await call(b, 'GET', '/notifications/unread-count')).json().count).toBe(0);

    expect((await call(b, 'DELETE', '/notifications/bad')).statusCode).toBe(400);
    expect((await call(b, 'PATCH', '/notifications/bad/read')).statusCode).toBe(400);
    await call(a, 'DELETE', `/notifications/${id}`); // not a's: no-op
    expect((await call(b, 'GET', '/notifications')).json()).toHaveLength(2);
    await call(b, 'DELETE', `/notifications/${id}`);
    expect((await call(b, 'GET', '/notifications')).json()).toHaveLength(1);
  });

  test('expense notifications reach active members with a share, not the payer or pending invitees', async () => {
    const a = await createUser();
    const b = await createUser();
    const c = await createUser();
    const p = await createUser();
    const outsider = await createUser();
    const g = await createGroup(a, [b, c], { pending: [p] });
    const { rows: [e] } = await db.query(
      `insert into expenses (group_id, description, amount, paid_by, split_type) values ($1, 'Pizza', 30, $2, 'unequal') returning id`, [g, a.id]);
    await db.query('insert into expense_splits (expense_id, user_id, amount) values ($1, $2, 10), ($1, $3, 10), ($1, $4, 10)', [e.id, a.id, b.id, p.id]);

    expect((await call(a, 'POST', '/notifications/expense/bad')).statusCode).toBe(400);
    expect((await call(a, 'POST', `/notifications/expense/${Z}`)).statusCode).toBe(404);
    expect((await call(outsider, 'POST', `/notifications/expense/${e.id}`)).statusCode).toBe(403);
    const res = await call(b, 'POST', `/notifications/expense/${e.id}`);
    expect(res.json()).toEqual({ created: 3 }); // b: added + assigned, c: added
    const { rows } = await db.query('select user_id, type from notifications where related_id = $1 order by type', [e.id]);
    expect(rows).toEqual(expect.arrayContaining([
      { user_id: b.id, type: 'expense_added' }, { user_id: b.id, type: 'expense_split_assigned' }, { user_id: c.id, type: 'expense_added' },
    ]));
    expect(rows.some((r) => r.user_id === a.id || r.user_id === p.id)).toBe(false);
  });
});

describe('push', () => {
  test('push token get/put', async () => {
    const u = await createUser();
    expect((await call(u, 'GET', '/push-token')).json()).toEqual({ push_token: null });
    expect((await call(u, 'PUT', '/push-token', { token: '' })).statusCode).toBe(400);
    expect((await call(u, 'PUT', '/push-token', { token: 'not-expo' })).json()).toEqual({ ok: true });
    expect((await call(u, 'GET', '/push-token')).json()).toEqual({ push_token: 'not-expo' });
  });

  test('push to group / conversation needs membership', async () => {
    const a = await createUser();
    const b = await createUser();
    const outsider = await createUser();
    const g = await createGroup(a, [b]);
    const body = { title: 'T', body: 'B' };
    expect((await call(a, 'POST', `/push/group/${g}`, body)).json()).toEqual({ sent: 0 }); // no Expo tokens → nothing sent
    expect((await call(outsider, 'POST', `/push/group/${g}`, body)).statusCode).toBe(403);
    expect((await call(a, 'POST', `/push/other/${g}`, body)).statusCode).toBe(400);
    expect((await call(a, 'POST', `/push/group/${g}`, { title: '' })).statusCode).toBe(400);
    const { rows: [c] } = await db.query(`insert into conversations (type, created_by) values ('individual', $1) returning id`, [a.id]);
    await db.query('insert into conversation_participants (conversation_id, user_id) values ($1, $2), ($1, $3)', [c.id, a.id, b.id]);
    expect((await call(b, 'POST', `/push/conversation/${c.id}`, body)).json()).toEqual({ sent: 0 });
    expect((await call(outsider, 'POST', `/push/conversation/${c.id}`, body)).statusCode).toBe(403);
  });
});

describe('uploads', () => {
  const multipart = (file: Buffer, type: string) => {
    const boundary = 'testboundary';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x"\r\nContent-Type: ${type}\r\n\r\n`),
      file, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
  };
  const png = () => sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#f00' } }).png().toBuffer();
  const upload = async (u: TestUser, bucket: string, file: Buffer, type = 'image/png') => {
    const m = multipart(file, type);
    return (await getApp()).inject({ method: 'POST', url: `/uploads/${bucket}`, payload: m.payload, headers: { ...m.headers, ...auth(u) } });
  };

  test('image is re-encoded to webp and served; bad bucket/type/content rejected', async () => {
    const u = await createUser();
    const res = await upload(u, 'receipts', await png());
    expect(res.statusCode).toBe(200);
    const url: string = res.json().url;
    expect(url).toMatch(new RegExp(`^http://test.local/files/receipts/${u.id}-[\\w-]+\\.webp$`));
    const file = await (await getApp()).inject({ method: 'GET', url: url.replace('http://test.local', '') });
    expect(file.statusCode).toBe(200);
    expect((await sharp(file.rawPayload).metadata()).width).toBe(1280);

    expect((await upload(u, 'secrets', await png())).statusCode).toBe(400);
    expect((await upload(u, 'chat', Buffer.from('hello'), 'text/plain')).statusCode).toBe(400);
    expect((await upload(u, 'chat', Buffer.from('not a png'))).json().error).toBe('Invalid image');
    expect((await call(u, 'POST', '/uploads/chat')).statusCode).toBeGreaterThanOrEqual(400);

    // receipts/delete removes the file the caller uploaded
    const t = await call(u, 'POST', '/personal-transactions', { type: 'expense', category: 'x', amount: 1, description: 'd', receipt_url: url });
    expect(t.statusCode).toBe(201);
    const path = `/tmp/expense-test-uploads/receipts/${url.split('/').pop()}`;
    expect(existsSync(path)).toBe(true);
    expect((await call(u, 'POST', '/receipts/delete', { url })).json()).toEqual({ deleted: true });
    expect(existsSync(path)).toBe(false);
  });
});
