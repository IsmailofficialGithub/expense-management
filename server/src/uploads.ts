import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { requireUser } from './auth.js';

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.resolve('uploads');
const BUCKETS = new Set(['avatars', 'receipts', 'chat']);

export function publicUrl(bucket: string, file: string) {
  return `${process.env.PUBLIC_URL ?? ''}/files/${bucket}/${file}`;
}

// Deletes a file previously returned by POST /uploads; ignores URLs that aren't ours or weren't uploaded by userId.
export async function deleteUpload(url: string | null | undefined, userId: string) {
  const m = url?.match(/\/files\/(avatars|receipts|chat)\/([\w-]+\.webp)$/);
  if (m && m[2].startsWith(`${userId}-`)) await unlink(path.join(UPLOAD_DIR, m[1], m[2])).catch(() => {});
}

export async function uploads(app: FastifyInstance) {
  for (const b of BUCKETS) await mkdir(path.join(UPLOAD_DIR, b), { recursive: true });

  // multipart field "file" → resized to max 1280px, re-encoded as webp q75 → { url }
  app.post<{ Params: { bucket: string } }>('/uploads/:bucket', { preHandler: requireUser }, async (req, reply) => {
    const { bucket } = req.params;
    if (!BUCKETS.has(bucket)) return reply.code(400).send({ error: 'Unknown bucket' });
    const file = await req.file();
    if (!file || !file.mimetype.startsWith('image/')) return reply.code(400).send({ error: 'Image file required' });
    const name = `${req.user.sub}-${randomUUID()}.webp`;
    const size = bucket === 'avatars' ? 512 : 1280;
    const buf = await file.toBuffer(); // throws 413 past the multipart fileSize limit
    try {
      await sharp(buf, { failOn: 'error' })
        .rotate()
        .resize(size, size, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(path.join(UPLOAD_DIR, bucket, name));
    } catch {
      return reply.code(400).send({ error: 'Invalid image' });
    }
    return { url: publicUrl(bucket, name) };
  });
}
