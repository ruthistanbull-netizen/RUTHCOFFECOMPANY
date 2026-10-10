const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { NextResponse } = require('next/server');
const root = path.resolve(__dirname, '../src');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
class StorageFixture {
  data = new Map();
  get length() { return this.data.size; }
  key(i) { return [...this.data.keys()][i] ?? null; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}
function harness(fetchImpl, overrides = {}, clock = setTimeout) {
  const window = new EventTarget();
  Object.assign(window, { sessionStorage: new StorageFixture(), localStorage: new StorageFixture(), setTimeout: clock, clearTimeout, atob, location: { origin: 'https://admin.test' } });
  const context = vm.createContext({ window, fetch: fetchImpl, Response, Request, Headers, URL, URLSearchParams, FormData, AbortController, AbortSignal, DOMException, CustomEvent, performance, crypto, Buffer, console, setTimeout: clock, clearTimeout });
  const modules = new Map();
  const mocks = {
    '@/lib/supabaseBrowser': { getSupabaseBrowser: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-token' } }, error: null }) } }) },
    '@/lib/adminConfirmation': { requestAdminConfirmation: async () => true },
    '@/lib/adminFreshnessTelemetry': { recordAdminFreshnessMetric() {} },
    '@/lib/platform': { assertRostaSupabaseUrl: value => value },
    ...overrides,
  };
  function load(relative) {
    if (modules.has(relative)) return modules.get(relative).exports;
    const module = { exports: {} }; modules.set(relative, module);
    const file = path.join(root, relative);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const get = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('@/lib/')) return load(`lib/${name.slice(6)}.ts`);
      return require(name);
    };
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename: file })(get, module, module.exports);
    return module.exports;
  }
  return { window, load };
}

test('cold settings/dashboard reads race live against a slow or missing read-model', async () => {
  let live = 0;
  const h = harness(async input => {
    if (String(input).startsWith('/api/instant-data?')) { await sleep(120); return Response.json({ ok: true }); }
    if (input === '/api/instant-data') return Response.json({ ok: true });
    live++; await sleep(10); return Response.json({ ok: true, settings: { current: true } });
  });
  const api = h.load('lib/adminApi.ts');
  const started = performance.now();
  const values = await Promise.all([api.adminRequest('/api/site-settings'), api.adminRequest('/api/site-settings')]);
  assert.equal(live, 1);
  assert.equal(values[0].settings.current, true);
  assert.ok(performance.now() - started < 100, 'a missing snapshot must not delay a healthy live endpoint');
});

test('an available snapshot paints first while exactly one live read refreshes it', async () => {
  let live = 0;
  const h = harness(async input => {
    if (String(input).startsWith('/api/instant-data?')) return Response.json({ ok: true, found: true, entry: { payload: { ok: true, settings: { version: 1 } }, status: 'healthy' } });
    if (input === '/api/instant-data') return Response.json({ ok: true });
    live++; await sleep(45); return Response.json({ ok: true, settings: { version: 2 } });
  });
  const api = h.load('lib/adminApi.ts');
  const first = await api.adminRequest('/api/site-settings');
  assert.equal(first.settings.version, 1);
  await sleep(70);
  assert.equal((await api.adminRequest('/api/site-settings')).settings.version, 2);
  assert.equal(live, 1);
});

test('page warmup and authoritative reconciliation share a live request', async () => {
  let reads = 0;
  const h = harness(async input => {
    if (String(input).startsWith('/api/instant-data')) return Response.json({ ok: true });
    reads++; await sleep(15); return Response.json({ ok: true, returns: [{ id: 'r1' }] });
  });
  const api = h.load('lib/adminApi.ts');
  const freshness = h.load('lib/adminOperationalFreshness.ts');
  freshness.installAdminOperationalFreshnessCacheGuard();
  await Promise.all([api.adminRequest('/api/returns?range=all'), freshness.reconcileAdminResource('/api/returns?range=all')]);
  await sleep(20);
  assert.equal(reads, 1);
});

