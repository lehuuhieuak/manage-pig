import Decimal, { type DecimalValue } from './decimal';
import type { Batch, Entry } from './types';

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
export const money = (value: DecimalValue) => currency.format(BigInt(new Decimal(value || 0).toFixed(0)));
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const dateLabel = (value: string) => value ? value.split('-').reverse().join('/') : '—';
export const kindLabel = { feed: 'Nhập cám', sale: 'Bán heo', labor: 'Tiền công', other: 'Chi phí khác' };
export function batchTotals(batch: Batch, entries: Entry[]) {
  const sum = (kind: Entry['kind']) => entries.filter(e => e.batchId === batch.id && e.kind === kind).reduce((n, e) => n.plus(e.amount), new Decimal(0));
  const sale = sum('sale'), feed = sum('feed'), labor = sum('labor'), other = sum('other'), pig = new Decimal(batch.pigCost);
  const expense = pig.plus(feed).plus(labor).plus(other);
  return { sale, pig, feed, labor, other, expense, profit: sale.minus(expense) };
}
