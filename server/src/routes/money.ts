import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { requireUser } from '../auth.js';
import { assertGroupAdmin, assertGroupMember, HttpError } from '../access.js';
import { publish } from '../realtime.js';
import { deleteUpload } from '../uploads.js';
import { sendMail } from '../mail.js';

const id = z.string().uuid();
const money = z.number().finite().nonnegative();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}/);
const optText = z.string().max(2000).nullish();

// to_jsonb keeps numerics as JSON numbers (like PostgREST did); never leak push tokens.
const prof = (a: string) => `(to_jsonb(${a}) - 'push_token' - 'push_token_updated_at')`;
const EXPENSE_LIST = `to_jsonb(e) || jsonb_build_object(
  'category', (select to_jsonb(c) from expense_categories c where c.id = e.category_id),
  'paid_by_user', (select ${prof('p')} from profiles p where p.id = e.paid_by),
  'splits', coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object('user', ${prof('u')}) order by s.created_at)
                        from expense_splits s join profiles u on u.id = s.user_id where s.expense_id = e.id), '[]'))`;
const EXPENSE_DETAIL = `${EXPENSE_LIST} || jsonb_build_object(
  'group', (select to_jsonb(g) from groups g where g.id = e.group_id),
  'hotel', (select to_jsonb(h) from hotels h where h.id = e.hotel_id),
  'food_items', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from expense_food_items f where f.expense_id = e.id), '[]'),
  'payment_method', (select to_jsonb(m) from user_payment_methods m
                      where m.id = e.payment_method_id and (m.is_visible_to_groups or m.user_id = $2)))`;
const COLLECTION = `to_jsonb(c) || jsonb_build_object(
  'recipient', (select ${prof('p')} from profiles p where p.id = c.recipient_id),
  'created_by_user', (select ${prof('p')} from profiles p where p.id = c.created_by),
  'contributions', coalesce((select jsonb_agg(to_jsonb(ac) || jsonb_build_object('user', ${prof('u')}) order by ac.created_at)
                             from advance_collection_contributions ac join profiles u on u.id = ac.user_id
                            where ac.collection_id = c.id), '[]'))`;

const splitSchema = z.object({
  user_id: id,
  amount: money,
  percentage: z.number().finite().nullish(),
  shares: z.number().finite().nullish(),
});
const foodItemSchema = z.object({
  menu_item_id: id.nullish(),
  item_name: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
  unit_price: money,
});
const expenseFields = {
  category_id: id.nullish(),
  description: z.string().trim().min(1).max(500),
  amount: money,
  paid_by: id,
  date: date.nullish(),
  notes: optText,
  receipt_url: z.string().url().max(1000).nullish(),
  split_type: z.enum(['equal', 'unequal', 'percentage', 'shares']),
  payment_method_id: id.nullish(),
  payment_method_type: z.string().max(50).nullish(),
  hotel_id: id.nullish(),
};
const createExpense = z.object({
  group_id: id,
  ...expenseFields,
  amount: money.optional(),
  splits: z.array(splitSchema).min(1).max(200),
  food_items: z.array(foodItemSchema).max(200).optional(),
});
const updateExpense = z.object({ ...expenseFields, splits: z.array(splitSchema).min(1).max(200).optional() }).partial();

async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

async function insertSplits(c: PoolClient, expenseId: string, splits: z.infer<typeof splitSchema>[]) {
  await c.query(
    `insert into expense_splits (expense_id, user_id, amount, percentage, shares)
     select $1, * from unnest($2::uuid[], $3::numeric[], $4::numeric[], $5::numeric[])`,
    [expenseId, splits.map((s) => s.user_id), splits.map((s) => s.amount),
      splits.map((s) => s.percentage ?? null), splits.map((s) => s.shares ?? null)],
  );
}

// Run inside the write transaction, on the final state: payer and split users are members, splits sum to amount.
async function assertExpenseValid(c: PoolClient, expenseId: string) {
  const { rows: [r] } = await c.query(
    `select e.amount, (select coalesce(sum(amount), 0) from expense_splits where expense_id = e.id) as split_sum,
            (select count(*) from expense_splits s where s.expense_id = e.id) as split_count,
            exists (select 1 from group_members where group_id = e.group_id and user_id = e.paid_by) as payer_ok,
            not exists (select 1 from expense_splits s where s.expense_id = e.id and not exists
              (select 1 from group_members gm where gm.group_id = e.group_id and gm.user_id = s.user_id)) as splits_ok
       from expenses e where e.id = $1`,
    [expenseId],
  );
  if (!r.payer_ok) throw new HttpError(400, 'Payer must be a group member');
  if (!r.splits_ok) throw new HttpError(400, 'Split users must be group members');
  if (Number(r.split_count) && Math.abs(Number(r.amount) - Number(r.split_sum)) > 0.01) {
    throw new HttpError(400, 'Splits must add up to the expense amount');
  }
}

