import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { redis } from '../redis.js';
import { issueTokens } from '../auth.js';
import { isSuperAdminEmail, requireSuperAdmin } from '../admin.js';
import { sendMail } from '../mail.js';
import { HttpError } from '../access.js';
import { publish } from '../realtime.js';
import { deleteAccount, defaultAvatar } from './auth.js';
import { tx, insertSplits, assertExpenseValid } from './money.js';
import { resendOutbound } from '../messaging.js';
import { getStatus, connect, disconnect, isOnWhatsApp, sendWhatsApp } from '../whatsapp.js';
import { runReports } from '../reports.js';

const email = z.string().trim().toLowerCase().email();
const uuid = z.string().uuid();
const str = (max = 500) => z.string().trim().max(max);
const opt = (max = 2000) => z.string().max(max).nullish();
const num = z.number().finite();
const bool = z.boolean();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}/);
const ts = z.string().datetime({ offset: true }).nullish();

type Resource = {
  table: string;
  // Read source when it differs from the table (joins / hidden columns); must expose the table's id column.
  from?: string;
  key?: 'uuid' | 'int' | 'text';
  pk?: string;
  search: string[];
  filters: string[];
  order?: string;
  write?: z.ZodObject<any>; // omitted = read-only
  required?: string[]; // fields needed on create (write schema is partial)
  touch?: boolean; // has updated_at
};

