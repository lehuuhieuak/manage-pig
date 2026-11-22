import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Thiếu DATABASE_URL.');
const familyId = process.env.DEFAULT_FAMILY_ID ?? '00000000-0000-4000-8000-000000000001';
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  const sql = await readFile(new URL('../db/001_initial.sql', import.meta.url), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('manage-pig-migrations'))");
    await client.query(sql);
    await client.query('INSERT INTO families(id, name) VALUES($1, $2) ON CONFLICT(id) DO NOTHING', [familyId, 'Gia đình']);
    await client.query('COMMIT');
    console.log('Đã tạo cấu trúc dữ liệu và gia đình mặc định.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
} finally { await pool.end(); }