// Looks up the expense's real group (never trust a client group id) and checks membership.
async function expenseGroup(expenseId: string, userId: string) {
  const { rows } = await db.query('select group_id, receipt_url, paid_by from expenses where id = $1', [expenseId]);
  if (!rows.length) throw new HttpError(404, 'Expense not found');
  await assertGroupMember(rows[0].group_id, userId);
  return rows[0] as { group_id: string; receipt_url: string | null; paid_by: string };
}

const isGroupAdmin = (groupId: string, userId: string) => assertGroupAdmin(groupId, userId).then(() => true, () => false);

// Changing an expense or its splits: the payer or a group admin.
async function assertExpenseOwner(e: { group_id: string; paid_by: string }, userId: string) {
  if (e.paid_by !== userId && !(await isGroupAdmin(e.group_id, userId))) {
    throw new HttpError(403, 'Only the payer or a group admin can change this expense');
  }
}

const expenseRow = async (expenseId: string) =>
  (await db.query('select to_jsonb(e) j from expenses e where id = $1', [expenseId])).rows[0]?.j;

type NewNotification = { user_id: string; title: string; message: string; type: string; related_id?: string | null; metadata?: unknown };
async function notify(list: NewNotification[]) {
  if (!list.length) return;
  const { rows } = await db.query(
    `insert into notifications (user_id, title, message, type, related_id, metadata)
     select * from jsonb_to_recordset($1::jsonb) as x(user_id uuid, title text, message text, type text, related_id uuid, metadata jsonb)
     returning *`,
    [JSON.stringify(list.map((n) => ({ related_id: null, metadata: null, ...n })))],
  );
  await Promise.all(rows.map((n) => publish(`user:${n.user_id}`, 'notification', { type: 'INSERT', new: n })));
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

async function completeIfAllPaid(c: PoolClient, collectionId: string) {
  const { rows } = await c.query(
    `update group_advance_collections set status = 'completed', completed_at = now(), updated_at = now()
      where id = $1 and status <> 'completed'
        and not exists (select 1 from advance_collection_contributions where collection_id = $1 and status <> 'paid')
     returning recipient_id, total_amount`,
    [collectionId],
  );
  return rows[0] as { recipient_id: string; total_amount: string } | undefined;
}

async function bulkSummary(groupId: string, recipientId: string) {
  const { rows: [recipient] } = await db.query('select full_name from profiles where id = $1', [recipientId]);
  if (!recipient) throw new HttpError(404, 'Recipient not found');
  const { rows } = await db.query(
    `select b.user_id, coalesce(p.full_name, 'Unknown') as user_name, abs(b.balance)::float8 as total_owed,
            (select count(*)::int from expenses e where e.group_id = $1 and exists
               (select 1 from expense_splits s where s.expense_id = e.id and s.user_id = b.user_id and not s.is_settled)) as expense_count
       from user_group_balances b join profiles p on p.id = b.user_id
      where b.group_id = $1 and b.user_id <> $2 and b.balance < 0`,
    [groupId, recipientId],
  );
  return {
    recipient_id: recipientId,
    recipient_name: recipient.full_name || 'Unknown',
    total_amount: rows.reduce((s, d) => s + d.total_owed, 0),
    member_debts: rows as { user_id: string; user_name: string; total_owed: number; expense_count: number }[],
  };
}

export async function moneyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  // ---------- expenses ----------
  app.get('/expenses', async (req) => {
    const f = z.object({
      group_id: id.optional(), category_id: id.optional(), paid_by: id.optional(),
      date_from: date.optional(), date_to: date.optional(),
      min_amount: z.coerce.number().optional(), max_amount: z.coerce.number().optional(),
      search: z.string().max(200).optional(),
    }).parse(req.query);
    const params: unknown[] = [req.user.sub];
    const where = ['e.group_id in (select group_id from group_members where user_id = $1)'];
    const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    if (f.group_id) add('e.group_id = ?', f.group_id);
    if (f.category_id) add('e.category_id = ?', f.category_id);
    if (f.paid_by) add('e.paid_by = ?', f.paid_by);
    if (f.date_from) add('e.date >= ?', f.date_from);
    if (f.date_to) add('e.date <= ?', f.date_to);
    if (f.min_amount) add('e.amount >= ?', f.min_amount);
    if (f.max_amount) add('e.amount <= ?', f.max_amount);
    if (f.search) add(`e.description ilike '%' || ? || '%'`, f.search.replace(/[%_\\]/g, '\\$&'));
    const { rows } = await db.query(
      `select ${EXPENSE_LIST} j from expenses e where ${where.join(' and ')} order by e.date desc, e.created_at desc`, params);
    return rows.map((r) => r.j);
  });

  app.get<{ Params: { id: string } }>('/expenses/:id', async (req) => {
    const expenseId = id.parse(req.params.id);
    await expenseGroup(expenseId, req.user.sub);
    const { rows } = await db.query(`select ${EXPENSE_DETAIL} j from expenses e where e.id = $1`, [expenseId, req.user.sub]);
    return rows[0].j;
  });

  // Plain and food expenses: expense + food items + splits in one transaction.
  app.post('/expenses', async (req, reply) => {
    const b = createExpense.parse(req.body);
    await assertGroupMember(b.group_id, req.user.sub);
    const food = b.food_items ?? [];
    const amount = food.length
      ? Math.round(food.reduce((s, i) => s + i.quantity * i.unit_price, 0) * 100) / 100
      : b.amount;
    if (amount === undefined) throw new HttpError(400, 'amount is required');
    const expenseId = await tx(async (c) => {
      const { rows: [e] } = await c.query(
        `insert into expenses (group_id, category_id, description, amount, paid_by, date, notes, receipt_url, split_type,
                               payment_method_id, payment_method_type, hotel_id)
         values ($1, $2, $3, $4, $5, coalesce($6::date, current_date), $7, $8, $9, $10, $11, $12) returning id`,
        [b.group_id, b.category_id ?? null, b.description, amount, b.paid_by, b.date ?? null, b.notes ?? null,
          b.receipt_url ?? null, b.split_type, b.payment_method_id ?? null, b.payment_method_type ?? null, b.hotel_id ?? null],
      );
      if (food.length) {
        await c.query(
          `insert into expense_food_items (expense_id, hotel_id, menu_item_id, item_name, quantity, unit_price, total_price)
           select $1, $2, * from unnest($3::uuid[], $4::text[], $5::int[], $6::numeric[], $7::numeric[])`,
          [e.id, b.hotel_id ?? null, food.map((i) => i.menu_item_id ?? null), food.map((i) => i.item_name),
            food.map((i) => i.quantity), food.map((i) => i.unit_price), food.map((i) => i.quantity * i.unit_price)],
        );
      }
      await insertSplits(c, e.id, b.splits);
      await assertExpenseValid(c, e.id);
      return e.id as string;
    });
    const row = await expenseRow(expenseId);
    await publish(`group:${b.group_id}`, 'expense', { type: 'INSERT', new: row, old: null });
    return reply.code(201).send(row);
  });

  app.patch<{ Params: { id: string } }>('/expenses/:id', async (req) => {
    const expenseId = id.parse(req.params.id);
    const { splits, ...fields } = updateExpense.parse(req.body);
    const current = await expenseGroup(expenseId, req.user.sub);
    await assertExpenseOwner(current, req.user.sub);
    const old = await expenseRow(expenseId);
    const keys = Object.keys(fields).filter((k) => (fields as any)[k] !== undefined);
    await tx(async (c) => {
      if (keys.length) {
        await c.query(
          `update expenses set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() where id = $1`,
          [expenseId, ...keys.map((k) => (fields as any)[k])],
        );
      }
      if (splits) {
        await c.query('delete from expense_splits where expense_id = $1', [expenseId]);
        await insertSplits(c, expenseId, splits);
      }
      await assertExpenseValid(c, expenseId);
    });
    if (fields.receipt_url !== undefined && fields.receipt_url !== current.receipt_url) await deleteUpload(current.receipt_url, req.user.sub);
    const row = await expenseRow(expenseId);
    await publish(`group:${current.group_id}`, 'expense', { type: 'UPDATE', new: row, old });
    return row;
  });

  app.put<{ Params: { id: string } }>('/expenses/:id/splits', async (req) => {
    const expenseId = id.parse(req.params.id);
    const { splits } = z.object({ splits: z.array(splitSchema).max(200) }).parse(req.body);
    const e = await expenseGroup(expenseId, req.user.sub);
    await assertExpenseOwner(e, req.user.sub);
    const { group_id } = e;
    await tx(async (c) => {
      await c.query('delete from expense_splits where expense_id = $1', [expenseId]);
      if (splits.length) await insertSplits(c, expenseId, splits);
      await assertExpenseValid(c, expenseId);
    });
    const row = await expenseRow(expenseId);
    await publish(`group:${group_id}`, 'expense', { type: 'UPDATE', new: row, old: row });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/expenses/:id', async (req, reply) => {
    const expenseId = id.parse(req.params.id);
    const e = await expenseGroup(expenseId, req.user.sub);
    await assertExpenseOwner(e, req.user.sub);
    const { group_id, receipt_url } = e;
    const old = await expenseRow(expenseId);
    await db.query('delete from expenses where id = $1', [expenseId]); // splits + food items cascade
    await deleteUpload(receipt_url, req.user.sub);
    await publish(`group:${group_id}`, 'expense', { type: 'DELETE', new: null, old });
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>('/expenses/:id/food-items', async (req) => {
    const expenseId = id.parse(req.params.id);
    await expenseGroup(expenseId, req.user.sub);
    const { rows } = await db.query(
      'select to_jsonb(f) j from expense_food_items f where expense_id = $1 order by created_at', [expenseId]);
    return rows.map((r) => r.j);
  });

  app.post<{ Params: { id: string } }>('/expense-splits/:id/settle', async (req) => {
    const splitId = id.parse(req.params.id);
    const { rows } = await db.query(
      'select e.group_id, e.id, e.paid_by from expense_splits s join expenses e on e.id = s.expense_id where s.id = $1', [splitId]);
    if (!rows.length) throw new HttpError(404, 'Split not found');
    await assertGroupMember(rows[0].group_id, req.user.sub);
    // Only the creditor (payer) or an admin can mark someone's debt as paid.
    await assertExpenseOwner(rows[0], req.user.sub);
    const { rows: [s] } = await db.query(
      'update expense_splits s set is_settled = true, settled_at = now() where id = $1 returning to_jsonb(s) j', [splitId]);
    await publish(`group:${rows[0].group_id}`, 'expense', { type: 'UPDATE', new: await expenseRow(rows[0].id), old: null });
    return s.j;
  });

  // Removes a receipt the caller can see (their group's expense or their own transaction) and clears the reference.
  app.post('/receipts/delete', async (req) => {
    const { url } = z.object({ url: z.string().max(1000) }).parse(req.body);
    const exp = await db.query(
      `update expenses set receipt_url = null, updated_at = now() where receipt_url = $1
         and group_id in (select group_id from group_members where user_id = $2) returning id`, [url, req.user.sub]);
    const tr = await db.query(
      `update personal_transactions set receipt_url = null, updated_at = now() where receipt_url = $1 and user_id = $2 returning id`,
      [url, req.user.sub]);
    if (!exp.rowCount && !tr.rowCount) return { deleted: false };
    await deleteUpload(url, req.user.sub);
    return { deleted: true };
  });

  // ---------- settlements ----------
  app.post('/settlements', async (req, reply) => {
    const b = z.object({
      group_id: id, from_user: id, to_user: id, amount: money.positive(),
      notes: optText, related_expense_ids: z.array(id).max(500).nullish(),
    }).parse(req.body);
    await assertGroupMember(b.group_id, req.user.sub);
    if (req.user.sub !== b.from_user && req.user.sub !== b.to_user) throw new HttpError(403, 'You must be part of the settlement');
    const row = await tx(async (c) => {
      const { rows: [m] } = await c.query(
        'select count(*)::int n from group_members where group_id = $1 and user_id = any($2::uuid[])',
        [b.group_id, [b.from_user, b.to_user]]);
      if (m.n !== new Set([b.from_user, b.to_user]).size) throw new HttpError(400, 'Both users must be group members');
      const { rows: [s] } = await c.query(
        `insert into settlements (group_id, from_user, to_user, amount, notes, related_expense_ids)
         values ($1, $2, $3, $4, $5, $6) returning to_jsonb(settlements) j`,
        [b.group_id, b.from_user, b.to_user, b.amount, b.notes ?? null, b.related_expense_ids ?? null]);
      if (b.related_expense_ids?.length) {
        await c.query(
          `update expense_splits set is_settled = true, settled_at = now()
            where user_id = $1 and expense_id in (select id from expenses where id = any($2::uuid[]) and group_id = $3)`,
          [b.from_user, b.related_expense_ids, b.group_id]);
      }
      return s.j;
    });
    await publish(`group:${b.group_id}`, 'settlement', { type: 'INSERT', new: row, old: null });
    return reply.code(201).send(row);
  });

  app.get('/settlements', async (req) => {
    const { group_id } = z.object({ group_id: id.optional() }).parse(req.query);
    if (group_id) await assertGroupMember(group_id, req.user.sub);
    const { rows } = await db.query(
      `select to_jsonb(s) j from settlements s
        where s.group_id in (select group_id from group_members where user_id = $1) and ($2::uuid is null or s.group_id = $2)
        order by s.settled_at desc`, [req.user.sub, group_id ?? null]);
    return rows.map((r) => r.j);
  });

  // ---------- advance collections / bulk payments ----------
  app.post('/advance-collections', async (req, reply) => {
    const b = z.object({
      group_id: id, recipient_id: id,
      total_amount: money.positive().optional(), per_member_amount: money.positive().optional(),
      description: z.string().max(1000).nullish(),
    }).parse(req.body);
    await assertGroupMember(b.group_id, req.user.sub);
    const me = req.user.sub;
    const collectionId = await tx(async (c) => {
      const { rows: members } = await c.query('select user_id from group_members where group_id = $1', [b.group_id]);
      if (!members.length) throw new HttpError(400, 'Group has no members');
      if (!members.some((m) => m.user_id === b.recipient_id)) throw new HttpError(400, 'Recipient must be a group member');
      let total = b.total_amount;
      let per = b.per_member_amount;
      if (total && !per) per = total / members.length;
      else if (per && !total) total = per * members.length;
      else if (!total && !per) throw new HttpError(400, 'Either total_amount or per_member_amount must be provided');
      const { rows: [col] } = await c.query(
        `insert into group_advance_collections (group_id, recipient_id, total_amount, per_member_amount, description, created_by)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [b.group_id, b.recipient_id, total, per, b.description || null, me]);
      // Every member (recipient included) gets a pending contribution.
      await c.query(
        `insert into advance_collection_contributions (collection_id, user_id, amount, status)
         select $1, user_id, $3, 'pending' from group_members where group_id = $2`,
        [col.id, b.group_id, per]);
      return col.id as string;
    });
    const { rows: [full] } = await db.query(`select ${COLLECTION} j from group_advance_collections c where c.id = $1`, [collectionId]);
    const collection = full.j;
    const per = Number(collection.per_member_amount);
    const total = Number(collection.total_amount);

    // Notifications + emails are best effort: the collection already exists.
    try {
      const { rows: [info] } = await db.query(
        `select (select name from groups where id = $1) as group_name,
                (select full_name from profiles where id = $2) as recipient_name,
                (select full_name from profiles where id = $3) as creator_name`, [b.group_id, b.recipient_id, me]);
      const recipientName = info.recipient_name || 'Someone';
      const groupName = info.group_name || 'the group';
      const creatorName = info.creator_name || 'A member';
      const { rows: members } = await db.query(
        'select p.id, p.email, p.full_name from group_members gm join profiles p on p.id = gm.user_id where gm.group_id = $1',
        [b.group_id]);
      await notify(members.filter((m) => m.id !== me).map((m) => ({
        user_id: m.id,
        title: 'New Advance Collection',
        message: `A new advance collection of ₹${per.toFixed(2)} per member has been created. Recipient: ${recipientName}`,
        type: 'payment_received',
        related_id: collectionId,
        metadata: { collection_id: collectionId, group_id: b.group_id, recipient_id: b.recipient_id, per_member_amount: per },
      })));
      for (const m of members) {
        if (!m.email) continue;
        sendMail(m.email, `New Advance Collection in "${groupName}" - ₹${per.toFixed(2)} per member`,
          `<p>Hi ${escapeHtml(m.full_name || 'there')},</p>
           <p><strong>${escapeHtml(creatorName)}</strong> has created a new advance collection in <strong>"${escapeHtml(groupName)}"</strong>.</p>
           <p><strong>Recipient:</strong> ${escapeHtml(recipientName)}<br><strong>Amount per Member:</strong> ₹${per.toFixed(2)}<br>
           <strong>Total Amount:</strong> ₹${total.toFixed(2)}${b.description ? `<br><strong>Description:</strong> ${escapeHtml(b.description)}` : ''}</p>
           <p>Open the Flatmates app, go to "${escapeHtml(groupName)}" → Advance Collections and mark your contribution (₹${per.toFixed(2)}) as paid.</p>`,
        ).catch((e) => req.log.warn(e, 'advance collection email failed'));
      }
    } catch (e) {
      req.log.warn(e, 'advance collection notifications failed');
    }
    await publish(`group:${b.group_id}`, 'advance_collection', { type: 'INSERT', new: collection, old: null });
    return reply.code(201).send(collection);
  });

  app.get<{ Params: { id: string } }>('/advance-collections/:id', async (req) => {
    const { rows } = await db.query(
      `select c.group_id, ${COLLECTION} j from group_advance_collections c where c.id = $1`, [id.parse(req.params.id)]);
    if (!rows.length) throw new HttpError(404, 'Collection not found');
    await assertGroupMember(rows[0].group_id, req.user.sub);
    return rows[0].j;
  });

  app.get<{ Params: { groupId: string } }>('/groups/:groupId/advance-collections', async (req) => {
    const groupId = id.parse(req.params.groupId);
    const q = z.object({
      page: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().positive().max(200).optional(),
      status: z.enum(['active', 'completed', 'cancelled', 'all']).optional(),
      dateFrom: date.optional(), dateTo: date.optional(),
    }).parse(req.query);
    await assertGroupMember(groupId, req.user.sub);
    const paged = q.page !== undefined && q.limit !== undefined;
    const { rows } = await db.query(
      `select ${COLLECTION} j from group_advance_collections c
        where c.group_id = $1 and ($2::text is null or c.status = $2)
          and ($3::date is null or c.created_at >= $3::date)
          and ($4::date is null or c.created_at < $4::date + 1)
        order by c.created_at desc limit $5 offset $6`,
      [groupId, q.status && q.status !== 'all' ? q.status : null, q.dateFrom ?? null, q.dateTo ?? null,
        paged ? q.limit : null, paged ? (q.page! - 1) * q.limit! : 0]);
    return rows.map((r) => r.j);
  });

  // Contributor marks their own contribution paid (auto-approved, as in the old app).
  app.post<{ Params: { id: string } }>('/advance-contributions/:id/contribute', async (req) => {
    const contributionId = id.parse(req.params.id);
    const { notes } = z.object({ notes: z.string().max(1000).nullish() }).parse(req.body ?? {});
    const me = req.user.sub;
    const { row, done, col } = await tx(async (c) => {
      const { rows } = await c.query(
        `update advance_collection_contributions ac
            set status = 'paid', contributed_at = now(), approved_at = now(), approved_by = $2, notes = $3
          where id = $1 and user_id = $2 returning to_jsonb(ac) j`, [contributionId, me, notes || null]);
      if (!rows.length) throw new HttpError(404, 'Contribution not found');
      const { rows: [colRow] } = await c.query(
        'select id, group_id, recipient_id, total_amount from group_advance_collections where id = $1', [rows[0].j.collection_id]);
      return { row: rows[0].j, done: await completeIfAllPaid(c, colRow.id), col: colRow };
    });
    if (me !== col.recipient_id) {
      const { rows: [p] } = await db.query('select full_name from profiles where id = $1', [me]);
      const list: NewNotification[] = [{
        user_id: col.recipient_id, title: 'Payment Received',
        message: `${p?.full_name || 'A member'} has paid their contribution (₹${Number(row.amount).toFixed(2)}).`,
        type: 'payment_received', related_id: col.id,
        metadata: { collection_id: col.id, contribution_id: contributionId, amount: row.amount },
      }];
      if (done) list.push({
        user_id: col.recipient_id, title: 'Advance Collection Completed',
        message: `All members have contributed. Total received: ₹${Number(col.total_amount).toFixed(2)}`,
        type: 'payment_received', related_id: col.id,
        metadata: { collection_id: col.id, total_amount: Number(col.total_amount) },
      });
      await notify(list).catch((e) => req.log.warn(e, 'contribution notification failed'));
    }
    await publish(`group:${col.group_id}`, 'advance_collection', { type: 'UPDATE', new: row, old: null });
    return row;
  });

  // Recipient or creator approves/rejects someone's contribution.
  async function collectionOfContribution(contributionId: string, userId: string) {
    const { rows } = await db.query(
      `select ac.user_id, c.id, c.group_id, c.recipient_id, c.created_by, c.total_amount
         from advance_collection_contributions ac join group_advance_collections c on c.id = ac.collection_id
        where ac.id = $1`, [contributionId]);
    if (!rows.length) throw new HttpError(404, 'Contribution not found');
    if (rows[0].recipient_id !== userId && rows[0].created_by !== userId) {
      throw new HttpError(403, 'Only the recipient can review contributions');
    }
    return rows[0];
  }

  app.post<{ Params: { id: string } }>('/advance-contributions/:id/approve', async (req) => {
    const contributionId = id.parse(req.params.id);
    const col = await collectionOfContribution(contributionId, req.user.sub);
    const { row, done } = await tx(async (c) => {
      const { rows: [r] } = await c.query(
        `update advance_collection_contributions ac set status = 'paid', approved_by = $2, approved_at = now()
          where id = $1 returning to_jsonb(ac) j`, [contributionId, req.user.sub]);
      return { row: r.j, done: await completeIfAllPaid(c, col.id) };
    });
    if (done) {
      await notify([{
        user_id: col.recipient_id, title: 'Advance Collection Completed',
        message: `All members have contributed. Total received: ₹${Number(col.total_amount).toFixed(2)}`,
        type: 'payment_received', related_id: col.id,
        metadata: { collection_id: col.id, total_amount: Number(col.total_amount) },
      }]).catch((e) => req.log.warn(e, 'completion notification failed'));
    }
    await publish(`group:${col.group_id}`, 'advance_collection', { type: 'UPDATE', new: row, old: null });
    return row;
  });

  app.post<{ Params: { id: string } }>('/advance-contributions/:id/reject', async (req) => {
    const contributionId = id.parse(req.params.id);
    const { reason } = z.object({ reason: z.string().max(1000).nullish() }).parse(req.body ?? {});
    const col = await collectionOfContribution(contributionId, req.user.sub);
    const r = await tx(async (c) => {
      const { rows: [row] } = await c.query(
        `update advance_collection_contributions ac set status = 'pending', contributed_at = null, notes = $2
          where id = $1 and status <> 'pending' returning to_jsonb(ac) j`, [contributionId, reason ? `Rejected: ${reason}` : 'Rejected by recipient']);
      if (!row) throw new HttpError(400, 'Nothing to reject');
      // A rejected payment reopens a completed collection.
      await c.query(`update group_advance_collections set status = 'active', completed_at = null, updated_at = now()
                        where id = $1 and status = 'completed'`, [col.id]);
      return row;
    });
    await notify([{
      user_id: col.user_id, title: 'Contribution Rejected',
      message: reason || 'Your contribution was rejected. Please contact the recipient.',
      type: 'payment_received', related_id: col.id,
      metadata: { collection_id: col.id, contribution_id: contributionId },
    }]).catch((e) => req.log.warn(e, 'rejection notification failed'));
    await publish(`group:${col.group_id}`, 'advance_collection', { type: 'UPDATE', new: r.j, old: null });
    return r.j;
  });

  app.get<{ Params: { groupId: string } }>('/groups/:groupId/bulk-stats', async (req) => {
    const groupId = id.parse(req.params.groupId);
    await assertGroupMember(groupId, req.user.sub);
    const { rows: [s] } = await db.query(
      `select count(*) filter (where status = 'active')::int as "activeCount",
              count(*)::int as "totalCount",
              count(*) filter (where status = 'completed')::int as "completedCount",
              coalesce(sum(total_amount), 0)::float8 as "totalAmount",
              coalesce(sum(total_amount) filter (where status = 'active'), 0)::float8 as "activeAmount",
              (select count(*)::int from advance_collection_contributions ac join group_advance_collections c2 on c2.id = ac.collection_id
                where c2.group_id = $1 and ac.status in ('pending', 'pending_approval')) as "pendingCount",
              (select coalesce(sum(ac.amount), 0)::float8 from advance_collection_contributions ac join group_advance_collections c2 on c2.id = ac.collection_id
                where c2.group_id = $1 and ac.status in ('pending', 'pending_approval')) as "pendingAmount"
         from group_advance_collections where group_id = $1`, [groupId]);
    return s;
  });

  app.get<{ Params: { groupId: string } }>('/groups/:groupId/bulk-settlement-summary', async (req) => {
    const groupId = id.parse(req.params.groupId);
    const { recipient_id } = z.object({ recipient_id: id }).parse(req.query);
    await assertGroupMember(groupId, req.user.sub);
    return bulkSummary(groupId, recipient_id);
  });

  app.post('/bulk-settlements', async (req, reply) => {
    const b = z.object({ group_id: id, recipient_id: id, notes: z.string().max(1000).nullish() }).parse(req.body);
    await assertGroupMember(b.group_id, req.user.sub);
    if (b.recipient_id !== req.user.sub && !(await isGroupAdmin(b.group_id, req.user.sub))) {
      throw new HttpError(403, 'Only the recipient or a group admin can record a bulk settlement');
    }
    await assertGroupMember(b.group_id, b.recipient_id).catch(() => { throw new HttpError(400, 'Recipient must be a group member'); });
    const summary = await bulkSummary(b.group_id, b.recipient_id);
    if (!summary.member_debts.length) throw new HttpError(400, 'No debts to settle');
    const debts = summary.member_debts;
    const created = await tx(async (c) => {
      const { rows } = await c.query(
        `insert into settlements (group_id, from_user, to_user, amount, notes, is_bulk, bulk_settlement_id)
         select $1, d.user_id, $2, d.amount, coalesce($3::text, 'Bulk settlement - ' || d.cnt || ' expenses'), true, $7
           from unnest($4::uuid[], $5::numeric[], $6::int[]) as d(user_id, amount, cnt)
         returning *`,
        [b.group_id, b.recipient_id, b.notes || null, debts.map((d) => d.user_id), debts.map((d) => d.total_owed),
          debts.map((d) => d.expense_count), randomUUID()]);
      await c.query(
        `update expense_splits set is_settled = true, settled_at = now()
          where not is_settled and user_id = any($2::uuid[]) and expense_id in (select id from expenses where group_id = $1)`,
        [b.group_id, debts.map((d) => d.user_id)]);
      const { rows: out } = await c.query('select to_jsonb(s) j from settlements s where id = any($1::uuid[])', [rows.map((r) => r.id)]);
      return out.map((r) => r.j);
    });
    await notify([
      {
        user_id: b.recipient_id, title: 'Bulk Settlement Received',
        message: `You received ₹${summary.total_amount.toFixed(2)} from ${debts.length} member(s)`,
        type: 'payment_received', metadata: { group_id: b.group_id, total_amount: summary.total_amount, is_bulk: true },
      },
      ...debts.map((d) => ({
        user_id: d.user_id, title: 'Bulk Settlement',
        message: `You paid ₹${d.total_owed.toFixed(2)} to ${summary.recipient_name} (${d.expense_count} expenses)`,
        type: 'payment_received',
        metadata: { group_id: b.group_id, recipient_id: b.recipient_id, amount: d.total_owed, is_bulk: true },
      })),
    ]).catch((e) => req.log.warn(e, 'bulk settlement notifications failed'));
    await publish(`group:${b.group_id}`, 'settlement', { type: 'INSERT', new: created, old: null });
    return reply.code(201).send(created);
  });

  // ---------- personal finance (always scoped to the caller) ----------
  const txFields = {
    type: z.enum(['income', 'expense']),
    category: z.string().min(1).max(100),
    amount: money,
    description: z.string().trim().min(1).max(500),
    date: date.nullish(),
    notes: optText,
    receipt_url: z.string().url().max(1000).nullish(),
  };

  app.get('/personal-transactions', async (req) => {
    const q = z.object({ start: date.optional(), end: date.optional() }).parse(req.query);
    const { rows } = await db.query(
      `select to_jsonb(t) j from personal_transactions t
        where user_id = $1 and ($2::date is null or date >= $2) and ($3::date is null or date <= $3)
        order by date desc, created_at desc`, [req.user.sub, q.start ?? null, q.end ?? null]);
    return rows.map((r) => r.j);
  });

  app.post('/personal-transactions', async (req, reply) => {
    const b = z.object(txFields).parse(req.body);
    const { rows: [r] } = await db.query(
      `insert into personal_transactions as t (user_id, type, category, amount, description, date, notes, receipt_url)
       values ($1, $2, $3, $4, $5, coalesce($6::date, current_date), $7, $8) returning to_jsonb(t) j`,
      [req.user.sub, b.type, b.category, b.amount, b.description, b.date ?? null, b.notes ?? null, b.receipt_url ?? null]);
    return reply.code(201).send(r.j);
  });

  app.patch<{ Params: { id: string } }>('/personal-transactions/:id', async (req) => {
    const txId = id.parse(req.params.id);
    const b = z.object(txFields).partial().parse(req.body);
    const { rows: cur } = await db.query('select receipt_url from personal_transactions where id = $1 and user_id = $2', [txId, req.user.sub]);
    if (!cur.length) throw new HttpError(404, 'Transaction not found');
    const keys = Object.keys(b).filter((k) => (b as any)[k] !== undefined);
    const { rows: [r] } = await db.query(
      `update personal_transactions t set ${keys.map((k, i) => `${k} = $${i + 3}, `).join('')}updated_at = now()
        where id = $1 and user_id = $2 returning to_jsonb(t) j`,
      [txId, req.user.sub, ...keys.map((k) => (b as any)[k])]);
    if (b.receipt_url !== undefined && b.receipt_url !== cur[0].receipt_url) await deleteUpload(cur[0].receipt_url, req.user.sub);
    return r.j;
  });

  app.delete<{ Params: { id: string } }>('/personal-transactions/:id', async (req, reply) => {
    const { rows } = await db.query(
      'delete from personal_transactions where id = $1 and user_id = $2 returning receipt_url', [id.parse(req.params.id), req.user.sub]);
    if (rows.length) await deleteUpload(rows[0].receipt_url, req.user.sub);
    return reply.code(204).send();
  });

  app.get('/personal-categories', async () => {
    const { rows } = await db.query('select to_jsonb(c) j from personal_categories c order by name');
    return rows.map((r) => r.j);
  });

  app.get('/me/complete-balance', async (req) => {
    const { rows } = await db.query('select to_jsonb(b) j from user_complete_balance b where user_id = $1', [req.user.sub]);
    if (!rows.length) throw new HttpError(404, 'Profile not found');
    return rows[0].j;
  });

  // ---------- personal debts ----------
  app.get('/personal-debts', async (req) => {
    const { rows } = await db.query(
      'select to_jsonb(d) j from personal_debts d where user_id = $1 or creditor_id = $1 order by created_at desc', [req.user.sub]);
    return rows.map((r) => r.j);
  });

  app.post('/personal-debts', async (req, reply) => {
    const b = z.object({ creditor_id: id, amount: money.positive(), description: z.string().trim().min(1).max(500), due_date: date.nullish() })
      .parse(req.body);
    const { rows: [r] } = await db.query(
      `insert into personal_debts as d (user_id, creditor_id, amount, description, due_date)
       values ($1, $2, $3, $4, $5) returning to_jsonb(d) j`,
      [req.user.sub, b.creditor_id, b.amount, b.description, b.due_date ?? null]);
    return reply.code(201).send(r.j);
  });

  app.post<{ Params: { id: string } }>('/personal-debts/:id/settle', async (req) => {
    const { rows } = await db.query(
      `update personal_debts d set is_settled = true, settled_at = now(), updated_at = now()
        where id = $1 and (user_id = $2 or creditor_id = $2) returning to_jsonb(d) j`, [id.parse(req.params.id), req.user.sub]);
    if (!rows.length) throw new HttpError(404, 'Debt not found');
    return rows[0].j;
  });

  app.delete<{ Params: { id: string } }>('/personal-debts/:id', async (req, reply) => {
    await db.query('delete from personal_debts where id = $1 and user_id = $2', [id.parse(req.params.id), req.user.sub]);
    return reply.code(204).send();
  });
}