// One entry per admin page; the generic CRUD below serves them all. Column names come from the zod keys only.
const resources: Record<string, Resource> = {
  users: {
    table: 'profiles',
    from: `select p.id, p.email, p.full_name, p.avatar_url, p.phone, p.phone_e164, p.phone_needs_country, p.report_daily,
                  p.report_weekly, p.whatsapp_opt_in, p.created_at, p.updated_at, u.email_verified
             from profiles p join users u on u.id = p.id`,
    search: ['email', 'full_name', 'phone', 'phone_e164'], filters: ['phone_needs_country', 'email_verified'], touch: true,
    write: z.object({
      full_name: opt(200), avatar_url: opt(1000), phone: opt(50),
      phone_e164: z.string().regex(/^\+\d{7,15}$/).nullish(), phone_needs_country: bool,
      report_daily: bool, report_weekly: bool, whatsapp_opt_in: bool,
    }),
  },
  groups: {
    table: 'groups',
    from: `select g.*, coalesce(nullif(p.full_name, ''), p.email) as creator_name,
                  (select count(*)::int from group_members m where m.group_id = g.id) as member_count
             from groups g left join profiles p on p.id = g.created_by`,
    search: ['name', 'description', 'creator_name'], filters: ['created_by'], touch: true,
    write: z.object({ name: str(200).min(1), description: opt(), created_by: uuid }), required: ['name', 'created_by'],
  },
  members: {
    table: 'group_memberships',
    from: `select m.*, coalesce(nullif(p.full_name, ''), p.email) as user_name, p.email as user_email
             from group_memberships m left join profiles p on p.id = m.user_id`,
    search: ['user_name', 'user_email'], filters: ['group_id', 'user_id', 'status', 'role'], order: 'joined_at',
    write: z.object({ group_id: uuid, user_id: uuid, role: z.enum(['admin', 'member']), status: z.enum(['active', 'pending', 'left']) }),
    required: ['group_id', 'user_id'],
  },
  invitations: {
    table: 'group_invitations', search: ['invited_email'], filters: ['group_id', 'status', 'invited_by'],
    write: z.object({
      group_id: uuid, invited_by: uuid, invited_email: z.string().trim().toLowerCase().email(),
      status: z.enum(['pending', 'accepted', 'expired']), expires_at: ts,
    }),
    required: ['group_id', 'invited_by', 'invited_email'],
  },
  expenses: {
    table: 'expenses',
    from: `select e.*, g.name as group_name, coalesce(nullif(p.full_name, ''), p.email) as payer_name
             from expenses e left join groups g on g.id = e.group_id left join profiles p on p.id = e.paid_by`,
    search: ['description', 'notes', 'group_name', 'payer_name'], filters: ['group_id', 'paid_by', 'category_id', 'split_type'], touch: true,
    // Writes go through the dedicated routes below (split validation).
  },
  splits: {
    table: 'expense_splits', search: [], filters: ['expense_id', 'user_id', 'is_settled'],
    write: z.object({ is_settled: bool, settled_at: ts }),
  },
  'food-items': {
    table: 'expense_food_items', search: ['item_name'], filters: ['expense_id', 'hotel_id'],
    write: z.object({ item_name: str(200).min(1), quantity: z.number().int().positive(), unit_price: num.nonnegative(), total_price: num.nonnegative() }),
  },
  settlements: {
    table: 'settlements',
    from: `select s.*, g.name as group_name, coalesce(nullif(f.full_name, ''), f.email) as from_name, coalesce(nullif(t.full_name, ''), t.email) as to_name
             from settlements s left join groups g on g.id = s.group_id
             left join profiles f on f.id = s.from_user left join profiles t on t.id = s.to_user`,
    search: ['notes', 'group_name', 'from_name', 'to_name'], filters: ['group_id', 'from_user', 'to_user', 'is_bulk'],
    write: z.object({ group_id: uuid, from_user: uuid, to_user: uuid, amount: num.positive(), settled_at: ts, notes: opt() }),
    required: ['group_id', 'from_user', 'to_user', 'amount'],
  },
  advances: {
    table: 'group_advance_collections', search: ['description'], filters: ['group_id', 'recipient_id', 'status'], touch: true,
    write: z.object({
      group_id: uuid, recipient_id: uuid, created_by: uuid, total_amount: num.nonnegative(), per_member_amount: num.nonnegative().nullish(),
      status: z.enum(['active', 'completed', 'cancelled']), description: opt(), completed_at: ts,
    }),
    required: ['group_id', 'recipient_id', 'created_by', 'total_amount'],
  },
  contributions: {
    table: 'advance_collection_contributions', search: ['notes'], filters: ['collection_id', 'user_id', 'status'],
    write: z.object({
      collection_id: uuid, user_id: uuid, amount: num.nonnegative(),
      status: z.enum(['pending', 'pending_approval', 'paid', 'cancelled']), notes: opt(), contributed_at: ts,
    }),
    required: ['collection_id', 'user_id', 'amount'],
  },
  categories: {
    table: 'expense_categories', search: ['name'], filters: ['is_default'], order: 'name',
    write: z.object({ name: str(100).min(1), icon: str(100).min(1), color: str(50).min(1), is_default: bool }),
    required: ['name', 'icon', 'color'],
  },
  'personal-categories': {
    table: 'personal_categories', search: ['name'], filters: ['type', 'is_default'], order: 'name',
    write: z.object({ name: str(100).min(1), type: z.enum(['income', 'expense']), icon: str(100).min(1), color: str(50).min(1), is_default: bool }),
    required: ['name', 'type', 'icon', 'color'],
  },
  hotels: {
    table: 'hotels', search: ['name', 'location', 'phone'], filters: ['is_active'], touch: true,
    write: z.object({ name: str(200).min(1), location: opt(500), phone: opt(50), is_active: bool }), required: ['name'],
  },
  'menu-items': {
    table: 'hotel_menu_items', search: ['item_name', 'category'], filters: ['hotel_id', 'is_available'], touch: true,
    write: z.object({
      hotel_id: uuid, item_name: str(200).min(1), category: str(100).min(1), price: num.nonnegative(), description: opt(), is_available: bool,
    }),
    required: ['hotel_id', 'item_name', 'category', 'price'],
  },
  'payment-methods': {
    table: 'user_payment_methods', search: ['bank_name', 'account_title', 'custom_name'], filters: ['user_id', 'method_type'], touch: true,
    write: z.object({
      user_id: uuid, method_type: z.enum(['cash', 'bank', 'jazzcash', 'easypaisa', 'card', 'other']), is_default: bool,
      bank_name: opt(200), account_title: opt(200), account_number: opt(100), iban: opt(100), phone_number: opt(50),
      card_last_four: opt(4), custom_name: opt(200), notes: opt(), is_visible_to_groups: bool,
    }),
    required: ['user_id', 'method_type'],
  },
  transactions: {
    table: 'personal_transactions', search: ['description', 'category', 'notes'], filters: ['user_id', 'type'], touch: true,
    write: z.object({
      user_id: uuid, type: z.enum(['income', 'expense']), category: str(100).min(1), amount: num.nonnegative(),
      description: str(500).min(1), date, notes: opt(),
    }),
    required: ['user_id', 'type', 'category', 'amount', 'description'],
  },
  debts: {
    table: 'personal_debts', search: ['description'], filters: ['user_id', 'creditor_id', 'is_settled'], touch: true,
    write: z.object({
      user_id: uuid, creditor_id: uuid, amount: num, description: str(500).min(1), due_date: date.nullish(), is_settled: bool, settled_at: ts,
    }),
    required: ['user_id', 'creditor_id', 'amount', 'description'],
  },
  notifications: {
    table: 'notifications',
    from: `select n.*, coalesce(nullif(p.full_name, ''), p.email) as user_name from notifications n left join profiles p on p.id = n.user_id`,
    search: ['title', 'message', 'user_name'], filters: ['user_id', 'type', 'is_read'],
    write: z.object({ user_id: uuid, title: str(200).min(1), message: str(2000).min(1), type: str(50).min(1), is_read: bool }),
    required: ['user_id', 'title', 'message', 'type'],
  },
  chats: {
    table: 'conversations',
    // title: group name, or the two people's names for a direct chat.
    from: `select c.*, coalesce(g.name, (select string_agg(coalesce(nullif(p.full_name, ''), p.email), ' & ' order by p.full_name)
                    from conversation_participants cp join profiles p on p.id = cp.user_id where cp.conversation_id = c.id)) as title,
                  (select count(*)::int from messages m where m.conversation_id = c.id) as message_count
             from conversations c left join groups g on g.id = c.group_id`,
    search: ['last_message_text', 'title'], filters: ['type', 'group_id'], order: 'coalesce(last_message_at, created_at)',
    touch: true, write: z.object({ type: z.enum(['group', 'individual']), group_id: uuid.nullish(), created_by: uuid }),
    required: ['type', 'created_by'],
  },
  participants: {
    table: 'conversation_participants',
    from: `select cp.*, coalesce(nullif(p.full_name, ''), p.email) as user_name
             from conversation_participants cp left join profiles p on p.id = cp.user_id`,
    search: ['user_name'], filters: ['conversation_id', 'user_id'], order: 'joined_at',
    write: z.object({ conversation_id: uuid, user_id: uuid, is_muted: bool }), required: ['conversation_id', 'user_id'],
  },
  messages: {
    table: 'messages',
    from: `select m.*, coalesce(nullif(p.full_name, ''), p.email) as sender_name from messages m left join profiles p on p.id = m.sender_id`,
    search: ['text', 'sender_name'], filters: ['conversation_id', 'sender_id', 'admin_action', 'is_deleted'],
    // Sending/editing goes through /admin/chats/:id/messages and PATCH /admin/messages/:id (admin_action label).
  },
  logs: { table: 'audit_logs', key: 'int', search: ['message', 'url', 'actor_email'], filters: ['actor_id', 'route', 'method', 'status', 'is_admin'] },
  outbound: { table: 'outbound_messages', key: 'int', search: ['to_addr', 'subject'], filters: ['channel', 'status', 'kind', 'user_id'] },
  settings: { table: 'system_settings', key: 'text', pk: 'key', search: ['key'], filters: [], order: 'key', write: z.object({ key: str(100).min(1), value: z.any() }), required: ['key', 'value'] },
};

