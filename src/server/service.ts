import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import Decimal from '../lib/decimal';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { Batch, Entry, Farm, FeedLine, FeedType, Mutation, Snapshot } from '@/lib/types';
import { familyId, getPool } from './db';
import { AppError, date, entrySchema, feedTotal, money, mutationSchema, name, positiveInt, roundMoney, uuid, version } from './domain';

const batchInput = z.object({ farmId: uuid, name, startDate: date, pigCount: positiveInt, pigCost: money });
const identity = z.object({ id: uuid, version });
const conflict = () => new AppError('Bản ghi đã được thay đổi trên máy khác. Vui lòng tải lại trước khi sửa.', 409, 'CONFLICT');

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

async function requireRow(client: PoolClient, table: 'farms' | 'batches' | 'entries', id: string, family: string, expectedVersion?: number) {
  const result = await client.query(`SELECT * FROM ${table} WHERE id=$1 AND family_id=$2 FOR UPDATE`, [id, family]);
  if (!result.rowCount) throw new AppError('Không tìm thấy bản ghi. Vui lòng tải lại.', 404, 'NOT_FOUND');
  if (expectedVersion !== undefined && result.rows[0].version !== expectedVersion) throw conflict();
  return result.rows[0];
}

export async function readSnapshot(): Promise<Snapshot> {
  const client = await getPool().connect();
  const family = familyId();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    // A single consistent snapshot prevents mismatched parent/detail records during concurrent writes.
    const farms = await client.query<Farm>('SELECT id,name,version FROM farms WHERE family_id=$1 ORDER BY name,id', [family]);
    const batches = await client.query<Batch>(`SELECT id,farm_id AS "farmId",name,start_date::text AS "startDate",end_date::text AS "endDate",pig_count AS "pigCount",pig_cost::text AS "pigCost",version FROM batches WHERE family_id=$1 ORDER BY start_date DESC,id`, [family]);
    const feedTypes = await client.query<FeedType>(`SELECT f.id,f.name,COALESCE(last.price::text,'0') AS "lastPrice",COALESCE(last.discount::text,'0') AS "lastDiscount"
      FROM feed_types f LEFT JOIN LATERAL (
        SELECT l.price,l.discount FROM feed_lines l JOIN entries e ON e.id=l.entry_id AND e.family_id=l.family_id
        WHERE l.feed_type_id=f.id AND l.family_id=f.family_id ORDER BY e.date DESC,e.created_at DESC,e.id DESC,l.position DESC LIMIT 1
      ) last ON true WHERE f.family_id=$1 ORDER BY f.name,f.id`, [family]);
    const entries = await client.query<Entry>(`SELECT id,batch_id AS "batchId",kind,date::text,month,description,amount::text,version,pig_count AS "pigCount",kg::text,price::text FROM entries WHERE family_id=$1 ORDER BY date DESC,created_at DESC,id`, [family]);
    const lines = await client.query<FeedLine & { entryId: string }>(`SELECT entry_id AS "entryId",feed_type_id AS "feedTypeId",name,bags,price::text,discount::text FROM feed_lines WHERE family_id=$1 ORDER BY entry_id,position`, [family]);
    const byEntry = new Map<string, FeedLine[]>();
    for (const { entryId, ...line } of lines.rows) {
      const existing = byEntry.get(entryId) ?? [];
      existing.push(line);
      byEntry.set(entryId, existing);
    }
    for (const entry of entries.rows) if (entry.kind === 'feed') entry.lines = byEntry.get(entry.id) ?? [];
    await client.query('COMMIT');
    return { farms: farms.rows, batches: batches.rows, feedTypes: feedTypes.rows, entries: entries.rows };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function mutate(input: unknown): Promise<void> {
  const mutation = mutationSchema.parse(input);
  const family = familyId();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    // Serialize writes within the default household, including deletes, unique labor months and retries.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`manage-pig:${family}`]);
    const hash = createHash('sha256').update(canonical({ action: mutation.action, data: mutation.data })).digest('hex');
    const previous = await client.query('SELECT payload_hash FROM mutation_requests WHERE family_id=$1 AND request_id=$2', [family, mutation.requestId]);
    if (previous.rowCount) {
      if (previous.rows[0].payload_hash !== hash) throw new AppError('Mã lần lưu đã được dùng với nội dung khác. Vui lòng mở lại biểu mẫu.', 409, 'IDEMPOTENCY_CONFLICT');
      await client.query('COMMIT');
      return;
    }
    await applyMutation(client, family, mutation);
    await client.query('INSERT INTO mutation_requests(family_id,request_id,payload_hash) VALUES($1,$2,$3)', [family, mutation.requestId, hash]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (typeof error === 'object' && error !== null && 'code' in error) {
      if (error.code === '23505') {
        const constraint = 'constraint' in error ? String(error.constraint) : '';
        if (constraint === 'batches_one_active_per_farm') throw new AppError('Trại đã có một đợt đang nuôi.', 409, 'ACTIVE_BATCH');
        if (constraint === 'entries_one_labor_per_month') throw new AppError('Tháng này đã có tiền công. Vui lòng mở khoản cũ để sửa.', 409, 'LABOR_EXISTS');
        if (constraint === 'feed_types_unique_name') throw new AppError('Loại cám này đã có trong danh mục.', 409, 'FEED_EXISTS');
        throw new AppError('Bản ghi đã tồn tại. Vui lòng tải lại.', 409, 'CONFLICT');
      }
      if (error.code === '23503') throw new AppError('Bản ghi đang có dữ liệu liên quan, không thể xóa.', 409, 'HAS_TRANSACTIONS');
    }
    throw error;
  } finally { client.release(); }
}

async function applyMutation(client: PoolClient, family: string, mutation: Mutation): Promise<void> {
  const { action, data } = mutation;
  switch (action) {
    case 'createFarm': {
      const values = z.object({ name }).parse(data);
      await client.query('INSERT INTO farms(id,family_id,name) VALUES($1,$2,$3)', [randomUUID(), family, values.name]);
      break;
    }
    case 'deleteFarm': {
      const values = identity.parse(data);
      await requireRow(client, 'farms', values.id, family, values.version);
      const entries = await client.query('SELECT 1 FROM entries e JOIN batches b ON e.batch_id=b.id AND e.family_id=b.family_id WHERE b.farm_id=$1 AND b.family_id=$2 LIMIT 1', [values.id, family]);
      if (entries.rowCount) throw new AppError('Không thể xóa trại đã có giao dịch.', 409, 'HAS_TRANSACTIONS');
      await client.query('DELETE FROM batches WHERE farm_id=$1 AND family_id=$2', [values.id, family]);
      await client.query('DELETE FROM farms WHERE id=$1 AND family_id=$2', [values.id, family]);
      break;
    }
    case 'createBatch': {
      const values = batchInput.parse(data);
      await requireRow(client, 'farms', values.farmId, family);
      await client.query('INSERT INTO batches(id,family_id,farm_id,name,start_date,pig_count,pig_cost) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), family, values.farmId, values.name, values.startDate, values.pigCount, roundMoney(values.pigCost)]);
      break;
    }
    case 'updateBatch': {
      const values = batchInput.omit({ farmId: true }).extend({ id: uuid, version }).parse(data);
      const current = await requireRow(client, 'batches', values.id, family, values.version);
      if (current.end_date && values.startDate > sqlDate(current.end_date)) throw new AppError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
      await client.query('UPDATE batches SET name=$1,start_date=$2,pig_count=$3,pig_cost=$4,version=version+1 WHERE id=$5 AND family_id=$6', [values.name, values.startDate, values.pigCount, roundMoney(values.pigCost), values.id, family]);
      break;
    }
    case 'endBatch': {
      const values = identity.extend({ endDate: date }).parse(data);
      const current = await requireRow(client, 'batches', values.id, family, values.version);
      if (current.end_date) throw new AppError('Đợt nuôi đã kết thúc. Vui lòng tải lại.', 409, 'CONFLICT');
      if (values.endDate < sqlDate(current.start_date)) throw new AppError('Ngày kết thúc phải từ ngày bắt đầu trở đi.');
      await client.query('UPDATE batches SET end_date=$1,version=version+1 WHERE id=$2 AND family_id=$3', [values.endDate, values.id, family]);
      break;
    }
    case 'deleteBatch': {
      const values = identity.parse(data);
      await requireRow(client, 'batches', values.id, family, values.version);
      const entries = await client.query('SELECT 1 FROM entries WHERE batch_id=$1 AND family_id=$2 LIMIT 1', [values.id, family]);
      if (entries.rowCount) throw new AppError('Không thể xóa đợt đã có giao dịch.', 409, 'HAS_TRANSACTIONS');
      await client.query('DELETE FROM batches WHERE id=$1 AND family_id=$2', [values.id, family]);
      break;
    }
    case 'createFeedType': {
      const values = z.object({ name }).parse(data);
      await client.query('INSERT INTO feed_types(id,family_id,name) VALUES($1,$2,$3)', [randomUUID(), family, values.name]);
      break;
    }
    case 'saveEntry': {
      const values = entrySchema.parse(data);
      await requireRow(client, 'batches', values.batchId, family);
      if (values.id) {
        if (values.version === undefined) throw conflict();
        const current = await requireRow(client, 'entries', values.id, family, values.version);
        if (current.batch_id !== values.batchId || current.kind !== values.kind) throw new AppError('Không được chuyển giao dịch sang đợt hoặc nhóm khác.');
      }
      const id = values.id ?? randomUUID();
      const entryDate = values.kind === 'labor' ? `${values.month}-01` : values.date;
      const amount = values.kind === 'feed' ? feedTotal(values.lines) : values.kind === 'sale' ? roundMoney(new Decimal(values.kg).times(values.price)) : roundMoney(values.amount);
      const params = [id, family, values.batchId, values.kind, entryDate, values.kind === 'labor' ? values.month : null, values.description, amount, values.kind === 'sale' ? values.pigCount : null, values.kind === 'sale' ? values.kg : null, values.kind === 'sale' ? values.price : null];
      if (values.id) {
        await client.query('UPDATE entries SET date=$5,month=$6,description=$7,amount=$8,pig_count=$9,kg=$10,price=$11,version=version+1 WHERE id=$1 AND family_id=$2 AND batch_id=$3 AND kind=$4', params);
        await client.query('DELETE FROM feed_lines WHERE entry_id=$1 AND family_id=$2', [id, family]);
      } else {
        await client.query('INSERT INTO entries(id,family_id,batch_id,kind,date,month,description,amount,pig_count,kg,price) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', params);
      }
      if (values.kind === 'feed') {
        for (const [position, line] of values.lines.entries()) {
          const type = await client.query('SELECT name FROM feed_types WHERE id=$1 AND family_id=$2', [line.feedTypeId, family]);
          if (!type.rowCount) throw new AppError('Loại cám không tồn tại. Vui lòng tải lại danh mục.', 404, 'NOT_FOUND');
          await client.query('INSERT INTO feed_lines(id,family_id,entry_id,feed_type_id,position,name,bags,price,discount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [randomUUID(), family, id, line.feedTypeId, position, type.rows[0].name, line.bags, line.price, line.discount]);
        }
      }
      break;
    }
    case 'deleteEntry': {
      const values = identity.parse(data);
      await requireRow(client, 'entries', values.id, family, values.version);
      await client.query('DELETE FROM entries WHERE id=$1 AND family_id=$2', [values.id, family]);
      break;
    }
  }
}

function sqlDate(value: Date | string): string {
  // pg DATE values are local dates; use local components rather than shifting by server timezone.
  if (typeof value === 'string') return value.slice(0, 10);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
