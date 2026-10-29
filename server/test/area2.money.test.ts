import { describe, expect, test } from 'vitest';
import { auth, covers, createGroup, createUser, db, getApp, type TestUser } from './helpers.js';

covers(
  'GET /expenses', 'GET /groups/:id/summary', 'GET /me/expense-summary', 'GET /expenses/:id', 'POST /expenses',
  'PATCH /expenses/:id', 'PUT /expenses/:id/splits', 'DELETE /expenses/:id', 'GET /expenses/:id/food-items',
  'POST /expense-splits/:id/settle', 'POST /receipts/delete', 'POST /settlements', 'GET /settlements',
  'POST /advance-collections', 'GET /advance-collections/:id', 'GET /groups/:groupId/advance-collections',
  'POST /advance-contributions/:id/contribute', 'POST /advance-contributions/:id/approve', 'POST /advance-contributions/:id/reject',
  'GET /groups/:groupId/bulk-stats', 'GET /groups/:groupId/bulk-settlement-summary', 'POST /bulk-settlements',
  'GET /personal-transactions', 'POST /personal-transactions', 'PATCH /personal-transactions/:id', 'DELETE /personal-transactions/:id',
  'GET /personal-categories', 'GET /me/complete-balance', 'GET /personal-debts', 'POST /personal-debts',
  'POST /personal-debts/:id/settle', 'DELETE /personal-debts/:id',
);

type M = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const call = async (u: TestUser | null, method: M, url: string, payload?: unknown) =>
  (await getApp()).inject({ method, url, payload: payload as any, headers: u ? auth(u) : {} });

const Z = '00000000-0000-0000-0000-000000000000';
const ROUTES: [M, string][] = [
  ['GET', '/expenses'], ['GET', `/groups/${Z}/summary`], ['GET', '/me/expense-summary'], ['GET', `/expenses/${Z}`],
  ['POST', '/expenses'], ['PATCH', `/expenses/${Z}`], ['PUT', `/expenses/${Z}/splits`], ['DELETE', `/expenses/${Z}`],
  ['GET', `/expenses/${Z}/food-items`], ['POST', `/expense-splits/${Z}/settle`], ['POST', '/receipts/delete'],
  ['POST', '/settlements'], ['GET', '/settlements'], ['POST', '/advance-collections'], ['GET', `/advance-collections/${Z}`],
  ['GET', `/groups/${Z}/advance-collections`], ['POST', `/advance-contributions/${Z}/contribute`],
  ['POST', `/advance-contributions/${Z}/approve`], ['POST', `/advance-contributions/${Z}/reject`],
  ['GET', `/groups/${Z}/bulk-stats`], ['GET', `/groups/${Z}/bulk-settlement-summary`], ['POST', '/bulk-settlements'],
  ['GET', '/personal-transactions'], ['POST', '/personal-transactions'], ['PATCH', `/personal-transactions/${Z}`],
  ['DELETE', `/personal-transactions/${Z}`], ['GET', '/personal-categories'], ['GET', '/me/complete-balance'],
  ['GET', '/personal-debts'], ['POST', '/personal-debts'], ['POST', `/personal-debts/${Z}/settle`], ['DELETE', `/personal-debts/${Z}`],
];

test.each(ROUTES)('%s %s rejects requests without a token', async (method, url) => {
  expect((await call(null, method, url, method === 'GET' || method === 'DELETE' ? undefined : {})).statusCode).toBe(401);
});

test.each(ROUTES.filter(([, u]) => u.includes(Z)))('%s %s rejects a malformed id', async (method, url) => {
  const u = await createUser();
  const res = await call(u, method, url.replace(Z, 'nope'), method === 'GET' || method === 'DELETE' ? undefined : {});
  expect(res.statusCode).toBe(400);
});

async function setup() {
  const a = await createUser({ name: 'Alice' });
  const b = await createUser({ name: 'Bob' });
  const outsider = await createUser();
  const g = await createGroup(a, [b]);
  return { a, b, outsider, g };
}
const split = (a: TestUser, b: TestUser, x = 50, y = 50) => [{ user_id: a.id, amount: x }, { user_id: b.id, amount: y }];

