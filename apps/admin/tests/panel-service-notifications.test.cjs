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
const optionalNotice = {
  kind: "health", service_key: "core-rosta-insight", status: "degraded",
  title: expectedBrand + " servis uyarısı",
  body: "ROSTA Insight Core: 33 araç, 15 connector ve sesli/yazılı onay politikası geçti · OpenAI provider yapılandırması eksik: OPENAI_API_KEY, ROSTA_INSIGHT_CHAT_MODEL",
};

function healthRoute(env, { failSelfTest = false, failTable = false, monitorStatus = "degraded" } = {}) {
  const provider = load("apps/admin/src/lib/ruthieOpenAI.ts");
  const core = {
    ...load("packages/commerce-core/src/ruthie.ts", {"./state-transitions.ts":load("packages/commerce-core/src/state-transitions.ts")}),
    ...load("packages/commerce-core/src/payment.ts"),
    calculatePricing:()=>({total:{amountMinor:2100}}),
    availableInventory:()=>4,
  };
  const supabase = { from(table) {
    const chain = {
      select(){return chain;}, eq(){return chain;},
      limit: async () => ({error: failTable && table === "products" ? {message:"Catalog unavailable"} : null}),
      like: async () => ({data:[{service_key:"commerce-core-rosta-insight",status:monitorStatus,detail:optionalNotice.body,last_seen_at:new Date().toISOString(),metadata:{verifiedFailure:true}}]}),
      maybeSingle: async () => ({data:null}),
    };
    return chain;
  }};
  return load("apps/admin/src/app/api/commerce-core/health/route.ts", {
    "@/lib/auth": {requireAdmin:async()=>({supabase})},
    "@/lib/ruthieOpenAI": {getRuthieOpenAIStatus:()=>provider.getRuthieOpenAIStatus(env)},
    "@/lib/websiteRevalidate": {noStoreHeaders:()=>({"Cache-Control":"no-store"})},
    "@ruth-commerce/commerce-core": {...core,runRuthieCoreSelfTest:()=>{
      if(failSelfTest) throw new Error("Approval policy self-test failed");
      return core.runRuthieCoreSelfTest();
    }},
  });
}

test("unconnected or partially configured AI is optional, and stale warnings do not revive it", async () => {
  for (const env of [{},{OPENAI_API_KEY:"fixture"},{ROSTA_INSIGHT_CHAT_MODEL:"fixture"},{OPENAI_API_KEY:"  ",ROSTA_INSIGHT_CHAT_MODEL:"  "}]) {
    const report = await (await healthRoute(env).GET(new Request("https://panel.example.invalid/api/commerce-core/health"))).json();
    const ai = report.cores.find(core=>core.key === "rosta-insight");
    assert.equal(ai.status,"healthy");
    assert.equal(ai.liveStatus,"healthy");
    assert.equal(ai.configuration.enabled,false);
    assert.equal(ai.selfTest.ok,true);
    assert.match(ai.detail,/bağlantısı kapalı/);
    assert.doesNotMatch(ai.detail,/eksik|OPENAI_API_KEY|CHAT_MODEL/);
    assert.equal(report.summary.warning,0);
  }
});

test("configured AI remains enabled, and genuine core failures still surface with AI disconnected", async () => {
  const configured = await (await healthRoute({OPENAI_API_KEY:"fixture",ROSTA_INSIGHT_CHAT_MODEL:"fixture-model"},{monitorStatus:"healthy"}).GET(new Request("https://panel.example.invalid"))).json();
  assert.equal(configured.cores.find(core=>core.key === "rosta-insight").configuration.enabled,true);
  const broken = await (await healthRoute({},{failSelfTest:true,failTable:true,monitorStatus:"unhealthy"}).GET(new Request("https://panel.example.invalid"))).json();
  const ai = broken.cores.find(core=>core.key === "rosta-insight");
  assert.equal(ai.liveStatus,"failed");
  assert.equal(ai.status,"failed");
  assert.match(ai.liveDetail,/Approval policy self-test failed/);
  assert.equal(broken.cores.find(core=>core.key === "catalog").liveStatus,"failed");
});

