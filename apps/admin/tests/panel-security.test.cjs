const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const lib = path.resolve(__dirname, '../src/lib');
function load(file, dependencies) {
  const source = readFileSync(path.join(lib, file + '.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = {exports: {}};
  new Function('require', 'module', 'exports', js.outputText)(name => dependencies[name] || require(name), module, module.exports);
  return module.exports;
}
const policy = load('adminPanelPolicy', {});
const NextResponse = { json: (body, init) => new Response(JSON.stringify(body), init) };

function fixture() {
  const state = { user: { id: 'user-1', email: 'staff@example.test', app_metadata: {panel_role: 'viewer', panel_status: 'active'} }, claims: {sub: 'user-1', app_metadata: {panel_role: 'owner'}}, fail: false, profileRole: 'admin', reads: 0 };
  const supabase = {
    auth: {getClaims: async () => ({data: {claims: state.claims}}), admin: {getUserById: async () => {
      state.reads++;
      if (state.fail) throw Error('unavailable');
      return state.user ? {data: {user: state.user}} : {data: {user: null}, error: {status:404}};
    }}},
    from: () => ({select: () => ({eq: () => ({maybeSingle: async () => ({data: {id:'profile-1', role:state.profileRole}})})})}),
  };
  const auth = load('auth', {
    'next/server': { NextResponse }, '@/lib/adminPanelPolicy': policy,
    '@/lib/adminContinuity': {readAdminContinuity: () => null}, '@/lib/supabaseAdmin': {getSupabaseAdmin: () => supabase},
  });
  const call = (path = '/api/me', method = 'GET') => auth.requireAdmin(new Request('https://panel.test'+path, {method, headers:{Authorization:'Bearer signed-token'}}));
  return {state, call};
}
test('user-editable metadata cannot create/restore a role or disable another authorization decision', () => {
  assert.equal(policy.panelRole({user_metadata: {panel_role:'owner'}}), null);
  assert.equal(policy.panelRole({app_metadata:{panel_role:'viewer'}, user_metadata:{panel_role:'owner'}}), 'viewer');
  assert.equal(policy.panelRole({app_metadata:{panel_role:'owner',panel_status:'disabled'}}), null);
  assert.equal(policy.panelRole({app_metadata:{panel_role:'owner'},banned_until:'2999-01-01T00:00:00Z'}), null);
});
test('stale JWT owner claims cannot read financial data or perform viewer writes', async () => {
  const {call} = fixture();
  assert.equal((await call('/api/finance/records')).error.status, 403);
  assert.equal((await call('/api/products', 'POST')).error.status, 403);
  assert.ok(!(await call('/api/products')).error);
  assert.ok(!(await call('/api/account', 'DELETE')).error);
});
test('cached identity immediately loses read and write access after disable, demotion or deletion', async () => {
  const {state, call} = fixture();
  state.user.app_metadata.panel_role='owner';
  assert.ok(!(await call('/api/products', 'POST')).error);
  state.user.app_metadata.panel_role='viewer';
  assert.equal((await call('/api/products','POST')).error.status, 403);
  state.user.app_metadata.panel_status='disabled';
  assert.equal((await call()).error.status, 403);
  state.user=null;
  assert.equal((await call()).error.status, 401);
  assert.equal(state.reads, 4);
});
test('fresh profile revocation and Auth outages fail closed despite a warm profile cache', async () => {
  const {state,call} = fixture();
  assert.ok(!(await call()).error);
  state.profileRole='customer';
  assert.equal((await call()).error.status, 403);
  state.profileRole='admin'; state.fail=true;
  assert.equal((await call()).error.status, 503);
});
test('role scopes use path boundaries and deny unknown roles', () => {
  assert.equal(policy.panelRouteAllowed('operations','POST','/api/products/123'),true);
  assert.equal(policy.panelRouteAllowed('operations','POST','/api/products-admin'),false);
  assert.equal(policy.panelRouteAllowed('support','POST','/api/theme'),false);
  assert.equal(policy.panelRouteAllowed('marketing','POST','/api/theme'),true);
  assert.equal(policy.panelRouteAllowed('invalid','GET','/api/products'),false);
});

function deletionFixture() {
  const state={passwordUser:'self',passwordError:false,rate:true,deleted:true,rpcTarget:null,signouts:0,called:0};
  const client={auth:{signInWithPassword:async () => ({data:{user:{id:state.passwordUser},session:{access_token:'temporary-jwt'}},error:state.passwordError?{}:null})}};
  const deletion=load('panelAccountDeletion',{'next/server':{NextResponse},'@/lib/supabaseAdmin':{createIsolatedSupabaseAdmin:()=>client}});
  const auth={user:{id:'self',email:'self@example.test'},profile:{id:'my-profile'},internal:false,supabase:{
    rpc:async (name,args)=>{
      if(name==='claim_public_action_rate') return {data:state.rate};
      state.called++;state.rpcTarget=args;return {data:{deleted:state.deleted}};
    },auth:{admin:{signOut:async()=>{state.signouts++}}}
  }};
  const call=(overrides={})=>deletion.deleteOwnPanelAccount(new Request('https://panel.test/api/account',{method:'DELETE',body:JSON.stringify({password:'secret',confirmation:'HESABIMI SİL',understands_business_retention:true,profile_id:'victim',auth_user_id:'victim',...overrides})}),auth);
  return {state,auth,call};
}
test('deletion ignores forged target IDs and uses the verified subject after password confirmation',async()=>{
  const {state,call}=deletionFixture();
  assert.equal((await call()).status,200);
  assert.deepEqual(state.rpcTarget,{p_auth_user_id:'self',p_profile_id:'my-profile'});
  assert.equal(state.signouts,1);
});
test('invalid password, mismatched reauthentication, rate limit and missing confirmation never delete',async()=>{
  for(const kind of ['password','mismatch','rate','confirmation','worker']) {
    const {state,auth,call}=deletionFixture();
    if(kind==='password')state.passwordError=true;
    if(kind==='mismatch')state.passwordUser='other';
    if(kind==='rate')state.rate=false;
    if(kind==='worker')auth.internal=true;
    const response=await call(kind==='confirmation'?{confirmation:'yes'}:{});
    assert.notEqual(response.status,200,kind);assert.equal(state.called,0,kind);
  }
});
