import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { redis } from './redis.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string };
    user: { sub: string; email: string };
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

export async function issueTokens(reply: FastifyReply, user: { id: string; email: string }) {
  const accessToken = await reply.jwtSign({ sub: user.id, email: user.email }, { expiresIn: '15m' });
  const refreshToken = randomBytes(32).toString('hex');
  await redis.set(`refresh:${refreshToken}`, JSON.stringify(user), 'EX', REFRESH_TTL);
  return { accessToken, refreshToken, user };
}
