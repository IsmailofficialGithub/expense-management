import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { requireUser } from '../auth.js';
import { HttpError, assertGroupMember } from '../access.js';
import { publish } from '../realtime.js';

const uuid = z.string().uuid();
const idParam = z.object({ id: uuid });

// Profile JSON without private push fields; null for a missing left-joined row.
const prof = (a: string) =>
  `case when ${a}.id is null then null else to_jsonb(${a}) - 'push_token' - 'push_token_updated_at' end`;

const CONVERSATION_SELECT = `
  select c.*, to_jsonb(g) as "group", ${prof('ls')} as last_message_sender,
    (select coalesce(json_agg(to_jsonb(cp) || jsonb_build_object('user', ${prof('up')})), '[]')
       from conversation_participants cp join profiles up on up.id = cp.user_id
      where cp.conversation_id = c.id) as participants,
    (select count(*)::int from messages m
      where m.conversation_id = c.id and not m.is_deleted
        and (me.last_read_at is null or m.created_at > me.last_read_at)) as unread_count
    from conversations c
    join conversation_participants me on me.conversation_id = c.id and me.user_id = $1
    left join groups g on g.id = c.group_id
    left join profiles ls on ls.id = c.last_message_sender_id
   where (c.type = 'individual'
      or exists (select 1 from group_members gm where gm.group_id = c.group_id and gm.user_id = $1))`;

const MESSAGE_SELECT = `
  select m.*, ${prof('s')} as sender,
    (select coalesce(json_agg(r), '[]') from message_reads r where r.message_id = m.id) as reads,
    (select count(*)::int from message_reads r where r.message_id = m.id) as read_count,
    (select count(*)::int from conversation_participants cp where cp.conversation_id = m.conversation_id) as total_participants,
    'sent' as status
    from messages m join profiles s on s.id = m.sender_id`;

// Group conversation access = group membership (participant row is synced so last_read_at / realtime work);
// individual conversation access = participant.
async function assertConversationAccess(conversationId: string, userId: string) {
  // One round trip; only writes the first time a group member opens the group chat.
  const { rows } = await db.query(
    `select c.type,
            exists (select 1 from group_members gm where gm.group_id = c.group_id and gm.user_id = $2) as member,
            exists (select 1 from conversation_participants cp where cp.conversation_id = c.id and cp.user_id = $2) as participant
       from conversations c where c.id = $1`,
    [conversationId, userId],
  );
  if (!rows.length) throw new HttpError(404, 'Conversation not found');
  const r = rows[0];
  if (r.type === 'group') {
    if (!r.member) throw new HttpError(403, 'Not a member of this group');
    if (!r.participant) {
      await db.query(
        `insert into conversation_participants (conversation_id, user_id) values ($1, $2)
         on conflict (conversation_id, user_id) do nothing`,
        [conversationId, userId],
      );
    }
    return;
  }
  if (!r.participant) throw new HttpError(403, 'Not a participant');
}

async function messageConversation(messageId: string, userId: string) {
  const { rows } = await db.query('select conversation_id, sender_id, is_deleted from messages where id = $1', [messageId]);
  if (!rows.length) throw new HttpError(404, 'Message not found');
  await assertConversationAccess(rows[0].conversation_id, userId);
  return rows[0] as { conversation_id: string; sender_id: string; is_deleted: boolean };
}

async function getConversation(id: string, userId: string) {
  const { rows } = await db.query(`${CONVERSATION_SELECT} and c.id = $2`, [userId, id]);
  return rows[0] ?? null;
}

async function getMessage(id: string) {
  const { rows } = await db.query(`${MESSAGE_SELECT} where m.id = $1`, [id]);
  return rows[0] ?? null;
}

async function typingUsers(conversationId: string) {
  const { rows } = await db.query(
    `select t.*, ${prof('p')} as user from typing_indicators t join profiles p on p.id = t.user_id
      where t.conversation_id = $1 and t.is_typing and t.updated_at > now() - interval '3 seconds'`,
    [conversationId],
  );
  return rows;
}

