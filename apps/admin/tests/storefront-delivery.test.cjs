const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { NextResponse } = require('next/server');
const root = path.resolve(__dirname, '../..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function load(file, mocks, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = vm.createContext({ Request, Response, Headers, URL, AbortSignal, console, setTimeout, clearTimeout, process: { env: {} }, ...globals });
  vm.runInContext(`(function(require,module,exports){${code}\n})`, context)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    return require(name);
  }, module, module.exports);
  return module.exports;
}

function storefront({ secret = 'fixture-secret', databaseDelay = 0 } = {}) {
  const tags = [], paths = [], cache = new Map();
  let databaseReads = 0;
  const api = load('storefront/src/app/api/revalidate/route.ts', {
    'next/server': { NextResponse },
    'next/cache': {
      revalidateTag(tag, profile) {
        assert.equal(profile.expire, 0, 'saved data must not use stale-while-revalidate');
        tags.push(tag);
        for (const [key, entry] of cache) if (entry.tags.includes(tag)) cache.delete(key);
      },
      revalidatePath: (...args) => paths.push(args),
    },
    '@/lib/storefrontRevalidationSecret': { getStorefrontRevalidationSecret: async () => secret },
    '@ruth-commerce/commerce-core/storefront-revalidation': { matchesStorefrontRevalidationSecret: (expected, supplied) => expected === supplied },
    '@/lib/supabaseAdmin': { getSupabaseAdmin() {
      databaseReads++;
      return { from: () => ({ select: async () => {
        await sleep(databaseDelay);
        return { data: [{ product_id: 'p1', slug: 'coffee', status: 'active', name: 'Coffee', sort_order: 1 }], error: null };
      } }) };
    } },
  });
  function read(key, entryTags, value) {
    if (!cache.has(key)) cache.set(key, { tags: entryTags, value: value() });
    return cache.get(key).value;
  }
  const post = (body, supplied = 'fixture-secret') => api.POST(new Request('https://storefront.test/api/revalidate', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-revalidate-secret': supplied }, body: JSON.stringify(body),
  }));
  return { api, post, tags, paths, read, databaseReads: () => databaseReads };
}

function panel(fetchImpl, { queueDelay = 0, queueError = false, secret = 'fixture-secret' } = {}) {
  const after = [], jobs = [], acknowledgements = [];
  let queuePersisted = false;
  const api = load('admin/src/lib/websiteRevalidate.ts', {
    'next/server': { after: callback => after.push(callback) },
    '@/lib/platform': { ROSTA_STORE_URL: 'https://rostacoffecompany.zeabur.app' },
    '@/lib/storefrontRevalidationSecret': { getStorefrontRevalidationSecret: async () => secret },
    '@/lib/supabaseAdmin': { getSupabaseAdmin: () => ({ from: () => ({
      upsert(job) {
        jobs.push(job);
        return { select: () => ({ maybeSingle: async () => {
          await sleep(queueDelay);
          queuePersisted = true;
          return queueError ? { error: { message: 'platform_delivery_jobs unavailable' } } : { data: { id: `job-${jobs.length}`, dedupe_key: job.dedupe_key } };
        } }) };
      },
      update: value => ({ eq: () => ({ in: async () => acknowledgements.push(value) }) }),
    }) }) },
  }, { fetch: fetchImpl });
  return { ...api, after, jobs, acknowledgements, queuePersisted: () => queuePersisted };
}

test('product invalidation acknowledges without reading the complete catalog, including archived products', async () => {
  const store = storefront({ databaseDelay: 90 });
  const response = await store.post({ scope: 'catalog', productIds: ['p1', 'archived-product'] });
  assert.equal(response.status, 200);
  assert.equal(store.databaseReads(), 0, 'cache invalidation must not wait on catalog/database availability');
  assert.ok(store.tags.includes('rosta-product-windows'));
  assert.ok(store.paths.some(([url, type]) => url === '/products/[slug]' && type === 'page'));
});

test('discount changes expire the catalog and cached product prices as well as discount rules', async () => {
  const store = storefront();
  let price = 100;
  assert.equal(store.read('catalog', ['rosta-products'], () => price), 100);
  assert.equal(store.read('detail', ['rosta-product-windows'], () => price), 100);
  price = 80;
  await store.post({ scope: 'discounts' });
  assert.equal(store.read('catalog', ['rosta-products'], () => price), 80);
  assert.equal(store.read('detail', ['rosta-product-windows'], () => price), 80);
  assert.ok(store.tags.includes('rosta-discounts'));
});