const keySchema = { uuid, int: z.string().regex(/^\d{1,18}$/), text: z.string().min(1).max(100) };

function resourceOf(name: string) {
  const r = resources[name];
  if (!r) throw new HttpError(404, 'Unknown resource');
  return r;
}
function keyOf(r: Resource, id: string) {
  return keySchema[r.key ?? 'uuid'].parse(id);
}
// FK / unique / check violations are admin input errors, not server errors.
function pgInput(e: any): never {
  if (typeof e?.code === 'string' && e.code.startsWith('23')) throw new HttpError(400, e.detail || e.message);
  throw e;
}
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().trim().max(200).optional(),
  notify: z.string().optional(),
}).passthrough();
const notifyOn = (q: unknown) => (q as { notify?: string })?.notify === 'true';

async function snapshot(req: { user: { sub: string; email: string }; method: string; url: string }, what: string, row: unknown) {
  await db.query(
    `insert into audit_logs (actor_id, actor_email, is_admin, method, route, url, status, message, request)
     values ($1, $2, true, $3, 'snapshot', $4, 200, $5, $6)`,
    [req.user.sub, req.user.email, req.method, req.url, `Snapshot before delete: ${what}`, JSON.stringify(row)],
  );
}

// "Notify affected users" box: one in-app notification per user the row touches (plus active group members).
async function notifyAffected(row: Record<string, unknown>, resource: string, action: string) {
  const ids = new Set<string>();
  for (const k of ['user_id', 'paid_by', 'from_user', 'to_user', 'recipient_id', 'creditor_id', 'sender_id']) {
    if (typeof row[k] === 'string') ids.add(row[k] as string);
  }
  if (resource === 'users') ids.add(row.id as string);
  if (typeof row.group_id === 'string') {
    const { rows } = await db.query('select user_id from group_members where group_id = $1', [row.group_id]);
    rows.forEach((m) => ids.add(m.user_id));
  }
  if (!ids.size) return;
  const { rows } = await db.query(
    `insert into notifications (user_id, title, message, type, related_id)
     select u, 'Updated by admin', $2, 'admin_update', $3 from unnest($1::uuid[]) u
      where exists (select 1 from profiles where id = u) returning *`,
    [[...ids], `An administrator ${action} a ${resource.replace(/s$/, '')} that involves you.`, typeof row.id === 'string' ? row.id : null],
  );
  await Promise.all(rows.map((n) => publish(`user:${n.user_id}`, 'notification', { type: 'INSERT', new: n })));
}

