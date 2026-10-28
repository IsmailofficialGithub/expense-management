import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { Redis } from 'ioredis';
import { redis } from './redis.js';
import { db } from './db.js';
import { bumpGroup } from './cache.js';

// Channels: group:<id>, user:<id>, conversation:<id>. Redis pub/sub lets several API instances share events.
export async function publish(channel: string, event: string, data: unknown) {
  if (channel.startsWith('group:')) await bumpGroup(channel.slice(6));
  return redis.publish(`rt:${channel}`, JSON.stringify({ channel, event, data }));
}

const sockets = new Map<string, Set<WebSocket>>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same rules as the HTTP routes: group chats require current group membership (see chat.ts assertConversationAccess).
async function canJoin(channel: string, userId: string) {
  const [kind, id] = channel.split(':');
  if (kind === 'user') return id === userId;
  if (!UUID.test(id ?? '')) return false;
  const sql = kind === 'group'
    ? 'select 1 from group_members where group_id = $1 and user_id = $2'
    : kind === 'conversation'
      ? `select 1 from conversations c where c.id = $1 and case when c.type = 'group'
           then exists (select 1 from group_members gm where gm.group_id = c.group_id and gm.user_id = $2)
           else exists (select 1 from conversation_participants cp where cp.conversation_id = c.id and cp.user_id = $2) end`
      : null;
  if (!sql) return false;
  return !!(await db.query(sql, [id, userId])).rowCount;
}

// Drop a removed member's open sockets from the group channel and its group conversation.
async function revoke(groupId: string, userId: string) {
  const { rows } = await db.query('select id from conversations where group_id = $1', [groupId]);
  for (const ch of [`group:${groupId}`, ...rows.map((r) => `conversation:${r.id}`)]) {
    for (const ws of sockets.get(ch) ?? []) if (owner.get(ws) === userId) sockets.get(ch)!.delete(ws);
  }
}

const owner = new WeakMap<WebSocket, string>();

export async function realtime(app: FastifyInstance) {
  const sub = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await sub.psubscribe('rt:*');
  sub.on('pmessage', (_p, ch, msg) => {
    const channel = ch.slice(3);
    if (channel.startsWith('group:') && msg.includes('"member_removed"')) {
      const { event, data } = JSON.parse(msg);
      if (event === 'member_removed') {
        // Let the removed user's sockets hear the removal itself, then drop them.
        for (const ws of sockets.get(channel) ?? []) ws.send(msg);
        revoke(data.group_id, data.user_id).catch((e) => app.log.error(e));
        return;
      }
    }
    for (const ws of sockets.get(channel) ?? []) ws.send(msg);
  });

  // Client: connect to /realtime?token=<accessToken>, send {"type":"subscribe"|"unsubscribe","channel":"group:<id>"}
  app.get('/realtime', { websocket: true }, async (ws, req) => {
    let userId: string;
    try {
      userId = (app.jwt.verify((req.query as { token?: string }).token ?? '') as { sub: string }).sub;
    } catch {
      return ws.close(4401, 'Unauthorized');
    }
    const mine = new Set<string>();
    owner.set(ws, userId);
    ws.on('message', async (raw) => {
      let msg: { type?: string; channel?: string };
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const channel = String(msg.channel ?? '');
      let ok = false;
      if (msg.type === 'subscribe') {
        try { ok = await canJoin(channel, userId); } catch (e) { app.log.error(e); }
      }
      if (ok) {
        if (!sockets.has(channel)) sockets.set(channel, new Set());
        sockets.get(channel)!.add(ws);
        mine.add(channel);
      } else if (msg.type === 'unsubscribe') {
        sockets.get(channel)?.delete(ws);
        mine.delete(channel);
      }
    });
    ws.on('close', () => {
      for (const ch of mine) {
        sockets.get(ch)?.delete(ws);
        if (!sockets.get(ch)?.size) sockets.delete(ch);
      }
    });
  });
}
