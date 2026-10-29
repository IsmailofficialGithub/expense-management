import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { db } from '../src/db.js';
import { redis } from '../src/redis.js';
import { flushAuditLogs } from '../src/audit.js';

export { sentMails, sentWhatsApps } from './setup.js';
export { db, redis, flushAuditLogs };

// Route coverage: call covers('POST /expenses', ...) at the top level of a test file for every route it tests.
// routes.coverage.test.ts reads these calls from the source files, so the strings must be literals.
export function covers(..._routes: string[]) {}

let app: FastifyInstance | null = null;
export async function getApp() {
  if (!app) {
    app = await buildApp({ logger: false });
    await app.ready();
  }
  return app;
}
export async function closeTestApp() {
  if (app) await app.close();
  app = null;
  await db.end().catch(() => {});
  redis.disconnect();
}

export type TestUser = { id: string; email: string; password: string; token: string };

// Verified user with a profile and a 15m access token. adm: true makes an admin token (email must be in SUPER_ADMIN_EMAILS).
export async function createUser(o: { email?: string; password?: string; name?: string; phone_e164?: string; adm?: boolean } = {}): Promise<TestUser> {
  const email = o.email ?? `u-${randomUUID().slice(0, 8)}@test.local`;
  const password = o.password ?? 'secret123';
  const { rows: [u] } = await db.query(
    'insert into users (email, password_hash, email_verified) values ($1, $2, true) returning id', [email, await bcrypt.hash(password, 4)]);
  await db.query('insert into profiles (id, email, full_name, phone_e164) values ($1, $2, $3, $4)', [u.id, email, o.name ?? email.split('@')[0], o.phone_e164 ?? null]);
  return { id: u.id, email, password, token: await tokenFor({ id: u.id, email }, { adm: o.adm }) };
}

export async function tokenFor(user: { id: string; email: string }, claims: { adm?: boolean } = {}) {
  const a = await getApp();
  return a.jwt.sign({ ...(claims.adm ? { adm: true } : {}), sub: user.id, email: user.email }, { expiresIn: '15m' });
}

export const auth = (u: { token: string }) => ({ authorization: `Bearer ${u.token}` });

// Group owned by `owner` (admin); `members` join as active members, `pending` as pending invitees.
export async function createGroup(owner: TestUser, members: TestUser[] = [], o: { name?: string; pending?: TestUser[] } = {}) {
  const { rows: [g] } = await db.query('insert into groups (name, created_by) values ($1, $2) returning id', [o.name ?? 'Test group', owner.id]);
  await db.query(`insert into group_memberships (group_id, user_id, role) values ($1, $2, 'admin')`, [g.id, owner.id]);
  for (const m of members) await db.query('insert into group_memberships (group_id, user_id) values ($1, $2)', [g.id, m.id]);
  for (const m of o.pending ?? []) await db.query(`insert into group_memberships (group_id, user_id, status) values ($1, $2, 'pending')`, [g.id, m.id]);
  return g.id as string;
}
