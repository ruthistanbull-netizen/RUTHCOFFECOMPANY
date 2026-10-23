// Exercise the real Finance GET handler with the canonical settlement report.
// Provider/auth/database are isolated: no credentials or live payment calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = id => Object.hasOwn(mocks, id) ? mocks[id] : original(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return mod.exports;
}
const { financePayouts } = load('apps/admin/src/lib/finance/paytrPayouts.ts');
const row = (currency, net, extra = {}) => ({ id: 'fixture', date: '2099-10-27', currency, sales: net + 20, returns: 20, net, future: true, ibanLast4: null, ...extra });
let report = { rows: [row('TL', 14500.25), row('TRY', 5.5), row('USD', 123.45), row('EUR', 80), row('TL', 999, { future: false }), row('TL', 42, { date: '2000-01-01' }), row('TL', -10)], providerStatus: 'success', providerWarning: null, diagnostics: { queriedWindows: [{}, {}, {}] } };
let providerError = null;
const handler = load('apps/admin/src/app/api/finance/[...path]/route.ts', {
  '@/lib/finance/expenseFx': {}, '@/lib/finance/orderItems': {},
  '@ruth-commerce/commerce-core/finance': {},
  '@/lib/finance/server': {
    financeAuth: async () => ({ supabase: {} }), financeRange: () => ({}),
    financeJson: data => data, financeError: error => { throw error; },
  },
  '@/lib/paytrSettlementReport': { loadPaytrSettlementReport: async () => { if (providerError) throw providerError; return report; } },
  '@/lib/finance/paytrPayouts': { financePayouts },
});
const get = () => handler.GET(new Request('http://fixture.invalid/api/finance/payouts'), { params: Promise.resolve({ path: ['payouts'] }) });
(async () => {
  const result = await get();
  assert.equal(result.unpaidTotal, 14505.75);
  assert.deepEqual(result.byCurrency, { TRY: 14505.75, USD: 123.45, EUR: 80 });
  assert.equal(result.upcoming.length, 4);
  assert.equal(result.upcoming[0].date, '2099-10-27');
  assert.equal(result.upcoming[0].net, 14500.25);
  for (const item of result.rows) assert.doesNotThrow(() => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: item.currency }).format(item.net));
  report = { ...report, providerStatus: 'partial', providerWarning: 'PayTR raporu eksik olabilir.' };
  const partial = await get();
  assert.equal(partial.byCurrency.TRY, 14505.75);
  assert.equal(partial.providerStatus, 'partial');
  assert.equal(partial.payoutWarning, report.providerWarning);
  providerError = new Error('PayTR 429');
  const unavailable = await get();
  assert.equal(unavailable.providerStatus, 'unavailable');
  assert.equal(unavailable.payoutWarning, 'PayTR 429');
  assert.deepEqual(unavailable.upcoming, []);
  assert.deepEqual(unavailable.byCurrency, {});
  providerError = null;
  report = { ...report, rows: [], providerStatus: 'success', providerWarning: null };
  const empty = await get();
  assert.equal(empty.providerStatus, 'success');
  assert.equal(empty.unpaidTotal, 0);
  // Finance is the live owner: even a persisted positive balance must not
  // replace a provider failure, a confirmed zero, or a report HTTP failure.
  const stored = new Map([['last:/api/finance/payouts', JSON.stringify({
    path: '/api/finance/payouts', payload: result, storedAt: Date.now(),
  })]]);
  let nextResponse, restores = 0;
  global.window = {
    location: { origin: 'http://fixture.invalid' },
    fetch: async () => nextResponse,
    addEventListener: () => {},
    localStorage: {
      get length() { return stored.size; }, key: i => [...stored.keys()][i],
      getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key),
    },
  };
  const continuity = load('apps/admin/src/lib/adminDataContinuity.ts', {
    '@/lib/adminFreshnessPolicy': {
      adminLastGoodStorageKey: route => 'last:' + route,
      meaningfulAdminPayload: () => true, validAdminPayload: () => true,
      suspiciousAdminEmptyTransition: () => true,
      shouldServeAdminContinuityFallback: () => true,
    },
    '@/lib/adminFreshnessTelemetry': { recordAdminFreshnessMetric: () => {} },
    '@/lib/panelSyncRegistry': { normalizePanelRoute: route => route },
  });
  continuity.installAdminDataContinuityGuard({ restore: () => restores++, dropEmptySnapshot: () => {} });
  assert.equal(restores, 0);
  assert.equal(stored.size, 0, 'remove stale persisted Finance snapshots');
  for (const payload of [unavailable, empty, partial]) {
    nextResponse = Response.json(payload);
    assert.deepEqual(await (await window.fetch('http://fixture.invalid/api/finance/payouts')).json(), payload);
  }
  nextResponse = Response.json({ error: 'report unavailable' }, { status: 503 });
  assert.equal((await window.fetch('http://fixture.invalid/api/finance/overview')).status, 503);
  delete global.window;
  console.log('Finance payouts: canonical TL/TRY totals, separate FX, real dates/net, past/paid exclusions, partial/unavailable/empty states passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
