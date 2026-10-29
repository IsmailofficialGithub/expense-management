import type { FastifyReply, FastifyRequest } from 'fastify';

export const superAdminEmails = () =>
  (process.env.SUPER_ADMIN_EMAILS ?? '').split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
export const isSuperAdminEmail = (email: string) => superAdminEmails().includes(email.toLowerCase());

// preHandler for /admin/*: valid token issued by /admin/verify (adm claim), and the email is still listed in .env
// (re-checked every request so removing an email revokes access immediately).
export async function requireSuperAdmin(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  if (req.user.adm !== true || !isSuperAdminEmail(req.user.email)) return reply.code(403).send({ error: 'Forbidden' });
}
