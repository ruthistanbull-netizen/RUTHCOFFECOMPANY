// Run from apps/admin with its installed dependencies. Default is read-only.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const url = process.env.PANEL_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mapFile = process.argv[2];
if (!url || !key || !mapFile) throw Error('PANEL_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and reviewed JSON map path are required.');
const host = new URL(url);
if (host.protocol !== 'https:' || host.username || host.password || host.hostname.endsWith('.supabase.co')) throw Error('Use the selected brand self-hosted HTTPS endpoint.');
const assignments = JSON.parse(readFileSync(mapFile, 'utf8'));
const roles = new Set(['owner','admin','operations','support','marketing','viewer']);
if (!Array.isArray(assignments) || !assignments.length) throw Error('Expected nonempty [{auth_user_id, panel_role, panel_status}] map.');
const seen = new Set();
const client = createClient(url, key, {auth:{persistSession:false,autoRefreshToken:false}});
const prepared=[];
for (const row of assignments) {
  if (!/^[0-9a-f-]{36}$/i.test(row.auth_user_id || '') || seen.has(row.auth_user_id)
      || !roles.has(row.panel_role) || !['active','disabled'].includes(row.panel_status)) throw Error('Invalid or duplicate explicit assignment.');
  seen.add(row.auth_user_id);
  const [{data,error},user] = await Promise.all([
    client.from('profiles').select('id,role').eq('auth_user_id',row.auth_user_id).maybeSingle(),
    client.auth.admin.getUserById(row.auth_user_id),
  ]);
  if (error || data?.role !== 'admin' || user.error || !user.data.user) throw Error('Reviewed identity is not a linked panel profile: '+row.auth_user_id);
  prepared.push({row,user:user.data.user});
}
if (!assignments.some(row=>row.panel_role==='owner' && row.panel_status==='active')) throw Error('Include the explicitly approved active owner; do not derive ownership from signup order or user_metadata.');
console.log('Validated',prepared.length,'explicit assignments for',host.origin,'— user_metadata was not read.');
if (!process.argv.includes('--apply')) {
  console.log('DRY RUN: no changes. Review the identities/roles, then rerun with --apply only after production approval.');
} else {
  for(const {row,user} of prepared) {
    const result=await client.auth.admin.updateUserById(row.auth_user_id,{app_metadata:{...user.app_metadata,panel_role:row.panel_role,panel_status:row.panel_status}});
    if(result.error)throw Error('Assignment failed for '+row.auth_user_id+'; stop deployment and reconcile explicitly.');
    const check=await client.auth.admin.getUserById(row.auth_user_id);
    if(check.error || check.data.user?.app_metadata?.panel_role!==row.panel_role || check.data.user?.app_metadata?.panel_status!==row.panel_status)throw Error('Readback failed; stop deployment.');
    console.log('Verified',row.auth_user_id,row.panel_role,row.panel_status);
  }
}
