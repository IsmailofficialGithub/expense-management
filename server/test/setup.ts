import { afterAll, beforeAll, vi } from 'vitest';

// Captured outbound messages instead of real email / WhatsApp. Tests read and clear these.
export const sentMails: { to: string; subject: string; html: string }[] = [];
export const sentWhatsApps: { to: string; text: string }[] = [];

vi.mock('../src/mail.js', () => ({
  sendMail: vi.fn(async (to: string, subject: string, html: string) => { sentMails.push({ to, subject, html }); }),
}));
vi.mock('../src/whatsapp.js', async (orig) => ({
  ...(await orig<typeof import('../src/whatsapp.js')>()),
  sendWhatsApp: vi.fn(async (to: string, text: string) => { sentWhatsApps.push({ to, text }); }),
  isOnWhatsApp: vi.fn(async () => true),
}));

beforeAll(async () => {
  const { redis } = await import('../src/redis.js');
  await redis.flushdb(); // db 15; clears rate limits and OTPs between files
});

afterAll(async () => {
  const { closeTestApp } = await import('./helpers.js');
  await closeTestApp();
});
