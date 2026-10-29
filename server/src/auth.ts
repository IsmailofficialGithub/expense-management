import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { redis } from './redis.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string; adm?: boolean };
    user: { sub: string; email: string; adm?: boolean };
  }
}

export const REFRESH_TTL = 60 * 60 * 24 * 30;

// preHandler: rejects requests without a valid access token; then req.user.sub is the user id
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}

// claims: extra access-token claims (adm for super admins). Not stored with the refresh token, so a refresh drops them.
export async function issueTokens(reply: FastifyReply, user: { id: string; email: string }, claims: { adm?: boolean } = {}) {
  const accessToken = await reply.jwtSign({ ...claims, sub: user.id, email: user.email }, { expiresIn: '15m' });
  const refreshToken = randomBytes(32).toString('hex');
  await redis.set(`refresh:${refreshToken}`, JSON.stringify(user), 'EX', REFRESH_TTL);
  // Index per user so a password change can revoke every session.
  await redis.multi().sadd(`refreshUser:${user.id}`, refreshToken).expire(`refreshUser:${user.id}`, REFRESH_TTL).exec();
  return { accessToken, refreshToken, user };
}

export async function revokeSessions(userId: string) {
  const tokens = await redis.smembers(`refreshUser:${userId}`);
  await redis.del(`refreshUser:${userId}`, ...tokens.map((t) => `refresh:${t}`));
}
