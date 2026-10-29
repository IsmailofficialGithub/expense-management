import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// Recreates the test database schema from server/migrations once per `npm test` run.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://expense:expense@127.0.0.1:55439/expense_management_test';
  if (!/test/.test(url)) throw new Error(`Refusing to reset a non-test database: ${url}`);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('drop schema public cascade; create schema public;');
    const dir = path.resolve(import.meta.dirname, '../migrations');
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      await client.query(readFileSync(path.join(dir, f), 'utf8'));
    }
  } finally {
    await client.end();
  }
}
