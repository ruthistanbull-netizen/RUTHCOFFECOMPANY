const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..');
const nodeRequire=require('node:module').createRequire(path.join(root,'package.json'));
const ts=nodeRequire('typescript'),{NextResponse}=nodeRequire('next/server');
let authorised=true,appointmentError=null,calls=[];
const db={
 from(table){
  const call={table,steps:[]};calls.push(call);const chain={};
  for(const name of ['select','eq','in','not','order','limit','gte','lt']) chain[name]=(...args)=>{call.steps.push([name,...args]);return chain;};
  chain.then=(resolve,reject)=>Promise.resolve({data:[],count:table==='business_appointments'?7:0,error:table==='business_appointments'?appointmentError:null}).then(resolve,reject);
  return chain;
 },
 rpc:async()=>({data:[{total_sessions:0,cart_sessions:0,checkout_sessions:0}],error:null})
};
function load(file){
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const req=name=>{
  if(name==='@/lib/auth')return{requireAdmin:async()=>authorised?{supabase:db}:{error:NextResponse.json({ok:false},{status:401})}};
  if(name==='@/lib/ranges')return load(root+'/apps/admin/src/lib/ranges.ts');
  if(name==='@/lib/statusLabels')return{isHistoricalImportedOrder:()=>false,normalizeOrderStatus:value=>value};
  return nodeRequire(name);
 };
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(req,module,module.exports);
 return module.exports;
}
const {GET}=load(root+'/apps/admin/src/app/api/summary/route.ts');
const {getDateRange}=load(root+'/apps/admin/src/lib/ranges.ts');
test.beforeEach(()=>{authorised=true;appointmentError=null;calls=[];});
test('dashboard appointment count requires authentication before reading any table',async()=>{
 authorised=false;const response=await GET(new Request('https://panel.test/api/summary?range=today'));
 assert.equal(response.status,401);assert.deepEqual(calls,[]);
});
test('dashboard counts actual appointments in the selected date range alongside existing returns',async()=>{
 for(const range of ['today','this_month','all']){
  calls=[];
  const response=await GET(new Request('https://panel.test/api/summary?range='+range));
  assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.summary.appointments,7);assert.equal(result.summary.returns,0);
  const appointments=calls.filter(row=>row.table==='business_appointments');assert.equal(appointments.length,1);
  const {steps}=appointments[0];assert.deepEqual(steps[0],['select','id',{count:'exact',head:true}]);
  const bounds=getDateRange(range);
  for(const [method,bound]of [['gte',bounds.from],['lt',bounds.to]]){
   const step=steps.find(row=>row[0]===method);
   if(bound)assert.deepEqual(step,[method,'created_at',bound.toISOString()]);else assert.equal(step,undefined);
  }
 }
});
test('appointment count failures are reported through the existing data-quality contract',async()=>{
 appointmentError={message:'Temporary count failure'};
 const response=await GET(new Request('https://panel.test/api/summary?range=all'));
 const result=await response.json();assert.equal(response.status,200);
 assert.ok(result.dataQuality.warnings.includes('Randevu talepleri: Temporary count failure'));
 assert.equal(result.summary.appointments,0);
});
