import Decimal, { type DecimalValue } from '../lib/decimal';
import { z } from 'zod';

export class AppError extends Error {
  constructor(message: string, public status = 400, public code = 'VALIDATION') { super(message); }
}
export const uuid = z.string().uuid('Mã bản ghi không hợp lệ.');
export const name = z.string().trim().min(1, 'Vui lòng nhập tên.').max(120, 'Tên quá dài.');
export const positiveInt = z.coerce.number().int().positive().max(1000000);
export const version = z.coerce.number().int().positive();
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày không hợp lệ.').refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= '9999-12-31';
}, 'Ngày không hợp lệ.');
export const month = z.string().regex(/^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/, 'Tháng không hợp lệ.');
export const money = z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d{1,12}(\.\d{1,6})?$/, 'Số tiền không hợp lệ.'));
export const kg = money.refine(value => new Decimal(value).gt(0), 'Khối lượng phải lớn hơn 0.');

export const feedLine = z.object({
  feedTypeId: uuid,
  bags: positiveInt,
  price: money,
  discount: money.default('0'),
}).refine(line => new Decimal(line.discount).lte(line.price), 'Chiết khấu không được lớn hơn giá mỗi bao.');

export function roundMoney(value: DecimalValue): string {
  const rounded = new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  if (rounded.abs().gte('1000000000000000000')) throw new AppError('Tổng số tiền vượt giới hạn cho phép.');
  return rounded.toFixed(0);
}

export function feedTotal(lines: { bags: number; price: string; discount: string }[]): string {
  return roundMoney(lines.reduce((total, line) => total.plus(new Decimal(line.price).minus(line.discount).times(line.bags)), new Decimal(0)));
}

export const mutationSchema = z.object({
  requestId: uuid,
  action: z.enum(['createFarm', 'deleteFarm', 'createBatch', 'updateBatch', 'deleteBatch', 'endBatch', 'createFeedType', 'saveEntry', 'deleteEntry']),
  data: z.record(z.string(), z.unknown()),
});

export const entrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('feed'), batchId: uuid, date, description: z.string().trim().max(500).default(''), lines: z.array(feedLine).min(1).max(100), id: uuid.optional(), version: version.optional() }),
  z.object({ kind: z.literal('sale'), batchId: uuid, date, description: z.string().trim().max(500).default(''), pigCount: positiveInt, kg, price: money, id: uuid.optional(), version: version.optional() }),
  z.object({ kind: z.literal('labor'), batchId: uuid, month, date: date.optional(), description: z.string().trim().max(500).default(''), amount: money, id: uuid.optional(), version: version.optional() }),
  z.object({ kind: z.literal('other'), batchId: uuid, date, description: z.string().trim().min(1, 'Vui lòng nhập nội dung chi phí.').max(500), amount: money, id: uuid.optional(), version: version.optional() }),
]);
