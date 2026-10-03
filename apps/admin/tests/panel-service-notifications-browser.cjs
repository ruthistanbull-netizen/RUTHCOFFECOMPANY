// Protected endpoints use fixtures. This exercises the production notification UI without writing customer data.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const baseOrigin=process.env.TEST_ADMIN_ORIGIN||'http://localhost:3050';
(async()=>{
 const remote=baseOrigin.startsWith('https:');
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox'],...(remote?{proxy:{server:process.env.HTTPS_PROXY||'http://proxy:8080'}}:{})});
 try{
  for(const [origin,prefix,brand] of [[baseOrigin, 'rosta', 'ROSTA Coffee']])for(const width of [390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:950},hasTouch:true,isMobile:width===390,reducedMotion:width===768?'reduce':'no-preference'});
   await context.addInitScript(({prefix})=>{
    sessionStorage.setItem('rosta_panel_hub_entered_v1','1');
    sessionStorage.setItem(prefix+'_admin_auth_session_v1',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJleHAiOjQwMDAwMDAwMDAsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.fixture',refresh_token:'fixture',expires_at:Date.now()/1000+3600,user:{id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.invalid'}}));
    localStorage.setItem('ruth_exact_notification_history_v1',JSON.stringify([{id:prefix+'-health-sync-returns',kind:'default',title:'Ruth Panel servis uyarısı',body:'Recorded return-shipping warning',url:'/system',createdAt:Date.now()-120000,read:false},{id:prefix+'-health-daily-backup',kind:'default',title:'Supabase yedeğini indir',body:'Recorded daily backup reminder',url:'/system',createdAt:Date.now()-3600000,read:true}]));
   },{prefix});
   await context.route('**/api/**',async route=>{
    const url=new URL(route.request().url());let data={ok:true};
    if(url.pathname==='/api/me')data={ok:true,user:{id:'00000000-0000-4000-8000-000000000001'},profile:{role:'admin',full_name:'Fixture'}};
    if(url.pathname==='/api/summary')data={ok:true,summary:{orders:0,revenue:0,sessions:21,carts:0,returns:0,appointments:0,conversionRate:0},recentOrders:[],operationCounts:{}};
    if(url.pathname.startsWith('/api/commerce-core'))data={ok:true,cores:[],summary:{healthy:0,warning:0,failed:0}};
    if(url.pathname==='/api/push/subscriptions')data={ok:true,subscriptions:[]};
    if(url.pathname==='/api/push/config')data={ok:true,vapidPublicKey:'fixture'};
    if(url.pathname==='/api/instant-data')data={ok:true,snapshots:[],snapshot:null};
    await route.fulfill({json:data});
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/notifications',{waitUntil:'domcontentloaded'});
   const bell=page.getByRole('button',{name:'Bildirimler',exact:true}).filter({visible:true}).first();await bell.waitFor();
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('button[aria-label="Bildirimler"]')).some(el=>Object.keys(el).some(k=>k.startsWith('__reactProps$'))));
   await bell.tap();const panel=page.getByRole('dialog',{name:'Bildirimler',exact:true});await panel.waitFor();
   await panel.getByText(brand+' servis uyarısı',{exact:true}).waitFor();
   assert.equal(await panel.getByText('Ruth Panel servis uyarısı',{exact:true}).count(),0);
   await panel.getByText('Supabase yedeğini indir',{exact:true}).waitFor();
   await panel.getByRole('button',{name:'Tümünü oku',exact:true}).tap();
   assert.equal(await panel.getByRole('button',{name:'Tümünü oku',exact:true}).count(),0);
   let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ruth_exact_notification_history_v1')));
   assert.equal(stored[0].title,brand+' servis uyarısı');assert.ok(stored.every(row=>row.read));assert.equal(stored[0].kind,'health');
   await page.evaluate(prefix=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{kind:'ruth-push',payload:{type:'health',tag:prefix+'-health-core-assistant',title:'Ruth Panel servis uyarısı',body:'OpenAI provider requires configuration',url:'/system'}}})),prefix);
   await panel.getByText('OpenAI provider requires configuration',{exact:true}).waitFor();
   stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ruth_exact_notification_history_v1')));
   assert.equal(stored[0].title,brand+' servis uyarısı');assert.equal(stored[0].read,false);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:'/workspace/'+prefix+'-service-notifications-'+width+(remote?'-live':'')+'.png'});
   await panel.getByRole('button',{name:'Kapat',exact:true}).tap();await panel.waitFor({state:'hidden'});
   await bell.tap();await panel.waitFor();await panel.getByRole('button',{name:'Temizle',exact:true}).tap();
   await panel.getByText('Henüz bildirim yok',{exact:false}).waitFor();
   assert.deepEqual(errors,[]);console.log(JSON.stringify({origin,width,oldHistoryCorrected:true,liveEventCorrected:true,markRead:true,clear:true,noOverflow:true,noBrowserErrors:true}));
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
