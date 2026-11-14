import { db } from './db.js';

// Who owes whom in a group, pair by pair, straight from the expenses (not simplified), so every debt can
// be traced back to the expenses and repayments behind it.
//
// For each pair the expenses one paid for the other offset each other, and repayments reduce the debt.
// Each member's balance (owed to them minus what they owe) matches user_group_balances.

export type DebtItem = {
  kind: 'expense' | 'settlement';
  id: string;
  label: string;
  date: string;
  paid_by: string; // who paid the expense / who made the repayment
  amount: number;  // effect on the debt: + adds to what `from` owes `to`, - reduces it
};
export type Debt = { from: string; to: string; amount: number; items: DebtItem[] };
export type DebtMember = { user_id: string; full_name: string; avatar_url: string | null; status: string; balance: number };
export type GroupDebts = { members: DebtMember[]; debts: Debt[] };

const cents = (n: number) => Math.round(n * 100) / 100;

export async function groupDebts(groupId: string): Promise<GroupDebts> {
  const [{ rows: shares }, { rows: repayments }, { rows: people }] = await Promise.all([
    db.query(
      `select e.id, e.description, e.date::text as date, e.paid_by, s.user_id, s.amount::float as amount
         from expenses e join expense_splits s on s.expense_id = e.id
        where e.group_id = $1 and s.user_id <> e.paid_by and s.amount > 0
        order by e.date, e.created_at`, [groupId]),
    db.query(
      `select id, from_user, to_user, amount::float as amount, settled_at::date::text as date, notes
         from settlements where group_id = $1 order by settled_at`, [groupId]),
    db.query(
      `select gm.user_id, gm.status, coalesce(nullif(p.full_name, ''), p.email, 'Unknown') as full_name, p.avatar_url
         from group_memberships gm join profiles p on p.id = gm.user_id where gm.group_id = $1`, [groupId]),
  ]);

  // Per unordered pair [lo, hi]: net > 0 means lo owes hi. Items are stored with their effect on lo's debt.
  const pairs = new Map<string, { lo: string; hi: string; net: number; items: DebtItem[] }>();
  const add = (debtor: string, creditor: string, amount: number, item: Omit<DebtItem, 'amount'>) => {
    const [lo, hi] = debtor < creditor ? [debtor, creditor] : [creditor, debtor];
    const key = `${lo}|${hi}`;
    const p = pairs.get(key) ?? pairs.set(key, { lo, hi, net: 0, items: [] }).get(key)!;
    const effect = debtor === lo ? amount : -amount;
    p.net += effect;
    p.items.push({ ...item, amount: effect });
  };
  for (const s of shares) {
    add(s.user_id, s.paid_by, s.amount, { kind: 'expense', id: s.id, label: s.description, date: s.date, paid_by: s.paid_by });
  }
  // A repayment from A to B reduces what A owes B (same as B owing A that amount).
  for (const r of repayments) {
    add(r.to_user, r.from_user, r.amount, { kind: 'settlement', id: r.id, label: r.notes || 'Repayment', date: r.date, paid_by: r.from_user });
  }

  const balance = new Map<string, number>();
  const debts: Debt[] = [];
  for (const p of pairs.values()) {
    const net = cents(p.net);
    if (Math.abs(net) < 0.01) continue;
    const [from, to, sign] = net > 0 ? [p.lo, p.hi, 1] : [p.hi, p.lo, -1];
    debts.push({ from, to, amount: Math.abs(net), items: p.items.map((i) => ({ ...i, amount: cents(i.amount * sign) })) });
    balance.set(from, (balance.get(from) ?? 0) - Math.abs(net));
    balance.set(to, (balance.get(to) ?? 0) + Math.abs(net));
  }
  debts.sort((a, b) => b.amount - a.amount);

  // Active members always show; pending/left members only when they still have money involved.
  const members: DebtMember[] = people
    .filter((m) => m.status === 'active' || balance.has(m.user_id))
    .map((m) => ({ user_id: m.user_id, full_name: m.full_name, avatar_url: m.avatar_url, status: m.status, balance: cents(balance.get(m.user_id) ?? 0) }))
    .sort((a, b) => a.balance - b.balance || a.full_name.localeCompare(b.full_name));
  return { members, debts };
}
