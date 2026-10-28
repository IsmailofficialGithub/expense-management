import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { redis } from '../redis.js';
import { issueTokens, requireUser } from '../auth.js';
import { sendMail } from '../mail.js';

const email = z.string().trim().toLowerCase().email();
const password = z.string().min(6).max(200);
const strict = { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } };

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Same as the old processPendingInvitations: join every group the email was invited to.
async function acceptPendingInvitations(userId: string, userEmail: string) {
  await db.query(
    `with inv as (
       update group_invitations set status = 'accepted', accepted_at = now()
        where invited_email = $2 and status = 'pending' and expires_at > now()
       returning group_id)
     insert into group_members (group_id, user_id, role)
     select distinct group_id, $1::uuid, 'member' from inv
     on conflict (group_id, user_id) do nothing`,
    [userId, userEmail],
  );
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/signup', strict, async (req, reply) => {
    const body = z.object({ email, password, full_name: z.string().trim().min(1).max(100) }).parse(req.body);
    const hash = await bcrypt.hash(body.password, 10);
    const client = await db.connect();
    let userId: string;
    try {
      await client.query('begin');
      const { rows } = await client.query(
        'insert into users (email, password_hash) values ($1, $2) on conflict (email) do nothing returning id',
        [body.email, hash],
      );
      if (!rows.length) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'User already registered' });
      }
      userId = rows[0].id;
      await client.query('insert into profiles (id, email, full_name) values ($1, $2, $3)', [userId, body.email, body.full_name]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
    const token = randomBytes(32).toString('hex');
    await redis.set(`verify:${token}`, userId, 'EX', 60 * 60 * 24);
    const link = `${process.env.PUBLIC_URL ?? ''}/auth/verify-email?token=${token}`;
    await sendMail(body.email, 'Confirm your Flatmate account',
      `<p>Hi ${escapeHtml(body.full_name)},</p><p><a href="${link}">Confirm your email</a> to finish signing up. The link expires in 24 hours.</p>`);
    return reply.code(201).send({ user: { id: userId, email: body.email } });
  });

  app.get('/verify-email', async (req, reply) => {
    const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.query);
    const userId = await redis.getdel(`verify:${token}`);
    reply.type('text/html');
    if (!userId) return reply.code(400).send('<h2>This link is invalid or expired.</h2>');
    await db.query('update users set email_verified = true where id = $1', [userId]);
    return '<h2>Email confirmed. You can now log in to the app.</h2>';
  });

  app.post('/login', strict, async (req, reply) => {
    const body = z.object({ email, password: z.string() }).parse(req.body);
    const { rows } = await db.query('select id, email, password_hash, email_verified from users where email = $1', [body.email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
      return reply.code(401).send({ error: 'Invalid login credentials' });
    }
    if (!user.email_verified) return reply.code(403).send({ error: 'Email not confirmed' });
    await acceptPendingInvitations(user.id, user.email);
    return issueTokens(reply, { id: user.id, email: user.email });
  });

  app.post('/refresh', async (req, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.body);
    const stored = await redis.getdel(`refresh:${refreshToken}`);
    if (!stored) return reply.code(401).send({ error: 'Session expired' });
    return issueTokens(reply, JSON.parse(stored));
  });

  app.post('/logout', async (req) => {
    const { refreshToken } = z.object({ refreshToken: z.string().optional() }).parse(req.body ?? {});
    if (refreshToken) await redis.del(`refresh:${refreshToken}`);
    return { ok: true };
  });

  // Password reset step 1: always 200 so the endpoint can't be used to find registered emails.
  app.post('/otp', strict, async (req) => {
    const body = z.object({ email }).parse(req.body);
    const { rowCount } = await db.query('select 1 from users where email = $1', [body.email]);
    if (rowCount) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await redis.set(`otp:${body.email}`, JSON.stringify({ code, tries: 0 }), 'EX', 600);
      await sendMail(body.email, 'Your Flatmate code', `<p>Your code is <b>${code}</b>. It expires in 10 minutes.</p>`);
    }
    return { ok: true };
  });

  // Step 2: correct code logs the user in (like Supabase recovery), then the app calls PATCH /auth/password.
  app.post('/verify-otp', strict, async (req, reply) => {
    const body = z.object({ email, code: z.string().trim().regex(/^\d{6}$/) }).parse(req.body);
    const key = `otp:${body.email}`;
    const raw = await redis.get(key);
    const otp = raw ? JSON.parse(raw) as { code: string; tries: number } : null;
    if (!otp || otp.tries >= 5) return reply.code(400).send({ error: 'Code expired, request a new one' });
    if (otp.code !== body.code) {
      await redis.set(key, JSON.stringify({ ...otp, tries: otp.tries + 1 }), 'KEEPTTL');
      return reply.code(400).send({ error: 'Invalid code' });
    }
    await redis.del(key);
    // Proving inbox access also verifies the email.
    const { rows } = await db.query('update users set email_verified = true where email = $1 returning id, email', [body.email]);
    return issueTokens(reply, rows[0]);
  });

  app.patch('/password', { preHandler: requireUser }, async (req) => {
    const body = z.object({ password }).parse(req.body);
    await db.query('update users set password_hash = $2 where id = $1', [req.user.sub, await bcrypt.hash(body.password, 10)]);
    return { ok: true };
  });

  app.get('/me', { preHandler: requireUser }, async (req, reply) => {
    const { rows } = await db.query('select * from profiles where id = $1', [req.user.sub]);
    if (!rows.length) return reply.code(404).send({ error: 'User not found' });
    return { user: { id: req.user.sub, email: req.user.email }, profile: rows[0] };
  });
}