test('theme changes refresh published design, settings and footer social links together', async () => {
  const store = storefront();
  let revision = 1;
  for (const tag of ['rosta-theme', 'rosta-social-media']) store.read(tag, [tag], () => revision);
  revision = 2;
  await store.post({ scope: 'theme' });
  for (const tag of ['rosta-theme', 'rosta-social-media']) assert.equal(store.read(tag, [tag], () => revision), 2);
  assert.deepEqual(store.paths, [['/', 'layout']]);
});

test('all-scope updates invalidate every public storefront cache owner', async () => {
  const store = storefront();
  await store.post({ scope: 'all' });
  for (const tag of ['rosta-theme', 'rosta-social-media', 'rosta-products', 'rosta-product-windows', 'rosta-categories', 'rosta-collections', 'rosta-discounts', 'rosta-orders']) assert.ok(store.tags.includes(tag), tag);
});

test('invalid secrets, missing credentials, unsupported scopes and malformed payloads never invalidate', async () => {
  const store = storefront();
  assert.equal((await store.post({ scope: 'all' }, '')).status, 401);
  assert.equal((await store.post({ scope: 'all' }, 'wrong')).status, 401);
  assert.equal((await storefront({ secret: '' }).post({ scope: 'all' })).status, 503);
  assert.equal((await store.post({ scope: 'invented' })).status, 400);
  const invalid = await store.api.POST(new Request('https://storefront.test/api/revalidate', {
    method: 'POST', headers: { 'x-revalidate-secret': 'fixture-secret' }, body: '{',
  }));
  assert.equal(invalid.status, 400);
  assert.equal(store.tags.length, 0);
});

test('a saved price or published design is fresh on the first read after the panel save resolves', async () => {
  const store = storefront();
  let price = 100, design = 1;
  store.read('catalog', ['rosta-products'], () => price);
  store.read('theme', ['rosta-theme'], () => design);
  const admin = panel(async (_url, init) => store.post(JSON.parse(init.body), init.headers['x-revalidate-secret']));
  price = 125;
  const priceSave = await admin.revalidateWebsite({ source: 'admin-product-update', productIds: ['p1'] });
  assert.equal(priceSave.deferred, false);
  assert.equal(store.read('catalog', ['rosta-products'], () => price), 125);
  design = 2;
  const themeSave = await admin.revalidateWebsite({ source: 'rosta-admin-theme-customizer', scope: 'theme' });
  assert.equal(themeSave.deferred, false);
  assert.equal(store.read('theme', ['rosta-theme'], () => design), 2);
  assert.equal(admin.jobs.length, 2, 'recovery remains durable');
});

test('slow recovery storage does not postpone delivery to the storefront', async () => {
  let persistedAtDelivery;
  const admin = panel(async () => { persistedAtDelivery = admin.queuePersisted(); return Response.json({ ok: true, revalidated: true }); }, { queueDelay: 100 });
  const result = await admin.revalidateWebsite({ source: 'admin-theme', immediate: true });
  assert.equal(result.ok, true);
  assert.equal(persistedAtDelivery, false, 'delivery must not wait for recovery persistence');
});

test('a missing recovery table cannot prevent a successful storefront update', async () => {
  const admin = panel(async () => Response.json({ ok: true, revalidated: true }), { queueError: true });
  const result = await admin.revalidateWebsite({ source: 'admin-theme' });
  assert.equal(result.ok, true);
  assert.equal(result.deferred, false);
  assert.equal(result.durable, false);
});

test('a queue job is not reported as an immediate storefront success', async () => {
  const admin = panel(async () => Response.json({ ok: false, error: 'Invalid credentials' }, { status: 401 }));
  const result = await admin.revalidateWebsite({ source: 'admin-product-update', immediate: true });
  assert.equal(result.ok, false);
  assert.equal(result.deferred, true);
  assert.equal(result.durable, true);
  assert.equal(result.attempts, 1);
});

