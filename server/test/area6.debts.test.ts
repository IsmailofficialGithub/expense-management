import { expect, test } from 'vitest';
import { auth, covers, createGroup, createUser, db, getApp, tokenFor, type TestUser } from './helpers.js';

covers('GET /groups/:id/debts', 'GET /admin/debts');

const call = async (u: { token: string } | null, method: 'GET' | 'POST', url: string, payload?: unknown) =>
  (await getApp()).inject({ method, url, payload: payload as any, headers: u ? auth(u) : {} });

async function expense(by: TestUser, group: string, description: string, shares: [TestUser, number][]) {
  const amount = shares.reduce((t, [, a]) => t + a, 0);
  const r = await call(by, 'POST', '/expenses', {
    group_id: group, description, amount, paid_by: by.id, split_type: 'unequal',
    splits: shares.map(([u, a]) => ({ user_id: u.id, amount: a })),
  });
  expect(r.statusCode).toBe(201);
}

test('pairwise debts trace back to expenses and repayments, and match balances', async () => {
  const shareer = await createUser({ name: 'Shareer' });
  const ali = await createUser({ name: 'Ali' });
  const sara = await createUser({ name: 'Sara' });
  const outsider = await createUser();
  const g = await createGroup(shareer, [ali, sara]);

  await expense(shareer, g, 'Lunch', [[shareer, 500], [ali, 1500]]);
  await expense(shareer, g, 'Taxi', [[ali, 900]]);
  await expense(ali, g, 'Groceries', [[ali, 300], [shareer, 300]]);
  await expense(sara, g, 'Movie', [[sara, 600], [ali, 600]]);
  expect((await call(ali, 'POST', '/settlements', { group_id: g, from_user: ali.id, to_user: shareer.id, amount: 500 })).statusCode).toBe(201);

  expect((await call(null, 'GET', `/groups/${g}/debts`)).statusCode).toBe(401);
  expect((await call(outsider, 'GET', `/groups/${g}/debts`)).statusCode).toBe(403);
  const r = await call(sara, 'GET', `/groups/${g}/debts`);
  expect(r.statusCode).toBe(200);
  const { debts, members } = r.json();

  expect(debts.map((d: any) => [d.from, d.to, d.amount])).toEqual([[ali.id, shareer.id, 1600], [ali.id, sara.id, 600]]);
  expect(debts[0].items.map((i: any) => [i.kind, i.label, i.amount])).toEqual([
    ['expense', 'Lunch', 1500], ['expense', 'Taxi', 900], ['expense', 'Groceries', -300], ['settlement', 'Repayment', -500],
  ]);
  expect(Object.fromEntries(members.map((m: any) => [m.full_name, m.balance]))).toEqual({ Ali: -2200, Sara: 600, Shareer: 1600 });

  const balances = (await call(sara, 'GET', `/groups/${g}/balances`)).json();
  for (const m of members) expect(Number(balances.find((b: any) => b.user_id === m.user_id).balance)).toBeCloseTo(m.balance);
});

test('admin debts: group list and one group', async () => {
  const { rows: [row] } = await db.query(`select id, email from users where email = 'admin@test.local'`);
  const admin = row ? { token: await tokenFor(row, { adm: true }) } : await createUser({ email: 'admin@test.local', adm: true });
  const a = await createUser({ name: 'A' });
  const b = await createUser({ name: 'B' });
  const g = await createGroup(a, [b], { name: 'Debt house' });
  await expense(a, g, 'Rent', [[a, 100], [b, 100]]);

  expect((await call(null, 'GET', '/admin/debts')).statusCode).toBe(401);
  expect([401, 403]).toContain((await call(a, 'GET', '/admin/debts')).statusCode);
  const list = (await call(admin, 'GET', '/admin/debts')).json();
  expect(list.find((x: any) => x.id === g)).toMatchObject({ name: 'Debt house', open_debts: 1, outstanding: 100, members: 2 });

  expect((await call(admin, 'GET', '/admin/debts?group_id=nope')).statusCode).toBe(400);
  expect((await call(admin, 'GET', '/admin/debts?group_id=00000000-0000-0000-0000-000000000000')).statusCode).toBe(404);
  const one = (await call(admin, 'GET', `/admin/debts?group_id=${g}`)).json();
  expect(one.group).toEqual({ id: g, name: 'Debt house' });
  expect(one.debts).toMatchObject([{ from: b.id, to: a.id, amount: 100 }]);
});
