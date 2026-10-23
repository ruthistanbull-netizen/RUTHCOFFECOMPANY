// Run against a local production build with a non-secret fixture public key.
// Every API request is intercepted; mutations never reach a real database.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const makeFixture = require('./fixtures/finance-workspace.cjs');
const AxeBuilder = process.env.FINANCE_TEST_AXE ? require(process.env.FINANCE_TEST_AXE).default : null;
const brand = process.env.FINANCE_TEST_BRAND || 'rosta';
const port = Number(process.env.FINANCE_TEST_PORT || 3126);
const output = process.env.FINANCE_TEST_OUTPUT || '/tmp/finance-workspace-' + brand;
const root = process.cwd();
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = spawn(process.execPath, [root + '/node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: root + '/apps/admin', stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '', browser;
  server.stdout.on('data', chunk => logs += chunk); server.stderr.on('data', chunk => logs += chunk);
  try {
    for (let n = 0; n < 100 && !logs.includes('Ready'); n++) {
      if (server.exitCode !== null) throw new Error(logs);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.match(logs, /Ready/);
    const launch = { headless: true };
    if (process.env.FINANCE_TEST_BROWSER_PATH) {
      launch.executablePath = process.env.FINANCE_TEST_BROWSER_PATH;
      launch.args = ['--no-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote', '--disable-gpu'];
    }
    for (const width of [390, 768, 1440]) {
      browser = await chromium.launch(launch);
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', hasTouch: width < 800 });
      await context.addInitScript(brand => {
        sessionStorage.setItem(brand + '_panel_hub_entered_v1', '1');
        sessionStorage.setItem('rr_hub_document_ready_v1', '1');
        sessionStorage.setItem(brand + '_admin_auth_session_v1', JSON.stringify({ access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJleHAiOjQwMDAwMDAwMDAsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.fixture', refresh_token: 'fixture', expires_at: 4000000000, user: { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.invalid', app_metadata: { panel_role: 'owner', panel_status: 'active' } } }));
      }, brand);
      const { setup, entries, report } = makeFixture(brand);
      const commands = [], reads = [];
      await context.route('**/api/**', async route => {
        const url = new URL(route.request().url()); reads.push(url);
        let data = { ok: true, items: [], orders: [], products: [], customers: [], carts: [], categories: [], collections: [], variants: [], returns: [], total: 0, count: 0 };
        if (url.pathname === '/api/me') data = { ok: true, user: { id: 'fixture', app_metadata: { panel_role: 'owner', panel_status: 'active' } }, profile: { role: 'admin', full_name: 'Tasarım önizleme' } };
        if (url.pathname === '/api/finance/setup') data = setup;
        if (url.pathname === '/api/finance/overview') data = { report };
        if (url.pathname === '/api/finance/payouts') data = { upcoming: [{ date: '2026-10-27', currency: 'TRY', net: 14500 }], unpaidTotal: 14500, checkedAt: '2026-10-23T12:00:00Z' };
        if (url.pathname === '/api/finance/records') data = { records: entries, count: entries.length };
        if (url.pathname === '/api/finance/payables') data = { rows: entries };
        if (url.pathname === '/api/finance/bank') data = { rows: [], payments: [] };
        if (url.pathname === '/api/finance/command') { commands.push(route.request().postDataJSON()); data = { result: {} }; }
        if (url.pathname === '/api/finance/export') return route.fulfill({ contentType: 'text/csv', headers: { 'content-disposition': 'attachment; filename=fixture.csv' }, body: 'sample,amount\nfixture,100\n' });
        return route.fulfill({ json: data });
      });
      // Fail closed for every request to an external service.
      await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const go = path => page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'domcontentloaded' });
      const accessibility = async label => {
        if (!AxeBuilder) return;
        const scan = await new AxeBuilder({ page }).include('.finance-workspace').withTags(['wcag2a', 'wcag2aa']).analyze();
        fs.writeFileSync(`${output}/accessibility-${label}-${width}.json`, JSON.stringify(scan.violations, null, 2));
        assert.deepEqual(scan.violations.filter(item => ['serious', 'critical'].includes(item.impact)).map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), [], label);
      };
      const noOverflow = async label => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + ' overflow at ' + width);
      await go('/finance');
      await page.getByRole('heading', { name: 'Finansal genel bakış', exact: true }).waitFor();
      await page.getByText('Net satış geliri', { exact: true }).first().waitFor();
      await noOverflow('overview');
      const monthRequest = page.waitForRequest(request => request.url().includes('/api/finance/overview?') && new URL(request.url()).searchParams.get('from')?.endsWith('-01'));
      await page.locator('.finance-period select').first().selectOption('month');
      await monthRequest;
      assert.equal(await page.locator('.finance-period select').first().inputValue(), 'month');
      if (width >= 768) {
        assert.ok(await page.locator('.finance-columns .ruth-data-table-wrap').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth + 1)), 'summary tables must fit their containers');
      }
      await accessibility('overview');
      await page.screenshot({ path: `${output}/overview-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: /Toplam giderler \(TL\)/ }).click();
      await page.getByRole('heading', { name: 'Toplam giderler · TL karşılıkları' }).waitFor();
      assert.match(await page.locator('#finance-expense-details').innerText(), /50.*USD|\$50/);
      await page.getByRole('button', { name: 'Ayrıntılı analiz', exact: true }).click();
      await page.getByRole('heading', { name: 'Finansal tablo', exact: true }).waitFor();
      await noOverflow('analysis');
      await page.getByRole('button', { name: 'Kasa ve bütçe', exact: true }).click();
      await page.getByRole('heading', { name: 'Kasa ve banka bakiyeleri', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Ayarlar', exact: true }).click();
      const settings = page.getByRole('dialog', { name: 'Finans ayarları' });
      await settings.waitFor();
      await settings.getByRole('button', { name: 'Kategoriler', exact: true }).click();
      await settings.getByLabel('Kategori adı', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await settings.waitFor({ state: 'hidden' });
      await expect(page.getByRole('button', { name: 'Ayarlar', exact: true })).toBeFocused();
      await go('/finance/records');
      await page.getByRole('heading', { name: 'Finans kayıtları', exact: true }).waitFor();
      await noOverflow('records');
      await accessibility('records');
      await page.screenshot({ path: `${output}/records-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Gider Ekle', exact: true }).click();
      const editor = page.getByRole('dialog', { name: 'Gider Ekle', exact: true });
      await editor.getByLabel('İşlem adı', { exact: true }).fill('Örnek gider');
      await editor.getByLabel('Tutar', { exact: true }).fill('1500');
      await editor.getByRole('button', { name: 'Vazgeç', exact: true }).click();
      await page.getByRole('alertdialog', { name: 'Değişiklikler silinsin mi?' }).waitFor();
      await page.getByRole('button', { name: 'Değişiklikleri sil', exact: true }).click();
      await editor.waitFor({ state: 'hidden' });
      await go('/finance/payables');
      await page.getByRole('heading', { name: 'Ödemeler', exact: true }).waitFor();
      await page.getByText('Aylık sunucu gideri', { exact: true }).waitFor();
      await noOverflow('payables');
      await accessibility('payables');
      await page.screenshot({ path: `${output}/payables-${width}.png`, fullPage: true });
      const payableTrigger = page.getByRole('button', { name: /Kutu ve paketleme/ });
      if (width < 800) {
        await payableTrigger.scrollIntoViewIfNeeded();
        const cdp = await context.newCDPSession(page);
        const box = await payableTrigger.boundingBox();
        if (box && box.y > 0 && box.y + 80 < 1000) {
          const before = await page.evaluate(() => scrollY), x = box.x + 40, y = box.y + 60;
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          for (let step = 1; step <= 6; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 20 }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          assert.ok(await page.evaluate(() => scrollY) > before, 'native touch scroll must advance');
          assert.equal(await payableTrigger.getAttribute('aria-expanded'), 'false');
        }
        await cdp.detach();
      }
      await payableTrigger.click();
      await page.getByLabel('Ödenen tutar', { exact: true }).fill('300');
      await page.getByRole('button', { name: 'Bu tutarı ödedim', exact: true }).click();
      await page.getByText('Kısmi ödeme kaydedildi.', { exact: true }).waitFor();
      assert.equal(commands.at(-1).action, 'payable_payment');
      assert.equal(commands.at(-1).data.entry_id, 'expense-2');
      assert.equal(commands.at(-1).data.amount, 300);
      assert.equal(commands.at(-1).data.account_id, 'bank-1');
      await page.getByRole('button', { name: 'Ödendi', exact: true }).click();
      await page.getByText('Reklam hizmet bedeli', { exact: true }).waitFor();
      await noOverflow('paid state');
      assert.deepEqual(errors, []);
      console.log(`PASS ${brand} ${width}: overview, expenses/FX, analysis, accounts, settings, editor dirty dismissal, payment filters and partial payment; no page errors/overflow`);
      await context.close(); await browser.close(); browser = undefined;
    }
  } finally { if (browser) await browser.close(); server.kill('SIGTERM'); }
})().catch(error => { console.error(error); process.exitCode = 1; });
