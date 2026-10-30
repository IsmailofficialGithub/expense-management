import { db } from './db.js';
import { redis } from './redis.js';
import { sendMail } from './mail.js';
import { autoConnect, getStatus, isOnWhatsApp, sendWhatsApp } from './whatsapp.js';

// text: hand-written WhatsApp version; when omitted it is converted from html.
export type Delivery = { userId?: string; email: string; phone?: string | null; kind: string; subject: string; html: string; text?: string };

// Kinds that also go to WhatsApp; everything else (OTP, verification, deletion) stays email-only.
const WA_KINDS = new Set(['expense', 'advance_collection', 'invitation', 'daily_report', 'weekly_report']);
const QUEUE = 'outbound:queue';
const RETRY = 'outbound:retry'; // zset scored by due time (ms)
const RETRY_DELAYS = [60_000, 600_000, 3_600_000];

export function htmlToPlainText(html: string): string {
  if (!html) return '';
  let text = html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n').replace(/<\/li>/gi, '\n').replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ').replace(/<\/th>/gi, ' | ');
  text = text
    // WhatsApp can't render buttons: keep each link as "Label: url" on its own line.
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_m, href: string, label: string) => `\n${label.replace(/<[^>]*>/g, '').trim()}: ${href}\n`)
    .replace(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi, '📌 *$1*\n')
    .replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, '*$2*')
    .replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, '_$2_')
    .replace(/<[uo]l[^>]*>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<\/[uo]l>/gi, '\n')
    .replace(/<\/?table[^>]*>/gi, '\n').replace(/<\/?(thead|tbody|tr|td)[^>]*>/gi, '').replace(/<th[^>]*>/gi, '*')
    .replace(/<[^>]*>/g, '');
  const entities: Record<string, string> = {
    '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&mdash;': '—',
    '&ndash;': '–', '&hellip;': '...', '&copy;': '©', '&reg;': '®', '&#8217;': "'", '&#8220;': '"', '&#8221;': '"',
  };
  text = text.replace(/&(nbsp|lt|gt|quot|#39|apos|mdash|ndash|hellip|copy|reg|#8217|#8220|#8221);/g, (m) => entities[m])
    .replace(/&amp;/g, '&'); // last, so "&amp;lt;" stays "&lt;"
  return text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ')
    .split('\n').map((l) => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function enqueue(channel: 'email' | 'whatsapp', to: string, d: Delivery, body: string) {
  const { rows: [r] } = await db.query(
    `insert into outbound_messages (channel, to_addr, subject, body, kind, user_id) values ($1, $2, $3, $4, $5, $6) returning id`,
    [channel, to, d.subject, body, d.kind, d.userId ?? null]);
  await redis.rpush(QUEUE, String(r.id));
}

// Queue an email, plus a WhatsApp copy when the kind allows it and the user has a usable, opted-in number.
export async function deliver(d: Delivery): Promise<void> {
  await enqueue('email', d.email, d, d.html);
  if (!WA_KINDS.has(d.kind) || getStatus().status !== 'connected') return;
  const { rows: [p] } = await db.query(
    `select id, phone_e164, phone_needs_country, whatsapp_opt_in from profiles where ${d.userId ? 'id = $1' : 'email = $1'}`,
    [d.userId ?? d.email]);
  if (!p?.whatsapp_opt_in || p.phone_needs_country || !p.phone_e164) return;
  const text = d.text ?? `*${d.subject}*\n\n${htmlToPlainText(d.html)}`;
  await enqueue('whatsapp', p.phone_e164, { ...d, userId: p.id }, text);
}

async function sendOne(id: string) {
  const { rows: [m] } = await db.query(`select * from outbound_messages where id = $1 and status = 'queued'`, [id]);
  if (!m) return;
  try {
    if (m.channel === 'email') await sendMail(m.to_addr, m.subject ?? '', m.body);
    else {
      if (!(await isOnWhatsApp(m.to_addr))) {
        await db.query(`update outbound_messages set status = 'failed', attempts = attempts + 1, last_error = 'not on WhatsApp' where id = $1`, [id]);
        return;
      }
      await sendWhatsApp(m.to_addr, m.body);
    }
    await db.query(`update outbound_messages set status = 'sent', attempts = attempts + 1, sent_at = now(), last_error = null where id = $1`, [id]);
  } catch (e) {
    const attempts = m.attempts + 1;
    const delay = RETRY_DELAYS[attempts - 1];
    await db.query(`update outbound_messages set attempts = $2, last_error = $3, status = $4 where id = $1`,
      [id, attempts, String((e as Error)?.message ?? e), delay ? 'queued' : 'failed']);
    if (delay) await redis.zadd(RETRY, Date.now() + delay, id);
  }
}

// Move due retries to the queue and send everything queued. Exported so tests can drain without the timer.
export async function drainQueue(): Promise<void> {
  const due = await redis.zrangebyscore(RETRY, 0, Date.now());
  for (const id of due) if (await redis.zrem(RETRY, id)) await redis.rpush(QUEUE, id);
  for (let id = await redis.lpop(QUEUE); id; id = await redis.lpop(QUEUE)) await sendOne(id);
}

export function startMessagingWorker(): void {
  autoConnect().catch((e) => console.error('WhatsApp auto-connect failed', e));
  let busy = false;
  setInterval(() => {
    if (busy) return;
    busy = true;
    drainQueue().catch((e) => console.error('Messaging worker failed', e)).finally(() => { busy = false; });
  }, 1000);
}

export async function resendOutbound(id: string | number): Promise<void> {
  const { rowCount } = await db.query(
    `update outbound_messages set status = 'queued', attempts = 0, last_error = null where id = $1`, [id]);
  if (!rowCount) throw new Error('Outbound message not found');
  await redis.zrem(RETRY, String(id));
  await redis.rpush(QUEUE, String(id));
}
