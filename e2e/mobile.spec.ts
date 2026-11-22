import { expect, test } from '@playwright/test';
import type { Snapshot } from '../src/lib/types';

function emptySnapshot(): Snapshot {
  return { farms: [], batches: [], entries: [], feedTypes: [] };
}

test('màn hình điện thoại, thêm trại và mở sổ trại', async ({ page }) => {
  const state = emptySnapshot();
  await page.route('**/api/data', route => route.fulfill({ json: state }));
  await page.route('**/api/mutate', async route => {
    const body = route.request().postDataJSON();
    expect(body.action).toBe('createFarm');
    state.farms.push({ id: 'farm-mobile', name: body.data.name, version: 1 });
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Các trại của gia đình' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bắt đầu từ trại đầu tiên' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: /Thêm trại$/ }).click();
  await page.getByRole('textbox').first().fill('Trại sau nhà');
  await page.getByRole('button', { name: /^Lưu/ }).click();
  await expect(page.getByRole('heading', { name: 'Trại sau nhà' })).toBeVisible();
  await page.getByRole('button', { name: /Trại sau nhà/ }).click();
  await expect(page.getByRole('heading', { name: 'Trại chưa có đợt đang nuôi' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Tạo đợt nuôi/ })).toBeVisible();
});

test('mất mạng giữ nội dung và thử lưu lại cùng mã chống trùng', async ({ page }) => {
  const state = emptySnapshot();
  const requestIds: string[] = [];
  await page.route('**/api/data', route => route.fulfill({ json: state }));
  await page.route('**/api/mutate', async route => {
    const body = route.request().postDataJSON();
    requestIds.push(body.requestId);
    if (requestIds.length === 1) return route.abort('failed');
    state.farms.push({ id: 'farm-retry', name: body.data.name, version: 1 });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Thêm trại$/ }).click();
  await page.getByRole('textbox').first().fill('Trại không mất nội dung');
  await page.getByRole('button', { name: /^Lưu/ }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Chưa xác nhận được đã lưu');
  await expect(page.getByRole('textbox').first()).toHaveValue('Trại không mất nội dung');
  await expect(page.getByRole('textbox').first()).toBeDisabled();
  await page.getByRole('button', { name: 'Thử xác nhận lưu lại' }).click();
  await expect(page.getByRole('heading', { name: 'Trại không mất nội dung' })).toBeVisible();
  expect(requestIds).toHaveLength(2);
  expect(requestIds[0]).toBe(requestIds[1]);
  expect(state.farms).toHaveLength(1);
});

test('máy chủ lỗi không hiển thị dữ liệu hoặc thành công giả', async ({ page }) => {
  await page.route('**/api/data', route => route.fulfill({ status: 503, json: { error: 'Chưa kết nối được cơ sở dữ liệu.' } }));
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Chưa kết nối được cơ sở dữ liệu');
  await expect(page.getByRole('heading', { name: 'Chưa mở được sổ' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tải lại dữ liệu' })).toBeVisible();
  await expect(page.getByText('Đã lưu thành công.')).toHaveCount(0);
});

test('manifest mở độc lập và biểu tượng PWA tải được', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.lang).toMatch(/^vi/);
  expect(manifest.start_url).toBe('/');
  expect(manifest.icons.length).toBeGreaterThan(0);
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok()).toBe(true);
  }
});
