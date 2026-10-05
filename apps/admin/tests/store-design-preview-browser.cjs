// Run against a production admin server; auth, API and storefront fixtures
// isolate this geometry/lifecycle regression from merchant data and publishing.
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.TEST_PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.TEST_ADMIN_ORIGIN || 'http://localhost:3050';
const engine = process.env.TEST_BROWSER || 'chromium';
const doc = { schemaVersion: 2, revision: 1, globals: { tokens: {}, header: {}, footer: {}, componentFamilies: {} },
  pages: {}, seo: {}, templates: {}, templateBindings: {}, sections: {}, blocks: {}, media: {}, presets: {}, redirects: [] };
const target = { id: 'global.header', type: 'header', label: 'Üst Bilgi', defaultScope: 'global',
  allowedScopes: ['global'], controlGroups: ['layout'], protectedFields: [], breadcrumb: [], current: { visible: true } };
const fixtureHtml = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0}header{height:64px}main{height:2400px;background:linear-gradient(#faf3e6,#c94a40)}button{height:44px}</style>
<header data-editor-id="global.header"><button>Fixture header</button></header><main>Storefront viewport fixture</main>
<script>
const target=${JSON.stringify(target)};
const ready=()=>parent.postMessage({type:'EDITOR_READY',route:location.pathname},'*');
addEventListener('message',e=>{if(e.data.type==='EDITOR_REQUEST_READY')ready();
if(e.data.type==='ROUTE_NAVIGATE'){history.pushState({},'',e.data.path+location.search);ready()}
if(e.data.type==='store-design-v2:select-target')parent.postMessage({type:'EDITOR_SELECT',target},'*')});
document.querySelector('header').addEventListener('contextmenu',e=>{e.preventDefault();window.__fixturePointer={x:e.clientX,y:e.clientY};parent.postMessage({type:'EDITOR_SELECT',target,pointer:{kind:'mouse',...window.__fixturePointer}},'*')});
ready();setInterval(()=>parent.postMessage({type:'HEARTBEAT',route:location.pathname},'*'),1000);
</script>`;

async function fixtures(context) {
  await context.addInitScript(() => {
    if (window !== window.top) return;
    sessionStorage.setItem('rosta_panel_hub_entered_v1', '1');
    sessionStorage.setItem('rosta_admin_auth_session_v1', JSON.stringify({
      access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJleHAiOjQwMDAwMDAwMDAsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.fixture',
      refresh_token: 'fixture', expires_at: Date.now() / 1000 + 3600,
      user: { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.invalid' },
    }));
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: () => true });
    if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, 'register', {
      configurable: true, value: async () => ({ pushManager: { getSubscription: async () => null }, update: async () => {} }),
    });
  });
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let json = { ok: true, items: [], snapshots: [] };
    if (path === '/api/store-design-v2') json = { ok: true, draft: doc, published: doc };
    if (path === '/api/theme-editor-pages') json = { pages: [
      { path: '/', label: 'Ana Sayfa', group: 'Sayfalar' },
      { path: '/studio', label: 'ROSTA.Studio', group: 'Sayfalar' },
    ] };
    await route.fulfill({ json });
  });
  await context.route('https://rostacoffecompany.zeabur.app/**', route => route.fulfill({ contentType: 'text/html', body: fixtureHtml }));
}

async function geometry(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('.sd-preview-shell'), stage = document.querySelector('.sd-preview-stage'), frame = document.querySelector('iframe');
    const bounds = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const s = getComputedStyle(stage), b = getComputedStyle(shell);
    return { shell: bounds(shell), stage: bounds(stage), frame: bounds(frame), viewport: [frame.clientWidth, frame.clientHeight],
      expectedScale: Math.min(1,
        (stage.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - parseFloat(b.borderLeftWidth) - parseFloat(b.borderRightWidth)) / 1440,
        (stage.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom) - parseFloat(b.borderTopWidth) - parseFloat(b.borderBottomWidth)) / 900),
      stageScroll: [stage.scrollWidth - stage.clientWidth, stage.scrollHeight - stage.clientHeight],
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth };
  });
}

async function desktop(page) {
  await page.waitForFunction(() => { const f = document.querySelector('iframe'); return f?.clientWidth === 1440 && f.clientHeight === 900; });
  const g = await geometry(page);
  assert.deepEqual(g.viewport, [1440, 900], 'The selected desktop viewport stays fixed');
  assert.ok(Math.abs(g.frame.width / 1440 - g.expectedScale) < 0.001, JSON.stringify(g));
  assert.ok(Math.abs(g.frame.width / 1440 - g.frame.height / 900) < 0.001, 'Uniform scaling preserves the storefront proportions');
  assert.ok(g.shell.x >= g.stage.x - 1 && g.shell.right <= g.stage.right + 1, 'The complete width fits');
  assert.ok(g.shell.y >= g.stage.y - 1 && g.shell.bottom <= g.stage.bottom + 1, 'The complete height fits');
  assert.ok(g.stageScroll.every(n => n <= 1), 'The editor canvas has no second scrollbar');
  assert.ok(g.horizontalOverflow <= 1);
  return g;
}

async function rendering(page, frame, pixelRatio) {
  const paint = await frame.evaluate(() => ({
    width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio,
    desktop: matchMedia('(min-width:1024px)').matches,
    desktopViewport: matchMedia('(min-width:1423px) and (max-width:1441px)').matches,
    layoutWidth: document.documentElement.clientWidth,
    headerWidth: document.querySelector('header').getBoundingClientRect().width,
  }));
  const style = await page.locator('iframe').evaluate(n => ({
    zoom: Number(getComputedStyle(n).zoom), transform: getComputedStyle(n).transform,
    scale: Number(n.parentElement.dataset.previewScale),
  }));
  assert.deepEqual([paint.width, paint.height], [1440, 900]);
  assert.ok(paint.desktop, 'Scaling must retain desktop CSS media queries');
  // WebKit subtracts the native scrollbar from its media-query viewport.
  assert.ok(paint.desktopViewport, `CSS viewport units must retain the desktop width: ${JSON.stringify({paint,style})}`);
  assert.ok(Math.abs(paint.headerWidth - paint.layoutWidth) < 1.1,
    `The header fills the desktop layout, allowing its native scrollbar: ${JSON.stringify({paint,style,pixelRatio})}`);
  if (engine === 'chromium') {
    assert.equal(style.transform, 'none', 'Text must not be resampled through a transformed iframe');
    assert.ok(Math.abs(style.zoom - style.scale) < 0.001);
    assert.ok(Math.abs(paint.pixelRatio - pixelRatio * style.scale) < 0.001,
      `Native zoom must paint at the display density, including Retina screens: ${JSON.stringify({paint,style,pixelRatio,topRatio:await page.evaluate(()=>devicePixelRatio)})}`);
  } else {
    assert.equal(style.zoom, 1, 'WebKit must retain its correct desktop layout');
    assert.equal(paint.pixelRatio, pixelRatio);
  }
}

function samePreview(a, b) {
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(a.shell[key] - b.shell[key]) < 1, `Opening an overlay cannot change preview ${key}: ${JSON.stringify({before:a,after:b})}`);
}

(async () => {
  for (const [width, height, reduced, pixelRatio] of [[1920, 950, false, 1], [1440, 900, false, 2], [1280, 600, false, 1], [768, 700, true, 2], [390, 844, false, 3]]) {
    // Chromium's iframe zoom reads the physical display density, so emulate it
    // at browser launch as well as context level when checking Retina painting.
    const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
      ...(engine === 'webkit'
        ? { executablePath: process.env.TEST_WEBKIT_EXECUTABLE }
        : { executablePath: '/usr/bin/chromium', args: ['--no-sandbox', `--force-device-scale-factor=${pixelRatio}`] }),
      ...(origin.startsWith('https:') ? { proxy: { server: process.env.HTTPS_PROXY || 'http://proxy:8080' } } : {}),
    });
    try {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: pixelRatio, serviceWorkers: 'block', hasTouch: true, isMobile: width < 768, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await fixtures(context);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/theme', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('.sd-preview-shell').waitFor();
      await page.waitForFunction(() => !document.querySelector('.sd-preview-connection-chip'));
      const canvas = await page.locator('[data-theme-editor-immersive-root]').evaluate(n => ({
        transform: getComputedStyle(n).transform, animations: n.getAnimations().length,
      }));
      assert.deepEqual(canvas, { transform: 'none', animations: 0 }, 'The complete editor canvas must not be composited by a route animation');
      const frame = page.frames().find(f => f.url().includes('storeDesignV2Preview'));
      if (width < 768) {
        assert.equal(await page.locator('[data-store-design-v2-admin]').getAttribute('data-device'), 'mobile');
        assert.equal(await frame.evaluate(() => innerWidth), width);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      } else {
        const initial = await desktop(page);
        assert.ok(await page.locator('.sd-sidebar-left').evaluate(n => n.inert));
        assert.ok(await page.locator('.sd-inspector').evaluate(n => n.inert));
        assert.deepEqual(await frame.evaluate(() => [innerWidth, innerHeight]), [1440, 900]);
        await rendering(page, frame, pixelRatio);
        await frame.evaluate(() => { window.__fixtureIdentity = 'retained'; });
        if (width >= 900) {
          await page.getByTitle('Mobil', { exact: true }).click();
          assert.equal(await frame.evaluate(() => innerWidth), 372);
          await page.getByTitle('Masaüstü', { exact: true }).click();
          samePreview(initial, await desktop(page));
        }
        await page.getByLabel('Yapıyı aç veya kapat').click();
        await page.getByRole('complementary', { name: 'Yapı', exact: true }).waitFor();
        samePreview(initial, await desktop(page));
        await page.getByRole('button', { name: 'Üst Bilgi', exact: true }).click();
        await page.locator('.sd-inspector[data-open="true"]').waitFor();
        samePreview(initial, await desktop(page));
        assert.equal(await page.locator('.sd-inspector').evaluate(n => getComputedStyle(n).position), 'absolute');
        assert.equal(await page.locator('.sd-editor-workspace').evaluate(n => n.scrollLeft), 0, 'Closing the focused structure panel must not scroll the canvas');
        await page.getByRole('button', { name: 'Ayarları kapat', exact: true }).click();
        const fb = await page.locator('iframe').boundingBox();
        const pointer = { x: 120, y: 32 };
        await page.mouse.click(fb.x + pointer.x * fb.width / 1440, fb.y + pointer.y * fb.height / 900, { button: 'right' });
        const menu = page.locator('[data-store-design-context-menu]');
        await menu.waitFor();
        const position = await menu.evaluate(n => ({ x: parseFloat(n.style.left), y: parseFloat(n.style.top) }));
        // Use the native event coordinates: WebKit quantizes synthetic clicks at fractional scales.
        const nativePointer = await frame.evaluate(() => window.__fixturePointer);
        assert.ok(Math.abs(position.x - Math.max(12, Math.min(width - 336 - 12, fb.x + nativePointer.x * fb.width / 1440))) < 1, `Context actions follow the scaled pointer: ${JSON.stringify({position, fb, nativePointer, width})}`);
        const menuHeight = Math.min(620, Math.max(360, height - 88));
        assert.ok(Math.abs(position.y - Math.max(68, Math.min(height - menuHeight - 12, fb.y + nativePointer.y * fb.height / 900))) < 1, 'Context actions preserve the scaled vertical coordinate');
        await page.keyboard.press('Escape');
        if (width >= 900) await page.getByRole('button', { name: 'Önizle', exact: true }).click();
        samePreview(initial, await desktop(page));
        await frame.locator('main').evaluate(n => n.scrollIntoView());
        await frame.evaluate(() => scrollTo(0, 500));
        const scroll = await frame.evaluate(() => ({ y: scrollY, pixelRatio: devicePixelRatio }));
        assert.ok(Math.abs(scroll.y - 500) <= 1 / scroll.pixelRatio,
          `Scrolling stays inside the storefront within one physical pixel: ${JSON.stringify(scroll)}`);
        samePreview(initial, await desktop(page));
        await page.getByLabel('Düzenlenen sayfa').selectOption('/studio');
        await frame.waitForURL(url => url.pathname === '/studio');
        samePreview(initial, await desktop(page));
        assert.equal(await frame.evaluate(() => window.__fixtureIdentity), 'retained');
        await page.setViewportSize({ width: Math.max(768, width - 110), height: Math.max(420, height - 100) });
        await page.waitForFunction(() => { const f = document.querySelector('iframe'), s = document.querySelector('.sd-preview-stage'); return f.getBoundingClientRect().bottom <= s.getBoundingClientRect().bottom + 1; });
        await desktop(page);
        await rendering(page, frame, pixelRatio);
      }
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `/workspace/preview-fit-${engine}-${width}${origin.startsWith('https:') ? '-live' : ''}.png` });
      console.log(JSON.stringify({ engine, origin, width, height, reduced, pixelRatio, nativePaintDensity: engine === 'chromium', fullViewportFits: true, stableDeviceAndPanelToggles: true, scrollAndNavigation: true, noPageErrors: true }));
      await context.close();
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exit(1); });