test("successive sync checks recover the optional AI state without creating another alert", async () => {
  const report = await (await healthRoute({}).GET(new Request("https://panel.example.invalid"))).json();
  const ai = report.cores.find(core=>core.key === "rosta-insight");
  const writes = [];
  let previous = {status:"degraded",first_seen_at:new Date(Date.now()-3600000).toISOString(),last_alerted_at:null};
  const db = {from(table){
    const chain = {select(){return chain;},eq(){return chain;},maybeSingle:async()=>({data:previous}),
      upsert:async fields=>{writes.push({table,fields});previous=fields;return {error:null};},
      insert:async fields=>{writes.push({table,fields});return {error:null};}};
    return chain;
  }};
  const sync = load("apps/admin/src/app/api/internal/panel-sync/route.ts", {"@/lib/auth":{},"@/lib/pushWorker":{}}, "\nexport { setHealthState as testSetHealthState };\n");
  for (let i=0;i<10;i++) assert.equal(await sync.testSetHealthState(db,"core-rosta-insight",ai.status,ai.detail),false);
  assert.equal(writes.filter(row=>row.table === "admin_push_jobs").length,0);
  assert.ok(writes[0].fields.recovered_at);
  assert.equal(previous.status,"healthy");
});

test("obsolete configuration notices are narrowly identified without masking actual failures or other messages", () => {
  assert.equal(presentation.isOptionalAIConfigurationNotice(optionalNotice),true);
  assert.equal(presentation.isOptionalAIConfigurationNotice({...optionalNotice,service_key:"",tag:"rosta-health-core-rosta-insight"}),true);
  assert.equal(presentation.isOptionalAIConfigurationNotice({...optionalNotice,kind:"contact"}),false);
  assert.equal(presentation.isOptionalAIConfigurationNotice({...optionalNotice,service_key:"sync-returns"}),false);
  assert.equal(presentation.isOptionalAIConfigurationNotice({...optionalNotice,body:optionalNotice.body+" · approval check failed"}),false);
  assert.equal(presentation.isOptionalAIConfigurationNotice({...optionalNotice,body:"OpenAI provider HTTP 401: invalid API key"}),false);
});

test("saved history removes only the obsolete optional AI notice", () => {
  const notice = {...optionalNotice,id:"rosta-health-core-rosta-insight",createdAt:12345,read:false};
  const real = {id:"rosta-health-sync-returns",kind:"health",title:"Returns warning",body:"Returns needs attention",url:"/system",createdAt:23456,read:true};
  global.window = {localStorage:{getItem:()=>JSON.stringify([notice,real])}};
  try {
    const center = load("apps/admin/src/components/base44-exact/ExactNotificationCenter.tsx", {}, "\nexport { readHistory as testReadHistory };\n");
    assert.deepEqual(center.testReadHistory(),[real]);
  } finally {delete global.window;}
});

test("old queued AI notices reach a terminal state while a real warning and an order are delivered", async () => {
  const sent=[],saved=[];
  global.__panelPushCapture = (_subscription,payload)=>sent.push(JSON.parse(payload));
  const jobs = [
    {id:"old-ai",kind:"health",payload:optionalNotice,attempts:1},
    {id:"real-warning",kind:"health",payload:{service_key:"sync-returns",body:"Returns unavailable"},attempts:1},
    {id:"new-order",kind:"order",payload:{customer_name:"Fixture",total_amount:100},order_id:"order-fixture",attempts:1},
  ];
  const db={from(table){
    const data=table === "admin_push_config" ? {vapid_public_key:"fixture",vapid_private_key:"fixture",subject:"mailto:fixture@example.invalid"} : [{id:"device",endpoint:"https://push.example.invalid",p256dh:"fixture",auth_key:"fixture"}];
    const chain={select(){return chain;},eq(_column,id){if(chain.fields)saved.push({table,id,fields:chain.fields});return chain;},maybeSingle:async()=>({data}),update(fields){chain.fields=fields;return chain;},then(resolve,reject){return Promise.resolve({data,error:null}).then(resolve,reject);}};
    return chain;
  },rpc:async name=>({data:name === "claim_admin_push_jobs" ? jobs : [],error:null})};
  try {
    const worker=load("apps/admin/src/lib/pushWorker.ts",{"@/lib/supabaseAdmin":{getSupabaseAdmin:()=>db}},"\n sendWebPushNotification = async (...args) => { globalThis.__panelPushCapture(...args); };\n");
    const result=await worker.kickAdminPushWorker();
    assert.equal(result.suppressed_jobs,1);
    assert.equal(result.delivered_notifications,2);
    assert.equal(result.failed_jobs,0);
    assert.deepEqual(sent.map(item=>item.type),["health","order"]);
    const suppressed=saved.find(item=>item.table === "admin_push_jobs" && item.id === "old-ai");
    assert.equal(suppressed.fields.status,"failed");
    assert.equal(suppressed.fields.error_message,"suppressed_optional_ai_connection_disabled");
    assert.equal(suppressed.fields.sent_at,undefined);
  } finally {delete global.__panelPushCapture;}
});
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
  const detail = "returns senkronunda veri kaynağı yenilenemedi.";
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
