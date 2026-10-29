import Fastify, { type RouteOptions } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import { db } from './db.js';
import { redis } from './redis.js';
import { HttpError } from './access.js';
import { realtime } from './realtime.js';
import { uploads, UPLOAD_DIR } from './uploads.js';
import { authRoutes } from './routes/auth.js';
import { peopleRoutes } from './routes/people.js';
import { moneyRoutes } from './routes/money.js';
import { notifyRoutes } from './routes/notify.js';
import { chatRoutes } from './routes/chat.js';
import { adminRoutes } from './routes/admin.js';
import { registerAudit } from './audit.js';

// Builds the app without listening (index.ts listens; tests use app.inject).
export async function buildApp(opts: { logger?: boolean; onRoute?: (r: RouteOptions) => void } = {}) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');

  const app = Fastify({ logger: opts.logger ?? true, trustProxy: (_addr, hop) => hop < 1 /* trust only nginx; the leftmost X-Forwarded-For is client-controlled */ });
  if (opts.onRoute) app.addHook('onRoute', opts.onRoute);
  // Browsers only (mobile apps ignore CORS). The plugin's default allows just GET/HEAD/POST, which silently
  // blocked every edit and delete on the web app.
  await app.register(cors, {
    origin: ['https://flatmate.ismailabbasi.qzz.io', /^http:\/\/localhost:\d+$/],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(jwt, { secret: process.env.JWT_SECRET });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute', redis });
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
  await app.register(websocket);
  await app.register(fastifyStatic, { root: UPLOAD_DIR, prefix: '/files/' });

  registerAudit(app);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
    if (err instanceof ZodError) return reply.code(400).send({ error: 'Invalid input', details: err.issues });
    const e = err as { statusCode?: number; code?: string; message: string };
    if (e.code === '23505') return reply.code(409).send({ error: 'Already exists' });
    if (e.code === '23503' || e.code === '22P02') return reply.code(400).send({ error: 'Invalid reference' });
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: e.message });
    req.log.error(err);
    return reply.code(500).send({ error: 'Internal error' });
  });

  app.get('/health', async () => {
    await db.query('select 1');
    await redis.ping();
    return { ok: true };
  });

  await app.register(realtime);
  await app.register(uploads);
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(peopleRoutes);
  await app.register(moneyRoutes);
  await app.register(notifyRoutes);
  await app.register(chatRoutes);
  await app.register(adminRoutes);
  return app;
}
