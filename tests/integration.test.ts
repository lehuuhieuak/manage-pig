import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Entry, Mutation, Snapshot } from '../src/lib/types';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const suffix = randomUUID().slice(0, 8);
const date = '2026-01-15';
async function snapshot(): Promise<Snapshot> {
  const response = await fetch(`${base}/api/data`);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
async function mutate(action: Mutation['action'], data: Mutation['data'], expected = 200, requestId = randomUUID()) {
  const response = await fetch(`${base}/api/mutate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, action, data }),
  });
  const body = await response.json();
  assert.equal(response.status, expected, JSON.stringify(body));
  if (expected === 200) assert.equal(body.ok, true);
  return body;
}
function entryData(entry: Entry): Record<string, unknown> {
  return { ...entry };
}

test('PostgreSQL + HTTP: nghiệp vụ, chống trùng và sửa đồng thời', async (t) => {
  let state = await snapshot();
  await mutate('createFarm', { name: `Trại kiểm thử ${suffix}` });
  state = await snapshot();
  const farm = state.farms.find((item) => item.name === `Trại kiểm thử ${suffix}`)!;
  assert.ok(farm);
  await mutate('createBatch', { farmId: farm.id, name: `Đợt ${suffix}`, startDate: '2026-01-01', pigCount: 20, pigCost: '20000000' });
  state = await snapshot();
  let batch = state.batches.find((item) => item.farmId === farm.id)!;
  assert.ok(batch);
  const batchId = batch.id;
  await mutate('createFeedType', { name: `Cám A ${suffix}` });
  await mutate('createFeedType', { name: `Cám B ${suffix}` });
  state = await snapshot();
  const feedA = state.feedTypes.find((item) => item.name === `Cám A ${suffix}`)!;
  const feedB = state.feedTypes.find((item) => item.name === `Cám B ${suffix}`)!;
  const feedData = {
    batchId, kind: 'feed', date, description: 'Đơn nhiều dòng',
    lines: [
      { feedTypeId: feedA.id, name: feedA.name, bags: 10, price: '300000', discount: '20000' },
      { feedTypeId: feedB.id, name: feedB.name, bags: 2, price: '250000', discount: '0' },
    ],
  };

  await t.test('một đợt đang nuôi và không nhận trại ngoài phạm vi', async () => {
    await mutate('createBatch', { farmId: farm.id, name: 'Đợt trùng', startDate: date, pigCount: 1, pigCost: '1' }, 409);
    const response = await fetch(`${base}/api/mutate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: randomUUID(), action: 'createBatch', data: { farmId: randomUUID(), name: 'Trại không tồn tại', startDate: date, pigCount: 1, pigCost: '1' } }) });
    assert.ok(response.status >= 400 && response.status < 500);
  });

  await t.test('nhiều dòng cám, giảm giá theo bao và bấm lưu lặp đồng thời', async () => {
    const requestId = randomUUID();
    await Promise.all([mutate('saveEntry', feedData, 200, requestId), mutate('saveEntry', feedData, 200, requestId)]);
    state = await snapshot();
    const feeds = state.entries.filter((item) => item.batchId === batchId && item.kind === 'feed');
    assert.equal(feeds.length, 1);
    assert.equal(feeds[0].amount, '3300000');
    assert.equal(Number(feeds[0].lines![0].bags) * (Number(feeds[0].lines![0].price) - Number(feeds[0].lines![0].discount)), 2800000);
    assert.equal(feeds[0].lines!.length, 2);
  });

  await t.test('giá lần mới không đổi đơn cũ; giá gợi ý theo ngày mua mới nhất', async () => {
    await mutate('saveEntry', { ...feedData, date: '2026-02-01', lines: [{ feedTypeId: feedA.id, name: feedA.name, bags: 1, price: '350000', discount: '10000' }] });
    // Ghi bổ sung một đơn cũ sau đơn mới: gợi ý vẫn lấy giá ngày mới nhất.
    await mutate('saveEntry', { ...feedData, date: '2026-01-05', lines: [{ feedTypeId: feedA.id, name: feedA.name, bags: 1, price: '200000', discount: '0' }] });
    state = await snapshot();
    const original = state.entries.find((item) => item.batchId === batchId && item.description === 'Đơn nhiều dòng' && item.date === date)!;
    assert.equal(original.amount, '3300000');
    assert.equal(Number(original.lines![0].price), 300000);
    assert.equal(Number(state.feedTypes.find((item) => item.id === feedA.id)!.lastPrice), 350000);
    assert.equal(Number(state.feedTypes.find((item) => item.id === feedA.id)!.lastDiscount), 10000);
  });

  await t.test('bán nhiều lần, kg thập phân và làm tròn đến đồng', async () => {
    await mutate('saveEntry', { batchId, kind: 'sale', date, description: 'Bán lần 1', pigCount: 10, kg: '1000.125', price: '60000' });
    await mutate('saveEntry', { batchId, kind: 'sale', date, description: 'Bán lần 2', pigCount: 10, kg: '999.999', price: '60001' });
    state = await snapshot();
    const sales = state.entries.filter((item) => item.batchId === batchId && item.kind === 'sale');
    assert.equal(sales.length, 2);
    assert.equal(sales.find((item) => item.description === 'Bán lần 1')!.amount, '60007500');
    assert.equal(sales.find((item) => item.description === 'Bán lần 2')!.amount, '60000940');
  });

  await t.test('tiền công theo tháng, chi phí và kiểm tra số liệu báo cáo', async () => {
    await mutate('saveEntry', { batchId, kind: 'labor', date, month: '2026-01', description: 'Công tháng 1', amount: '3000000' });
    await mutate('saveEntry', { batchId, kind: 'labor', date: '2026-02-01', month: '2026-02', description: 'Công tháng 2', amount: '3500000' });
    await mutate('saveEntry', { batchId, kind: 'labor', date, month: '2026-01', description: 'Không tạo trùng tháng', amount: '1' }, 409);
    await mutate('saveEntry', { batchId, kind: 'other', date, description: 'Thuốc', amount: '500000' });
    await mutate('saveEntry', { batchId, kind: 'other', date, description: 'Điện', amount: '1000000' });
    state = await snapshot();
    const entries = state.entries.filter((item) => item.batchId === batchId);
    const sum = (kind: Entry['kind']) => entries.filter((item) => item.kind === kind).reduce((total, item) => total + BigInt(item.amount), 0n);
    assert.equal(sum('feed'), 3840000n);
    assert.equal(sum('sale'), 120008440n);
    assert.equal(sum('labor'), 6500000n);
    assert.equal(sum('other'), 1500000n);
    assert.equal(sum('sale') - BigInt(batch.pigCost) - sum('feed') - sum('labor') - sum('other'), 88168440n);
  });

  await t.test('sửa bản cũ bị chặn, kết thúc đợt vẫn được sửa khoản chi', async () => {
    const expense = state.entries.find((item) => item.batchId === batchId && item.description === 'Thuốc')!;
    await mutate('saveEntry', { ...entryData(expense), amount: '600000' });
    await mutate('saveEntry', { ...entryData(expense), amount: '700000' }, 409);
    state = await snapshot();
    batch = state.batches.find((item) => item.id === batchId)!;
    await mutate('endBatch', { id: batchId, version: batch.version, endDate: '2026-03-01' });
    state = await snapshot();
    assert.equal(state.batches.find((item) => item.id === batchId)!.endDate, '2026-03-01');
    const currentExpense = state.entries.find((item) => item.id === expense.id)!;
    await mutate('saveEntry', { ...entryData(currentExpense), amount: '750000' });
    state = await snapshot();
    assert.equal(state.entries.find((item) => item.id === expense.id)!.amount, '750000');
    assert.equal(state.entries.find((item) => item.id === expense.id)!.version, expense.version + 2);
  });

  await t.test('không xóa trại/đợt đã phát sinh khoản ghi nhận', async () => {
    state = await snapshot();
    batch = state.batches.find((item) => item.id === batchId)!;
    const currentFarm = state.farms.find((item) => item.id === farm.id)!;
    await mutate('deleteBatch', { id: batchId, version: batch.version }, 409);
    await mutate('deleteFarm', { id: farm.id, version: currentFarm.version }, 409);
  });

  await t.test('kiểm tra đầu vào và không lưu nửa đơn', async () => {
    const count = (await snapshot()).entries.filter((item) => item.batchId === batchId).length;
    for (const invalidLine of [
      { bags: 0, price: '300000', discount: '0' },
      { bags: 1.5, price: '300000', discount: '0' },
      { bags: 1, price: '300000', discount: '300001' },
    ]) {
      await mutate('saveEntry', { ...feedData, lines: [feedData.lines[0], { feedTypeId: feedB.id, name: feedB.name, ...invalidLine }] }, 400);
    }
    assert.equal((await snapshot()).entries.filter((item) => item.batchId === batchId).length, count);
  });
});