describe('expenses', () => {
  test('create, read, list, update, splits, settle, food items, delete', async () => {
    const { a, b, outsider, g } = await setup();
    const body = { group_id: g, description: 'Dinner', amount: 100, paid_by: a.id, split_type: 'equal', splits: split(a, b) };

    expect((await call(outsider, 'POST', '/expenses', body)).statusCode).toBe(403);
    expect((await call(a, 'POST', '/expenses', { ...body, splits: split(a, b, 50, 40) })).statusCode).toBe(400);
    expect((await call(a, 'POST', '/expenses', { ...body, amount: -1 })).statusCode).toBe(400);
    expect((await call(a, 'POST', '/expenses', { ...body, paid_by: outsider.id })).statusCode).toBe(400);
    const { amount: _, ...noAmount } = body;
    expect((await call(a, 'POST', '/expenses', noAmount)).json().error).toBe('amount is required');

    const created = await call(a, 'POST', '/expenses', body);
    expect(created.statusCode).toBe(201);
    const e = created.json();
    expect(Number(e.amount)).toBe(100);

    const list = await call(b, 'GET', `/expenses?group_id=${g}&status=pending&sort=amount&search=Din`);
    expect(list.json().map((x: any) => x.id)).toEqual([e.id]);
    expect((await call(outsider, 'GET', '/expenses')).json()).toEqual([]);
    expect((await call(a, 'GET', '/expenses?limit=0')).statusCode).toBe(400);

    const detail = await call(b, 'GET', `/expenses/${e.id}`);
    expect(detail.json().splits).toHaveLength(2);
    expect(detail.json().paid_by_user.push_token).toBeUndefined();
    expect((await call(outsider, 'GET', `/expenses/${e.id}`)).statusCode).toBe(403);
    expect((await call(a, 'GET', `/expenses/${crypto.randomUUID()}`)).statusCode).toBe(404);

    // Only the payer or a group admin may edit; b is neither.
    expect((await call(b, 'PATCH', `/expenses/${e.id}`, { description: 'x' })).statusCode).toBe(403);
    expect((await call(a, 'PATCH', `/expenses/${e.id}`, { amount: 120 })).statusCode).toBe(400); // splits no longer add up
    const upd = await call(a, 'PATCH', `/expenses/${e.id}`, { amount: 120, description: 'Dinner 2', splits: split(a, b, 60, 60) });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().description).toBe('Dinner 2');

    expect((await call(a, 'PUT', `/expenses/${e.id}/splits`, { splits: split(a, b, 10, 10) })).statusCode).toBe(400);
    expect((await call(b, 'PUT', `/expenses/${e.id}/splits`, { splits: split(a, b, 60, 60) })).statusCode).toBe(403);
    expect((await call(a, 'PUT', `/expenses/${e.id}/splits`, { splits: split(a, b, 20, 100) })).json()).toEqual({ ok: true });

    expect((await call(b, 'GET', `/expenses/${e.id}/food-items`)).json()).toEqual([]);
    expect((await call(outsider, 'GET', `/expenses/${e.id}/food-items`)).statusCode).toBe(403);

    const bSplit = (await db.query('select id from expense_splits where expense_id = $1 and user_id = $2', [e.id, b.id])).rows[0].id;
    expect((await call(b, 'POST', `/expense-splits/${bSplit}/settle`)).statusCode).toBe(403);
    expect((await call(a, 'POST', `/expense-splits/${crypto.randomUUID()}/settle`)).statusCode).toBe(404);
    const settled = await call(a, 'POST', `/expense-splits/${bSplit}/settle`);
    expect(settled.json().is_settled).toBe(true);

    expect((await call(b, 'DELETE', `/expenses/${e.id}`)).statusCode).toBe(403);
    expect((await call(a, 'DELETE', `/expenses/${e.id}`)).statusCode).toBe(204);
    expect((await call(a, 'GET', `/expenses/${e.id}`)).statusCode).toBe(404);
  });

  test('food expense amount is the sum of its items', async () => {
    const { a, b, g } = await setup();
    const res = await call(a, 'POST', '/expenses', {
      group_id: g, description: 'Lunch', paid_by: a.id, split_type: 'unequal', splits: split(a, b, 15, 10),
      food_items: [{ item_name: 'Tea', quantity: 2, unit_price: 5 }, { item_name: 'Cake', quantity: 1, unit_price: 15 }],
    });
    expect(res.statusCode).toBe(201);
    expect(Number(res.json().amount)).toBe(25);
    expect((await call(b, 'GET', `/expenses/${res.json().id}/food-items`)).json()).toHaveLength(2);
  });

  test('summaries', async () => {
    const { a, b, outsider, g } = await setup();
    await call(a, 'POST', '/expenses', { group_id: g, description: 'X', amount: 100, paid_by: a.id, split_type: 'equal', splits: split(a, b) });
    const s = (await call(b, 'GET', `/groups/${g}/summary`)).json();
    expect(s).toMatchObject({ total_spent: 100, expense_count: 1, my_paid: 0, my_share: 50 });
    expect((await call(outsider, 'GET', `/groups/${g}/summary`)).statusCode).toBe(403);
    expect((await call(b, 'GET', '/me/expense-summary')).json()).toMatchObject({ total_i_owe: 50, total_owed_to_me: 0 });
    expect((await call(a, 'GET', '/me/expense-summary')).json()).toMatchObject({ total_paid_by_me: 100, total_owed_to_me: 50 });
  });

  test('receipts/delete clears a visible receipt reference', async () => {
    const { a, b, outsider, g } = await setup();
    const url = `http://test.local/files/receipts/${a.id}-r.webp`;
    const e = (await call(a, 'POST', '/expenses', {
      group_id: g, description: 'R', amount: 10, paid_by: a.id, split_type: 'equal', splits: split(a, b, 5, 5), receipt_url: url,
    })).json();
    expect((await call(a, 'POST', '/receipts/delete', {})).statusCode).toBe(400);
    expect((await call(outsider, 'POST', '/receipts/delete', { url })).json()).toEqual({ deleted: false });
    expect((await call(b, 'POST', '/receipts/delete', { url })).json()).toEqual({ deleted: true });
    expect((await db.query('select receipt_url from expenses where id = $1', [e.id])).rows[0].receipt_url).toBeNull();
  });
});

