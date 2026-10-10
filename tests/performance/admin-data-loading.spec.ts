import { expect, test, type Page } from '@playwright/test';
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

const product = {
  id: 'latency-product', name: 'Latency Test Coffee', slug: 'latency-test-coffee', price: 1190, currency: 'TRY',
  material: 'Arabica', status: 'active', stock_status: 'in_stock', product_type: 'single',
  is_bundle: false, image_urls: [], product_variants: [], collection_ids: [], category_ids: [],
};
const catalog = { ok: true, products: [product], categories: [], collections: [] };
async function prime(page: Page, options: { slowCatalog?: boolean; empty?: boolean } = {}) {
  const calls: string[] = [];
  await page.addInitScript(() => {
    sessionStorage.setItem('rosta_panel_hub_entered_v1', '1');
    sessionStorage.setItem('ruth_admin_next_checked_until', String(Date.now() + 3600000));
    sessionStorage.setItem('ruth_admin_live_read_owner_v1', '1');
    sessionStorage.setItem('rosta_admin_auth_session_v1', JSON.stringify({
      access_token: 'eyJhbGciOiJub25lIn0.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6ImxhZC1hZG1pbiJ9.',
      refresh_token: 'fixture-only', expires_at: 4102444800, user: { id: 'load-admin', role: 'authenticated', email: 'load@example.test' },
    }));
  });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    calls.push(url.pathname + url.search);
    let body: unknown = { ok: true };
    if (url.pathname === '/api/me') body = { ok: true, user: { id: 'load-admin', role: 'admin' } };
    if (url.pathname === '/api/instant-data') body = { ok: true, found: false, entries: [] };
    if (url.pathname === '/api/products/list') body = { ...catalog, products: options.empty ? [] : catalog.products, pagination: { page: 1, pageSize: 25, total: options.empty ? 0 : 1, totalPages: 1, hasMore: false } };
    if (url.pathname === '/api/products') {
      if (options.slowCatalog && !url.searchParams.has('id')) await new Promise(resolve => setTimeout(resolve, 3500));
      body = catalog;
    }
    if (url.pathname === '/api/core-list-counts') body = { ok: true, counts: { products: 139 } };
    if (url.pathname.startsWith('/api/product-settings')) {
      await new Promise(resolve => setTimeout(resolve, 3500));
      body = { ok: true, groups: [], options: ['Arabica'] };
    }
    if (url.pathname === '/api/products/variant-media') body = { ok: true, variantImages: {} };
    if (url.pathname === '/api/products/discount-pricing') body = { ok: true, pricing: [] };
    if (url.pathname === '/api/notifications' || url.pathname === '/api/push') body = { ok: true, notifications: [], subscriptions: [] };
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); } catch { /* Page teardown can cancel delayed auxiliary fixtures. */ }
  });
  await page.route('**/auth/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'load-admin', role: 'authenticated' }) }));
  return calls;
}

test('@performance populated products paint before slow filter settings and skip unrelated counters', async ({ page }, testInfo) => {
  const calls = await prime(page);
  await page.goto('/products');
  await expect(page.getByText(product.name, { exact: true }).first()).toBeVisible({ timeout: 2500 });
  expect(calls.filter(path => path.startsWith('/api/core-list-counts'))).toHaveLength(0);
  await expectNoHorizontalOverflow(page);
  const screenshot = testInfo.outputPath('populated-products.png');
  await page.screenshot({ path: screenshot });
  await testInfo.attach('populated-products', { path: screenshot, contentType: 'image/png' });
});

for (const route of ['/products?productModal=1&id=latency-product', '/products/studio?id=latency-product']) {
  test(`@performance fresh editable detail opens without waiting for auxiliary catalogue: ${route}`, async ({ page }, testInfo) => {
    await prime(page, { slowCatalog: true });
    await page.goto(route);
    const input = page.locator('label').filter({ hasText: /^Ürün adı/ }).locator('..').getByRole('textbox');
    await expect(input).toHaveValue(product.name, { timeout: 2500 });
    await input.fill('Locally edited name');
    await page.waitForTimeout(3700);
    await expect(input).toHaveValue('Locally edited name');
    await expectNoHorizontalOverflow(page);
    const screenshot = testInfo.outputPath('editable-detail.png');
    await page.screenshot({ path: screenshot });
    await testInfo.attach('editable-detail', { path: screenshot, contentType: 'image/png' });
  });
}

test('@performance an unexpected empty catalog remains an error while the scoped count is positive', async ({ page }) => {
  const calls = await prime(page, { empty: true });
  await page.goto('/products');
  await expect(page.getByText('Ürünler doğrulanamadı', { exact: true })).toBeVisible();
  expect(calls.filter(path => path.startsWith('/api/core-list-counts'))).toEqual(['/api/core-list-counts?kind=products']);
  await expectNoHorizontalOverflow(page);
});
