/* Run against an admin production server. Auth, API responses and push are
 * isolated fixtures; the test never changes customer data or subscriptions. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const site = process.env.TEST_SITE || 'rosta';
const origin = process.env.TEST_ADMIN_ORIGIN || `http://localhost:${site === 'rosta' ? 3050 : 3051}`;
const remote = origin.startsWith('https:');
const groupNames = ['Kontrol Merkezi', 'Operasyon', 'Ürün & Stok', 'Müşteri', 'Pazarlama', 'Meta', 'Mağaza', 'Analitik', site === 'rosta' ? 'ROSTA Insight' : 'Ruthie', 'Sistem'];

async function fixture(context) {
  await context.addInitScript(site => {
    if (window !== window.top) return;
    sessionStorage.setItem('rosta_panel_hub_entered_v1', '1');
    sessionStorage.setItem(`${site}_admin_auth_session_v1`, JSON.stringify({
      access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJleHAiOjQwMDAwMDAwMDAsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.fixture',
      refresh_token: 'fixture', expires_at: Date.now() / 1000 + 3600,
      user: { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.invalid' },
    }));
    if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, 'register', {
      configurable: true, value: async () => ({ pushManager: { getSubscription: async () => null }, update: async () => {} }),
    });
  }, site);
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = { ok: true, items: [], orders: [], carts: [], total: 0 };
    if (path === '/api/me') data = { ok: true, user: { id: 'fixture' }, profile: { role: 'admin', full_name: 'Fixture' } };
    if (path === '/api/instant-data') data = { ok: true, snapshots: [], snapshot: null };
    if (path.startsWith('/api/commerce-core')) data = { ok: true, cores: [], summary: { healthy: 0, warning: 0, failed: 0 } };
    await route.fulfill({ json: data });
  });
}

async function firstGroup(menu) {
  const name = await menu.locator('svg > g[role="button"]').first().getAttribute('aria-label');
  const index = groupNames.findIndex(group => name === group || name === `${group} alt menüsünü aç`);
  assert.ok(index >= 0, `Unknown menu heading: ${name}`);
  return index;
}

async function still(page) {
  // Observe rendered SVG motion, rather than assuming a fixed spring duration.
  await page.evaluate(() => new Promise((resolve, reject) => {
    let previous = '', stable = 0, frames = 0;
    function tick() {
      const menu = document.querySelector('[data-ruth-mobile-quarter-menu="true"]');
      const nodes = menu?.querySelectorAll('svg > path[class*="mainRingBase"], g[clip-path="url(#ruth-mobile-main-ring-clip)"] > g');
      const state = Array.from(nodes || [], node => node.getAttribute('style')).join('|');
      stable = state === previous ? stable + 1 : 0;
      previous = state;
      if (stable >= 10) resolve();
      else if (++frames > 240) reject(new Error('Menu motion did not settle'));
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }));
}

async function point(menu, angle = 225, radius = 181) {
  const box = await menu.boundingBox();
  const radians = angle * Math.PI / 180;
  return { x: box.x + box.width * (360 + radius * Math.cos(radians)) / 360,
    y: box.y + box.height * (360 + radius * Math.sin(radians)) / 360 };
}

async function swipe(page, cdp, menu, deltas, hold = 0, cancel = false) {
  const { x, y } = await point(menu);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const delta of deltas) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + delta }] });
    await page.waitForTimeout(16);
  }
  // A deliberate stopped-finger pause is the regression: stale velocity must
  // not produce another fling when the user finally lifts their finger.
  if (hold) await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  await still(page);
}

async function reset(page, menu) {
  await menu.locator('svg > g[role="button"]').first().focus();
  await page.keyboard.press('Home');
  await still(page);
  assert.equal(await firstGroup(menu), 0);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'],
    ...(remote ? { proxy: { server: process.env.HTTPS_PROXY || 'http://proxy:8080' } } : {}) });
  try {
    for (const [width, height, reduced] of [[320, 568, false], [390, 844, false], [768, 600, true], [1440, 900, false]]) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 768, hasTouch: true,
        reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await fixture(context);
      const page = await context.newPage();
      const errors = [], passiveWarnings = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (/passive event listener/i.test(message.text())) passiveWarnings.push(message.text()); });
      await page.goto(`${origin}/orders`, { waitUntil: 'domcontentloaded' });
      const menu = page.locator('[data-ruth-mobile-quarter-menu="true"]');
      if (width >= 1024) {
        await page.getByRole('heading', { name: 'Siparişler', exact: true }).waitFor();
        assert.equal(await menu.count(), 0, 'Desktop keeps its existing sidebar');
        assert.ok(await page.locator('a[href="/products"]').count() > 0);
      } else {
        await menu.waitFor();
        const core = menu.locator('button');
        await core.tap();
        await still(page);
        assert.equal(await menu.getAttribute('data-open'), 'true');
        const scrollBefore = await page.evaluate(() => scrollY);
        const cdp = await context.newCDPSession(page);

        await reset(page, menu);
        await swipe(page, cdp, menu, [15, 30, 45, 60, 75, 90], 250);
        assert.equal(await firstGroup(menu), 1, 'A stopped finger must snap nearby, without stale-velocity drift');
        assert.equal(await menu.getAttribute('data-has-submenu'), 'false');
        assert.equal(new URL(page.url()).pathname, '/orders');
        assert.equal(await page.evaluate(() => scrollY), scrollBefore, 'Menu dragging must not scroll the background');

        // Delayed compatibility clicks from a swipe must never choose a row.
        await menu.locator('svg > g[role="button"]').nth(1).dispatchEvent('click', { detail: 1 });
        assert.equal(await menu.getAttribute('data-has-submenu'), 'false');
        await menu.locator('button').dispatchEvent('click', { detail: 1 });
        assert.equal(await menu.getAttribute('data-open'), 'true');

        // A fresh intentional tap after the swipe must still work.
        const target = await point(menu);
        await page.touchscreen.tap(target.x, target.y);
        assert.equal(await menu.getAttribute('data-has-submenu'), 'true');
        await reset(page, menu);

        await swipe(page, cdp, menu, [20, 40, 60, 80, 100]);
        const fling = await firstGroup(menu);
        assert.ok(fling >= 1 && fling <= (reduced ? 2 : 3), 'Fast flings remain bounded');
        await swipe(page, cdp, menu, [-15, -30, -45, -60, -75, -90], 250);
        assert.equal(await firstGroup(menu), Math.max(0, fling - 1));

        await reset(page, menu);
        await swipe(page, cdp, menu, [-20, -40, -60], 250);
        assert.equal(await firstGroup(menu), 0, 'First boundary springs back to the first group');
        await swipe(page, cdp, menu, [15, 30, 45, 60], 0, true);
        assert.equal(await firstGroup(menu), 1, 'Pointer cancellation restores a valid nearby slot');
        assert.equal(await menu.getAttribute('data-has-submenu'), 'false');

        // Reversing direction before release follows the recent motion.
        await reset(page, menu);
        await swipe(page, cdp, menu, [20, 40, 60, 40, 20, 0]);
        assert.equal(await firstGroup(menu), 0);

        // A second contact stops the in-flight spring immediately.
        if (!reduced) {
          const start = await point(menu);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x, y: start.y + 50 }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
          const position = () => menu.locator('g[clip-path="url(#ruth-mobile-main-ring-clip)"] > g').first().getAttribute('style');
          // Let the queued MotionValue render flush, then check the held contact.
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const stopped = await position();
          await page.waitForTimeout(180);
          assert.equal(await position(), stopped, 'The second touch stops inertia while held');
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
          await still(page);
        }

        await reset(page, menu);
        const wheelPoint = await point(menu);
        await page.mouse.move(wheelPoint.x, wheelPoint.y);
        // Send one continuous native trackpad burst. Awaiting every driver's
        // frame acknowledgement can turn it into separate gestures under load.
        await Promise.all(Array.from({ length: 8 }, () => cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel', x: wheelPoint.x, y: wheelPoint.y, deltaX: 0, deltaY: 10,
        })));
        await page.waitForTimeout(150); // wheel-end debounce, then observe the spring
        await still(page);
        assert.equal(await firstGroup(menu), 1, 'Small wheel deltas accumulate smoothly rather than skipping whole groups');
        assert.equal(await page.evaluate(() => scrollY), scrollBefore);

        await reset(page, menu);
        await page.keyboard.press('ArrowDown'); await still(page); assert.equal(await firstGroup(menu), 1);
        await page.keyboard.press('PageDown'); await still(page); assert.equal(await firstGroup(menu), 4);
        await page.keyboard.press('End'); await still(page); assert.equal(await firstGroup(menu), 7);
        await swipe(page, cdp, menu, [20, 40, 60], 250); assert.equal(await firstGroup(menu), 7);
        await page.keyboard.press('Home'); await still(page); assert.equal(await firstGroup(menu), 0);

        // Stationary touch navigation retains the existing destination.
        const operations = await point(menu);
        await page.touchscreen.tap(operations.x, operations.y);
        const orderItem = menu.getByRole('button', { name: 'Siparişler', exact: true });
        await orderItem.waitFor();
        const submenuCount = await menu.locator('g[aria-label="Siparişler"]').locator('..').locator(':scope > g[role="button"]').count();
        assert.ok(submenuCount > 0);
        const orderPoint = await point(menu, 180 + 45 / submenuCount, 293.5);
        await page.touchscreen.tap(orderPoint.x, orderPoint.y);
        await page.waitForFunction(() => document.querySelector('[data-ruth-mobile-quarter-menu="true"]')?.getAttribute('data-open') === 'false');
        assert.equal(new URL(page.url()).pathname, '/orders');

        await core.tap(); await still(page);
        await page.keyboard.press('Escape');
        assert.equal(await menu.getAttribute('data-open'), 'false');
        assert.equal(await core.evaluate(node => document.activeElement === node), true, 'Dismissal restores launcher focus');
        await core.tap(); await still(page);
        await page.mouse.click(30, height / 3); // untouched backdrop outside both menu and RR HUB
        assert.equal(await menu.getAttribute('data-open'), 'false');
        await core.tap(); await still(page);
        await page.screenshot({ path: `/workspace/${site}-quarter-${width}${remote ? '-live' : '-after'}.png` });
        await page.keyboard.press('Escape');
        await page.mouse.move(0, 0); await page.mouse.wheel(0, 180);
        await page.waitForTimeout(100);
        assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden', 'Closing releases background scrolling');
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(passiveWarnings, []);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ site, origin, width, reduced,
        ...(width < 1024 ? { staleVelocityFixed: true, touchScrollAndTap: true,
          cancellationAndBoundaries: true, wheelAndKeyboard: true, escapeOutsideAndFocus: true }
          : { desktopSidebarPreserved: true }),
        noHorizontalOverflow: true, noPageErrors: true }));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
