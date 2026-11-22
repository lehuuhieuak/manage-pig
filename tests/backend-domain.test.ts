import assert from 'node:assert/strict';
import test from 'node:test';
import Decimal from '../src/lib/decimal';
import { date, entrySchema, feedTotal, roundMoney } from '../src/server/domain';

test('feed discount is per bag and all lines are added before VND rounding', () => {
  assert.equal(feedTotal([{ bags: 10, price: '300000', discount: '20000' }]), '2800000');
  assert.equal(feedTotal([{ bags: 10, price: '300000', discount: '20000' }, { bags: 3, price: '100000.5', discount: '0' }]), '3100002');
  assert.equal(roundMoney('1.5'), '2');
});

test('invalid feed discounts and fractional bag counts are rejected', () => {
  const input = { kind: 'feed', batchId: '00000000-0000-4000-8000-000000000001', date: '2026-10-28', lines: [{ feedTypeId: '00000000-0000-4000-8000-000000000002', bags: 10, price: '100', discount: '101' }] };
  assert.equal(entrySchema.safeParse(input).success, false);
  input.lines[0].discount = '0';
  input.lines[0].bags = 1.5;
  assert.equal(entrySchema.safeParse(input).success, false);
});

test('invalid calendar dates are rejected', () => {
  assert.equal(date.safeParse('2026-02-29').success, false);
  assert.equal(date.safeParse('2024-02-29').success, true);
  assert.equal(date.safeParse('2026-13-01').success, false);
});

test('large valid decimal products round once without losing one đồng', () => {
  assert.equal(roundMoney(new Decimal('99999999999.999999').times('1500001')), '150000099999999998');
});

test('decimal kg sales and labor month rules validate', () => {
  const common = { batchId: '00000000-0000-4000-8000-000000000001' };
  assert.equal(entrySchema.safeParse({ ...common, kind: 'sale', date: '2026-10-28', pigCount: 2, kg: '212.75', price: '60000' }).success, true);
  assert.equal(entrySchema.safeParse({ ...common, kind: 'labor', month: '2026-13', amount: '5000000' }).success, false);
  assert.equal(entrySchema.safeParse({ ...common, kind: 'other', date: '2026-10-28', description: '', amount: '1' }).success, false);
});