test('each save gets a distinct recovery job even when the same product is edited twice within five seconds', async () => {
  const admin = panel(async () => Response.json({ ok: true, revalidated: true }));
  await admin.revalidateWebsite({ source: 'admin-product-update', productIds: ['p1'] });
  await admin.revalidateWebsite({ source: 'admin-product-update', productIds: ['p1'] });
  assert.notEqual(admin.jobs[0].dedupe_key, admin.jobs[1].dedupe_key);
});

test('HTTP 200 without a cache invalidation acknowledgement is a failed delivery', async () => {
  const admin = panel(async () => Response.json({ ok: true }));
  const result = await admin.executeWebsiteRevalidate({ source: 'admin-product-update' });
  assert.equal(result.ok, false);
});

test('missing credentials fail closed and explicit background delivery still runs after the response', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json({ ok: true, revalidated: true }); };
  const unavailable = panel(fetcher, { secret: '' });
  assert.equal((await unavailable.revalidateWebsite({ source: 'admin-theme' })).ok, false);
  assert.equal(calls, 0);
  const background = panel(fetcher);
  const result = await background.revalidateWebsite({ source: 'maintenance', immediate: false });
  assert.equal(result.deferred, true);
  assert.equal(calls, 0);
  await background.after[0]();
  assert.equal(calls, 1);
});

test('legacy catalog and inventory delivery use the same canonical immediate publisher', async () => {
  const calls = [];
  const api = load('admin/src/lib/storefront.ts', {
    '@/lib/platform': { ROSTA_STORE_URL: 'https://rostacoffecompany.zeabur.app' },
    '@/lib/websiteRevalidate': { revalidateWebsite: async input => { calls.push(input); return { ok: true, deferred: false }; } },
    '@/lib/storefrontRevalidationSecret': { getStorefrontRevalidationSecret: async () => 'fixture-secret' },
  }, { fetch: () => { throw new Error('legacy publisher must not issue a separate HTTP request'); } });
  const result = await api.revalidateStorefront('rosta-admin-inventory-update', 'catalog');
  assert.equal(result.ok, true);
  assert.equal(calls[0].scope, 'catalog');
  assert.equal(calls[0].source, 'rosta-admin-inventory-update');
});

function insightCreate(revalidate) {
  return load('admin/src/app/api/rosta-insight/admin/execute/route.ts', {
    'next/server': { NextResponse, after: () => { throw new Error('user product creation must await storefront delivery'); } },
    '@/lib/auth': { requireAdmin: async () => ({ profile: { id: 'owner' }, supabase: {} }) },
    '@/lib/ruthieAdminGateway': { invokeRuthieAdminAction: () => { throw new Error('unexpected action'); } },
    '@/lib/ruthieActionConfirmation': { verifyRuthieConfirmationToken: () => ({ arguments: { action: 'products.create', payload: {} } }) },
    '@/lib/ruthieProductFastPath': {
      createRuthieProductFast: async () => ({ product: { id: 'p1' }, counts: {}, durationMs: 10 }),
      RuthieProductCreateError: class extends Error {},
    },
    '@/lib/websiteRevalidate': { noStoreHeaders: () => ({ 'Cache-Control': 'no-store' }), revalidateWebsite: revalidate },
  }).POST(new Request('https://admin.test/api/rosta-insight/admin/execute', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'confirmed-fixture-action' }),
  }));
}

test('Insight product creation waits for the same cache delivery acknowledgement as the panel editor', async () => {
  let release, delivered = false, resolved = false;
  const gate = new Promise(resolve => { release = resolve; });
  const response = insightCreate(async input => {
    assert.equal(input.productIds[0], 'p1');
    delivered = true;
    await gate;
    return { ok: true, deferred: false };
  });
  response.then(() => { resolved = true; });
  await sleep(0);
  assert.equal(delivered, true);
  assert.equal(resolved, false, 'creation cannot claim storefront freshness before delivery');
  release();
  const payload = await (await response).json();
  assert.equal(payload.result.data.revalidate.ok, true);
  assert.equal(payload.result.data.revalidate.deferred, false);
});

test('Insight keeps a successful product write while reporting deferred cache delivery accurately', async () => {
  const response = await insightCreate(async () => ({ ok: false, deferred: true, durable: true }));
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.result.data.product.id, 'p1');
  assert.equal(payload.result.data.revalidate.ok, false);
  assert.equal(payload.result.data.revalidate.durable, true);
});
