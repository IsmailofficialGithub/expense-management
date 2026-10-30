import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, type WASocket } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { db } from './db.js';
import { redis } from './redis.js';
import { sendMail } from './mail.js';
import { superAdminEmails } from './admin.js';

export type WaStatus = { status: 'connected' | 'disconnected' | 'qr'; qr?: string; me?: string };

const SESSION_DIR = process.env.WA_SESSION_DIR ?? './wa-session';

// Empty the session folder but keep the folder: in Docker it is a mount point and can't be removed (EBUSY).
// Never throws: a failed cleanup must not crash the API.
async function clearSession() {
  try {
    for (const f of await readdir(SESSION_DIR)) await rm(join(SESSION_DIR, f), { recursive: true, force: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.error('WhatsApp session cleanup failed', e);
  }
}
const ALERT_KEY = 'wa:disconnect_alerted';
let sock: WASocket | null = null;
let state: WaStatus = { status: 'disconnected' };
let wanted = false; // false after an explicit disconnect(), so close events don't reconnect

export function getStatus(): WaStatus {
  return state;
}

const setEnabled = (on: boolean) =>
  db.query(`insert into system_settings (key, value) values ('whatsapp_enabled', $1)
            on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(on)]);

// Reconnect on boot if the admin left WhatsApp connected.
export async function autoConnect(): Promise<void> {
  const { rows } = await db.query(`select value from system_settings where key = 'whatsapp_enabled'`);
  if (rows[0]?.value === true) await connect();
}

async function alertAdmins(reason: string) {
  if (!(await redis.set(ALERT_KEY, '1', 'NX'))) return; // once per outage
  for (const to of superAdminEmails()) {
    await sendMail(to, 'Flatmate WhatsApp disconnected',
      `<p>The system WhatsApp disconnected (${reason}). Reconnect it from the admin Settings page.</p>`)
      .catch((e) => console.error('WhatsApp alert email failed', e));
  }
}

export async function connect(): Promise<void> {
  wanted = true;
  await setEnabled(true);
  if (sock) return;
  const { state: auth, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const s = makeWASocket({ auth });
  sock = s;
  s.ev.on('creds.update', saveCreds);
  // Errors here would be unhandled rejections and crash the whole API, so they are only logged.
  s.ev.on('connection.update', (u) => onUpdate(s, u).catch((e) => console.error('WhatsApp connection handler failed', e)));
}

async function onUpdate(s: WASocket, { connection, lastDisconnect, qr }: Partial<import('@whiskeysockets/baileys').ConnectionState>) {
  if (sock !== s) return;
  if (qr) state = { status: 'qr', qr: await QRCode.toDataURL(qr) };
  if (connection === 'open') {
    state = { status: 'connected', me: s.user?.id?.split(':')[0] };
    await redis.del(ALERT_KEY);
  }
  if (connection === 'close') {
    sock = null;
    state = { status: 'disconnected' };
    if (!wanted) return;
    const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
    if (code === DisconnectReason.loggedOut) {
      wanted = false;
      await setEnabled(false);
      await clearSession();
      await alertAdmins('logged out from the phone');
      return;
    }
    if (code !== DisconnectReason.restartRequired) await alertAdmins(`code ${code ?? 'unknown'}`);
    setTimeout(() => { if (wanted) connect().catch((e) => console.error('WhatsApp reconnect failed', e)); }, 5000);
  }
}

export async function disconnect(): Promise<void> {
  wanted = false;
  await setEnabled(false);
  const s = sock;
  sock = null;
  state = { status: 'disconnected' };
  await s?.logout().catch(() => s.end(undefined));
  await clearSession();
}

const jid = (e164: string) => `${e164.replace(/\D/g, '')}@s.whatsapp.net`;
const live = () => {
  if (!sock || state.status !== 'connected') throw new Error('WhatsApp not connected');
  return sock;
};

// Sends are serialized with a 1-3 s random gap to look less like a bot.
let chain: Promise<unknown> = Promise.resolve();
export function sendWhatsApp(e164: string, text: string): Promise<void> {
  const run = chain.then(async () => {
    await live().sendMessage(jid(e164), { text });
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
  });
  chain = run.catch(() => {});
  return run;
}

export async function isOnWhatsApp(e164: string): Promise<boolean> {
  const [r] = (await live().onWhatsApp(jid(e164))) ?? [];
  return !!r?.exists;
}
