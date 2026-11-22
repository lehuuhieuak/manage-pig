import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

test('PostgreSQL transactions, retry safety, concurrency, isolation and historical snapshots', { skip: process.env.RUN_DATABASE_TESTS !== '1' }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const family = randomUUID();
  const otherFamily = randomUUID();
  const previousFamily = process.env.DEFAULT_FAMILY_ID;
  process.env.DEFAULT_FAMILY_ID = family;
  await pool.query('INSERT INTO families(id,name) VALUES($1,$2),($3,$4)', [family, 'Kiểm thử', otherFamily, 'Gia đình khác']);
  const { mutate, readSnapshot } = await import('../src/server/service');
  const save = (action: string, data: Record<string, unknown>, requestId = randomUUID()) => mutate({ action, data, requestId });
  try {
    await save('createFarm', { name: 'Trại thử' });
    const farm = (await readSnapshot()).farms[0];
    await save('createBatch', { farmId: farm.id, name: 'Đợt 1', startDate: '2026-01-01', pigCount: 20, pigCost: '20000000' });
    let batch = (await readSnapshot()).batches[0];
    await assert.rejects(save('createBatch', { farmId: farm.id, name: 'Đợt trùng', startDate: '2026-02-01', pigCount: 1, pigCost: '1' }), /đang nuôi/);
    await save('createFeedType', { name: 'Cám 01' });
    const feed = (await readSnapshot()).feedTypes[0];
    const feedData = { kind: 'feed', batchId: batch.id, date: '2026-02-01', lines: [{ feedTypeId: feed.id, bags: 10, price: '300000', discount: '20000' }] };
    const retryId = randomUUID();
    await Promise.all([save('saveEntry', feedData, retryId), save('saveEntry', feedData, retryId)]);
    let snapshot = await readSnapshot();
    assert.equal(snapshot.entries.length, 1);
    assert.equal(snapshot.entries[0].amount, '2800000');
    assert.equal(snapshot.entries[0].lines?.[0].name, 'Cám 01');
    await assert.rejects(save('saveEntry', { ...feedData, date: '2026-02-02' }, retryId), /nội dung khác/);
    await save('saveEntry', { ...feedData, date: '2026-03-01', lines: [{ feedTypeId: feed.id, bags: 2, price: '400000', discount: '10000' }] });
    snapshot = await readSnapshot();
    assert.equal(snapshot.feedTypes[0].lastPrice, '400000.000000');
    assert.equal(snapshot.entries.find(entry => entry.date === '2026-02-01')?.amount, '2800000');
    assert.equal(snapshot.entries.find(entry => entry.date === '2026-02-01')?.lines?.[0].price, '300000.000000');
    await save('saveEntry', { ...feedData, date: '2026-01-20', lines: [{ feedTypeId: feed.id, bags: 1, price: '500000', discount: '0' }] });
    assert.equal((await readSnapshot()).feedTypes[0].lastPrice, '400000.000000');

    // Atomic rollback: a missing second feed type must not leave the order or first line behind.
    const before = (await readSnapshot()).entries.length;
    await assert.rejects(save('saveEntry', { ...feedData, lines: [...feedData.lines, { ...feedData.lines[0], feedTypeId: randomUUID() }] }), /không tồn tại/);
    assert.equal((await readSnapshot()).entries.length, before);

    const laborResults = await Promise.allSettled([
      save('saveEntry', { kind: 'labor', batchId: batch.id, month: '2026-02', amount: '5000000' }),
      save('saveEntry', { kind: 'labor', batchId: batch.id, month: '2026-02', amount: '6000000' }),
    ]);
    assert.equal(laborResults.filter(result => result.status === 'fulfilled').length, 1);
    await save('saveEntry', { kind: 'labor', batchId: batch.id, month: '2026-03', amount: '5000000' });
    await save('saveEntry', { kind: 'sale', batchId: batch.id, date: '2026-04-01', pigCount: 10, kg: '1000.5', price: '60000' });
    await save('saveEntry', { kind: 'sale', batchId: batch.id, date: '2026-04-02', pigCount: 10, kg: '999.5', price: '60000' });
    await save('saveEntry', { kind: 'other', batchId: batch.id, date: '2026-04-03', description: 'Thuốc', amount: '500000' });
    await save('endBatch', { id: batch.id, version: batch.version, endDate: '2026-04-05' });
    await assert.rejects(save('updateBatch', { ...batch, name: 'Máy khác' }), /máy khác/);
    snapshot = await readSnapshot();
    batch = snapshot.batches[0];
    const other = snapshot.entries.find(entry => entry.kind === 'other')!;
    await save('saveEntry', { ...other, amount: '750000' });
    await assert.rejects(save('saveEntry', { ...other, amount: '800000' }), /máy khác/);
    await save('saveEntry', { kind: 'other', batchId: batch.id, date: '2026-04-06', description: 'Bổ sung sau kết thúc', amount: '250000' });
    snapshot = await readSnapshot();
    assert.equal(snapshot.entries.filter(entry => entry.kind === 'sale').reduce((total, entry) => total + Number(entry.amount), 0), 120000000);
    assert.equal(snapshot.entries.filter(entry => entry.kind === 'other').reduce((total, entry) => total + Number(entry.amount), 0), 1000000);
    await assert.rejects(save('deleteBatch', { id: batch.id, version: batch.version }), /đã có giao dịch/);
    await assert.rejects(save('deleteFarm', { id: farm.id, version: farm.version }), /đã có giao dịch/);

    process.env.DEFAULT_FAMILY_ID = otherFamily;
    assert.deepEqual(await readSnapshot(), { farms: [], batches: [], entries: [], feedTypes: [] });
    await assert.rejects(save('saveEntry', { ...other, amount: '1' }), /Không tìm thấy/);
  } finally {
    process.env.DEFAULT_FAMILY_ID = previousFamily;
    await pool.query('DELETE FROM feed_lines WHERE family_id=ANY($1::uuid[])', [[family, otherFamily]]);
    await pool.query('DELETE FROM entries WHERE family_id=ANY($1::uuid[])', [[family, otherFamily]]);
    await pool.query('DELETE FROM batches WHERE family_id=ANY($1::uuid[])', [[family, otherFamily]]);
    await pool.query('DELETE FROM farms WHERE family_id=ANY($1::uuid[])', [[family, otherFamily]]);
    await pool.query('DELETE FROM feed_types WHERE family_id=ANY($1::uuid[])', [[family, otherFamily]]);
    await pool.query('DELETE FROM mutation_requests WHERE family_id=ANY($1::uuid[])', [[family, otherFamily]]);
    await pool.query('DELETE FROM families WHERE id=ANY($1::uuid[])', [[family, otherFamily]]);
    await pool.end();
    const { getPool } = await import('../src/server/db');
    await getPool().end();
  }
});
