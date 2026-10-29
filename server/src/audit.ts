import type { FastifyInstance, FastifyRequest } from 'fastify';
import { db } from './db.js';

// Global request log: every route gets one audit_logs row with a friendly message plus the raw (redacted) data.
// Registered on the root instance before any route so the hooks apply everywhere.

// Substring match so new_password, password_hash, leave_token, otp_code etc. are caught too; qr = WhatsApp pairing code.
const SECRET = /password|token|secret|otp|^code$|^qr$|^authorization$|^cookie$/i;
const MAX_JSON = 20_000; // chars; larger bodies are stored truncated so one upload can't bloat the table

export function redact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET.test(k) ? '[redacted]' : redact(x)]));
  }
  return v;
}

const clip = (v: unknown) => {
  if (v === undefined) return null;
  const s = JSON.stringify(v);
  return s && s.length > MAX_JSON ? { truncated: s.slice(0, MAX_JSON) } : v;
};

type Ctx = { actor: string; body: any; params: any; query: any; status: number; res: any };
const money = (n: unknown) => `₹${n ?? '?'}`;

// Keys are "METHOD routerPath". Anything missing falls back to the generic message.
export const routeMessages: Record<string, (c: Ctx) => string> = {
  'POST /auth/signup': (c) => `${c.actor} signed up`,
  'POST /auth/login': (c) => c.status < 300 ? `${c.actor} logged in` : `${c.actor} failed to log in`,
  'POST /auth/logout': (c) => `${c.actor} logged out`,
  'POST /auth/otp': (c) => `${c.actor} requested a password reset code`,
  'POST /auth/verify-otp': (c) => `${c.actor} verified a password reset code`,
  'PATCH /auth/password': (c) => `${c.actor} changed their password`,
  'POST /auth/delete-account': (c) => `${c.actor} deleted their account`,
  'POST /admin/login': (c) => `${c.actor} started admin login`,
  'POST /admin/verify': (c) => c.status < 300 ? `${c.actor} logged in to the admin panel` : `${c.actor} failed admin verification`,
  'POST /groups': (c) => `${c.actor} created group "${c.body?.name}"`,
  'PATCH /groups/:id': (c) => `${c.actor} updated group ${c.params.id}`,
  'DELETE /groups/:id': (c) => `${c.actor} deleted group ${c.params.id}`,
  'POST /groups/:id/members': (c) => `${c.actor} added a member to group ${c.params.id}`,
  'DELETE /groups/:id/members/:userId': (c) => `${c.actor} removed member ${c.params.userId} from group ${c.params.id}`,
  'POST /invitations': (c) => `${c.actor} invited ${c.body?.email ?? c.body?.invited_email ?? 'someone'}`,
  'POST /invitations/:id/:action': (c) => `${c.actor} ${c.params.action}ed invitation ${c.params.id}`,
  'POST /expenses': (c) => `${c.actor} added expense "${c.body?.description}" ${money(c.body?.amount)}`,
  'PATCH /expenses/:id': (c) => `${c.actor} edited expense ${c.params.id}`,
  'PUT /expenses/:id/splits': (c) => `${c.actor} changed the splits of expense ${c.params.id}`,
  'DELETE /expenses/:id': (c) => `${c.actor} deleted expense ${c.params.id}`,
  'POST /expense-splits/:id/settle': (c) => `${c.actor} settled split ${c.params.id}`,
  'POST /settlements': (c) => `${c.actor} recorded a settlement of ${money(c.body?.amount)}`,
  'POST /bulk-settlements': (c) => `${c.actor} recorded a bulk settlement`,
  'POST /advance-collections': (c) => `${c.actor} started an advance collection of ${money(c.body?.total_amount ?? c.body?.amount)}`,
  'POST /advance-contributions/:id/contribute': (c) => `${c.actor} paid advance contribution ${c.params.id}`,
  'POST /advance-contributions/:id/approve': (c) => `${c.actor} approved advance contribution ${c.params.id}`,
  'POST /advance-contributions/:id/reject': (c) => `${c.actor} rejected advance contribution ${c.params.id}`,
  'POST /personal-transactions': (c) => `${c.actor} added a personal transaction of ${money(c.body?.amount)}`,
  'POST /personal-debts': (c) => `${c.actor} added a personal debt of ${money(c.body?.amount)}`,
  'PATCH /profiles/me': (c) => `${c.actor} updated their profile`,
  'POST /conversations/:id/messages': (c) => `${c.actor} sent a message in conversation ${c.params.id}`,
  'DELETE /messages/:id': (c) => `${c.actor} deleted message ${c.params.id}`,
  'POST /uploads/:bucket': (c) => `${c.actor} uploaded a file to ${c.params.bucket}`,
};

