import { expect, test, type Locator } from '@playwright/test';
import type { Entry, Snapshot } from '../src/lib/types';

function reportSnapshot(): Snapshot {
  const entry = (id: string, batchId: string, kind: Entry['kind'], amount: string): Entry => ({
    id, batchId, kind, amount, date: '2026-02-01', description: id === 'other-a' ? 'Thuốc đợt tháng sáu' : id, version: 1,
  });
  return {
    farms: [{ id: 'farm-a', name: 'Trại Đông', version: 1 }, { id: 'farm-b', name: 'Trại Tây', version: 1 }],
    batches: [
      { id: 'batch-b', farmId: 'farm-b', name: 'Đợt tháng ba', startDate: '2026-01-01', endDate: '2026-03-31', pigCount: 10, pigCost: '1000000', version: 1 },
      { id: 'batch-a', farmId: 'farm-a', name: 'Đợt tháng sáu', startDate: '2026-01-01', endDate: '2026-06-30', pigCount: 10, pigCost: '2000000', version: 1 },
      { id: 'batch-active', farmId: 'farm-a', name: 'Đợt chưa kết thúc', startDate: '2026-07-01', endDate: null, pigCount: 10, pigCost: '90000000', version: 1 },
    ],
    feedTypes: [],
    entries: [
      entry('sale-a', 'batch-a', 'sale', '10000000'), entry('feed-a', 'batch-a', 'feed', '2800000'),
      entry('labor-a', 'batch-a', 'labor', '1000000'), entry('other-a', 'batch-a', 'other', '200000'),
      entry('sale-b', 'batch-b', 'sale', '8000000'), entry('feed-b', 'batch-b', 'feed', '2000000'),
      entry('labor-b', 'batch-b', 'labor', '500000'), entry('other-b', 'batch-b', 'other', '100000'),
    ],
  };
}

async function expectMoney(row: Locator, amounts: string[]) {
  for (const amount of amounts) {
    const escaped = amount.replaceAll('.', '\\.');
    await expect(row.getByText(new RegExp(`^${escaped}\\s*₫$`))).toBeVisible();
  }
}

test('báo cáo chỉ lấy đợt kết thúc, lọc và cộng đủ từng nhóm chi phí', async ({ page }) => {
  const state = reportSnapshot();
  await page.route('**/api/data', route => route.fulfill({ json: state }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Bảng tổng hợp', exact: true }).click();
  const table = page.getByRole('table');
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Đợt tháng sáu');
  await expect(rows.nth(1)).toContainText('Đợt tháng ba');
  await expect(table).not.toContainText('Đợt chưa kết thúc');
  await expectMoney(rows.nth(0), ['10.000.000', '2.000.000', '2.800.000', '1.000.000', '200.000', '6.000.000', '4.000.000']);
  const total = table.getByRole('row').filter({ hasText: 'Tổng cộng' });
  await expectMoney(total, ['18.000.000', '3.000.000', '4.800.000', '1.500.000', '300.000', '9.600.000', '8.400.000']);

  await page.getByRole('combobox').selectOption('farm-b');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Đợt tháng ba');
  await expectMoney(total, ['8.000.000', '1.000.000', '2.000.000', '500.000', '100.000', '3.600.000', '4.400.000']);

  await page.getByRole('combobox').selectOption('');
  const dates = page.locator('input[type="date"]');
  await dates.nth(0).fill('2026-04-01');
  await dates.nth(1).fill('2026-06-30');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Đợt tháng sáu');
  await expectMoney(total, ['10.000.000', '6.000.000', '4.000.000']);
});

test('sửa chi phí đợt đã kết thúc cập nhật lời lỗ và dòng tổng báo cáo', async ({ page }) => {
  const state = reportSnapshot();
  await page.route('**/api/data', route => route.fulfill({ json: state }));
  await page.route('**/api/mutate', async route => {
    const { action, data } = route.request().postDataJSON();
    expect(action).toBe('saveEntry');
    expect(data.id).toBe('other-a');
    expect(data.version).toBe(1);
    expect(data.amount).toBe('700000');
    const expense = state.entries.find(entry => entry.id === data.id)!;
    expense.amount = data.amount;
    expense.version++;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Bảng tổng hợp', exact: true }).click();
  await page.getByRole('table').getByRole('button', { name: 'Đợt tháng sáu', exact: true }).click();
  const expense = page.getByRole('article').filter({ hasText: 'Thuốc đợt tháng sáu' });
  await expense.getByRole('button', { name: 'Sửa', exact: true }).click();
  await page.getByLabel('Số tiền (đồng)', { exact: true }).fill('700000');
  await page.getByRole('button', { name: 'Lưu vào sổ', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Bảng tổng hợp', exact: true }).click();
  const table = page.getByRole('table');
  await expectMoney(table.locator('tbody tr').filter({ hasText: 'Đợt tháng sáu' }), ['700.000', '6.500.000', '3.500.000']);
  await expectMoney(table.getByRole('row').filter({ hasText: 'Tổng cộng' }), ['800.000', '10.100.000', '7.900.000']);
});
