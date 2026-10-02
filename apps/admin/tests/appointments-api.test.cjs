// Real route handlers with only auth/database transport replaced. Database
// constraints, roles and triggers are tested by supabase/tests/business_appointments.sql.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..'),ts=require(path.join(root,'node_modules/typescript')),nodeRequire=require('node:module').createRequire(path.join(root,'package.json'));
const {NextResponse}=nodeRequire('next/server');
let authorised=true,calls=[],dbResult={data:null,error:null},rpcResult={data:null,error:null};
const db={from(table){calls.push(['from',table]);const chain={};for(const name of ['select','update','eq','order','range','or','maybeSingle','single'])chain[name]=(...args)=>{calls.push([name,...args]);return chain;};chain.then=(resolve,reject)=>Promise.resolve(dbResult).then(resolve,reject);return chain;},rpc(name,args){calls.push(['rpc',name,args]);return Promise.resolve(rpcResult);}};
const modules=new Map();
function load(file){if(modules.has(file))return modules.get(file).exports;const module={exports:{}};modules.set(file,module);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const req=name=>{if(name==='@/lib/auth')return{requireAdmin:async()=>authorised?{supabase:db,profile:{id:'01234567-1234-4123-8123-123456789abc'},internal:false}:{error:NextResponse.json({ok:false,error:'Unauthorized'},{status:401})}};if(name==='@/lib/supabaseAdmin')return{getSupabaseAdmin:()=>db};if(name.startsWith('@ruth-commerce/commerce-core/'))return load(path.join(root,'packages/commerce-core/src',name.split('/').at(-1)+'.ts'));if(name.startsWith('@/lib/'))return load(path.join(file.includes('/storefront/')?root+'/apps/storefront/src/lib':root+'/apps/admin/src/lib',name.split('/').at(-1)+'.ts'));if(name.endsWith('.ts'))return load(path.resolve(path.dirname(file),name));return nodeRequire(name);};vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(req,module,module.exports);return module.exports;
}
const collection=load(root+'/apps/admin/src/app/api/appointments/route.ts'),detail=load(root+'/apps/admin/src/app/api/appointments/[id]/route.ts'),publicRoute=load(root+'/apps/storefront/src/app/api/business-inquiry/route.ts');
const id='01234567-1234-4123-8123-123456789abc';
const inquiry={context:'studio',businessName:'Test Kafe',contactName:'Test Yetkili',email:'test@example.invalid',phone:'+905555555555',businessType:'Kafe',city:'İstanbul',website:'',needs:'Kahve programını birlikte kurmak istiyoruz.',services:['Kahve Programı'],monthlyKg:'',usage:'',cupping:false,date:'2090-10-10',time:'11:00 - 12:00',meeting:'online',address:''};
const row={id,inquiry,scheduled_date:inquiry.date,scheduled_time:inquiry.time,meeting:inquiry.meeting,address:'',status:'pending',admin_notes:'',revision:1};
const request=(method,body,url='/api/appointments')=>new Request('https://admin.test'+url,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const ctx={params:Promise.resolve({id})};
test.beforeEach(()=>{authorised=true;calls=[];dbResult={data:row,error:null};rpcResult={data:id,error:null};});
test('all panel handlers require admin auth before any database call',async()=>{authorised=false;for(const [handler,req,context]of [[collection.GET,request('GET')],[collection.POST,request('POST',{})],[detail.GET,request('GET'),ctx],[detail.PATCH,request('PATCH',{}),ctx]]){const response=await handler(req,context);assert.equal(response.status,401);}assert.deepEqual(calls,[]);});
test('manual creation validates fields and fixes the source and author on the server',async()=>{
 let response=await collection.POST(request('POST',{requestKey:id,inquiry:{...inquiry,needs:''},status:'confirmed',admin_notes:''}));assert.equal(response.status,400);assert.deepEqual(calls,[]);
 response=await collection.POST(request('POST',{requestKey:id,inquiry,status:'confirmed',admin_notes:'Hazırlık',source:'storefront',created_by:'attacker'}));assert.equal(response.status,201);
 const [,name,args]=calls.find(c=>c[0]==='rpc');assert.equal(name,'submit_business_appointment');assert.equal(args.p_source,'manual');assert.equal(args.p_created_by,id);assert.equal(args.p_status,'confirmed');
});
test('detail updates use optimistic revisions and never accept private/source mutations',async()=>{
 const update={scheduled_date:inquiry.date,scheduled_time:inquiry.time,meeting:'online',address:'',status:'confirmed',admin_notes:'Test notu',revision:1,source:'manual',inquiry:{email:'attacker@example.invalid'},created_by:'attacker'};
 const response=await detail.PATCH(request('PATCH',update),ctx);assert.equal(response.status,200);assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='revision'&&c[2]===1));
 const fields=calls.find(c=>c[0]==='update')[1];assert.deepEqual(Object.keys(fields).sort(),['address','admin_notes','meeting','scheduled_date','scheduled_time','status'].sort());
});
test('invalid schedule, face-to-face address and unknown status fail before writing',async()=>{
 for(const changes of [{scheduled_date:'2026-02-30'},{scheduled_time:'10:00 - 11:00'},{meeting:'in_person',address:''},{status:'deleted'}]){calls=[];const response=await detail.PATCH(request('PATCH',{...row,...changes}),ctx);assert.equal(response.status,400);assert.ok(!calls.some(c=>c[0]==='update'));}
});
test('concurrent edits and confirmed-slot conflicts return 409 instead of success',async()=>{
 dbResult={data:row,error:null};const originalFrom=db.from;let count=0;db.from=function(table){const chain=originalFrom(table);if(++count===2)chain.then=(resolve,reject)=>Promise.resolve({data:null,error:null}).then(resolve,reject);return chain;};
 let r=await detail.PATCH(request('PATCH',{...row}),ctx);assert.equal(r.status,409);db.from=originalFrom;
 rpcResult={data:null,error:{code:'23505'}};r=await collection.POST(request('POST',{requestKey:id,inquiry,status:'confirmed',admin_notes:''}));assert.equal(r.status,409);
});
test('public submissions persist both contexts and never trust a client-supplied status',async()=>{
 for(const context of ['studio','wholesale']){calls=[];const data={...inquiry,context,requestKey:id,status:'confirmed',source:'manual',monthlyKg:'25',usage:'Espresso'};const response=await publicRoute.POST(request('POST',data,'/api/business-inquiry'));assert.equal(response.status,201);const args=calls.find(c=>c[0]==='rpc')[2];assert.equal(args.p_inquiry.context,context);assert.equal(args.p_request_key,id);assert.equal(args.p_ip_hash.length,64);assert.ok(!('p_status'in args));assert.ok(!('p_source'in args));const result=await response.json();assert.equal(result.appointmentId,id);}
});
test('public persistence failure, rate limit and mismatched retry are never reported as success',async()=>{
 for(const [error,status]of [[{message:'Database unavailable'},503],[{message:'appointment_rate_limited'},429],[{message:'appointment_request_mismatch'},409]]){rpcResult={data:null,error};const response=await publicRoute.POST(request('POST',{...inquiry,requestKey:id}));assert.equal(response.status,status);assert.equal((await response.json()).ok,false);}
});
test('invalid and oversized public requests do not reach the database',async()=>{
 let response=await publicRoute.POST(request('POST',{...inquiry,requestKey:'not-an-id'}));assert.equal(response.status,400);
 response=await publicRoute.POST(request('POST',{...inquiry,needs:'x'.repeat(25000)}));assert.equal(response.status,413);assert.deepEqual(calls,[]);
});
test('notification deep links select ROSTA and survive the login redirect without weakening auth',()=>{
 const runtime=load(root+'/apps/admin/src/lib/rrHubRuntime.ts'),storage=new Map();
 global.window={location:{pathname:'/appointments',search:'?appointment='+id},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},navigator:{},matchMedia:()=>({matches:false})};
 try{runtime.prepareRRHubWorkspaceForDocument();assert.equal(storage.get(runtime.ROSTA_ENTERED_KEY),'1');assert.equal(runtime.rostaLoginPath(),'/login?appointment='+id);storage.clear();window.location.pathname='/login';assert.equal(runtime.rostaLoginDestination(),'/appointments?appointment='+id);assert.equal(storage.get(runtime.ROSTA_ENTERED_KEY),'1');window.location.search='?appointment=https://attacker.invalid';assert.equal(runtime.rostaLoginDestination(),'/profiles');window.location.pathname='/orders';assert.equal(runtime.rostaLoginPath(),'/login');}
 finally{delete global.window;}
});
test('the existing service worker displays appointment pushes and opens the exact detail',async()=>{
 const handlers={},shown=[],opened=[];let windows=[];
 const self={addEventListener:(type,fn)=>handlers[type]=fn,location:{origin:'https://admin.test'},clients:{matchAll:async()=>windows,openWindow:async url=>opened.push(url)},registration:{showNotification:async(title,options)=>shown.push({title,options})}};
 vm.runInNewContext(fs.readFileSync(root+'/apps/admin/public/push-sw.js','utf8'),{self,URL});
 let waited;const payload={type:'appointment',title:'Yeni randevu talebi',body:'Test Kafe',url:'/appointments?appointment='+id,tag:'rosta-appointment-'+id};
 handlers.push({data:{json:()=>payload},waitUntil:p=>waited=p});await waited;assert.equal(shown[0].options.data.type,'appointment');assert.equal(shown[0].options.tag,payload.tag);
 handlers.notificationclick({action:'open',notification:{close(){},data:{url:payload.url}},waitUntil:p=>waited=p});await waited;assert.equal(opened[0],'https://admin.test'+payload.url);
 const messages=[],navigated=[];let focused=false;windows=[{postMessage:m=>messages.push(m),navigate:async url=>navigated.push(url),focus:async()=>focused=true}];
 handlers.push({data:{json:()=>payload},waitUntil:p=>waited=p});await waited;assert.equal(messages[0].kind,'ruth-push');assert.equal(messages[0].payload.type,'appointment');
 handlers.notificationclick({action:'open',notification:{close(){},data:{url:payload.url}},waitUntil:p=>waited=p});await waited;assert.equal(navigated[0],'https://admin.test'+payload.url);assert.ok(focused);
});