export const auditMessage = (key: string, c: Ctx) => {
  const fn = routeMessages[key];
  try {
    if (fn) return fn(c);
  } catch { /* fall through to the generic text */ }
  return `${c.actor} ${key} → ${c.status}`;
};

let buffer: Record<string, unknown>[] = [];
let timer: NodeJS.Timeout | null = null;

export async function flushAuditLogs() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!buffer.length) return;
  const rows = buffer;
  buffer = [];
  try {
    await db.query(
      `insert into audit_logs (created_at, actor_id, actor_email, is_admin, method, route, url, status, ip, duration_ms, message, request, response, error)
       select created_at, actor_id, actor_email, is_admin, method, route, url, status, ip, duration_ms, message, request, response, error
         from jsonb_to_recordset($1::jsonb) as r(created_at timestamptz, actor_id uuid, actor_email text, is_admin boolean, method text,
           route text, url text, status int, ip text, duration_ms int, message text, request jsonb, response jsonb, error text)`,
      [JSON.stringify(rows)],
    );
  } catch (e) {
    console.error('audit log insert failed', e); // logging must never break requests
  }
}

function enqueue(row: Record<string, unknown>) {
  buffer.push(row);
  if (buffer.length >= 100) void flushAuditLogs();
  else timer ??= setTimeout(() => void flushAuditLogs(), 2000);
}

export async function purgeOldLogs(days = Number(process.env.LOG_RETENTION_DAYS ?? 90)) {
  const { rowCount } = await db.query(`delete from audit_logs where created_at < now() - make_interval(days => $1)`, [days]);
  return rowCount ?? 0;
}

declare module 'fastify' {
  interface FastifyRequest { auditStart?: number; auditPayload?: unknown; auditError?: string }
}

export function registerAudit(app: FastifyInstance) {
  app.addHook('onRequest', async (req) => { req.auditStart = performance.now(); });
  app.addHook('onError', async (req, _reply, err) => { req.auditError = err.stack ?? err.message; });
  app.addHook('onSend', async (req, reply, payload) => {
    // Keep JSON responses only; files/streams are logged as their content type.
    const type = String(reply.getHeader('content-type') ?? '');
    if (typeof payload === 'string' && type.includes('json')) {
      try { req.auditPayload = JSON.parse(payload); } catch { req.auditPayload = payload; }
    } else if (payload != null) req.auditPayload = { contentType: type };
    return payload;
  });
  app.addHook('onResponse', async (req, reply) => {
    if (req.routeOptions.url === '/health') return;
    const user = (req as FastifyRequest & { user?: { sub: string; email: string; adm?: boolean } }).user;
    const body = req.body as any;
    const actorEmail = user?.email ?? (typeof body?.email === 'string' ? body.email : null);
    const route = req.routeOptions.url ?? null;
    const key = `${req.method} ${route ?? req.url.split('?')[0]}`;
    enqueue({
      created_at: new Date().toISOString(),
      actor_id: user?.sub ?? null,
      actor_email: actorEmail,
      is_admin: user?.adm === true,
      method: req.method,
      route,
      url: req.url.replace(/([?&]([^=&]*)=)[^&]*/g, (m, p: string, k: string) => (SECRET.test(k.replace(/%5f/gi, "_")) ? `${p}[redacted]` : m)),
      status: reply.statusCode,
      ip: req.ip,
      duration_ms: Math.round(performance.now() - (req.auditStart ?? performance.now())),
      message: auditMessage(key, { actor: actorEmail ?? 'anonymous', body, params: req.params ?? {}, query: req.query ?? {}, status: reply.statusCode, res: req.auditPayload }),
      request: clip(redact({ params: req.params, query: req.query, body })),
      response: clip(redact(req.auditPayload)),
      error: req.auditError ?? null,
    });
  });
  app.addHook('onClose', async () => { await flushAuditLogs(); });
}
