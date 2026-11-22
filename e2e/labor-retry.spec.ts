import { expect, test, type Page } from '@playwright/test';
import type { Entry, Snapshot } from '../src/lib/types';

function fixture(entries: Entry[] = []): Snapshot {
  return {
    farms: [{ id: 'farm-labor', name: 'Trại hồi quy', version: 1 }],
    batches: [{ id: 'batch-labor', farmId: 'farm-labor', name: 'Đợt hồi quy', startDate: '2026-01-01', endDate: null, pigCount: 10, pigCost: '10000000', version: 1 }],
    feedTypes: [], entries,
  };
}
function labor(month = '2026-01', version = 1): Entry {
  return { id: 'labor-original', batchId: 'batch-labor', kind: 'labor', date: `${month}-01`, month, description: 'Công tháng đầu', amount: '3000000', version };
}
async function openBatch(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Trại hồi quy/ }).click();
  await page.getByRole('button', { name: /Đợt hồi quy/ }).click();
}

test('sửa tháng tiền công giữ nguyên khoản ghi nhận, không tạo khoản thứ hai', async ({ page }) => {
  const state = fixture([labor()]);
  await page.route('**/api/data', route => route.fulfill({ json: state }));
  await page.route('**/api/mutate', async route => {
    const body = route.request().postDataJSON();
    expect(body.action).toBe('saveEntry');
    expect(body.data.id).toBe('labor-original');
    expect(body.data.version).toBe(1);
    expect(body.data.month).toBe('2026-02');
    Object.assign(state.entries[0], body.data, { version: 2 });
    await route.fulfill({ json: { ok: true } });
  });
  await openBatch(page);
  await page.getByRole('article').filter({ hasText: 'Công tháng đầu' }).getByRole('button', { name: 'Sửa', exact: true }).click();
  await page.getByLabel('Tháng tính tiền công').fill('2026-02');
  await page.getByRole('button', { name: 'Lưu vào sổ', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(state.entries).toHaveLength(1);
  expect(state.entries[0].month).toBe('2026-02');
  await expect(page.getByRole('article').filter({ hasText: 'Công tháng đầu' })).toContainText('Tháng 02/2026');
});

test('thử lại sau lỗi mạng rồi lỗi đầu vào mở khóa biểu mẫu và giữ nội dung', async ({ page }) => {
  const state: Snapshot = { farms: [], batches: [], entries: [], feedTypes: [] };
  const ids: string[] = [];
  await page.route('**/api/data', route => route.fulfill({ json: state }));
  await page.route('**/api/mutate', async route => {
    const body = route.request().postDataJSON();
    ids.push(body.requestId);
    if (ids.length === 1) return route.abort('failed');
    if (ids.length === 2) return route.fulfill({ status: 400, json: { error: 'Tên không hợp lệ, vui lòng sửa lại.', code: 'VALIDATION' } });
    state.farms.push({ id: 'farm-corrected', name: body.data.name, version: 1 });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Thêm trại$/ }).click();
  const name = page.getByRole('textbox', { name: 'Tên trại' });
  await name.fill('Nội dung giữ lại');
  await page.getByRole('button', { name: 'Lưu vào sổ', exact: true }).click();
  await expect(name).toBeDisabled();
  await page.getByRole('button', { name: 'Thử xác nhận lưu lại', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Tên không hợp lệ');
  await expect(name).toBeEnabled();
  await expect(name).toHaveValue('Nội dung giữ lại');
  expect(ids[0]).toBe(ids[1]);
  await name.fill('Trại đã sửa');
  await page.getByRole('button', { name: 'Lưu vào sổ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trại đã sửa' })).toBeVisible();
  expect(ids[2]).not.toBe(ids[1]);
});

test('tiền công máy khác vừa ghi được tải lại đúng tháng và sửa bản hiện có', async ({ page }) => {
  const state = fixture();
  let attempts = 0;
  await page.route('**/api/data', route => route.fulfill({ json: state }));
  await page.route('**/api/mutate', async route => {
    const { action, data } = route.request().postDataJSON();
    expect(action).toBe('saveEntry');
    expect(data.month).toBe('2026-02');
    attempts++;
    if (attempts === 1) {
      expect(data.id).toBeUndefined();
      state.entries.push(labor('2026-02', 3));
      return route.fulfill({ status: 409, json: { error: 'Tháng này đã có tiền công.', code: 'LABOR_EXISTS' } });
    }
    expect(data.id).toBe('labor-original');
    expect(data.version).toBe(3);
    expect(data.amount).toBe('3500000');
    Object.assign(state.entries[0], data, { version: 4 });
    return route.fulfill({ json: { ok: true } });
  });
  await openBatch(page);
  await page.getByRole('button', { name: 'Tiền công', exact: true }).click();
  await page.getByLabel('Tháng tính tiền công').fill('2026-02');
  const amount = page.getByLabel('Tổng tiền công của đợt trong tháng (đồng)');
  await amount.fill('3500000');
  await page.getByRole('button', { name: 'Lưu vào sổ', exact: true }).click();
  await page.getByRole('button', { name: 'Tải bản mới để sửa', exact: true }).click();
  await expect(page.getByLabel('Tháng tính tiền công')).toHaveValue('2026-02');
  await expect(amount).toHaveValue('3000000');
  await amount.fill('3500000');
  await page.getByRole('button', { name: 'Lưu vào sổ', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(attempts).toBe(2);
  expect(state.entries).toHaveLength(1);
});
