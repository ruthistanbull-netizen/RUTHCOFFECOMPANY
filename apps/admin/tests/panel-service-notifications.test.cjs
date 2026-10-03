const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../../..");
const ts = require(path.join(root, "node_modules/typescript"));
const nodeRequire = require("node:module").createRequire(path.join(root, "package.json"));
const expectedBrand = 'ROSTA Coffee';
const prefix = 'rosta';
function load(relative, injected = {}, appended = "") {
  const file = path.join(root, relative);
  const source = fs.readFileSync(file, "utf8") + appended;
  const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const module = {exports:{}};
  const req = name => {
    if (name in injected) return injected[name];
    if (name === "@/lib/adminNotification") return presentation;
    if (name === "@/lib/panelSyncRegistry") return {};
    if (name === "./primitives") return {};
    if (name === "@ruth-commerce/commerce-core/appointments") return {appointmentNotification:()=>null};
    return nodeRequire(name);
  };
  vm.runInThisContext("(function(require,module,exports){"+code+"\n})",{filename:file})(req,module,module.exports);
  return module.exports;
}
const presentation = load("apps/admin/src/lib/adminNotification.ts");
test("health producer uses this panel's brand, and keeps actionable warning details", async () => {
  const writes = [];
  const previous = {status:"degraded", first_seen_at:new Date(Date.now()-3600000).toISOString(), last_alerted_at:null};
  const db = {from(table) {
    const chain = {select(){return chain;},eq(){return chain;},maybeSingle:async()=>({data:previous}),
      upsert:async fields=>writes.push({table,fields}),
      insert(fields){writes.push({table,fields});return Promise.resolve({error:null});}};
    return chain;
  }};
  const route = load("apps/admin/src/app/api/internal/panel-sync/route.ts", {"@/lib/auth":{},"@/lib/pushWorker":{}}, "\nexport { setHealthState as testSetHealthState };\n");
  const detail = "OpenAI provider yapılandırması eksik: OPENAI_API_KEY";
  assert.equal(await route.testSetHealthState(db,"core-assistant","degraded",detail),true);
  const job = writes.find(row=>row.table === "admin_push_jobs").fields;
  assert.equal(job.payload.title,expectedBrand+" servis uyarısı");
  assert.equal(job.payload.body,detail);
  assert.equal(job.target_url,"/system");
  assert.equal(presentation.panelServiceAlertTitle("unhealthy"),expectedBrand+" servis hatası");
});
test("queued legacy system titles are corrected without rewriting custom reminders or customer text", () => {
  const worker = load("apps/admin/src/lib/pushWorker.ts", {"@/lib/supabaseAdmin":{}}, "\nexport { notificationFor as testNotificationFor };\n");
  const base = {id:"job-1",kind:"health",target_url:"/system",order_id:null,attempts:0};
  const notification = worker.testNotificationFor({...base,payload:{title:"Ruth Panel servis uyarısı",body:"returns needs attention",service_key:"sync-returns"}});
  assert.equal(notification.title,expectedBrand+" servis uyarısı");
  assert.equal(notification.body,"returns needs attention");
  assert.equal(notification.tag,prefix+"-health-sync-returns");
  assert.equal(worker.testNotificationFor({...base,payload:{title:"Supabase yedeğini indir",body:"Backup reminder"}}).title,"Supabase yedeğini indir");
  assert.equal(presentation.normalizePanelNotificationTitle("Ruth Panel servis uyarısı","contact"),"Ruth Panel servis uyarısı");
});
test("saved notification history keeps dates, read state and links while repairing legacy brand and kind", () => {
  const previous = [{id:prefix+"-health-core-assistant",kind:"default",title:"Ruth Panel servis uyarısı",body:"Configuration required",url:"/system",createdAt:1234567890,read:true}];
  global.window = {localStorage:{getItem:()=>JSON.stringify(previous)}};
  try {
    const center = load("apps/admin/src/components/base44-exact/ExactNotificationCenter.tsx", {}, "\nexport { readHistory as testReadHistory };\n");
    const [row] = center.testReadHistory();
    assert.equal(row.title,expectedBrand+" servis uyarısı");
    assert.equal(row.kind,"health");
    assert.equal(row.createdAt,1234567890);
    assert.equal(row.read,true);
    assert.equal(row.id,previous[0].id);
    assert.equal(row.url,"/system");
  } finally {delete global.window;}
});
test("typed pushes keep the correct category and do not infer another panel's tag", () => {
  assert.equal(presentation.normalizePanelNotificationPayload({type:"order",tag:prefix+"-health-x"}).kind,"order");
  assert.equal(presentation.normalizePanelNotificationPayload({tag:(prefix === "rosta" ? "ruth" : "rosta")+"-health-x"}).kind,"default");
  assert.equal(presentation.normalizePanelNotificationPayload({tag:prefix+"-health-x"}).kind,"health");
});

test("the delivery worker sends an explicitly typed, corrected health event from its own queue", async () => {
  const sent = [], saved = [];
  global.__panelPushCapture = (_subscription,payload) => sent.push(JSON.parse(payload));
  const db = {
    from(table) {
      const result = table === "admin_push_config" ? {data:{vapid_public_key:"fixture",vapid_private_key:"fixture",subject:"mailto:fixture@example.invalid"}} : {data:[{id:"device-1",endpoint:"https://push.example.invalid",p256dh:"fixture",auth_key:"fixture"}]};
      const chain = {select(){return chain;},eq(){return chain;},maybeSingle(){return Promise.resolve(result);},update(fields){saved.push({table,fields});return chain;},then(resolve,reject){return Promise.resolve(result).then(resolve,reject);}};
      return chain;
    },
    rpc(name) {return Promise.resolve({data:name === "claim_admin_push_jobs" ? [{id:"job-1",kind:"health",payload:{service_key:"sync-returns",title:"Ruth Panel servis uyarısı",body:"Returns failure details"},target_url:"/system",attempts:0}] : [],error:null});},
  };
  try {
    const worker = load("apps/admin/src/lib/pushWorker.ts", {"@/lib/supabaseAdmin":{getSupabaseAdmin:()=>db}}, "\n sendWebPushNotification = async (...args) => { globalThis.__panelPushCapture(...args); };\n");
    const result = await worker.kickAdminPushWorker();
    assert.equal(result.delivered_notifications,1);
    assert.equal(sent[0].type,"health");
    assert.equal(sent[0].title,expectedBrand+" servis uyarısı");
    assert.equal(sent[0].body,"Returns failure details");
    assert.equal(sent[0].url,"/system");
    assert.ok(saved.some(row=>row.table === "admin_push_jobs" && row.fields.status === "sent"));
  } finally {delete global.__panelPushCapture;}
});
