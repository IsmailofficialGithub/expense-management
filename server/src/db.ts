import pg from 'pg';

// pg returns numeric and bigint (count(*)) as strings; the app expects numbers like Supabase gave it.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, parseFloat);
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => parseInt(v, 10));

export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
