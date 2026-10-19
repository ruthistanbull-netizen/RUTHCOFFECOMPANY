const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { loadRoutes, req, sqlPath, PGlite } = require('./entertainment-support.cjs');
const base = process.env.WATCH_TEST_URL || 'http://127.0.0.1:3100';
const screenshots = process.env.WATCH_SCREENSHOT_DIR || '/tmp/entertainment-screenshots';
fs.mkdirSync(screenshots, { recursive: true });
if (!fs.existsSync('/tmp/watch-test.webm')) execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=640x360:r=24','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=44100','-t','40','-c:v','libvpx','-deadline','realtime','-pix_fmt','yuv420p','-c:a','libvorbis','-y','/tmp/watch-test.webm']);

(async () => {
  const db = new PGlite();
  let browser, hostPage, guestPage;
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
    await db.exec(fs.readFileSync(sqlPath, 'utf8'));
    const api = loadRoutes(db);
    const { session } = await (await api.rooms.POST(req('POST', { url: 'https://media.example.com/test.webm', title: 'Film gecesi', name: 'Görkem' }, null, true))).json();
    const options = { headless: true, args: ['--autoplay-policy=no-user-gesture-required'] };
    if (process.env.WATCH_CHROMIUM_MODULE) {
      const loaded = await import(process.env.WATCH_CHROMIUM_MODULE);
      const executable = loaded.default || loaded;
      options.executablePath = await executable.executablePath(); options.args.push(...executable.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content', '--single-process'].includes(arg)));
    }
    browser = await chromium.launch(options);
    const failures = [], unexpectedApis = [];
    async function setup(context) {
      await context.addInitScript(() => {
        const Original = RTCPeerConnection;
        window.__watchTestPeers = [];
        window.RTCPeerConnection = class extends Original { constructor(...args) { super(...args); window.__watchTestPeers.push(this); } };
      });
      await context.route('https://media.example.com/test.webm', async route => {
        const file = fs.readFileSync('/tmp/watch-test.webm');
        const range = (await route.request().allHeaders()).range?.match(/bytes=(\d+)-(\d*)/);
        if (!range) return route.fulfill({ body: file, contentType: 'video/webm', headers: { 'Accept-Ranges': 'bytes' } });
        const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), file.length - 1) : file.length - 1;
        return route.fulfill({ status: 206, body: file.subarray(start, end + 1), contentType: 'video/webm', headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${file.length}` } });
      });
      await context.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url());
        if (!url.pathname.startsWith('/api/entertainment/')) { unexpectedApis.push(url.pathname); return route.fulfill({ json: { ok: false }, status: 401 }); }
        const match = url.pathname.match(/^\/api\/entertainment\/rooms\/([a-f0-9-]+)(\/join)?$/);
        assert.ok(match);
        const headers = await request.allHeaders();
        const input = new Request(request.url(), { method: request.method(), headers,
          ...(request.postData() ? { body: request.postData() } : {}) });
        const context = { params: Promise.resolve({ id: match[1] }) };
        const handler = match[2] ? api.join : api.room;
        const response = await handler[request.method()](input, context);
        if (request.method() !== 'GET') console.log('API', request.method(), request.postData()?.slice(0,100), response.status);
        await route.fulfill({ status: response.status, body: await response.text(), contentType: 'application/json' });
      });
      context.on('page', page => page.on('pageerror', error => failures.push(error.message)));
    }
    const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    hostContext.setDefaultTimeout(15000); guestContext.setDefaultTimeout(15000);
    await setup(hostContext); await setup(guestContext);
    await hostContext.addInitScript(s => { try { sessionStorage.setItem(`rr-watch:v1:${s.roomId}`, JSON.stringify(s)); } catch {} }, session);
    const host = await hostContext.newPage(), guest = await guestContext.newPage();
    hostPage = host; guestPage = guest;
    const url = `${base}/eglence/oda/${session.roomId}#davet=${session.invite}`;
    await host.goto(url); await guest.goto(url);
    await guest.getByRole('textbox', { name: 'Adın', exact: true }).fill('Arkadaş');
    await guest.getByRole('button', { name: 'Odaya katıl', exact: true }).click();
    await host.getByRole('heading', { name: 'Film gecesi', exact: true }).waitFor();
    await guest.getByRole('heading', { name: 'Film gecesi', exact: true }).waitFor();
    console.log('Browser: host and guest joined');
    await host.waitForFunction(() => document.querySelector('video')?.readyState >= 1, null, { timeout: 15000 });
    console.log('Browser: video ready');
    await host.getByRole('button', { name: 'Herkes için oynat', exact: true }).click();
    await guest.waitForFunction(() => document.querySelector('video')?.paused === false);
    await host.getByRole('button', { name: 'Herkes için duraklat', exact: true }).click();
    await guest.waitForFunction(() => document.querySelector('video')?.paused === true);
    await host.getByRole('spinbutton', { name: 'Saniyeye git' }).fill('12');
    await host.getByRole('button', { name: 'Herkesi bu ana getir' }).click();
    await guest.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 12) < 1);
    await guest.getByRole('textbox', { name: 'Mesajın', exact: true }).fill('Hazırım, başlayalım.');
    await guest.getByRole('button', { name: 'Gönder', exact: true }).click();
    await host.getByText('Hazırım, başlayalım.', { exact: true }).waitFor();
    assert.equal(await guest.getByRole('button', { name: 'Herkes için oynat', exact: true }).count(), 0);
    await guest.evaluate(() => scrollTo(0, 0));
    const leaveBox = await guest.getByRole('button', { name: 'Odadan ayrıl', exact: true }).boundingBox();
    const touch = await guestContext.newCDPSession(guest), x = leaveBox.x + leaveBox.width / 2, y = leaveBox.y + leaveBox.height / 2;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 5; i++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.max(8, y - i * 24) }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await guest.waitForFunction(() => scrollY > 0);
    assert.equal(guest.url(), url, 'scroll beginning on a button must not leave the room');
    await guest.getByRole('button', { name: 'Tam ekran', exact: true }).tap();
    await guest.waitForFunction(() => Boolean(document.fullscreenElement));
    await guest.evaluate(() => document.exitFullscreen());
    console.log('Browser: synchronized play/pause/seek and chat passed');
    for (const width of [390, 768, 1440]) {
      await host.setViewportSize({ width, height: 1000 });
      assert.ok(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
      await host.screenshot({ path: path.join(screenshots, `host-${width}.png`), fullPage: true });
    }
    await guest.screenshot({ path: path.join(screenshots, 'guest-390.png'), fullPage: true });
    if (process.env.WATCH_AXE_MODULE) {
      await guest.addScriptTag({ path: require.resolve(process.env.WATCH_AXE_MODULE) });
      const violations = await guest.evaluate(async () => (await axe.run(document.querySelector('main'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.filter(v => ['serious', 'critical'].includes(v.impact)));
      assert.deepEqual(violations.map(v => ({ id: v.id, nodes: v.nodes.length })), []);
    }
    // Real WebRTC negotiation with a generated local test screen, without a
    // browser permission picker or third-party source in the test environment.
    await host.evaluate(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
        const ctx = canvas.getContext('2d');
        const interval = setInterval(() => { ctx.fillStyle = `hsl(${Date.now() % 360},70%,30%)`; ctx.fillRect(0, 0, 640, 360); }, 50);
        const audio = new AudioContext(), oscillator = audio.createOscillator(), destination = audio.createMediaStreamDestination();
        oscillator.connect(destination); oscillator.start();
        const stream = new MediaStream([...canvas.captureStream(20).getTracks(), ...destination.stream.getTracks()]);
        stream.getVideoTracks()[0].addEventListener('ended', () => { clearInterval(interval); audio.close(); });
        return stream;
      };
    });
    console.log('Browser: responsive layout and accessibility passed');
    await host.getByRole('button', { name: 'Sekmeyi paylaş', exact: true }).click();
    await guest.waitForFunction(() => document.querySelector('video')?.srcObject?.getVideoTracks().length === 1);
    let mediaTransport = true;
    try { await guest.waitForFunction(() => document.querySelector('video')?.readyState >= 2, null, { timeout: 12000 }); }
    catch (error) {
      const candidates = await host.evaluate(async () => {
        const result = []; for (const peer of window.__watchTestPeers) for (const stat of (await peer.getStats()).values()) if (stat.type === 'local-candidate') result.push(stat);
        return result.length;
      });
      if (candidates) throw error;
      mediaTransport = false;
      console.log('UNVERIFIED: media transport; sandbox exposes no ICE network candidates. Offer/answer and remote track attachment passed.');
    }
    await host.getByRole('button', { name: 'Paylaşımı durdur', exact: true }).click();
    await guest.waitForFunction(() => document.querySelector('video')?.src.endsWith('test.webm'));
    await host.getByRole('button', { name: 'Odayı kapat', exact: true }).click();
    await host.getByRole('button', { name: 'Odayı kapat', exact: true }).last().click();
    await guest.getByRole('heading', { name: 'Odaya erişilemiyor', exact: true }).waitFor();
    assert.deepEqual(unexpectedApis, [], 'guest room must never call operational admin APIs');
    assert.deepEqual(failures, [], 'browser runtime errors');
    console.log(`Browser passed: invite join, two-client play/pause/seek, chat, role controls, native touch scrolling, fullscreen, 390/768/1440 layout, guest isolation, WebRTC signaling and close. Media transport verified: ${mediaTransport}`);
  } finally {
    if (guestPage) { await guestPage.screenshot({ path: path.join(screenshots,'guest-final.png'), fullPage: true }).catch(() => {}); console.log('Guest final', await guestPage.locator('main').innerText().catch(() => 'unavailable')); }
    if (hostPage) await hostPage.screenshot({ path: path.join(screenshots,'host-final.png'), fullPage: true }).catch(() => {});
    await browser?.close(); await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
