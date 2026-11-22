import { expect, test } from '@playwright/test';

test('trình duyệt lưu trại qua API và PostgreSQL thật', async ({ page }) => {
  const name = `Trại trình duyệt ${crypto.randomUUID().slice(0, 8)}`;
  await page.goto('/');
  await page.getByRole('button', { name: /Thêm trại$/ }).click();
  await page.getByRole('textbox', { name: 'Tên trại' }).fill(name);
  const saved = page.waitForResponse(r => r.url().endsWith('/api/mutate') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Lưu vào sổ' }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name })).toBeVisible();
});

test('API nhận cùng nguồn và từ chối nguồn ngoài', async ({ request, baseURL }) => {
  for (const [origin, status] of [[new URL(baseURL!).origin, 200], ['https://other.example', 403]] as const) {
    const response = await request.post('/api/mutate', {
      headers: { Origin: origin },
      data: { requestId: crypto.randomUUID(), action: 'createFarm', data: { name: `Kiểm tra nguồn ${crypto.randomUUID()}` } },
    });
    expect(response.status()).toBe(status);
  }
});
