// Isolated API/session fixtures only. Build with non-secret fixture public URL/key; never run against production.
const {spawn}=require('node:child_process');const fs=require('fs');const assert=require('assert/strict');
const {chromium}=require('@playwright/test');
const root=process.cwd();
const brand=process.env.FINANCE_TEST_BRAND || 'rosta';
(async()=>{
 const server=spawn(process.execPath,[root+'/node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3124'],{cwd:root+'/apps/admin',stdio:['ignore','pipe','pipe']});let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
 let browser;try{
 await new Promise((resolve,reject)=>{const timer=setInterval(()=>{if(logs.includes('Ready')){clearInterval(timer);resolve();}if(logs.includes('Error:')){clearInterval(timer);reject(new Error(logs));}},100);setTimeout(()=>{clearInterval(timer);reject(new Error(logs));},10000).unref();});
 let connected=false;for(let i=0;i<50;i++){try{await fetch('http://127.0.0.1:3124/finance');connected=true;break}catch{}await new Promise(r=>setTimeout(r,200));}if(!connected)throw new Error('Server not reachable: '+logs);
 const launchOptions={headless:true};
 if(process.env.FINANCE_TEST_BROWSER_PATH){launchOptions.executablePath=process.env.FINANCE_TEST_BROWSER_PATH;launchOptions.args=['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--disable-gpu','--disable-software-rasterizer'];}

 const metrics={net_sales:'1000.00',cogs:'200.00',gross_profit:'800.00',operating_expenses:'100.00',operating_profit:'700.00',period_result:'700.00',margin:'70',cash_in:'1200.00',cash_out:'100.00',net_cash:'1100.00',unpaid:'0.00',receivables:'0.00',missing_costs:0,refund_review:0,gross_sales:'1200.00',discounts:'0.00',refunds:'0.00',taxes:'0',financing:'0'};
 const setup={ok:true,settings:{brand,recognition:'paid'},categories:[{id:'00000000-0000-0000-0000-000000000010',name:'Yazılım'}],accounts:[],recurring:[],permissions:['*']};
 for(const width of [390,768,1440]){
 browser=await chromium.launch(launchOptions);
 const context=await browser.newContext({viewport:{width,height:900}});
 await context.addInitScript((brand)=>{sessionStorage.setItem(brand+'_panel_hub_entered_v1','1');sessionStorage.setItem('rr_hub_document_ready_v1','1');sessionStorage.setItem(brand+'_admin_auth_session_v1',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJleHAiOjQwMDAwMDAwMDAsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.fixture',refresh_token:'fixture',expires_at:4000000000,user:{id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.invalid',app_metadata:{panel_role:'owner',panel_status:'active'}}}));},brand);
 await context.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;let data={ok:true,items:[],orders:[],products:[],customers:[],carts:[],categories:[],collections:[],variants:[],returns:[],total:0,count:0};if(path==='/api/me')data={ok:true,user:{id:'fixture',app_metadata:{panel_role:'owner',panel_status:'active'}},profile:{role:'admin',full_name:'Fixture'}};if(path==='/api/finance/setup')data=setup;if(path==='/api/finance/overview')data={ok:true,report:{current:metrics,previous:metrics,series:[{date:'2026-10-18',values:metrics}],monthly:[{date:'2026-10-01',values:metrics}],categories:[],channels:[],products:[],product_groups:[],budgets:[],accounts:[]}};if(path==='/api/finance/records')data={ok:true,records:[],count:0};if(path==='/api/finance/bank')data={ok:true,rows:[]};await route.fulfill({json:data});});
 const page=await context.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3124/finance',{waitUntil:'domcontentloaded'});await page.locator('.ruth-page-header h1').waitFor({timeout:12000}).catch(async e=>{await page.screenshot({path:'/tmp/finance-debug.png',fullPage:true});throw new Error(e.message+' URL='+page.url()+' BODY='+(await page.locator('body').innerText()).slice(0,1800)+' ERRORS='+JSON.stringify(errors));});
 await page.getByText('Net satış geliri',{exact:true}).first().waitFor();await page.screenshot({path:`/tmp/finance-overview-${width}.png`,fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'overview overflow '+width);
 await page.goto('http://127.0.0.1:3124/finance/records',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Gider Ekle',exact:true}).click();
 await page.getByRole('dialog',{name:'Gider Ekle',exact:true}).waitFor();await page.getByLabel('İşlem adı',{exact:true}).fill('Sunucu');await page.getByLabel('Tutar',{exact:true}).fill('1500');
 await page.screenshot({path:`/tmp/finance-form-${width}.png`,fullPage:true});
 await page.getByRole('dialog',{name:'Gider Ekle',exact:true}).getByRole('button',{name:'Vazgeç',exact:true}).click();await page.getByRole('alertdialog',{name:'Değişiklikler silinsin mi?'}).waitFor();
 await page.getByRole('button',{name:'Değişiklikleri sil',exact:true}).click();await page.getByRole('dialog',{name:'Gider Ekle',exact:true}).waitFor({state:'hidden'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'records overflow '+width);
 assert.deepEqual(errors,[]);console.log('UI passed',width,'overview, records, drawer, inputs, dirty-dismiss, overflow, page errors');await context.close();await browser.close();browser=undefined;
 }
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e.message);process.exitCode=1});
