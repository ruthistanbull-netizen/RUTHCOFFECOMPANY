// Run against the production admin server: TEST_ADMIN_ORIGIN=http://localhost:3050 node apps/admin/tests/appointment-detail-browser.cjs
// API responses are isolated fixtures; this never creates or edits real customer data.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin=process.env.TEST_ADMIN_ORIGIN||'http://localhost:3050';
const id='01234567-1234-4123-8123-123456789abc';
const wholesaleId='01234567-1234-4123-8123-123456789abd';
const manualId='01234567-1234-4123-8123-123456789abe';
const inquiry={context:'studio',businessName:'Test Studio Kafe',contactName:'Studio Yetkili',email:'studio@example.invalid',phone:'+90 555 555 5555',businessType:'Kafe',city:'İstanbul',website:'@teststudio',needs:'Kahve programı ve bar kurulumu planlamak istiyoruz.',services:['Kahve Programı','Bar Kurulumu'],monthlyKg:'',usage:'',cupping:false,date:'2090-10-07',time:'11:00 - 12:00',meeting:'online',address:''};
const row=(data,rowId,source='storefront',status='pending')=>({id:rowId,source,context:data.context,inquiry:data,business_name:data.businessName,contact_name:data.contactName,scheduled_date:data.date,scheduled_time:data.time,meeting:data.meeting,address:data.address,status,admin_notes:'',revision:1,created_at:'2026-10-02T09:00:00Z',updated_at:'2026-10-02T09:00:00Z'});
async function fixture(ctx){
 await ctx.addInitScript(()=>{
  localStorage.setItem('ruth_exact_dark','1');sessionStorage.setItem('rosta_panel_hub_entered_v1','1');
  sessionStorage.setItem('rosta_admin_auth_session_v1',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJleHAiOjQwMDAwMDAwMDAsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.invalid'}}));
 });
 const state={rows:[row(inquiry,id),row({...inquiry,context:'wholesale',businessName:'Test Toptan Otel',contactName:'Toptan Yetkili',services:[],monthlyKg:'40',usage:'Her ikisi',cupping:true,meeting:'in_person',address:'İstanbul Kadıköy, Test Sokak 10'},wholesaleId)],patches:[],posts:[],conflict:false,reads:0};
 for(let n=0;n<15;n++)state.rows.push(row({...inquiry,businessName:'Diğer İşletme '+n},'11234567-1234-4123-8123-'+String(n).padStart(12,'0')));
 await ctx.route(origin+'/api/**',async route=>{
  const req=route.request(),u=new URL(req.url()),method=req.method();let json={ok:true};
  if(u.pathname==='/api/appointments'&&method==='GET'){
   const q=(u.searchParams.get('q')||'').toLocaleLowerCase('tr-TR'),status=u.searchParams.get('status'),context=u.searchParams.get('context');
   const filtered=state.rows.filter(r=>(status==='all'||status===r.status)&&(context==='all'||context===r.context)&&(!q||r.business_name.toLocaleLowerCase('tr-TR').includes(q)||r.contact_name.toLocaleLowerCase('tr-TR').includes(q)));
   json={ok:true,appointments:filtered,total:filtered.length,counts:{total:state.rows.length,pending:state.rows.filter(r=>r.status==='pending').length,confirmed:state.rows.filter(r=>r.status==='confirmed').length,today:0}};
  }else if(u.pathname==='/api/appointments'&&method==='POST'){
   const body=req.postDataJSON();state.posts.push(body);const saved=row(body.inquiry,manualId,'manual',body.status);saved.admin_notes=body.admin_notes;state.rows.unshift(saved);json={ok:true,appointment:saved};
  }else if(u.pathname.startsWith('/api/appointments/')){
   const rowId=u.pathname.split('/').at(-1);let selected=state.rows.find(r=>r.id===rowId);
   if(!selected)return route.fulfill({status:404,json:{ok:false,error:'Randevu bulunamadı.'}});
   if(method==='PATCH'){
    const body=req.postDataJSON();state.patches.push(body);
    if(state.conflict)return route.fulfill({status:409,json:{ok:false,error:'Randevu başka bir kullanıcı tarafından değiştirildi. Güncel kaydı yenileyin.'}});
    selected={...selected,...body,revision:selected.revision+1};state.rows=state.rows.map(r=>r.id===rowId?selected:r);
   }else state.reads++;
   json={ok:true,appointment:selected};
  }else if(u.pathname==='/api/summary')json={ok:true,summary:{orders:3,paidOrders:3,revenue:1000,sessions:200,carts:20,checkoutReached:10,returns:2,appointments:7,products:1,conversionRate:1.5,conversion:{cartRate:10,checkoutRate:5,purchaseRate:1.5,carts:20,checkoutReached:10,paidOrders:3,sessions:200}},recentOrders:[],operationCounts:{},openReturns:2};
  else if(u.pathname==='/api/dashboard/catalog-counts')json={ok:true,counts:{products:1,variants:3},products:1,variants:3};
  else if(u.pathname==='/api/dashboard/session-sources')json={ok:true,total:200,sources:[]};
  else if(u.pathname==='/api/dashboard/chart')json={ok:true,series:[]};
  return route.fulfill({json});
 });
 return state;
}
const detail=page=>page.locator('[data-exact-base44-page="appointment-detail"]');
async function readyDetail(page,name){await detail(page).getByRole('heading',{name,exact:true}).waitFor();await detail(page).getByLabel('Panel notu',{exact:true}).waitFor();}
const noOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
async function choose(page,container,label,value){await container.getByRole('button',{name:new RegExp('^'+label+':')}).tap();await page.getByRole('option',{name:value,exact:true}).tap();}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{for(const width of [1440,768,390]){
  const ctx=await browser.newContext({viewport:{width,height:950},isMobile:width<640,hasTouch:true,reducedMotion:width===768?'reduce':'no-preference'});
  const state=await fixture(ctx),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>{errors.push(e.message);console.error(JSON.stringify({browserError:e.message,url:p.url(),stack:e.stack}));});
  await p.goto(origin+'/appointments',{waitUntil:'domcontentloaded'});await p.getByRole('heading',{name:'Randevular',exact:true}).waitFor();
  const target=p.getByText('Test Studio Kafe',{exact:true}).filter({visible:true}).first();await target.waitFor();
  if(width<640){
   await target.scrollIntoViewIfNeeded();const box=await target.boundingBox(),cdp=await ctx.newCDPSession(p);
   const before=await p.evaluate(()=>window.scrollY);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+10,y:box.y+8}]});
   for(let n=1;n<=7;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+10,y:box.y+8-n*22}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await p.waitForFunction(previous=>window.scrollY>previous,before);
   assert.equal(new URL(p.url()).pathname,'/appointments','scrolling a row does not open its detail');
  }
  await p.getByPlaceholder('İşletme veya yetkili ara…').fill('Studio');
  await p.waitForURL(url=>url.searchParams.get('q')==='Studio');await target.tap();
  await p.waitForURL(url=>url.pathname==='/appointments/'+id);await readyDetail(p,'Test Studio Kafe');
  assert.equal(await p.getByRole('dialog').count(),0,'the request is a full page, not a popup');
  assert.match(await detail(p).innerText(),/Kahve Programı/);assert.ok(await noOverflow(p));
  await detail(p).getByLabel('Panel notu',{exact:true}).fill('Görüşme hazırlığı yapılacak.');
  await detail(p).getByRole('button',{name:'Randevulara dön',exact:true}).tap();
  const dirtyDialog=p.getByRole('alertdialog');await dirtyDialog.getByRole('button',{name:'Düzenlemeye devam et',exact:true}).tap();
  assert.equal(await detail(p).getByLabel('Panel notu',{exact:true}).inputValue(),'Görüşme hazırlığı yapılacak.');
  await detail(p).getByRole('button',{name:'Kaydet',exact:true}).tap();await p.getByText('Randevu güncellendi.',{exact:true}).waitFor();
  assert.equal(state.patches[0].revision,1);assert.equal(state.patches[0].admin_notes,'Görüşme hazırlığı yapılacak.');
  await detail(p).getByRole('button',{name:'Randevulara dön',exact:true}).tap();await p.waitForURL(url=>url.pathname==='/appointments');
  await p.getByPlaceholder('İşletme veya yetkili ara…').waitFor();assert.equal(new URL(p.url()).searchParams.get('q'),'Studio');assert.equal(await p.getByPlaceholder('İşletme veya yetkili ara…').inputValue(),'Studio');
  await p.getByPlaceholder('İşletme veya yetkili ara…').fill('');await p.waitForURL(url=>!url.searchParams.has('q'));
  await p.getByText('Test Toptan Otel',{exact:true}).filter({visible:true}).first().tap();await readyDetail(p,'Test Toptan Otel');
  assert.match(await detail(p).innerText(),/40 kg \/ ay/);assert.match(await detail(p).innerText(),/Cupping: İsteniyor/);
  assert.match(await detail(p).getByLabel('Görüşme adresi',{exact:true}).inputValue(),/Kadıköy/);
  state.conflict=true;await detail(p).getByLabel('Panel notu',{exact:true}).fill('Çakışmada korunacak not');await detail(p).getByRole('button',{name:'Kaydet',exact:true}).tap();
  await p.getByRole('alert').filter({hasText:'başka bir kullanıcı'}).first().waitFor();assert.equal(await detail(p).getByLabel('Panel notu',{exact:true}).inputValue(),'Çakışmada korunacak not');
  await detail(p).getByRole('button',{name:'Değişiklikleri geri al',exact:true}).tap();state.conflict=false;
  await p.goBack();await p.getByRole('heading',{name:'Randevular',exact:true}).waitFor();await p.goForward();await readyDetail(p,'Test Toptan Otel');
  await detail(p).getByRole('button',{name:'Randevulara dön',exact:true}).tap();await p.getByRole('heading',{name:'Randevular',exact:true}).waitFor();
  await p.getByRole('button',{name:'Manuel randevu',exact:true}).tap();const modal=p.getByRole('dialog');await modal.getByRole('heading',{name:'Manuel randevu',exact:true}).waitFor();
  await choose(p,modal,'Görüşme konusu','Toptan Kahve');
  for(const [label,value]of [['İşletme adı','Manuel Test İşletme'],['Yetkili adı','Manuel Yetkili'],['E-posta','manual@example.invalid'],['Telefon','+90 555 555 5555'],['Şehir / İlçe','İstanbul Kadıköy'],['İhtiyaçlar','Aylık kahve tedariki için görüşmek istiyoruz.'],['Aylık kahve ihtiyacı (kg)','25']])await modal.getByLabel(label,{exact:true}).fill(value);
  await choose(p,modal,'İşletme türü','Restoran');await choose(p,modal,'Kullanım alanı','Espresso');await modal.getByLabel('Randevu tarihi',{exact:true}).fill('2090-10-08');await choose(p,modal,'Randevu saati','15:00 - 16:00');await choose(p,modal,'Görüşme türü','Yüz yüze');await modal.getByLabel('Görüşme adresi',{exact:true}).fill('İstanbul Kadıköy, Test Sokak 25');
  await modal.getByRole('button',{name:'Randevu oluştur',exact:true}).tap();await readyDetail(p,'Manuel Test İşletme');
  assert.equal(new URL(p.url()).pathname,'/appointments/'+manualId);assert.equal(state.posts.length,1);assert.equal(state.posts[0].status,'confirmed');assert.equal(state.posts[0].inquiry.time,'15:00 - 16:00');assert.match(state.posts[0].requestKey,/^[a-f0-9-]{36}$/);assert.ok(await noOverflow(p));
  await p.goto(origin+'/appointments?appointment='+id+'&context=studio',{waitUntil:'domcontentloaded'});await readyDetail(p,'Test Studio Kafe');assert.equal(new URL(p.url()).pathname,'/appointments/'+id);assert.equal(new URL(p.url()).searchParams.get('context'),'studio');
  await p.goto(origin+'/appointments/01234567-1234-4123-8123-123456789aff');await p.getByRole('alert').filter({hasText:'Randevu bulunamadı'}).waitFor();assert.equal(await p.getByRole('button',{name:'Kaydet',exact:true}).count(),0);await p.getByRole('button',{name:'Randevulara dön',exact:true}).tap();await p.getByRole('heading',{name:'Randevular',exact:true}).waitFor();
  await p.goto(origin+'/dashboard',{waitUntil:'domcontentloaded'});
  const appointments=p.getByRole('button',{name:'Randevuları aç',exact:true}),conversion=p.getByRole('button',{name:'Dönüşüm detayını aç',exact:true}),returns=p.getByRole('button',{name:'İadeleri aç',exact:true});await appointments.waitFor();await conversion.waitFor();
  assert.match(await appointments.innerText(),/7/);assert.match(await returns.innerText(),/2/);
  const a=await appointments.boundingBox(),c=await conversion.boundingBox(),b=await returns.boundingBox();
  assert.ok(a.y<c.y);assert.ok(b.x>c.x);assert.ok(Math.abs(b.y-c.y)<2);assert.ok(Math.abs(b.width-c.width)<2);
  await conversion.tap();await p.getByText('Sepete ekleme',{exact:true}).waitFor();assert.ok(await noOverflow(p));
  assert.ok(await p.getByRole('button',{name:'Dönüşüm detayını kapat',exact:true}).evaluate(el=>el.scrollWidth<=el.clientWidth+1),'expanded half-width conversion stays inside its card');
  const dock=p.locator('[data-ruthie-orb-dock]');
  await dock.locator('[data-ruthie-orb-portal] button[data-phase]').waitFor();
  assert.equal(await p.locator('[data-ruthie-orb-portal]').count(),1,'one stable host owns the orb');
  await appointments.tap();await p.getByRole('heading',{name:'Randevular',exact:true}).waitFor();
  await p.waitForFunction(()=>!document.querySelector('[data-ruthie-orb-portal]'));
  await p.goBack();await p.getByRole('button',{name:'Randevuları aç',exact:true}).waitFor();
  await p.locator('[data-ruthie-orb-dock] [data-ruthie-orb-portal] button[data-phase]').waitFor();
  assert.equal(await p.locator('[data-ruthie-orb-portal]').count(),1);
  await p.goForward();await p.getByRole('heading',{name:'Randevular',exact:true}).waitFor();
  await p.waitForFunction(()=>!document.querySelector('[data-ruthie-orb-portal]'));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({width,fullPageDetails:true,browserBackForward:true,searchRetained:true,dirtyExitProtected:true,saveAndConflict:true,manualCreation:true,legacyNotificationRedirect:true,notFound:true,dashboardLayoutAndCounts:true,noOverflow:true}));
  await ctx.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