describe('settlements', () => {
  test('create marks related splits settled; list is scoped', async () => {
    const { a, b, outsider, g } = await setup();
    const e = (await call(a, 'POST', '/expenses', { group_id: g, description: 'X', amount: 100, paid_by: a.id, split_type: 'equal', splits: split(a, b) })).json();
    const body = { group_id: g, from_user: b.id, to_user: a.id, amount: 50, related_expense_ids: [e.id] };
    expect((await call(a, 'POST', '/settlements', { ...body, amount: 0 })).statusCode).toBe(400);
    expect((await call(outsider, 'POST', '/settlements', body)).statusCode).toBe(403);
    expect((await call(a, 'POST', '/settlements', { ...body, from_user: outsider.id })).statusCode).toBe(400);
    const c = await createUser();
    await db.query('insert into group_memberships (group_id, user_id) values ($1, $2)', [g, c.id]);
    expect((await call(c, 'POST', '/settlements', body)).statusCode).toBe(403); // not a party
    const res = await call(b, 'POST', '/settlements', body);
    expect(res.statusCode).toBe(201);
    const { rows } = await db.query('select is_settled from expense_splits where expense_id = $1 and user_id = $2', [e.id, b.id]);
    expect(rows[0].is_settled).toBe(true);

    expect((await call(a, 'GET', `/settlements?group_id=${g}`)).json().map((s: any) => s.id)).toEqual([res.json().id]);
    expect((await call(outsider, 'GET', '/settlements')).json()).toEqual([]);
    expect((await call(outsider, 'GET', `/settlements?group_id=${g}`)).statusCode).toBe(403);
    expect((await call(a, 'GET', '/settlements?group_id=bad')).statusCode).toBe(400);
  });

  test('bulk settlement settles every debtor to the recipient', async () => {
    const { a, b, outsider, g } = await setup();
    await call(a, 'POST', '/expenses', { group_id: g, description: 'X', amount: 100, paid_by: a.id, split_type: 'equal', splits: split(a, b) });
    const sum = (await call(b, 'GET', `/groups/${g}/bulk-settlement-summary?recipient_id=${a.id}`)).json();
    expect(sum).toMatchObject({ recipient_id: a.id, total_amount: 50, member_debts: [{ user_id: b.id, total_owed: 50, expense_count: 1 }] });
    expect((await call(b, 'GET', `/groups/${g}/bulk-settlement-summary`)).statusCode).toBe(400);
    expect((await call(outsider, 'GET', `/groups/${g}/bulk-settlement-summary?recipient_id=${a.id}`)).statusCode).toBe(403);

    expect((await call(a, 'POST', '/bulk-settlements', { group_id: g })).statusCode).toBe(400);
    expect((await call(b, 'POST', '/bulk-settlements', { group_id: g, recipient_id: a.id })).statusCode).toBe(403);
    expect((await call(a, 'POST', '/bulk-settlements', { group_id: g, recipient_id: outsider.id })).statusCode).toBe(400);
    const res = await call(a, 'POST', '/bulk-settlements', { group_id: g, recipient_id: a.id });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toHaveLength(1);
    expect((await call(a, 'POST', '/bulk-settlements', { group_id: g, recipient_id: a.id })).json().error).toBe('No debts to settle');
  });
});

