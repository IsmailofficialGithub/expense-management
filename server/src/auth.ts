import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { redis } from './redis.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // imp: email of the super admin who logged in as this user (see POST /admin/users/:id/impersonate).
    payload: { sub: string; email: string; adm?: boolean; imp?: string };
    user: { sub: string; email: string; adm?: boolean; imp?: string };
  }
}

export const REFRESH_TTL = 60 * 60 * 24 * 30;
// An admin's "log in as" session ends after a day without use.
const IMPERSONATION_TTL = 60 * 60 * 24;

// preHandler: rejects requests without a valid access token; then req.user.sub is the user id
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}

// claims: extra access-token claims (adm for super admins). Not stored with the refresh token, so a refresh drops them.
// accessTtl: access-token lifetime (default 15m; the admin panel uses a longer one since it can't refresh).
// user.imp is kept with the refresh token, so a "log in as" session stays marked after refreshes.
export async function issueTokens(reply: FastifyReply, user: { id: string; email: string; imp?: string }, claims: { adm?: boolean } = {}, accessTtl = '15m') {
  const accessToken = await reply.jwtSign({ ...claims, ...(user.imp ? { imp: user.imp } : {}), sub: user.id, email: user.email }, { expiresIn: accessTtl });
  const refreshToken = randomBytes(32).toString('hex');
  await redis.set(`refresh:${refreshToken}`, JSON.stringify(user), 'EX', user.imp ? IMPERSONATION_TTL : REFRESH_TTL);
  // Index per user so a password change can revoke every session.
  await redis.multi().sadd(`refreshUser:${user.id}`, refreshToken).expire(`refreshUser:${user.id}`, REFRESH_TTL).exec();
  return { accessToken, refreshToken, user };
}

export async function revokeSessions(userId: string) {
  const tokens = await redis.smembers(`refreshUser:${userId}`);
  await redis.del(`refreshUser:${userId}`, ...tokens.map((t) => `refresh:${t}`));
}
