import { redis } from './redis.js';

const TTL = 60 * 60;

// Each group has a version number; every group write bumps it (see realtime.publish), so cache keys that
// embed the version can never serve stale money data. Old keys just expire.
export const bumpGroup = (groupId: string) => redis.incr(`gv:${groupId}`);

export async function groupVersions(groupIds: string[]): Promise<string> {
  if (!groupIds.length) return '';
  const vs = await redis.mget(groupIds.map((g) => `gv:${g}`));
  return groupIds.map((g, i) => `${g}.${vs[i] ?? 0}`).join(',');
}

export async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = await redis.get(`c:${key}`);
  if (hit !== null) return JSON.parse(hit) as T;
  const value = await compute();
  await redis.set(`c:${key}`, JSON.stringify(value), 'EX', TTL);
  return value;
}

// Cache a group-scoped result under the group's current version.
export async function cachedForGroup<T>(name: string, groupId: string, compute: () => Promise<T>): Promise<T> {
  return cached(`${name}:${await groupVersions([groupId])}`, compute);
}