// Server-side Expo push so clients never read other users' push tokens. Fire-and-forget.
async function pushNewMessage(conversationId: string, senderId: string, body: string) {
  const { rows } = await db.query(
    `select p.push_token, (select full_name from profiles where id = $2) as sender_name
       from conversation_participants cp join profiles p on p.id = cp.user_id
      where cp.conversation_id = $1 and cp.user_id <> $2 and not cp.is_muted and p.push_token is not null`,
    [conversationId, senderId],
  );
  if (!rows.length) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(rows.map((r) => ({
      to: r.push_token, sound: 'default', title: r.sender_name || 'New Message', body, data: { conversationId },
    }))),
  });
}

export async function chatRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireUser };

  app.get('/conversations', auth, async (req) => {
    const me = req.user.sub;
    // Group conversations of groups joined after creation get a participant row here.
    await db.query(
      `insert into conversation_participants (conversation_id, user_id)
       select c.id, $1 from conversations c join group_members gm on gm.group_id = c.group_id and gm.user_id = $1
       on conflict (conversation_id, user_id) do nothing`,
      [me],
    );
    const { rows } = await db.query(`${CONVERSATION_SELECT} order by c.last_message_at desc nulls last`, [me]);
    return rows;
  });

  app.get('/conversations/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    await assertConversationAccess(id, req.user.sub);
    return getConversation(id, req.user.sub);
  });

  app.post('/conversations/individual', auth, async (req) => {
    const me = req.user.sub;
    const { other_user_email } = z.object({ other_user_email: z.string().trim().toLowerCase().email() }).parse(req.body);
    const { rows: users } = await db.query('select id from profiles where email = $1', [other_user_email]);
    if (!users.length) throw new HttpError(404, 'User not found');
    const other = users[0].id;
    if (other === me) throw new HttpError(400, 'Cannot create conversation with yourself');

    const client = await db.connect();
    let id: string;
    try {
      await client.query('begin');
      // Serialize concurrent creates for the same pair so we never make duplicates.
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [[me, other].sort().join(':')]);
      const { rows } = await client.query(
        `select c.id from conversations c
           join conversation_participants a on a.conversation_id = c.id and a.user_id = $1
           join conversation_participants b on b.conversation_id = c.id and b.user_id = $2
          where c.type = 'individual' limit 1`,
        [me, other],
      );
      if (rows.length) {
        id = rows[0].id;
      } else {
        const ins = await client.query(
          `insert into conversations (type, created_by) values ('individual', $1) returning id`,
          [me],
        );
        id = ins.rows[0].id;
        await client.query(
          'insert into conversation_participants (conversation_id, user_id) values ($1, $2), ($1, $3)',
          [id, me, other],
        );
      }
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
    return getConversation(id, me);
  });

  app.post('/conversations/group', auth, async (req) => {
    const me = req.user.sub;
    const { group_id } = z.object({ group_id: uuid }).parse(req.body);
    await assertGroupMember(group_id, me);
    const client = await db.connect();
    let id: string;
    try {
      await client.query('begin');
      const { rows } = await client.query(
        `insert into conversations (type, group_id, created_by) values ('group', $1, $2)
         on conflict (group_id) do update set group_id = excluded.group_id returning id`,
        [group_id, me],
      );
      id = rows[0].id;
      await client.query(
        `insert into conversation_participants (conversation_id, user_id)
         select $1, user_id from group_members where group_id = $2
         on conflict (conversation_id, user_id) do nothing`,
        [id, group_id],
      );
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
    return getConversation(id, me);
  });

  app.get('/conversations/:id/messages', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const q = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      before: z.string().datetime({ offset: true }).optional(),
    }).parse(req.query);
    await assertConversationAccess(id, req.user.sub);
    const { rows } = await db.query(
      `${MESSAGE_SELECT}
        where m.conversation_id = $1 and not m.is_deleted
          and ($3::timestamptz is null or m.created_at < $3)
          and not exists (select 1 from message_deletions d where d.message_id = m.id and d.user_id = $2)
        order by m.created_at desc limit $4`,
      [id, req.user.sub, q.before ?? null, q.limit + 1],
    );
    const hasMore = rows.length > q.limit;
    return { messages: rows.slice(0, q.limit).reverse(), hasMore };
  });

  app.post('/conversations/:id/messages', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({
      text: z.string().max(5000).default(''),
      message_type: z.enum(['text', 'image', 'file', 'expense']).default('text'),
      media_url: z.string().url().max(2000).nullish(),
      media_type: z.string().max(100).nullish(),
      related_expense_id: uuid.nullish(),
    }).parse(req.body);
    const me = req.user.sub;
    await assertConversationAccess(id, me);
    const { rows } = await db.query(
      `insert into messages (conversation_id, sender_id, text, message_type, media_url, media_type, related_expense_id)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [id, me, body.text, body.message_type, body.media_url ?? null, body.media_type ?? null, body.related_expense_id ?? null],
    );
    const message = await getMessage(rows[0].id);
    await publish(`conversation:${id}`, 'message', message);
    const { rows: parts } = await db.query('select user_id from conversation_participants where conversation_id = $1', [id]);
    await Promise.all(parts.map((p) => publish(`user:${p.user_id}`, 'conversation', { conversation_id: id, message })));
    pushNewMessage(id, me, body.message_type === 'image' ? '📷 Sent an image' : body.text)
      .catch((e) => req.log.warn(e, 'push failed'));
    return message;
  });

  app.get('/messages/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    await messageConversation(id, req.user.sub);
    return getMessage(id);
  });

  app.post('/messages/:id/read', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const me = req.user.sub;
    const msg = await messageConversation(id, me);
    const client = await db.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into message_reads (message_id, user_id) values ($1, $2)
         on conflict (message_id, user_id) do update set read_at = now()`,
        [id, me],
      );
      await client.query(
        'update conversation_participants set last_read_at = now() where conversation_id = $1 and user_id = $2',
        [msg.conversation_id, me],
      );
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
    await publish(`conversation:${msg.conversation_id}`, 'read', { message_ids: [id], user_id: me });
    return { ok: true };
  });

  app.post('/conversations/:id/read', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const me = req.user.sub;
    await assertConversationAccess(id, me);
    const client = await db.connect();
    let ids: string[];
    try {
      await client.query('begin');
      const { rows } = await client.query(
        `insert into message_reads (message_id, user_id)
         select m.id, $2 from messages m join conversation_participants p on p.conversation_id = m.conversation_id and p.user_id = $2
          where m.conversation_id = $1 and m.created_at > coalesce(p.last_read_at, 'epoch')
         on conflict (message_id, user_id) do nothing returning message_id`,
        [id, me],
      );
      ids = rows.map((r) => r.message_id);
      await client.query(
        'update conversation_participants set last_read_at = now() where conversation_id = $1 and user_id = $2',
        [id, me],
      );
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
    if (ids.length) await publish(`conversation:${id}`, 'read', { message_ids: ids, user_id: me });
    return { ok: true };
  });

  app.put('/conversations/:id/typing', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const { is_typing } = z.object({ is_typing: z.boolean() }).parse(req.body);
    await assertConversationAccess(id, req.user.sub);
    await db.query(
      `insert into typing_indicators (conversation_id, user_id, is_typing, updated_at) values ($1, $2, $3, now())
       on conflict (conversation_id, user_id) do update set is_typing = excluded.is_typing, updated_at = now()`,
      [id, req.user.sub, is_typing],
    );
    await publish(`conversation:${id}`, 'typing', await typingUsers(id));
    return { ok: true };
  });

  app.get('/conversations/:id/typing', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    await assertConversationAccess(id, req.user.sub);
    return typingUsers(id);
  });

  app.delete('/messages/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const msg = await messageConversation(id, req.user.sub);
    if (msg.sender_id !== req.user.sub) throw new HttpError(403, 'Only the sender can delete messages for everyone');
    if (msg.is_deleted) throw new HttpError(400, 'Message already deleted');
    await db.query(
      `update messages set is_deleted = true, deleted_at = now(), text = 'This message was deleted', updated_at = now()
        where id = $1`,
      [id],
    );
    await publish(`conversation:${msg.conversation_id}`, 'message_update', await getMessage(id));
    return { ok: true };
  });

  app.post('/messages/:id/hide', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    await messageConversation(id, req.user.sub);
    await db.query(
      `insert into message_deletions (message_id, user_id) values ($1, $2)
       on conflict (message_id, user_id) do update set deleted_at = now()`,
      [id, req.user.sub],
    );
    return { ok: true };
  });
}
