import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { requireUser } from '../auth.js';
import { assertConversationParticipant, assertGroupMember, HttpError } from '../access.js';
import { publish } from '../realtime.js';
import { deliver } from '../messaging.js';

const uuid = z.string().uuid();
const auth = { preHandler: requireUser };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

type NewNotification = { user_id: string; title: string; message: string; type: string; related_id?: string | null; metadata?: unknown };

async function unreadCount(userId: string) {
  const { rows } = await db.query('select count(*)::int as n from notifications where user_id = $1 and not is_read', [userId]);
  return rows[0].n as number;
}

// Best effort: push failures never fail the request.
export async function sendPush(tokens: (string | null)[], title: string, body: string, data: unknown = {}, badge?: number) {
  const valid = tokens.filter((t): t is string => !!t?.startsWith('ExponentPushToken'));
  if (!valid.length) return;
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(valid.map((to) => ({
        to, sound: 'default', title, body, data, badge, priority: 'high', channelId: 'expense_notifications',
      }))),
    });
    if (!res.ok) console.error('Expo push failed', await res.text());
  } catch (e) {
    console.error('Expo push failed', e);
  }
}

export async function insertNotifications(list: NewNotification[]) {
  if (!list.length) return [];
  const { rows } = await db.query(
    `insert into notifications (user_id, title, message, type, related_id, metadata)
     select * from jsonb_to_recordset($1::jsonb)
       as x(user_id uuid, title text, message text, type text, related_id uuid, metadata jsonb)
     returning *`,
    [JSON.stringify(list)],
  );
  for (const n of rows) await publish(`user:${n.user_id}`, 'notification', { type: 'INSERT', new: n });
  return rows;
}

