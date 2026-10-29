import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { buildApp } from '../src/app.js';

// Not app routes: static files, and HEAD/OPTIONS that Fastify/CORS add automatically.
const IGNORED = new Set(['GET /files/*']);

// Fails when a registered route has no test file declaring covers('METHOD /path').
test('every route is covered by a test', async () => {
  const registered = new Set<string>();
  const app = await buildApp({
    logger: false,
    onRoute: (r) => {
      for (const m of [r.method].flat()) if (m !== 'HEAD' && m !== 'OPTIONS') registered.add(`${m} ${r.url}`);
    },
  });
  await app.close();

  const covered = new Set<string>();
  for (const f of readdirSync(import.meta.dirname).filter((f) => f.endsWith('.test.ts'))) {
    const src = readFileSync(path.join(import.meta.dirname, f), 'utf8');
    for (const call of src.matchAll(/covers\(([^)]*)\)/g)) {
      for (const [, key] of call[1].matchAll(/['"`]([A-Z]+ \/[^'"`]*)['"`]/g)) covered.add(key);
    }
  }
  const missing = [...registered].filter((r) => !covered.has(r) && !IGNORED.has(r)).sort();
  expect(missing, `routes without a covers(...) test:\n${missing.join('\n')}`).toEqual([]);
});
