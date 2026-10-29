import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { redis } from '../redis.js';
import { issueTokens, requireUser, revokeSessions } from '../auth.js';
import { sendMail } from '../mail.js';
import { publish } from '../realtime.js';
import { insertNotifications } from './notify.js';

const email = z.string().trim().toLowerCase().email();
const password = z.string().min(6).max(200);
const strict = { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } };

// Generated default picture (PNG works on Android, iOS and web), seeded by the user id so it is stable and unique.
export const defaultAvatar = (userId: string) => `https://api.dicebear.com/9.x/adventurer-neutral/png?seed=${userId}&size=256`;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Same as the old processPendingInvitations: join every group the email was invited to.
async function acceptPendingInvitations(userId: string, userEmail: string) {
  await db.query(
    `with inv as (
       update group_invitations set status = 'accepted', accepted_at = now()
        where invited_email = $2 and status = 'pending' and expires_at > now()
       returning group_id)
     insert into group_memberships (group_id, user_id, role)
     select distinct group_id, $1::uuid, 'member' from inv
     on conflict (group_id, user_id) do update set status = 'active'`,
    [userId, userEmail],
  );
}

// Anonymises the account. Shared expenses, settlements and chat messages stay (shown as "Deleted user") so other
// members' balances and history don't change; personal data is deleted. Also used by the admin panel.
export async function deleteAccount(me: string) {
  // Captured before anonymising, to tell everyone I shared a group with.
  const { rows: mates } = await db.query(
    `select distinct m.user_id, m.group_id, g.name as group_name, coalesce(p.full_name, p.email) as my_name
       from group_members mine join group_members m on m.group_id = mine.group_id and m.user_id <> $1
       join groups g on g.id = mine.group_id join profiles p on p.id = $1
      where mine.user_id = $1`, [me]);
  const client = await db.connect();
  try {
    await client.query('begin');
    const { rows: [u] } = await client.query('select email from users where id = $1 for update', [me]);
    if (!u) throw new Error('user missing');
    // Groups I created: hand over to the longest-standing other member, or delete if I'm alone.
    const { rows: owned } = await client.query('select id from groups where created_by = $1', [me]);
    for (const { id: groupId } of owned) {
      const { rows: [heir] } = await client.query(
        'select user_id from group_members where group_id = $1 and user_id <> $2 order by (role = \'admin\') desc, joined_at limit 1', [groupId, me]);
      if (heir) {
        await client.query('update groups set created_by = $2, updated_at = now() where id = $1', [groupId, heir.user_id]);
        await client.query("update group_members set role = 'admin' where group_id = $1 and user_id = $2", [groupId, heir.user_id]);
      } else {
        await client.query('delete from groups where id = $1', [groupId]);
      }
    }
    await client.query("update group_members set role = 'member' where user_id = $1", [me]);
    await client.query("update group_invitations set status = 'expired' where invited_email = $1 and status = 'pending'", [u.email]);
    for (const t of ['personal_transactions', 'personal_debts', 'user_payment_methods', 'notifications', 'typing_indicators', 'message_deletions', 'message_reads']) {
      await client.query(`delete from ${t} where user_id = $1`, [me]);
    }
    // Free the email for a new signup; '!' never matches a bcrypt hash, so nobody can log in.
    const gone = `deleted-${me}@deleted.invalid`;
    await client.query("update users set email = $2, password_hash = '!', email_verified = false where id = $1", [me, gone]);
    await client.query(
      `update profiles set email = $2, full_name = 'Deleted user', avatar_url = null, phone = null, phone_e164 = null,
         push_token = null, push_token_updated_at = null, updated_at = now() where id = $1`, [me, gone]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  await revokeSessions(me);
  // Best effort: the account is already gone, so a notification failure must not fail the request.
  try {
    await insertNotifications(mates.map((m) => ({
      user_id: m.user_id, type: 'member_left', related_id: m.group_id,
      title: 'Member left', message: `${m.my_name} deleted their account and left "${m.group_name}"`,
      metadata: { group_id: m.group_id },
    })));
    for (const m of mates) await publish(`user:${m.user_id}`, 'members_changed', { group_id: m.group_id });
  } catch (e) {
    console.error('account deletion notifications failed', e);
  }
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
        // Invitees added to expenses before signing up have a placeholder account ('!' hash); signup claims it.
        `insert into users (email, password_hash) values ($1, $2)
         on conflict (email) do update set password_hash = excluded.password_hash where users.password_hash = '!' returning id`,
        [body.email, hash],
      );
      if (!rows.length) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'User already registered' });
      }
      userId = rows[0].id;
      await client.query(`insert into profiles (id, email, full_name, avatar_url) values ($1, $2, $3, $4)
                          on conflict (id) do update set full_name = excluded.full_name, updated_at = now()`,
        [userId, body.email, body.full_name, defaultAvatar(userId)]);
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
    // Straight to the web login; logging in also joins any groups this email was invited to
    return reply.redirect(process.env.WEB_URL ?? 'https://flatmate.ismailabbasi.qzz.io');
  });

  app.post('/login', strict, async (req, reply) => {
    const body = z.object({ email, password: z.string() }).parse(req.body);
    const { rows } = await db.query('select id, email, password_hash, email_verified from users where email = $1', [body.email]);
    const user = rows[0];
    if (!user || user.password_hash === '!' || !(await bcrypt.compare(body.password, user.password_hash))) {
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
    // Per-email cap too, so codes can't be re-issued without limit for guessing.
    const sent = await redis.multi().incr(`otpSent:${body.email}`).expire(`otpSent:${body.email}`, 3600, 'NX').exec();
    if (rowCount && Number(sent?.[0]?.[1]) <= 5) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await redis.multi().set(`otp:${body.email}`, code, 'EX', 600).del(`otpTries:${body.email}`).exec();
      await sendMail(body.email, 'Your Flatmate code', `<p>Your code is <b>${code}</b>. It expires in 10 minutes.</p>`);
    }
    return { ok: true };
  });

  // Step 2: correct code logs the user in (like Supabase recovery), then the app calls PATCH /auth/password.
  app.post('/verify-otp', strict, async (req, reply) => {
    const body = z.object({ email, code: z.string().trim().regex(/^\d{6}$/) }).parse(req.body);
    const key = `otp:${body.email}`;
    // Count the attempt atomically before comparing, so parallel guesses can't all see tries=0.
    const [[, tries], , [, code]] = (await redis.multi().incr(`otpTries:${body.email}`).expire(`otpTries:${body.email}`, 600).get(key).exec())!;
    if (!code || Number(tries) > 5) return reply.code(400).send({ error: 'Code expired, request a new one' });
    if (code !== body.code) return reply.code(400).send({ error: 'Invalid code' });
    if (!(await redis.del(key))) return reply.code(400).send({ error: 'Code expired, request a new one' });
    // Proving inbox access also verifies the email.
    const { rows } = await db.query('update users set email_verified = true where email = $1 returning id, email', [body.email]);
    await redis.set(`recovery:${rows[0].id}`, '1', 'EX', 900);
    return issueTokens(reply, rows[0]);
  });

  // Needs the current password, unless the user just proved inbox access via verify-otp. Revokes all other sessions.
  app.patch('/password', { preHandler: requireUser, ...strict }, async (req, reply) => {
    const body = z.object({ password, current_password: z.string().optional() }).parse(req.body);
    const { rows } = await db.query('select password_hash from users where id = $1', [req.user.sub]);
    if (!rows.length) return reply.code(404).send({ error: 'User not found' });
    const recovery = await redis.getdel(`recovery:${req.user.sub}`);
    if (!recovery && !(body.current_password && await bcrypt.compare(body.current_password, rows[0].password_hash))) {
      return reply.code(403).send({ error: 'Current password is incorrect' });
    }
    await db.query('update users set password_hash = $2 where id = $1', [req.user.sub, await bcrypt.hash(body.password, 10)]);
    await revokeSessions(req.user.sub);
    return issueTokens(reply, { id: req.user.sub, email: req.user.email });
  });

  // ---------- leave a group from the invite email (no account needed; the invitee proves inbox access with a code) ----------
  const leaveToken = z.string().regex(/^[a-f0-9]{48}$/);
  const inviteByToken = async (token: string) => (await db.query(
    `select i.id, i.group_id, i.invited_email, i.status, g.name as group_name
       from group_invitations i join groups g on g.id = i.group_id where i.invitation_token = $1`, [token])).rows[0];

  app.get('/leave-group', async (req, reply) => {
    const { token } = z.object({ token: leaveToken }).parse(req.query);
    const inv = await inviteByToken(token);
    reply.type('text/html');
    if (!inv || inv.status !== 'pending') return reply.code(400).send('<h2>This link is invalid, or you already left or joined this group.</h2>');
    const t = JSON.stringify(token);
    return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<div style="font-family:Arial,sans-serif;max-width:420px;margin:40px auto;padding:0 16px">
<h2>Leave &quot;${escapeHtml(inv.group_name)}&quot;?</h2>
<p>We'll send a 6-digit code to <b>${escapeHtml(inv.invited_email)}</b> to confirm it's you.</p>
<button id="send">Email me a code</button>
<div id="step2" hidden><p><label>Code <input id="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label></p><button id="leave">Leave group</button></div>
<p id="msg" role="status"></p></div>
<script>
const post = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ ok: r.ok, ...(await r.json()) }));
const msg = (m) => { document.getElementById('msg').textContent = m; };
document.getElementById('send').onclick = async () => {
  const r = await post('leave-group/code', { token: ${t} });
  if (!r.ok) return msg(r.error || 'Something went wrong');
  document.getElementById('step2').hidden = false; msg('Code sent. Check your email.');
};
document.getElementById('leave').onclick = async () => {
  const r = await post('leave-group', { token: ${t}, code: document.getElementById('code').value.trim() });
  if (!r.ok) return msg(r.error || 'Something went wrong');
  document.body.innerHTML = '<h2 style="font-family:Arial,sans-serif;text-align:center;margin-top:60px">You left the group.</h2>';
};
</script>`;
  });

  app.post('/leave-group/code', strict, async (req, reply) => {
    const { token } = z.object({ token: leaveToken }).parse(req.body);
    const inv = await inviteByToken(token);
    if (!inv || inv.status !== 'pending') return reply.code(400).send({ error: 'This link is no longer valid' });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await redis.multi().set(`leaveOtp:${token}`, code, 'EX', 600).del(`leaveTries:${token}`).exec();
    await sendMail(inv.invited_email, `Your code to leave "${inv.group_name}"`, `<p>Your code is <b>${code}</b>. It expires in 10 minutes.</p>`);
    return { ok: true };
  });

  // Declines the invite. Shares already assigned stay on their expenses as a placeholder (status 'left').
  app.post('/leave-group', strict, async (req, reply) => {
    const body = z.object({ token: leaveToken, code: z.string().trim().regex(/^\d{6}$/) }).parse(req.body);
    const [[, tries], , [, code]] = (await redis.multi().incr(`leaveTries:${body.token}`).expire(`leaveTries:${body.token}`, 600).get(`leaveOtp:${body.token}`).exec())!;
    if (!code || Number(tries) > 5) return reply.code(400).send({ error: 'Code expired, request a new one' });
    if (code !== body.code) return reply.code(400).send({ error: 'Invalid code' });
    if (!(await redis.del(`leaveOtp:${body.token}`))) return reply.code(400).send({ error: 'Code expired, request a new one' });
    const { rows: [inv] } = await db.query(
      `with i as (update group_invitations set status = 'expired' where invitation_token = $1 and status = 'pending' returning group_id, invited_email)
       update group_memberships m set status = 'left' from i, profiles p
        where m.group_id = i.group_id and p.email = i.invited_email and m.user_id = p.id and m.status = 'pending'
       returning m.group_id`,
      [body.token],
    );
    if (inv) await publish(`group:${inv.group_id}`, 'member_removed', { group_id: inv.group_id });
    return { ok: true };
  });

  app.get('/me', { preHandler: requireUser }, async (req, reply) => {
    const { rows } = await db.query('select * from profiles where id = $1', [req.user.sub]);
    if (!rows.length) return reply.code(404).send({ error: 'User not found' });
    return { user: { id: req.user.sub, email: req.user.email }, profile: rows[0] };
  });

  // Account deletion step 1: email a 6-digit code to the logged-in user.
  app.post('/delete-account/code', { preHandler: requireUser, ...strict }, async (req) => {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await redis.multi().set(`delOtp:${req.user.sub}`, code, 'EX', 600).del(`delOtpTries:${req.user.sub}`).exec();
    await sendMail(req.user.email, 'Confirm account deletion',
      `<p>Your code to permanently delete your Flatmate account is <b>${code}</b>. It expires in 10 minutes.</p>
       <p>If you didn't ask for this, ignore this email and change your password.</p>`);
    return { ok: true };
  });

  // Step 2: correct code anonymises the account (see deleteAccount).
  app.post('/delete-account', { preHandler: requireUser, ...strict }, async (req, reply) => {
    const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).parse(req.body);
    const me = req.user.sub;
    const [[, tries], , [, stored]] = (await redis.multi().incr(`delOtpTries:${me}`).expire(`delOtpTries:${me}`, 600).get(`delOtp:${me}`).exec())!;
    if (!stored || Number(tries) > 5) return reply.code(400).send({ error: 'Code expired, request a new one' });
    if (stored !== code) return reply.code(400).send({ error: 'Invalid code' });
    if (!(await redis.del(`delOtp:${me}`))) return reply.code(400).send({ error: 'Code expired, request a new one' });

    await deleteAccount(me);
    return { ok: true };
  });
}