test('a canonical live cache update is accepted without another database read', async () => {
  let reads = 0;
  const h = harness(async input => { if (input === '/api/instant-data') return Response.json({ ok: true }); reads++; return Response.json({ ok: true, settings: { enabled: true } }); });
  const api = h.load('lib/adminApi.ts');
  const freshness = h.load('lib/adminOperationalFreshness.ts');
  freshness.installAdminOperationalFreshnessCacheGuard();
  await api.adminRequest('/api/site-settings', { hardRefresh: true });
  await sleep(10);
  assert.equal(reads, 1);
  assert.equal(freshness.currentAcceptedAdminPayload('/api/site-settings').settings.enabled, true);
});

test('one cancelled consumer cannot abort another consumer or poison its cache', async () => {
  const pending = deferred(); let reads = 0, physicalSignal;
  const h = harness(async (_input, init) => { reads++; physicalSignal = init.signal; await pending.promise; return Response.json({ ok: true, products: [{ id: 'p1' }] }); });
  const api = h.load('lib/adminApi.ts');
  const caller = new AbortController();
  const cancelled = api.adminRequest('/api/products?id=p1', { hardRefresh: true, signal: caller.signal });
  const remaining = api.adminRequest('/api/products?id=p1', { hardRefresh: true });
  await sleep(0);
  caller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.equal(physicalSignal.aborted, false);
  pending.resolve();
  assert.equal((await remaining).products[0].id, 'p1');
  assert.equal(reads, 1);
});

test('mutation invalidation detaches old reads and prevents stale cache events', async () => {
  const old = deferred(); let reads = 0; const events = [];
  const h = harness(async (input, init) => {
    if (init.method === 'PATCH') return Response.json({ ok: true });
    if (++reads === 1) { await old.promise; return Response.json({ ok: true, products: [{ id: 'old' }] }); }
    return Response.json({ ok: true, products: [{ id: 'new' }] });
  });
  const api = h.load('lib/adminApi.ts');
  h.window.addEventListener('ruth-admin-api-cache-updated', event => events.push(event.detail.value.products?.[0]?.id));
  const prior = api.adminRequest('/api/products?id=p1', { hardRefresh: true });
  await api.adminRequest('/api/products/safe-update', { method: 'PATCH', body: '{}', confirmation: false });
  await api.adminRequest('/api/products?id=p1', { hardRefresh: true });
  old.resolve(); await prior;
  assert.deepEqual(events, ['new']);
  assert.equal((await api.adminRequest('/api/products?id=p1')).products[0].id, 'new');
});