describe('advance collections', () => {
  test('create, list, contribute, reject, approve, complete', async () => {
    const { a, b, outsider, g } = await setup();
    expect((await call(a, 'POST', '/advance-collections', { group_id: g, recipient_id: a.id })).statusCode).toBe(400);
    expect((await call(a, 'POST', '/advance-collections', { group_id: g, recipient_id: outsider.id, total_amount: 100 })).statusCode).toBe(400);
    expect((await call(outsider, 'POST', '/advance-collections', { group_id: g, recipient_id: a.id, total_amount: 100 })).statusCode).toBe(403);
    const res = await call(b, 'POST', '/advance-collections', { group_id: g, recipient_id: a.id, total_amount: 100, description: 'Rent' });
    expect(res.statusCode).toBe(201);
    const col = res.json();
    expect(Number(col.per_member_amount)).toBe(50);
    expect(col.contributions).toHaveLength(2);
    const { rows: notes } = await db.query(`select user_id from notifications where related_id = $1`, [col.id]);
    expect(notes.map((n) => n.user_id)).toEqual([a.id]); // creator is not notified

    expect((await call(b, 'GET', `/advance-collections/${col.id}`)).json().id).toBe(col.id);
    expect((await call(outsider, 'GET', `/advance-collections/${col.id}`)).statusCode).toBe(403);
    expect((await call(a, 'GET', `/advance-collections/${crypto.randomUUID()}`)).statusCode).toBe(404);
    expect((await call(a, 'GET', `/groups/${g}/advance-collections?status=active&page=1&limit=10`)).json()).toHaveLength(1);
    expect((await call(a, 'GET', `/groups/${g}/advance-collections?status=bogus`)).statusCode).toBe(400);
    expect((await call(outsider, 'GET', `/groups/${g}/advance-collections`)).statusCode).toBe(403);

    const contrib = (u: TestUser) => col.contributions.find((c: any) => c.user_id === u.id).id;
    expect((await call(a, 'POST', `/advance-contributions/${contrib(b)}/contribute`, {})).statusCode).toBe(404); // not mine
    expect((await call(b, 'POST', `/advance-contributions/${contrib(b)}/contribute`, { notes: 5 })).statusCode).toBe(400);
    expect((await call(b, 'POST', `/advance-contributions/${contrib(b)}/contribute`, { notes: 'paid' })).json().status).toBe('paid');

    expect((await call(outsider, 'POST', `/advance-contributions/${contrib(b)}/reject`, {})).statusCode).toBe(403);
    expect((await call(a, 'POST', `/advance-contributions/${contrib(b)}/reject`, { reason: 'not received' })).json().status).toBe('pending');
    expect((await call(a, 'POST', `/advance-contributions/${contrib(b)}/reject`, {})).json().error).toBe('Nothing to reject');
    expect((await call(a, 'POST', `/advance-contributions/${contrib(b)}/reject`, { reason: 1 })).statusCode).toBe(400);

    expect((await call(outsider, 'POST', `/advance-contributions/${contrib(b)}/approve`)).statusCode).toBe(403);
    expect((await call(a, 'POST', `/advance-contributions/${crypto.randomUUID()}/approve`)).statusCode).toBe(404);
    expect((await call(a, 'POST', `/advance-contributions/${contrib(b)}/approve`)).json().status).toBe('paid');
    await call(a, 'POST', `/advance-contributions/${contrib(a)}/contribute`, {});
    expect((await call(a, 'GET', `/advance-collections/${col.id}`)).json().status).toBe('completed');

    const stats = (await call(b, 'GET', `/groups/${g}/bulk-stats`)).json();
    expect(stats).toMatchObject({ totalCount: 1, completedCount: 1, pendingCount: 0 });
    expect((await call(outsider, 'GET', `/groups/${g}/bulk-stats`)).statusCode).toBe(403);
  });
});

