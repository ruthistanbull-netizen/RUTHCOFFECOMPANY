const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const mod = new Module(filename); mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = id => Object.hasOwn(mocks, id) ? mocks[id] : original(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return mod.exports;
}
let payload;
const { loadPaytrSettlementReport } = load('apps/admin/src/lib/paytrSettlementReport.ts', {
  '@ruth-commerce/commerce-core': { queryPaytrPaymentSummary: async () => {
    if (payload instanceof Error) throw payload;
    return payload;
  } },
});
const { financePayouts } = load('apps/admin/src/lib/finance/paytrPayouts.ts');
let merchant = 0;
const read = async response => {
  payload = response;
  return loadPaytrSettlementReport({ merchantId: 'fixture-' + (++merchant), merchantKey: 'fixture', merchantSalt: 'fixture' });
};
(async () => {
  const emptyShapes = [[], {}, null, '', '[]', '{}', { TL: [] }, { TL: {} }];
  for (const status of ['success', 'failed']) {
    for (const future of emptyShapes) {
      const report = await read({ status, future_payments: future });
      assert.equal(report.providerStatus, 'success');
      assert.equal(report.providerWarning, null, JSON.stringify({ status, future }));
      assert.equal(report.diagnostics.parserMismatch, false);
      assert.equal(report.summary.futureNet, 0);
      const payout = financePayouts(report);
      assert.equal(payout.unpaidTotal, 0);
      assert.equal(payout.upcoming.length, 0);
      assert.equal(payout.payoutWarning, null);
    }
  }
  for (const future of [
    { '2000-01-01': { TL: { net_amounts: '150', sale_amounts: '155', return_amounts: '5' } } },
    { '2099-10-27': { TL: { net_amounts: '0', sale_amounts: '0', return_amounts: '0' } } },
  ]) {
    const report = await read({ status: 'success', future_payments: future });
    assert.equal(report.providerWarning, null);
    assert.equal(financePayouts(report).unpaidTotal, 0);
  }
  const valid = await read({ status: 'failed', future_payments: {
    '2099-10-27': { TL: { net_amounts: '1.450,25', sale_amounts: '1.500,00', return_amounts: '49,75' } },
  } });
  assert.equal(valid.providerWarning, null);
  assert.equal(financePayouts(valid).unpaidTotal, 1450.25);
  assert.equal(financePayouts(valid).upcoming[0].date, '2099-10-27');
  const unreadable = await read({ status: 'success', future_payments: { unsupported_payment: { net_amounts: '500' } } });
  assert.equal(unreadable.diagnostics.parserMismatch, true);
  assert.ok(unreadable.providerWarning, "unreadable data must keep its warning");
  await assert.rejects(read(new Error('provider unavailable')), /provider unavailable/);
  await assert.rejects(read({ status: 'error', err_msg: 'provider rejected request' }), /provider rejected request/);
  console.log('PASS: empty/null/JSON schedules and past/zero rows yield a confirmed zero; genuine payouts, unreadable data and provider failures stay distinct.');
})().catch(error => { console.error(error); process.exitCode = 1; });