test('database transport dedupes exact concurrent reads with independently readable bodies', async () => {
  let reads = 0;
  const h = harness(async () => { reads++; await sleep(10); return Response.json([{ id: 'p1' }], { status: 206, headers: { 'Content-Range': '0-0/139' } }); });
  const { supabaseAdminFetch } = h.load('lib/supabaseAdmin.ts');
  const responses = await Promise.all([supabaseAdminFetch('https://database.test/rest/v1/products'), supabaseAdminFetch('https://database.test/rest/v1/products')]);
  assert.equal(reads, 1);
  for (const response of responses) { assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Range'), '0-0/139'); assert.equal((await response.json())[0].id, 'p1'); }
});

test('database transport never shares reads across authorization or representation headers', async () => {
  let reads = 0;
  const h = harness(async () => { reads++; await sleep(5); return Response.json([]); });
  const { supabaseAdminFetch } = h.load('lib/supabaseAdmin.ts');
  await Promise.all(['one', 'two'].map(token => supabaseAdminFetch('https://database.test/rest/v1/profiles', { headers: { Authorization: token } })));
  assert.equal(reads, 2);
});

test('database deadline remains active after headers and actually cancels the slow body', async () => {
  let signal;
  const h = harness(async (_input, init) => {
    signal = init.signal;
    return new Response(new ReadableStream({ start(controller) { signal.addEventListener('abort', () => controller.error(signal.reason)); } }));
  }, {}, (callback, ms) => setTimeout(callback, ms === 8000 ? 20 : ms));
  const { supabaseAdminFetch } = h.load('lib/supabaseAdmin.ts');
  await assert.rejects(supabaseAdminFetch('https://database.test/rest/v1/products'), { name: 'AbortError' });
  assert.equal(signal.aborted, true);
});

test('upstream cancellation propagates during a database request', async () => {
  const h = harness(async (_input, init) => new Promise((_resolve, reject) => { init.signal.addEventListener('abort', () => reject(init.signal.reason)); }));
  const { supabaseAdminFetch } = h.load('lib/supabaseAdmin.ts');
  const upstream = new AbortController();
  const work = supabaseAdminFetch('https://database.test/rest/v1/products', { signal: upstream.signal });
  upstream.abort();
  await assert.rejects(work, { name: 'AbortError' });
});

test('a write separates old, mid-write and post-write reads without caching mutation results', async () => {
  const old = deferred(); const write = deferred(); let reads = 0;
  const h = harness(async (_input, init) => {
    if (init.method === 'PATCH') { await write.promise; return Response.json({ ok: true }); }
    if (++reads === 1) await old.promise;
    return Response.json([]);
  });
  const { supabaseAdminFetch } = h.load('lib/supabaseAdmin.ts');
  const url = 'https://database.test/rest/v1/products';
  const prior = supabaseAdminFetch(url);
  const mutation = supabaseAdminFetch(url, { method: 'PATCH' });
  await supabaseAdminFetch(url);
  write.resolve(); await mutation;
  await supabaseAdminFetch(url);
  old.resolve(); await prior;
  assert.equal(reads, 3);
});

test('empty-list verification counts only the requested entity and rejects missing counts', async () => {
  const tables = []; let count = 139;
  const query = { select() { return this; }, neq() { return this; }, then(resolve) { return Promise.resolve({ count, error: null }).then(resolve); } };
  const h = harness(() => {}, { '@/lib/auth': { requireAdmin: async () => ({ supabase: { from(table) { tables.push(table); return query; } } }) } });
  const route = h.load('app/api/core-list-counts/route.ts');
  const response = await route.GET(new Request('https://admin.test/api/core-list-counts?kind=products'));
  assert.equal((await response.json()).counts.products, 139);
  assert.deepEqual(tables, ['products']);
  count = null;
  assert.equal((await route.GET(new Request('https://admin.test/api/core-list-counts?kind=products'))).status, 500);
});

test('product detail loads joined relations and group dictionaries concurrently with no truncated fallback', async () => {
  const started = []; const finish = deferred(); let invalid = false;
  const information = { origin: 'Ethiopia', roasting: 'Medium' };
  const rows = { products: [{ id: 'p1', status: 'active', material: 'Arabica', information_sections: information, collection_id: 'c1', product_variants: [{ id: 'v1', options: {} }], product_images: [{ variant_id: 'v1', image_url: 'photo', is_main: true }], product_categories: [{ category_id: 'g1' }], product_collections: [{ collection_id: 'c2' }] }], categories: [{ id: 'g1', name: 'Category' }], collections: [{ id: 'c1', name: 'Direct' }, { id: 'c2', name: 'Linked' }] };
  const db = { from(table) {
    const query = {};
    for (const method of ['select', 'order', 'eq', 'limit']) query[method] = () => query;
    query.then = async resolve => { started.push(table); await finish.promise; return resolve({ data: invalid && table === 'products' ? null : rows[table], error: null }); };
    return query;
  } };
  const h = harness(() => {}, { '@/lib/auth': { requireAdmin: async () => ({ supabase: db }) }, '@/lib/localProductImages': { getLocalProductImage: () => null }, '@/lib/websiteRevalidate': { noStoreHeaders: () => ({ 'Cache-Control': 'no-store' }) }, '@/lib/catalogGroups': {} });
  const route = h.load('app/api/products/route.ts');
  const work = route.GET(new Request('https://admin.test/api/products?id=p1'));
  await sleep(5);
  assert.deepEqual(started.sort(), ['categories', 'collections', 'products']);
  finish.resolve();
  const data = await (await work).json();
  assert.equal(data.products[0].main_image_url, 'photo');
  assert.equal(data.products[0].product_variants[0].image_url, 'photo');
  assert.deepEqual(data.products[0].information_sections, information);
  assert.equal(data.products[0].material, 'Arabica');
  assert.deepEqual(data.products[0].category_ids, ['g1']);
  assert.deepEqual(data.products[0].collection_ids, ['c1', 'c2']);
  invalid = true;
  assert.equal((await route.GET(new Request('https://admin.test/api/products?id=p1'))).status, 503);
});

test('a bodyless or non-JSON API success cannot seed a false empty state', async () => {
  for (const body of ['', 'null', '<html>upstream failure</html>']) {
    const h = harness(async () => new Response(body, { status: 200 }));
    await assert.rejects(h.load('lib/adminApi.ts').adminRequest('/api/products?id=p1'));
    assert.equal(h.window.sessionStorage.length, 0);
  }
});

test('concurrent authorization shares verification but sequential mutations still verify live', async () => {
  let verifications = 0, roleVerifications = 0;
  const supabase = {
    auth: { getClaims: async () => { verifications++; await sleep(10); return { data: { claims: { sub: 'admin-user', app_metadata: { panel_role: 'owner' }, exp: Math.floor(Date.now() / 1000) + 3600 } }, error: null }; }, admin: { getUserById: async () => { roleVerifications++; return { data: { user: { id: 'admin-user', app_metadata: { panel_role: 'owner' } } }, error: null }; } } },
    from() { const query = {}; for (const method of ['select', 'eq', 'maybeSingle']) query[method] = () => query; query.then = resolve => Promise.resolve({ data: { id: 'admin-user', role: 'admin' }, error: null }).then(resolve); return query; },
  };
  const h = harness(() => {}, { '@/lib/supabaseAdmin': { getSupabaseAdmin: () => supabase }, '@/lib/adminContinuity': { readAdminContinuity: () => null } });
  const { requireAdmin } = h.load('lib/auth.ts');
  const request = () => new Request('https://admin.test/api/products', { method: 'PATCH', headers: { Authorization: 'Bearer verified-fixture' } });
  const results = await Promise.all(Array.from({ length: 5 }, () => requireAdmin(request())));
  assert.equal(verifications, 1);
  assert.ok(results.every(result => result.profile.role === 'admin'));
  await requireAdmin(request());
  assert.equal(verifications, 2);
  assert.equal(roleVerifications, 6, 'ROSTA mutations must still verify live app_metadata roles independently');
});

test('ROSTA rejects a freshly disabled mutation even when concurrent JWT claims still say owner', async () => {
  const supabase = {
    auth: {
      getClaims: async () => ({ data: { claims: { sub: 'disabled-admin', app_metadata: { panel_role: 'owner' }, exp: Math.floor(Date.now() / 1000) + 3600 } }, error: null }),
      admin: { getUserById: async () => ({ data: { user: { id: 'disabled-admin', app_metadata: { panel_role: 'owner', panel_status: 'disabled' } } }, error: null }) },
    },
    from() { const query = {}; for (const method of ['select', 'eq', 'maybeSingle']) query[method] = () => query; query.then = resolve => Promise.resolve({ data: { id: 'disabled-admin', role: 'admin' }, error: null }).then(resolve); return query; },
  };
  const h = harness(() => {}, { '@/lib/supabaseAdmin': { getSupabaseAdmin: () => supabase }, '@/lib/adminContinuity': { readAdminContinuity: () => null } });
  const result = await h.load('lib/auth.ts').requireAdmin(new Request('https://admin.test/api/products', { method: 'PATCH', headers: { Authorization: 'Bearer disabled-fixture' } }));
  assert.equal(result.error.status, 403);
});

test('JWT rotation clears the header cache without an older pending session overwriting it', async () => {
  const previous = deferred(); let reads = 0;
  const h = harness(() => {}, { '@/lib/supabaseBrowser': { getSupabaseBrowser: () => ({ auth: {
    getSession: async () => {
      if (++reads === 1) { await previous.promise; return { data: { session: { access_token: 'previous-token' } } }; }
      return { data: { session: { access_token: 'rotated-token' } } };
    },
  } }) } });
  const api = h.load('lib/adminApi.ts');
  const old = api.adminAuthHeaders();
  api.clearAdminAuthHeaderCache();
  assert.equal((await api.adminAuthHeaders()).Authorization, 'Bearer rotated-token');
  previous.resolve(); await old;
  assert.equal((await api.adminAuthHeaders()).Authorization, 'Bearer rotated-token');
  assert.equal(reads, 2);
  api.clearAdminApiCache();
  await api.adminAuthHeaders();
  assert.equal(reads, 3, 'sign-out/session cache reset cannot retain another session JWT');
});