const splitSchema = z.object({ user_id: uuid, amount: num.nonnegative(), percentage: num.nullish(), shares: num.nullish() });
const foodSchema = z.object({ menu_item_id: uuid.nullish(), item_name: str(200).min(1), quantity: z.number().int().positive(), unit_price: num.nonnegative() });
const expenseFields = z.object({
  category_id: uuid.nullish(), description: str(500).min(1), amount: num.nonnegative(), paid_by: uuid, date: date.nullish(),
  notes: opt(), receipt_url: z.string().url().max(1000).nullish(), split_type: z.enum(['equal', 'unequal', 'percentage', 'shares']),
  payment_method_id: uuid.nullish(), payment_method_type: opt(50), hotel_id: uuid.nullish(),
});

const strict = { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } };

// Paths start with /admin; register without a prefix. Other admin routes use { preHandler: requireSuperAdmin }.
export async function adminRoutes(app: FastifyInstance) {
  // Step 1: password, then a 6-digit code is emailed. Same 401 for wrong password and non-admin, so the
  // endpoint doesn't reveal who the admins are.
  app.post('/admin/login', strict, async (req, reply) => {
    const body = z.object({ email, password: z.string() }).parse(req.body);
    const { rows: [user] } = await db.query('select id, password_hash, email_verified from users where email = $1', [body.email]);
    if (!user || user.password_hash === '!' || !(await bcrypt.compare(body.password, user.password_hash)) || !isSuperAdminEmail(body.email)) {
      return reply.code(401).send({ error: 'Invalid login credentials' });
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await redis.multi().set(`adminOtp:${body.email}`, code, 'EX', 600).del(`adminOtpTries:${body.email}`).exec();
    await sendMail(body.email, 'Your Flatmate admin code', `<p>Your admin login code is <b>${code}</b>. It expires in 10 minutes.</p>`);
    return { ok: true };
  });

  // Step 2: correct code issues a token with the adm claim.
  app.post('/admin/verify', strict, async (req, reply) => {
    const body = z.object({ email, code: z.string().trim().regex(/^\d{6}$/) }).parse(req.body);
    const key = `adminOtp:${body.email}`;
    const [[, tries], , [, code]] = (await redis.multi().incr(`adminOtpTries:${body.email}`).expire(`adminOtpTries:${body.email}`, 600).get(key).exec())!;
    if (!code || Number(tries) > 5) return reply.code(400).send({ error: 'Code expired, request a new one' });
    if (code !== body.code) return reply.code(400).send({ error: 'Invalid code' });
    if (!(await redis.del(key))) return reply.code(400).send({ error: 'Code expired, request a new one' });
    if (!isSuperAdminEmail(body.email)) return reply.code(403).send({ error: 'Forbidden' });
    const { rows: [user] } = await db.query('select id, email from users where email = $1', [body.email]);
    if (!user) return reply.code(401).send({ error: 'Invalid login credentials' });
    return issueTokens(reply, user, { adm: true });
  });

  const sa = { preHandler: requireSuperAdmin };

  app.get('/admin/stats', sa, async () => {
    const { rows: [counts] } = await db.query(
      `select (select count(*) from profiles)::int as users, (select count(*) from groups)::int as groups,
              (select count(*) from expenses)::int as expenses, (select count(*) from settlements)::int as settlements,
              (select coalesce(sum(amount), 0) from expenses)::float as expense_total,
              (select coalesce(sum(amount), 0) from settlements)::float as settlement_total,
              (select count(*) from profiles where phone_needs_country)::int as phones_need_country,
              (select count(*) from outbound_messages where status = 'failed')::int as outbound_failed`);
    const { rows: logs } = await db.query(
      'select id, created_at, actor_email, method, route, status, message from audit_logs order by created_at desc limit 20');
    return { ...counts, whatsapp: getStatus(), logs };
  });

  // Users: create = users + profiles row; delete = the same anonymising deletion users get (never a hard delete).
  app.post('/admin/users', sa, async (req, reply) => {
    const body = resources.users.write!.partial().extend({ email, password: z.string().min(6).max(200) }).parse(req.body);
    const { email: e, password, ...profile } = body;
    const user = await tx(async (c) => {
      const { rows: [u] } = await c.query(
        'insert into users (email, password_hash, email_verified) values ($1, $2, true) returning id', [e, await bcrypt.hash(password, 10)],
      ).catch(pgInput);
      const cols = Object.keys(profile);
      const { rows: [p] } = await c.query(
        `insert into profiles (id, email, avatar_url${cols.map((k) => `, ${k}`).join('')})
         values ($1, $2, $3${cols.map((_, i) => `, $${i + 4}`).join('')}) returning *`,
        [u.id, e, defaultAvatar(u.id), ...Object.values(profile)],
      ).catch(pgInput);
      return p;
    });
    delete user.push_token;
    return reply.code(201).send(user);
  });
  const deleteUser = async (req: any) => {
    const id = uuid.parse(req.params.id);
    const { rows: [p] } = await db.query('select * from profiles where id = $1', [id]);
    if (!p) throw new HttpError(404, 'Not found');
    await snapshot(req, `user ${id}`, p);
    await deleteAccount(id);
    return { ok: true };
  };
  app.post('/admin/users/:id/delete', sa, deleteUser);
  app.delete('/admin/users/:id', sa, deleteUser);

  // Expenses: same validation as the app (payer/split members, splits sum to amount).
  app.post('/admin/expenses', sa, async (req, reply) => {
    const body = expenseFields.extend({
      group_id: uuid, amount: num.nonnegative().optional(),
      splits: z.array(splitSchema).min(1).max(200), food_items: z.array(foodSchema).max(200).optional(),
    }).parse(req.body);
    const { splits, food_items, ...fields } = body;
    const items = food_items ?? [];
    if (fields.amount === undefined) fields.amount = items.reduce((t, f) => t + f.quantity * f.unit_price, 0);
    const expense = await tx(async (c) => {
      const cols = Object.keys(fields);
      const { rows: [e] } = await c.query(
        `insert into expenses (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
        Object.values(fields),
      ).catch(pgInput);
      await insertSplits(c, e.id, splits).catch(pgInput);
      if (items.length) {
        await c.query(
          `insert into expense_food_items (expense_id, hotel_id, menu_item_id, item_name, quantity, unit_price, total_price)
           select $1, $2, x.menu_item_id, x.item_name, x.quantity, x.unit_price, x.quantity * x.unit_price
             from jsonb_to_recordset($3::jsonb) as x(menu_item_id uuid, item_name text, quantity int, unit_price numeric)`,
          [e.id, fields.hotel_id ?? null, JSON.stringify(items.map((f) => ({ menu_item_id: null, ...f })))],
        ).catch(pgInput);
      }
      await assertExpenseValid(c, e.id);
      return e;
    });
    if (notifyOn(req.query)) await notifyAffected(expense, 'expenses', 'added');
    return reply.code(201).send(expense);
  });
  app.patch('/admin/expenses/:id', sa, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const { splits, ...fields } = expenseFields.partial().extend({ splits: z.array(splitSchema).min(1).max(200).optional() }).parse(req.body);
    const expense = await tx(async (c) => {
      const cols = Object.keys(fields);
      const { rows: [e] } = await c.query(
        `update expenses set updated_at = now()${cols.map((k, i) => `, ${k} = $${i + 2}`).join('')} where id = $1 returning *`,
        [id, ...Object.values(fields)],
      ).catch(pgInput);
      if (!e) throw new HttpError(404, 'Not found');
      if (splits) {
        await c.query('delete from expense_splits where expense_id = $1', [id]);
        await insertSplits(c, id, splits).catch(pgInput);
      }
      await assertExpenseValid(c, id);
      return e;
    });
    if (notifyOn(req.query)) await notifyAffected(expense, 'expenses', 'edited');
    return expense;
  });

  // Chats: post / edit as a user; the label shows in the app.
  app.post('/admin/chats/:id/messages', sa, async (req, reply) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const body = z.object({ sender_id: uuid, text: z.string().min(1).max(5000) }).parse(req.body);
    const { rows: [m] } = await db.query(
      `insert into messages (conversation_id, sender_id, text, admin_action) values ($1, $2, $3, 'sent') returning *`,
      [id, body.sender_id, body.text],
    ).catch(pgInput);
    await publish(`conversation:${id}`, 'message', m);
    const { rows: parts } = await db.query('select user_id from conversation_participants where conversation_id = $1', [id]);
    await Promise.all(parts.map((p) => publish(`user:${p.user_id}`, 'conversation', { conversation_id: id, message: m })));
    return reply.code(201).send(m);
  });
  app.patch('/admin/messages/:id', sa, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const body = z.object({ text: z.string().min(1).max(5000) }).parse(req.body);
    const { rows: [m] } = await db.query(
      `update messages set text = $2, is_edited = true, admin_action = 'edited', updated_at = now() where id = $1 returning *`, [id, body.text]);
    if (!m) throw new HttpError(404, 'Not found');
    await publish(`conversation:${m.conversation_id}`, 'message_update', m);
    return m;
  });

  app.post('/admin/outbound/:id/resend', sa, async (req) => {
    const id = keySchema.int.parse((req.params as { id: string }).id);
    const { rowCount } = await db.query('select 1 from outbound_messages where id = $1', [id]);
    if (!rowCount) throw new HttpError(404, 'Not found');
    await resendOutbound(id);
    return { ok: true };
  });

  app.get('/admin/whatsapp/status', sa, async () => getStatus());
  app.post('/admin/whatsapp/connect', sa, async () => { await connect(); return getStatus(); });
  app.post('/admin/whatsapp/disconnect', sa, async () => { await disconnect(); return getStatus(); });

  // Direct send, bypassing the queue, so the admin sees the real result right away.
  app.post('/admin/whatsapp/test', sa, async (req) => {
    const { phone } = z.object({ phone: z.string().regex(/^\+\d{7,15}$/, 'Use international format, e.g. +923001234567') }).parse(req.body);
    if (getStatus().status !== 'connected') throw new HttpError(409, 'WhatsApp is not connected');
    if (!(await isOnWhatsApp(phone))) throw new HttpError(400, `${phone} is not on WhatsApp`);
    await sendWhatsApp(phone, 'Test message from Flatmate admin. WhatsApp delivery works.');
    return { ok: true };
  });

  app.post('/admin/reports/run', sa, async (req) => {
    const { type, user_id } = z.object({ type: z.enum(['daily', 'weekly']), user_id: uuid.optional() }).parse(req.query);
    return runReports(type, new Date(), true, user_id);
  });

  // Generic CRUD over the resources map. Static routes above win over these param routes.
  app.get('/admin/:resource', sa, async (req) => {
    const r = resourceOf((req.params as { resource: string }).resource);
    const { page, limit, q, notify: _n, ...rest } = listQuery.parse(req.query);
    const where: string[] = [];
    const args: unknown[] = [];
    if (q && r.search.length) {
      args.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
      where.push(`(${r.search.map((c) => `t.${c}::text ilike $${args.length}`).join(' or ')})`);
    }
    for (const f of r.filters) {
      const v = rest[f];
      if (typeof v !== 'string' || v === '') continue;
      args.push(v);
      where.push(`t.${f}::text = $${args.length}`);
    }
    const src = r.from ?? `select * from ${r.table}`;
    const cond = where.length ? `where ${where.join(' and ')}` : '';
    const { rows: [{ total }] } = await db.query(`select count(*)::int as total from (${src}) t ${cond}`, args);
    const { rows } = await db.query(
      `select t.* from (${src}) t ${cond} order by ${r.order ? r.order.replace(/(\w+)/g, (w) => (w === 'coalesce' ? w : `t.${w}`)) : 't.created_at'} desc
        limit ${limit} offset ${(page - 1) * limit}`,
      args,
    );
    return { rows: rows.map(({ push_token: _p, ...x }) => x), total, page, limit };
  });

  app.get('/admin/:resource/:id', sa, async (req) => {
    const p = req.params as { resource: string; id: string };
    const r = resourceOf(p.resource);
    const { rows: [row] } = await db.query(`select t.* from (${r.from ?? `select * from ${r.table}`}) t where t.${r.pk ?? 'id'} = $1`, [keyOf(r, p.id)]);
    if (!row) throw new HttpError(404, 'Not found');
    delete row.push_token;
    return row;
  });

  app.post('/admin/:resource', sa, async (req, reply) => {
    const name = (req.params as { resource: string }).resource;
    const r = resourceOf(name);
    if (!r.write) throw new HttpError(405, 'Read-only resource');
    const body = r.write.partial().parse(req.body) as Record<string, unknown>;
    const missing = (r.required ?? []).filter((k) => body[k] === undefined);
    if (missing.length) throw new HttpError(400, `Missing: ${missing.join(', ')}`);
    if ('value' in body) body.value = JSON.stringify(body.value);
    const cols = Object.keys(body);
    const { rows: [row] } = await db.query(
      `insert into ${r.table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`, Object.values(body),
    ).catch(pgInput);
    if (notifyOn(req.query)) await notifyAffected(row, name, 'added');
    return reply.code(201).send(row);
  });

  app.patch('/admin/:resource/:id', sa, async (req) => {
    const p = req.params as { resource: string; id: string };
    const r = resourceOf(p.resource);
    if (!r.write) throw new HttpError(405, 'Read-only resource');
    const body = r.write.partial().parse(req.body) as Record<string, unknown>;
    if ('value' in body) body.value = JSON.stringify(body.value);
    const cols = Object.keys(body);
    if (!cols.length) throw new HttpError(400, 'Nothing to update');
    const sets = cols.map((k, i) => `${k} = $${i + 2}`);
    if (r.touch || r.table === 'system_settings') sets.push('updated_at = now()');
    const { rows: [row] } = await db.query(
      `update ${r.table} set ${sets.join(', ')} where ${r.pk ?? 'id'} = $1 returning *`, [keyOf(r, p.id), ...Object.values(body)],
    ).catch(pgInput);
    if (!row) throw new HttpError(404, 'Not found');
    delete row.push_token;
    if (notifyOn(req.query)) await notifyAffected(row, p.resource, 'edited');
    return row;
  });

  // Hard delete: the full row is snapshotted into audit_logs first.
  app.delete('/admin/:resource/:id', sa, async (req) => {
    const p = req.params as { resource: string; id: string };
    const r = resourceOf(p.resource);
    const { rows: [row] } = await db.query(`select * from ${r.table} where ${r.pk ?? 'id'} = $1`, [keyOf(r, p.id)]);
    if (!row) throw new HttpError(404, 'Not found');
    await snapshot(req, `${p.resource} ${p.id}`, row);
    await db.query(`delete from ${r.table} where ${r.pk ?? 'id'} = $1`, [keyOf(r, p.id)]).catch(pgInput);
    if (notifyOn(req.query)) await notifyAffected(row, p.resource, 'deleted');
    return { ok: true };
  });
}
