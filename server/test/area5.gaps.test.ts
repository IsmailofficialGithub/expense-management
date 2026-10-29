import { afterAll, beforeAll, expect, test } from 'vitest';
import WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { covers, createUser } from './helpers.js';

covers('GET /realtime');

// injectWS has no real socket, which trustProxy's req.ip trips over; use a real listener instead.
let app: FastifyInstance;
let base: string;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  base = (await app.listen({ port: 0, host: '127.0.0.1' })).replace('http', 'ws');
});
afterAll(() => app.close());

const open = (token: string) => new WebSocket(`${base}/realtime?token=${token}`);

test('realtime rejects a bad token with 4401', async () => {
  const ws = open('nope');
  expect(await new Promise((r) => ws.once('close', r))).toBe(4401);
});

test('realtime accepts a valid token and stays open', async () => {
  const u = await createUser();
  const ws = open(u.token);
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'subscribe', channel: `user:${u.id}` }));
  await new Promise((r) => setTimeout(r, 100));
  expect(ws.readyState).toBe(WebSocket.OPEN);
  ws.terminate();
});