function expenseEmail(name: string, paidBy: string, group: string, desc: string, share: number, total: number) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:20px 0;font-family:'Segoe UI',Tahoma,sans-serif;background:#f9f9f9;">
<table role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#6200EE,#9c27b0);padding:40px 20px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:28px;">Expense Added</h1></td></tr>
<tr><td style="padding:40px 30px;">
<p style="color:#333;font-size:18px;">Hi ${esc(name || 'there')},</p>
<p style="color:#555;font-size:16px;line-height:1.6;"><strong>${esc(paidBy)}</strong> added a new expense in <strong>"${esc(group)}"</strong> and you are included in it.</p>
<div style="background:#f0f4ff;border-left:5px solid #6200EE;padding:25px;border-radius:8px;">
<div style="color:#666;font-size:14px;text-transform:uppercase;">Description</div>
<div style="color:#1a1a1a;font-size:20px;font-weight:600;padding-bottom:20px;">${esc(desc)}</div>
<div style="color:#666;font-size:14px;text-transform:uppercase;">Your Share</div>
<div style="color:#6200EE;font-size:32px;font-weight:700;">₹${share.toFixed(2)}</div>
<div style="color:#888;font-size:14px;padding-top:15px;">Total Amount: ₹${total.toFixed(2)}</div></div>
<p style="text-align:center;margin-top:20px;"><a href="https://flatmates-expense.vercel.app" style="background:#6200EE;color:#fff;padding:16px 32px;border-radius:8px;text-decoration:none;font-weight:600;">View Details in App</a></p>
</td></tr>
<tr><td style="padding:30px;text-align:center;background:#fcfcfc;border-top:1px solid #eee;color:#999;font-size:13px;">Flatmates Expense Tracker helps you manage group expenses easily.<br>This is an automated notification. Please do not reply to this email.</td></tr>
</table></body></html>`;
}

// For someone added to an expense before accepting the group invite.
function pendingExpenseEmail(email: string, paidBy: string, group: string, desc: string, share: number, total: number, token: string | null) {
  const web = process.env.WEB_URL ?? 'https://flatmate.ismailabbasi.qzz.io';
  const button = (href: string, label: string, color: string) =>
    `<a href="${href}" style="display:inline-block;background:${color};color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin:4px">${label}</a>`;
  const leave = token
    ? `<p style="color:#555">Don't know ${esc(paidBy)} or this group? ${button(`${process.env.PUBLIC_URL ?? ''}/auth/leave-group?token=${token}`, 'Leave the group', '#B00020')}</p>`
    : '';
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
    <h2 style="color:#6200EE">You've been invited, and added to an expense</h2>
    <p>You were invited to <strong>"${esc(group)}"</strong> on Flatmates Expense Tracker, and <strong>${esc(paidBy)}</strong> added an expense that includes you.</p>
    <div style="background:#f0f4ff;border-left:5px solid #6200EE;padding:16px;border-radius:8px">
      <div><strong>${esc(desc)}</strong></div>
      <div>Your share: <strong>₹${share.toFixed(2)}</strong> (total ₹${total.toFixed(2)})</div></div>
    <p>To see it and join the group, sign up or log in with this email address:</p>
    <p>${button(`${web}/signup?email=${encodeURIComponent(email)}`, 'Sign up', '#6200EE')}${button(`${web}/login`, 'Log in', '#3700B3')}</p>
    ${leave}</div>`;
}

export async function notifyRoutes(app: FastifyInstance) {
  app.get('/notifications', auth, async (req) => {
    const q = z.object({
      limit: z.coerce.number().int().min(1).max(200).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    }).parse(req.query);
    const { rows } = await db.query(
      'select * from notifications where user_id = $1 order by created_at desc limit $2 offset $3',
      [req.user.sub, q.limit ?? 50, q.offset ?? 0],
    );
    return rows;
  });

  app.get('/notifications/unread-count', auth, async (req) => ({ count: await unreadCount(req.user.sub) }));

  // Other domains notify other users (settlements, collections...): target must be self or share a group.
  app.post('/notifications', auth, async (req, reply) => {
    const body = z.object({
      user_id: uuid,
      title: z.string().min(1).max(200),
      message: z.string().min(1).max(2000),
      type: z.string().min(1).max(64),
      related_id: uuid.nullish(),
      metadata: z.unknown().optional(),
    }).parse(req.body);
    if (body.user_id !== req.user.sub) {
      const { rowCount } = await db.query(
        `select 1 from group_members a join group_members b on a.group_id = b.group_id
          where a.user_id = $1 and b.user_id = $2 limit 1`,
        [req.user.sub, body.user_id],
      );
      if (!rowCount) throw new HttpError(403, 'Cannot notify this user');
    }
    const [n] = await insertNotifications([{ ...body, related_id: body.related_id ?? null, metadata: body.metadata ?? null }]);
    const { rows } = await db.query('select push_token from profiles where id = $1', [body.user_id]);
    sendPush([rows[0]?.push_token], n.title, n.message, { type: n.type, ...(n.metadata ?? {}) }, await unreadCount(body.user_id));
    return reply.code(201).send(n);
  });

  app.post('/notifications/expense/:expenseId', auth, async (req) => {
    const { expenseId } = z.object({ expenseId: uuid }).parse(req.params);
    const { rows: [expense] } = await db.query(
      `select e.id, e.group_id, e.description, e.amount, e.paid_by, p.full_name as paid_by_name, g.name as group_name
         from expenses e left join profiles p on p.id = e.paid_by join groups g on g.id = e.group_id
        where e.id = $1`,
      [expenseId],
    );
    if (!expense) throw new HttpError(404, 'Expense not found');
    await assertGroupMember(expense.group_id, req.user.sub);
    const groupId = expense.group_id;
    const amount = Number(expense.amount);
    const paidByName = expense.paid_by_name || 'Someone';
    const groupName = expense.group_name || 'a group';

    const { rows: members } = await db.query(
      `select gm.user_id, gm.status, p.email, p.full_name, p.push_token, s.amount as split,
              (select invitation_token from group_invitations i where i.group_id = $1 and i.invited_email = p.email
                 and i.status = 'pending' order by i.created_at desc limit 1) as invite_token
         from group_memberships gm join profiles p on p.id = gm.user_id
         left join expense_splits s on s.expense_id = $2 and s.user_id = gm.user_id
        where gm.group_id = $1 and gm.user_id is distinct from $3
          and (gm.status = 'active' or (gm.status = 'pending' and s.amount > 0))`,
      [groupId, expenseId, expense.paid_by],
    );

    const list: NewNotification[] = [];
    for (const m of members) {
      // Pending invitees only get the invite-style email: no in-app notifications or pushes until they join.
      if (m.status === 'pending') {
        deliver({ userId: m.user_id, email: m.email, kind: 'expense', subject: `You're included in "${expense.description}" in ${groupName}`,
          html: pendingExpenseEmail(m.email, paidByName, groupName, expense.description, Number(m.split), amount, m.invite_token) })
          .catch((e) => console.error('Expense email failed', e));
        continue;
      }
      list.push({
        user_id: m.user_id, title: 'New Expense Added',
        message: `${paidByName} added "${expense.description}" - ₹${amount.toFixed(2)}`,
        type: 'expense_added', related_id: expenseId,
        metadata: { expense_id: expenseId, group_id: groupId, amount: expense.amount },
      });
      const split = Number(m.split ?? 0);
      if (split > 0) {
        list.push({
          user_id: m.user_id, title: 'Amount Assigned to You',
          message: `You owe ₹${split.toFixed(2)} for "${expense.description}"`,
          type: 'expense_split_assigned', related_id: expenseId,
          metadata: { expense_id: expenseId, group_id: groupId, split_amount: split, total_amount: expense.amount },
        });
        if (m.email) {
          deliver({ userId: m.user_id, email: m.email, kind: 'expense', subject: `Included in expense: ${expense.description} (${groupName})`,
            html: expenseEmail(m.full_name, paidByName, groupName, expense.description, split, amount) })
            .catch((e) => console.error('Expense email failed', e));
        }
      }
    }
    const inserted = await insertNotifications(list);

    // Pushes run after the response; same shape as the old client (one group push + one per split).
    (async () => {
      const added = list.find((n) => n.type === 'expense_added');
      if (added) {
        await sendPush(members.filter((m) => m.status === 'active').map((m) => m.push_token), added.title, added.message,
          { type: added.type, expense_id: expenseId, group_id: groupId });
      }
      for (const n of list.filter((x) => x.type === 'expense_split_assigned')) {
        const token = members.find((m) => m.user_id === n.user_id)?.push_token;
        await sendPush([token], n.title, n.message, {
          type: n.type, expense_id: expenseId, group_id: groupId,
          split_amount: (n.metadata as { split_amount: number }).split_amount,
        }, await unreadCount(n.user_id));
      }
    })();
    return { created: inserted.length };
  });

  app.patch('/notifications/:id/read', auth, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    await db.query('update notifications set is_read = true where id = $1 and user_id = $2', [id, req.user.sub]);
    return { ok: true };
  });

  app.patch('/notifications/read-all', auth, async (req) => {
    await db.query('update notifications set is_read = true where user_id = $1 and not is_read', [req.user.sub]);
    return { ok: true };
  });

  app.delete('/notifications/:id', auth, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    await db.query('delete from notifications where id = $1 and user_id = $2', [id, req.user.sub]);
    return { ok: true };
  });

  app.get('/push-token', auth, async (req) => {
    const { rows } = await db.query('select push_token from profiles where id = $1', [req.user.sub]);
    return { push_token: rows[0]?.push_token ?? null };
  });

  app.put('/push-token', auth, async (req) => {
    const { token } = z.object({ token: z.string().min(1).max(300) }).parse(req.body);
    await db.query('update profiles set push_token = $2, push_token_updated_at = now() where id = $1', [req.user.sub, token]);
    return { ok: true };
  });

  // Replaces the client reading other users' tokens: server pushes to the other members/participants.
  app.post('/push/:kind/:id', auth, async (req) => {
    const { kind, id } = z.object({ kind: z.enum(['group', 'conversation']), id: uuid }).parse(req.params);
    const body = z.object({
      title: z.string().min(1).max(200),
      body: z.string().max(2000),
      data: z.record(z.string(), z.unknown()).optional(),
      badge: z.number().int().min(0).optional(),
    }).parse(req.body);
    if (kind === 'group') await assertGroupMember(id, req.user.sub);
    else await assertConversationParticipant(id, req.user.sub);
    const { rows } = await db.query(
      kind === 'group'
        ? 'select p.push_token from group_members m join profiles p on p.id = m.user_id where m.group_id = $1 and m.user_id <> $2'
        : 'select p.push_token from conversation_participants m join profiles p on p.id = m.user_id where m.conversation_id = $1 and m.user_id <> $2',
      [id, req.user.sub],
    );
    await sendPush(rows.map((r) => r.push_token), body.title, body.body, body.data ?? {}, body.badge);
    return { sent: rows.filter((r) => r.push_token?.startsWith('ExponentPushToken')).length };
  });
}
