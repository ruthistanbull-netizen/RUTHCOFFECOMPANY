// Auth and API fixtures keep this UI regression test isolated from customer data and push delivery.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const site = require('../package.json').name.includes('rosta') ? 'rosta' : 'ruth';
const origin = process.env.TEST_ADMIN_ORIGIN || `http://localhost:${site === 'rosta' ? 3050 : 3051}`;
const remote = origin.startsWith('https:');
const routes = ['/account','/settings/users','/settings/integrations','/system','/settings/security','/settings/appearance'];
(async () => {
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox'],...(remote?{proxy:{server:process.env.HTTPS_PROXY||'http://proxy:8080'}}:{})});
 try {
  for(const width of [390,768,1440]) {
   const context=await browser.newContext({viewport:{width,height:950},isMobile:width===390,hasTouch:width===390,reducedMotion:width===768?'reduce':'no-preference'});
   await context.addInitScript(site=>{
    if(window!==window.top)return;
    sessionStorage.setItem('rosta_panel_hub_entered_v1','1');
    sessionStorage.setItem(site+'_admin_auth_session_v1',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJleHAiOjQwMDAwMDAwMDAsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.fixture',refresh_token:'fixture',expires_at:Date.now()/1000+3600,user:{id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.invalid'}}));
    window.__pushFixture={active:false,permission:'default',promptCalls:0};
    const state=window.__pushFixture;
    const subscription={endpoint:'https://push.example.invalid/'+site,toJSON:()=>({endpoint:'https://push.example.invalid/'+site,keys:{p256dh:'fixture',auth:'fixture'}}),unsubscribe:async()=>{state.active=false;return true;}};
    const registration={pushManager:{getSubscription:async()=>state.active?subscription:null,subscribe:async()=>{state.active=true;return subscription;}}};
    Object.defineProperty(window,'Notification',{configurable:true,value:class {static get permission(){return state.permission;}static async requestPermission(){state.promptCalls++;state.permission='granted';return state.permission;}}});
    Object.defineProperty(window,'PushManager',{configurable:true,value:class {}});
    Object.defineProperty(navigator.serviceWorker,'register',{configurable:true,value:async()=>registration});
    Object.defineProperty(navigator.serviceWorker,'ready',{configurable:true,value:Promise.resolve(registration)});
   },site);
   const mutations=[];
   await context.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url());let data={ok:true};
    if(!['GET','HEAD'].includes(request.method()))mutations.push({path:url.pathname,method:request.method(),body:request.postData()});
    if(url.pathname==='/api/me')data={ok:true,user:{id:'00000000-0000-4000-8000-000000000001'},profile:{role:'admin',full_name:'Fixture'}};
    if(url.pathname==='/api/account')data={ok:true,user:{id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.invalid'},profile:{role:'admin',full_name:'Fixture'},users:[]};
    if(url.pathname==='/api/push/config')data={ok:true,vapidPublicKey:'B'.repeat(87)};
    if(url.pathname==='/api/summary')data={ok:true,summary:{orders:0,revenue:0,sessions:0,carts:0,returns:0,conversionRate:0},recentOrders:[],operationCounts:{}};
    if(url.pathname==='/api/instant-data')data={ok:true,snapshots:[],snapshot:null};
    if(url.pathname==='/api/audit')data={ok:true,logs:[],items:[]};
    if(url.pathname==='/api/theme')data={ok:true,settings:{}};
    if(url.pathname==='/api/store-design-v2')data={ok:true,document:null};
    if(url.pathname.startsWith('/api/commerce-core'))data={ok:true,cores:[],summary:{healthy:0,warning:0,failed:0}};
    await route.fulfill({json:data});
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/settings',{waitUntil:'domcontentloaded',timeout:60000});
   const settings=page.locator('[data-exact-base44-page="settings"]');await settings.waitFor().catch(async error=>{console.error(JSON.stringify({url:page.url(),errors,body:(await page.locator('body').innerText()).slice(0,1500)}));throw error;});
   await settings.getByRole('heading',{name:'Ayarlar',exact:true,level:1}).waitFor();
   await settings.getByRole('heading',{name:'Bildirim ayarları',exact:true,level:2}).waitFor();
   assert.equal(await page.locator('[data-theme-editor-immersive-root], [data-store-design-v2-admin], [data-theme-customizer-v2]').count(),0,'settings must not mount a theme editor');
   assert.equal(await settings.locator('iframe').count(),0);
   const enable=settings.getByRole('button',{name:'Bildirimleri aç',exact:true});await enable.waitFor();await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Bildirimleri aç')&&!b.disabled));
   assert.equal(await page.evaluate(()=>window.__pushFixture.promptCalls),0,'opening settings must not request permission');
   if(width===1440){await enable.focus();await page.keyboard.press('Enter');}else await enable.click();
   const test=settings.getByRole('button',{name:'Test gönder',exact:true});await test.waitFor();assert.equal(await page.evaluate(()=>window.__pushFixture.promptCalls),1);
   await test.click();await page.getByRole('button',{name:'Devam et',exact:true}).click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Test gönder')&&!b.disabled));
   await settings.getByRole('button',{name:'Kapat',exact:true}).click();await page.getByRole('button',{name:'Devam et',exact:true}).click();await enable.waitFor();
   assert.equal(mutations.filter(x=>x.path==='/api/push/subscriptions'&&x.method==='POST').length,1);
   assert.equal(mutations.filter(x=>x.path==='/api/push/subscriptions'&&x.method==='DELETE').length,1);
   assert.equal(mutations.filter(x=>x.path==='/api/push/test').length,1);
   await page.mouse.move(0,0);
   await page.waitForFunction(()=>!document.querySelector('[aria-label="Bildirimler"] [role="status"], [aria-label="Toast bildirimleri"] [role="status"]'),null,{timeout:10000});
   const nav=settings.getByRole('navigation',{name:'Ayar bölümleri',exact:true});assert.equal(await nav.locator('a').count(),6);
   assert.deepEqual((await nav.locator('a').evaluateAll(es=>es.map(e=>e.getAttribute('href')))).sort(),[...routes].sort());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:`/workspace/${site}-settings-${width}${remote?'-live':''}.png`,fullPage:true});
   // Drag a settings link: normal scrolling must not activate navigation.
   if(width===390){
    const link=nav.locator('a').first();await link.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));const r=await link.boundingBox();const x=r.x+r.width/2,y=r.y+r.height/2;const before=await page.evaluate(()=>scrollY);const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*16}]});await page.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(180);
    assert.equal(new URL(page.url()).pathname,'/settings');assert.ok(await page.evaluate(()=>scrollY)>before,'dragging a link must scroll');
   }
   for(const path of routes){
    const destination=nav.locator(`a[href="${path}"]`);
    if(width===768){await destination.focus();await page.keyboard.press('Enter');}else{await page.mouse.move(0,0);await destination.click();}await page.waitForURL(url=>url.pathname===path);await page.locator('[data-exact-base44-page="settings"]').waitFor({state:'detached'});assert.equal(await page.locator('[data-theme-editor-immersive-root]').count(),0);
    await page.goBack({waitUntil:'domcontentloaded'});await settings.waitFor();await settings.getByRole('heading',{name:'Bildirim ayarları',exact:true}).waitFor();
   }
   await page.goto(origin+'/notifications',{waitUntil:'domcontentloaded'});await page.locator('[data-exact-base44-page="notifications"]').getByRole('heading',{name:'Bildirimler',exact:true}).waitFor();
   assert.equal(await page.locator('[data-theme-editor-immersive-root]').count(),0);
   // The canonical command palette uses the same Settings destination as panel menus.
   await page.keyboard.press('Control+k');
   const commands=page.getByRole('dialog',{name:'Komut paleti',exact:true});await commands.waitFor();
   await commands.getByPlaceholder('Sayfa ara veya komut çalıştır…').fill('Ayarlar');
   await commands.getByRole('button',{name:/^Ayarlar/}).first().click();
   await page.waitForURL(url=>url.pathname==='/settings');await settings.waitFor();
   assert.equal(await page.locator('[data-theme-editor-immersive-root]').count(),0);
   await page.goto(origin+'/theme',{waitUntil:'domcontentloaded'});await page.locator('[data-theme-editor-immersive-root]').waitFor();await page.locator('[data-store-design-v2-admin]').waitFor();
   assert.equal(await page.locator('[data-exact-base44-page="settings"]').count(),0);assert.deepEqual(errors,[]);
   console.log(JSON.stringify({site,origin,width,settingsInPanel:true,notificationActions:true,sixSettingsLinks:true,browserBack:true,themeSeparate:true,noHorizontalOverflow:true,noPageErrors:true}));await context.close();
  }
  const anonymous=await browser.newContext();const p=await anonymous.newPage();await p.goto(origin+'/settings',{waitUntil:'domcontentloaded'});assert.equal(await p.locator('[data-exact-base44-page="settings"]').count(),0,'settings remains protected by RequireAdmin');await anonymous.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