describe('personal finance', () => {
  test('transactions are scoped to the caller', async () => {
    const u = await createUser();
    const other = await createUser();
    const body = { type: 'expense', category: 'Food', amount: 12.5, description: 'Snack', date: '2026-01-02' };
    expect((await call(u, 'POST', '/personal-transactions', { ...body, type: 'gift' })).statusCode).toBe(400);
    const t = (await call(u, 'POST', '/personal-transactions', body));
    expect(t.statusCode).toBe(201);
    await call(u, 'POST', '/personal-transactions', { ...body, type: 'income', amount: 100, date: '2026-02-01' });
    expect((await call(u, 'GET', '/personal-transactions?start=2026-01-01&end=2026-01-31')).json()).toHaveLength(1);
    expect((await call(u, 'GET', '/personal-transactions?start=junk')).statusCode).toBe(400);
    expect((await call(other, 'GET', '/personal-transactions')).json()).toEqual([]);

    const id = t.json().id;
    expect((await call(other, 'PATCH', `/personal-transactions/${id}`, { amount: 1 })).statusCode).toBe(404);
    expect((await call(u, 'PATCH', `/personal-transactions/${id}`, { amount: -1 })).statusCode).toBe(400);
    expect((await call(u, 'PATCH', `/personal-transactions/${id}`, { amount: 20 })).json().amount).toBe(20);
    expect((await call(u, 'GET', '/me/complete-balance')).json()).toMatchObject({ total_income: 100, total_personal_expenses: 20 });

    await call(other, 'DELETE', `/personal-transactions/${id}`);
    expect((await call(u, 'GET', '/personal-transactions')).json()).toHaveLength(2); // other can't delete it
    expect((await call(u, 'DELETE', `/personal-transactions/${id}`)).statusCode).toBe(204);
    expect((await call(u, 'GET', '/personal-transactions')).json()).toHaveLength(1);
  });

  test('categories and complete balance', async () => {
    const u = await createUser();
    expect(Array.isArray((await call(u, 'GET', '/personal-categories')).json())).toBe(true);
    expect((await call(u, 'GET', '/me/complete-balance')).json().user_id).toBe(u.id);
    const ghost = await createUser();
    await db.query('delete from profiles where id = $1', [ghost.id]);
    expect((await call(ghost, 'GET', '/me/complete-balance')).statusCode).toBe(404);
  });

  test('debts: debtor creates, either side settles, only debtor deletes', async () => {
    const u = await createUser();
    const cred = await createUser();
    const stranger = await createUser();
    expect((await call(u, 'POST', '/personal-debts', { creditor_id: cred.id, amount: 0, description: 'x' })).statusCode).toBe(400);
    const d = await call(u, 'POST', '/personal-debts', { creditor_id: cred.id, amount: 30, description: 'Loan' });
    expect(d.statusCode).toBe(201);
    const id = d.json().id;
    expect((await call(cred, 'GET', '/personal-debts')).json().map((x: any) => x.id)).toEqual([id]);
    expect((await call(stranger, 'GET', '/personal-debts')).json()).toEqual([]);
    expect((await call(stranger, 'POST', `/personal-debts/${id}/settle`)).statusCode).toBe(404);
    expect((await call(cred, 'POST', `/personal-debts/${id}/settle`)).json().is_settled).toBe(true);
    await call(cred, 'DELETE', `/personal-debts/${id}`);
    expect((await call(u, 'GET', '/personal-debts')).json()).toHaveLength(1);
    expect((await call(u, 'DELETE', `/personal-debts/${id}`)).statusCode).toBe(204);
    expect((await call(u, 'GET', '/personal-debts')).json()).toEqual([]);
  });
});
