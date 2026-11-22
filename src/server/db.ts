import 'server-only';
import { Pool } from 'pg';
import { z } from 'zod';

const globalDb = globalThis as unknown as { pigPool?: Pool };

export function familyId(): string {
  return z.string().uuid().parse(process.env.DEFAULT_FAMILY_ID ?? '00000000-0000-4000-8000-000000000001');
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('Chưa cấu hình DATABASE_URL trên máy chủ.');
  if (!globalDb.pigPool) {
    globalDb.pigPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 30000,
    });
    globalDb.pigPool.on('error', () => console.error('PostgreSQL pool connection error'));
  }
  return globalDb.pigPool;
}
