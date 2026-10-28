import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { Redis } from 'ioredis';
import { redis } from './redis.js';
import { db } from './db.js';

// Channels: group:<id>, user:<id>, conversation:<id>. Redis pub/sub lets several API instances share events.
export function publish(channel: string, event: string, data: unknown) {
  return redis.publish(`rt:${channel}`, JSON.stringify({ channel, event, data }));
}

const sockets = new Map<string, Set<WebSocket>>();

async function canJoin(channel: string, userId: string) {
  const [kind, id] = channel.split(':');
  if (kind === 'user') return id === userId;
  const sql = kind === 'group'
    ? 'select 1 from group_members where group_id = $1 and user_id = $2'
    : kind === 'conversation'
      ? 'select 1 from conversation_participants where conversation_id = $1 and user_id = $2'
      : null;
  if (!sql) return false;
  return !!(await db.query(sql, [id, userId])).rowCount;
}

export async function realtime(app: FastifyInstance) {
  const sub = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await sub.psubscribe('rt:*');
  sub.on('pmessage', (_p, ch, msg) => {
    for (const ws of sockets.get(ch.slice(3)) ?? []) ws.send(msg);
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
    ws.on('message', async (raw) => {
      let msg: { type?: string; channel?: string };
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const channel = String(msg.channel ?? '');
      if (msg.type === 'subscribe' && await canJoin(channel, userId)) {
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
