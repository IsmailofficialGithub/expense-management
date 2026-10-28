import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { requireUser } from '../auth.js';
import { assertGroupAdmin, assertGroupMember, HttpError } from '../access.js';
import { publish } from '../realtime.js';
import { cachedForGroup } from '../cache.js';
import { deleteUpload } from '../uploads.js';
import { sendMail } from '../mail.js';
import { insertNotifications } from './notify.js';

const id = z.string().uuid();
const idParam = z.object({ id });

// Every member listens on its own user channel app-wide, so member lists refresh without opening the group.
async function notifyMembersChanged(groupId: string, data: object, extraUserIds: string[] = []) {
  const { rows } = await db.query('select user_id from group_members where group_id = $1', [groupId]);
  for (const u of new Set([...rows.map((r) => r.user_id as string), ...extraUserIds])) {
    await publish(`user:${u}`, 'members_changed', data);
  }
}
const opt = z.string().trim().max(500).nullish();

// Profile fields other users may see (never push_token).
const profileJson = (a: string) =>
  `json_build_object('id', ${a}.id, 'email', ${a}.email, 'full_name', ${a}.full_name, 'avatar_url', ${a}.avatar_url,
     'phone', ${a}.phone, 'created_at', ${a}.created_at, 'updated_at', ${a}.updated_at)`;

const groupSelect = `
  select g.*, ${profileJson('cp')} as created_by_profile,
    (select coalesce(json_agg(to_jsonb(gm) || jsonb_build_object('user', ${profileJson('mp')}) order by gm.joined_at), '[]')
       from group_members gm join profiles mp on mp.id = gm.user_id where gm.group_id = g.id) as members
  from groups g join profiles cp on cp.id = g.created_by`;

const hotelSelect = `
  select h.*, (select coalesce(json_agg(m order by m.category, m.item_name), '[]') from hotel_menu_items m where m.hotel_id = h.id) as menu_items
  from hotels h`;

const paymentBody = z.object({
  method_type: z.enum(['cash', 'bank', 'jazzcash', 'easypaisa', 'card', 'other']),
  is_default: z.boolean().optional(),
  bank_name: opt, account_title: opt, account_number: opt, iban: opt,
  phone_number: opt, card_last_four: opt, custom_name: opt, notes: opt,
  is_visible_to_groups: z.boolean().optional(),
});

const menuItemBody = z.object({
  item_name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100),
  price: z.coerce.number().nonnegative(),
  description: opt,
  is_available: z.boolean().optional(),
});

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Builds "set a = $2, b = $3" from a validated partial object; $1 is reserved for the row id.
function setClause(updates: Record<string, unknown>) {
  const keys = Object.keys(updates).filter((k) => updates[k] !== undefined);
  if (!keys.length) throw new HttpError(400, 'Nothing to update');
  return { sql: keys.map((k, i) => `${k} = $${i + 2}`).join(', ') + ', updated_at = now()', values: keys.map((k) => updates[k]) };
}

const WEB_URL = process.env.WEB_URL ?? 'https://flatmate.ismailabbasi.qzz.io';

function invitationEmail(inviterName: string, groupName: string, registered: boolean, email: string) {
  const inviter = escapeHtml(inviterName);
  const group = escapeHtml(groupName);
  const download = 'https://github.com/IsmailofficialGithub/expense-management/releases/download/1.0/expense-management.apk';
  const button = (href: string, label: string, color: string) =>
    `<a href="${href}" style="display:inline-block;background:${color};color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold">${label}</a>`;
  // Unregistered: the web signup is prefilled with the invited email; logging in afterwards joins the group automatically.
  const steps = registered
    ? `<ol><li>Open Flatmate (app or web)</li><li>Go to Profile → Group Invitations</li><li>Accept the invitation to join &quot;${group}&quot;</li></ol>
       <p>${button(`${WEB_URL}/invitations`, 'View invitation', '#6200EE')}</p>`
    : `<p>Create your account with this email address and you'll automatically be added to &quot;${group}&quot;.</p>
       <p>${button(`${WEB_URL}/signup?email=${encodeURIComponent(email)}`, 'Create your account', '#6200EE')}</p>
       <p style="font-size:13px;color:#666">On Android? You can also <a href="${download}">download the app</a> and sign up there.</p>`;
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
    <h2 style="color:#6200EE">You've been invited!</h2>
    <p>Hi there,</p>
    <p><strong>${inviter}</strong> has invited you to join the group <strong>"${group}"</strong> on Flatmates Expense Tracker.</p>
    ${steps}
    <p style="color:#999;font-size:12px">If you didn't expect this invitation, you can safely ignore this email.</p></div>`;
}

export async function peopleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  // ---------- profiles ----------
  app.get('/profiles/search', async (req) => {
    const { q } = z.object({ q: z.string().trim().min(1).max(100) }).parse(req.query);
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const { rows } = await db.query(
      // Partial matches only among people who share a group with the caller; strangers need their exact email.
      `select id, email, full_name, avatar_url from profiles p
        where p.email = lower($2)
           or ((p.full_name ilike $1 or p.email ilike $1) and exists (
                select 1 from group_members a join group_members b on b.group_id = a.group_id
                 where a.user_id = $3 and b.user_id = p.id))
        order by full_name limit 10`,
      [like, q, req.user.sub],
    );
    return rows;
  });

  app.get('/profiles/:id', async (req, reply) => {
    const { id: userId } = idParam.parse(req.params);
    const { rows } = await db.query(
      userId === req.user.sub ? 'select * from profiles where id = $1' : `select ${profileJson('p')} as p from profiles p where id = $1`,
      [userId],
    );
    if (!rows.length) return reply.code(404).send({ error: 'Profile not found' });
    return rows[0].p ?? rows[0];
  });

  app.patch('/profiles/me', async (req) => {
    const body = z.object({
      full_name: z.string().trim().min(1).max(100).optional(),
      phone: z.string().trim().max(30).nullish(),
      avatar_url: z.string().url().max(1000).nullish(),
    }).parse(req.body);
    const { sql, values } = setClause(body);
    const old = body.avatar_url !== undefined
      ? (await db.query('select avatar_url from profiles where id = $1', [req.user.sub])).rows[0]?.avatar_url
      : undefined;
    const { rows } = await db.query(`update profiles set ${sql} where id = $1 returning *`, [req.user.sub, ...values]);
    if (old && old !== body.avatar_url) await deleteUpload(old, req.user.sub).catch(() => {});
    return rows[0];
  });

  // ---------- hotels ----------
  app.get('/hotels', async () => (await db.query(`${hotelSelect} where h.is_active order by h.name`)).rows);

  app.get('/hotels/:id', async (req, reply) => {
    const { rows } = await db.query(`${hotelSelect} where h.id = $1`, [idParam.parse(req.params).id]);
    if (!rows.length) return reply.code(404).send({ error: 'Hotel not found' });
    return rows[0];
  });

  app.post('/hotels', async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(200), location: opt, phone: opt }).parse(req.body);
    const { rows } = await db.query(
      'insert into hotels (name, location, phone, created_by) values ($1, $2, $3, $4) returning *',
      [body.name, body.location || null, body.phone || null, req.user.sub],
    );
    return reply.code(201).send(rows[0]);
  });

  app.get('/hotels/:id/menu-items', async (req) => {
    const { rows } = await db.query(
      'select * from hotel_menu_items where hotel_id = $1 and is_available order by category, item_name',
      [idParam.parse(req.params).id],
    );
    return rows;
  });

  async function assertHotelCreator(hotelId: string, userId: string) {
    const { rows } = await db.query('select created_by from hotels where id = $1', [hotelId]);
    if (!rows.length) throw new HttpError(404, 'Hotel not found');
    if (rows[0].created_by !== userId) throw new HttpError(403, 'Only the hotel creator can edit it');
  }

  async function menuItemHotel(itemId: string) {
    const { rows } = await db.query('select hotel_id from hotel_menu_items where id = $1', [itemId]);
    if (!rows.length) throw new HttpError(404, 'Menu item not found');
    return rows[0].hotel_id as string;
  }

  app.post('/hotel-menu-items', async (req, reply) => {
    const body = menuItemBody.extend({ hotel_id: id }).parse(req.body);
    await assertHotelCreator(body.hotel_id, req.user.sub);
    const { rows } = await db.query(
      `insert into hotel_menu_items (hotel_id, item_name, category, price, description, is_available)
       values ($1, $2, $3, $4, $5, coalesce($6, true)) returning *`,
      [body.hotel_id, body.item_name, body.category, body.price, body.description ?? null, body.is_available ?? null],
    );
    return reply.code(201).send(rows[0]);
  });

  app.patch('/hotel-menu-items/:id', async (req) => {
    const { id: itemId } = idParam.parse(req.params);
    await assertHotelCreator(await menuItemHotel(itemId), req.user.sub);
    const { sql, values } = setClause(menuItemBody.partial().parse(req.body));
    return (await db.query(`update hotel_menu_items set ${sql} where id = $1 returning *`, [itemId, ...values])).rows[0];
  });

  app.delete('/hotel-menu-items/:id', async (req) => {
    const { id: itemId } = idParam.parse(req.params);
    await assertHotelCreator(await menuItemHotel(itemId), req.user.sub);
    await db.query('delete from hotel_menu_items where id = $1', [itemId]);
    return { ok: true };
  });

  // ---------- payment methods ----------
  // Own methods: all. Someone else's: only visible ones, and only if you share a group.
  app.get('/users/:id/payment-methods', async (req) => {
    const { id: userId } = idParam.parse(req.params);
    const { rows } = await db.query(
      `select * from user_payment_methods pm where pm.user_id = $1
         and ($1 = $2 or (pm.is_visible_to_groups and exists (
           select 1 from group_members a join group_members b on a.group_id = b.group_id where a.user_id = $1 and b.user_id = $2)))
       order by is_default desc, created_at desc`,
      [userId, req.user.sub],
    );
    return rows;
  });

  app.get('/groups/:id/payment-methods', async (req) => {
    const { id: groupId } = idParam.parse(req.params);
    await assertGroupMember(groupId, req.user.sub);
    const { rows } = await db.query(
      `select pm.*, json_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email) as user
         from user_payment_methods pm join group_members gm on gm.user_id = pm.user_id and gm.group_id = $1
         join profiles p on p.id = pm.user_id
        where pm.is_visible_to_groups order by p.full_name, pm.is_default desc`,
      [groupId],
    );
    return rows;
  });

  app.post('/payment-methods', async (req, reply) => {
    const body = paymentBody.parse(req.body);
    const keys = Object.keys(body).filter((k) => (body as any)[k] !== undefined);
    const { rows } = await db.query(
      `insert into user_payment_methods (user_id, ${keys.join(', ')}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')}) returning *`,
      [req.user.sub, ...keys.map((k) => (body as any)[k])],
    );
    return reply.code(201).send(rows[0]);
  });

  app.patch('/payment-methods/:id', async (req) => {
    const { id: methodId } = idParam.parse(req.params);
    const { sql, values } = setClause(paymentBody.partial().parse(req.body));
    const { rows } = await db.query(
      `update user_payment_methods set ${sql} where id = $1 and user_id = $${values.length + 2} returning *`,
      [methodId, ...values, req.user.sub],
    );
    if (!rows.length) throw new HttpError(404, 'Payment method not found');
    return rows[0];
  });

  app.post('/payment-methods/:id/default', async (req) => {
    const { id: methodId } = idParam.parse(req.params);
    const client = await db.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query(
        'update user_payment_methods set is_default = (id = $1), updated_at = now() where user_id = $2 and exists (select 1 from user_payment_methods where id = $1 and user_id = $2) returning *',
        [methodId, req.user.sub],
      );
      const method = rows.find((r) => r.id === methodId);
      if (!method) throw new HttpError(404, 'Payment method not found');
      await client.query('commit');
      return method;
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  });

  app.delete('/payment-methods/:id', async (req) => {
    const { rowCount } = await db.query('delete from user_payment_methods where id = $1 and user_id = $2', [idParam.parse(req.params).id, req.user.sub]);
    if (!rowCount) throw new HttpError(404, 'Payment method not found');
    return { ok: true };
  });

  // ---------- invitations ----------
  app.post('/invitations', async (req, reply) => {
    const body = z.object({ group_id: id, invited_email: z.string().trim().toLowerCase().email() }).parse(req.body);
    await assertGroupAdmin(body.group_id, req.user.sub);
    const { rows: [ctx] } = await db.query(
      `select g.name as group_name, me.full_name as inviter_name,
         exists (select 1 from profiles where email = $3) as registered,
         exists (select 1 from group_members gm join profiles p on p.id = gm.user_id where gm.group_id = $1 and p.email = $3) as is_member,
         exists (select 1 from group_invitations where group_id = $1 and invited_email = $3 and status = 'pending' and expires_at > now()) as pending
       from groups g, profiles me where g.id = $1 and me.id = $2`,
      [body.group_id, req.user.sub, body.invited_email],
    );
    if (ctx.is_member) throw new HttpError(409, 'User is already a member of this group.');
    if (ctx.pending) throw new HttpError(409, 'Invitation already sent to this user.');
    const { rows } = await db.query(
      `insert into group_invitations (group_id, invited_by, invited_email) values ($1, $2, $3)
       returning id, group_id, invited_by, invited_email, invitation_token, status, expires_at, accepted_at, created_at`,
      [body.group_id, req.user.sub, body.invited_email],
    );
    // Email failure must not fail the invitation (same as before).
    await sendMail(body.invited_email, `You're invited to join "${ctx.group_name}" on Flatmates Expense Tracker`,
      invitationEmail(ctx.inviter_name || 'Someone', ctx.group_name, ctx.registered, body.invited_email)).catch((e) => req.log.error(e, 'invitation email failed'));
    const invitee = await db.query('select id from profiles where email = $1', [body.invited_email]);
    if (invitee.rows[0]) {
      await publish(`user:${invitee.rows[0].id}`, 'invitation_received', rows[0]);
      await insertNotifications([{
        user_id: invitee.rows[0].id, type: 'group_invitation', related_id: rows[0].id,
        title: 'Group invitation', message: `${ctx.inviter_name || 'Someone'} invited you to join "${ctx.group_name}"`,
        metadata: { group_id: body.group_id, invitation_id: rows[0].id },
      }]);
    }
    await notifyMembersChanged(body.group_id, { group_id: body.group_id });
    return reply.code(201).send(rows[0]);
  });

  app.get('/groups/:id/invitations', async (req) => {
    const { id: groupId } = idParam.parse(req.params);
    await assertGroupMember(groupId, req.user.sub);
    const { rows } = await db.query(
      `select id, group_id, invited_by, invited_email, status, expires_at, created_at from group_invitations
         where group_id = $1 and status = 'pending' and expires_at > now() order by created_at desc`,
      [groupId],
    );
    return rows;
  });

  // Admin revokes a pending invite: it stops working and the invitee's notification goes away.
  app.delete('/invitations/:id', async (req) => {
    const { id: invitationId } = idParam.parse(req.params);
    const { rows: [inv] } = await db.query(
      "select group_id, invited_email from group_invitations where id = $1 and status = 'pending'", [invitationId]);
    if (!inv) throw new HttpError(404, 'Invitation not found');
    await assertGroupAdmin(inv.group_id, req.user.sub);
    await db.query("update group_invitations set status = 'expired' where id = $1", [invitationId]);
    const { rows: [invitee] } = await db.query('select id from profiles where email = $1', [inv.invited_email]);
    if (invitee) {
      await db.query("delete from notifications where user_id = $1 and type = 'group_invitation' and related_id = $2", [invitee.id, invitationId]);
      await publish(`user:${invitee.id}`, 'invitation_revoked', { id: invitationId, group_id: inv.group_id });
    }
    await notifyMembersChanged(inv.group_id, { group_id: inv.group_id });
    return { ok: true };
  });

  app.get('/invitations/pending', async (req) => {
    const { rows } = await db.query(
      `select i.id, i.group_id, i.invited_by, i.invited_email, i.invitation_token, i.status, i.expires_at, i.accepted_at, i.created_at,
              to_jsonb(g) as group
         from group_invitations i join groups g on g.id = i.group_id
        where i.invited_email = lower($1) and i.status = 'pending' order by i.created_at desc`,
      [req.user.email],
    );
    return rows;
  });

  // Locks the invitation row so accept/reject can't race.
  async function pendingInvitation(client: { query: typeof db.query }, invitationId: string, email: string) {
    const { rows } = await client.query("select * from group_invitations where id = $1 and status = 'pending' for update", [invitationId]);
    if (!rows.length) throw new HttpError(404, 'Invitation not found or already processed');
    if (rows[0].invited_email.toLowerCase() !== email.toLowerCase()) throw new HttpError(403, 'This invitation is not for you');
    return rows[0];
  }

  app.post('/invitations/:id/:action', async (req) => {
    const { id: invitationId, action } = z.object({ id, action: z.enum(['accept', 'reject']) }).parse(req.params);
    const client = await db.connect();
    let groupId: string;
    try {
      await client.query('begin');
      const inv = await pendingInvitation(client as any, invitationId, req.user.email);
      groupId = inv.group_id;
      if (action === 'accept') {
        await client.query(
          "insert into group_members (group_id, user_id, role) values ($1, $2, 'member') on conflict (group_id, user_id) do nothing",
          [groupId, req.user.sub],
        );
        await client.query("update group_invitations set status = 'accepted', accepted_at = now() where id = $1", [invitationId]);
      } else {
        // 'expired' doubles as rejected (schema has no rejected status).
        await client.query("update group_invitations set status = 'expired' where id = $1", [invitationId]);
      }
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
    if (action === 'accept') {
      await publish(`group:${groupId}`, 'member_added', { group_id: groupId, user_id: req.user.sub });
    }
    await notifyMembersChanged(groupId, { group_id: groupId });
    return { ok: true };
  });

  // ---------- groups ----------
  app.post('/groups', async (req, reply) => {
    const body = z.object({
      name: z.string().trim().min(1).max(100),
      description: z.string().trim().max(1000).nullish(),
      member_ids: z.array(id).max(100).default([]),
    }).parse(req.body);
    const client = await db.connect();
    try {
      await client.query('begin');
      const { rows: [group] } = await client.query(
        'insert into groups (name, description, created_by) values ($1, $2, $3) returning *',
        [body.name, body.description ?? null, req.user.sub],
      );
      await client.query(
        `insert into group_members (group_id, user_id, role)
         select $1, u, case when u = $2 then 'admin' else 'member' end from unnest($3::uuid[]) u
         on conflict (group_id, user_id) do nothing`,
        [group.id, req.user.sub, [req.user.sub, ...body.member_ids]],
      );
      await client.query('commit');
      for (const m of body.member_ids) await publish(`user:${m}`, 'group_added', group);
      return reply.code(201).send(group);
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  });

  app.get('/groups', async (req) => {
    const { rows } = await db.query(
      `${groupSelect} where exists (select 1 from group_members where group_id = g.id and user_id = $1) order by g.created_at desc`,
      [req.user.sub],
    );
    return rows;
  });

  app.get('/groups/:id', async (req) => {
    const { id: groupId } = idParam.parse(req.params);
    await assertGroupMember(groupId, req.user.sub);
    return (await db.query(`${groupSelect} where g.id = $1`, [groupId])).rows[0];
  });

  app.patch('/groups/:id', async (req) => {
    const { id: groupId } = idParam.parse(req.params);
    await assertGroupAdmin(groupId, req.user.sub);
    const body = z.object({ name: z.string().trim().min(1).max(100).optional(), description: z.string().trim().max(1000).nullish() }).parse(req.body);
    const { sql, values } = setClause(body);
    const { rows } = await db.query(`update groups set ${sql} where id = $1 returning *`, [groupId, ...values]);
    await publish(`group:${groupId}`, 'group_updated', rows[0]);
    return rows[0];
  });

  app.delete('/groups/:id', async (req) => {
    const { id: groupId } = idParam.parse(req.params);
    await assertGroupAdmin(groupId, req.user.sub);
    await publish(`group:${groupId}`, 'group_deleted', { id: groupId });
    await db.query('delete from groups where id = $1', [groupId]);
    return { ok: true };
  });

  app.post('/groups/:id/members', async (req, reply) => {
    const { id: groupId } = idParam.parse(req.params);
    await assertGroupAdmin(groupId, req.user.sub);
    const body = z.object({ user_id: id, role: z.enum(['admin', 'member']).default('member') }).parse(req.body);
    const { rows } = await db.query(
      'insert into group_members (group_id, user_id, role) values ($1, $2, $3) returning *',
      [groupId, body.user_id, body.role],
    );
    await publish(`group:${groupId}`, 'member_added', rows[0]);
    await publish(`user:${body.user_id}`, 'group_added', { id: groupId });
    await notifyMembersChanged(groupId, { group_id: groupId });
    return reply.code(201).send(rows[0]);
  });

  // Admins remove anyone; a member may remove themselves (leave).
  app.delete('/groups/:id/members/:userId', async (req) => {
    const { id: groupId, userId } = z.object({ id, userId: id }).parse(req.params);
    if (userId === req.user.sub) await assertGroupMember(groupId, userId);
    else await assertGroupAdmin(groupId, req.user.sub);
    // One statement, so membership and group-chat participation go together.
    await db.query(
      `with m as (delete from group_members where group_id = $1 and user_id = $2)
       delete from conversation_participants where user_id = $2
          and conversation_id in (select id from conversations where group_id = $1)`,
      [groupId, userId],
    );
    await publish(`group:${groupId}`, 'member_removed', { group_id: groupId, user_id: userId });
    await notifyMembersChanged(groupId, { group_id: groupId, removed_user_id: userId }, [userId]);
    return { ok: true };
  });

  app.get('/groups/:id/balances', async (req) => {
    const { id: groupId } = idParam.parse(req.params);
    await assertGroupMember(groupId, req.user.sub);
    return cachedForGroup('balances', groupId, async () =>
      (await db.query('select * from user_group_balances where group_id = $1', [groupId])).rows);
  });

  // ---------- categories ----------
  app.get('/categories', async () => (await db.query('select * from expense_categories order by name')).rows);
}
