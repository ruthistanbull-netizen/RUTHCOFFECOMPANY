const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../../..');
const dir = path.join(root, 'supabase/migrations');
const migration = readFileSync(path.join(dir, readdirSync(dir).find(x => x.endsWith('_panel_self_account_deletion.sql'))), 'utf8');
const subject = '11111111-1111-4111-8111-111111111111';
const profile = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const invoke = `select public.delete_own_panel_account('${subject}', '${profile}')`;

async function fixture(extra = '') {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id int, user_id uuid references auth.users on delete cascade);
    create table auth.refresh_tokens(id int, user_id text, session_id int);
    create table public.profiles(id uuid primary key, auth_user_id uuid references auth.users on delete cascade, role text, email text);
    create table public.orders(id int, profile_id uuid references public.profiles on delete set null, total numeric);
    create table public.products(id int, name text);
    create table public.ruthie_conversations(id int primary key, profile_id uuid references public.profiles on delete cascade);
    create table public.ruthie_messages(id int, profile_id uuid references public.profiles on delete cascade, conversation_id int references public.ruthie_conversations on delete cascade);
    create table public.ruthie_memories(id int, profile_id uuid references public.profiles on delete cascade);
    create table public.ruthie_voice_match_events(id int, expected_profile_id uuid references public.profiles on delete set null, matched_profile_id uuid references public.profiles on delete set null);
    create table public.admin_push_subscriptions(id int, admin_profile_id uuid references public.profiles on delete cascade);
    create table public.customer_addresses(id int, profile_id uuid references public.profiles on delete set null, address text);
    create table public.ruthie_point_transactions(id int, profile_id uuid references public.profiles on delete cascade, admin_profile_id uuid references public.profiles on delete set null);
    create table storage.objects(id int, owner uuid, owner_id text);
    insert into auth.users values ('${subject}'), ('${other}');
    insert into public.profiles values ('${profile}', '${subject}', 'admin', 'delete@example.test'), ('${other}', '${other}', 'admin', 'keep@example.test');
    insert into auth.sessions values (1, '${subject}'), (2, '${other}');
    insert into auth.refresh_tokens values (1, '${subject}', null), (2, '${other}', 2);
    insert into public.orders values (1, '${profile}', 99), (2, '${other}', 100);
    insert into public.products values (1, 'Keep this');
    insert into public.ruthie_conversations values (1, '${profile}'), (2, '${other}');
    insert into public.ruthie_messages values (1, '${profile}', 1), (2, '${other}', 2);
    insert into public.ruthie_memories values (1, '${profile}');
    insert into public.admin_push_subscriptions values (1, '${profile}');
    insert into public.customer_addresses values (1, '${profile}', 'Erase me');
    insert into public.ruthie_voice_match_events values (1, '${profile}', '${other}');
    insert into public.ruthie_point_transactions values (1, '${profile}', null), (2, '${other}', '${profile}');
    ${extra}
  `);
  await db.exec(migration);
  return db;
}
async function count(db, table) { return Number((await db.query(`select count(*) n from ${table}`)).rows[0].n); }

test('permanently deletes only the selected identity and personal rows, preserves business and other staff', async () => {
  const db = await fixture();
  try {
    await db.exec('set role service_role');
    assert.deepEqual((await db.query(invoke)).rows[0].delete_own_panel_account, { deleted: true });
    await db.exec('reset role');
    for (const table of ['auth.users', 'auth.sessions', 'auth.refresh_tokens', 'public.profiles', 'public.ruthie_messages', 'public.ruthie_conversations']) assert.equal(await count(db, table), 1, table);
    for (const table of ['public.ruthie_memories', 'public.admin_push_subscriptions', 'public.customer_addresses', 'public.ruthie_voice_match_events']) assert.equal(await count(db, table), 0, table);
    assert.equal(await count(db, 'public.orders'), 2);
    assert.equal((await db.query('select profile_id, total from public.orders where id=1')).rows[0].profile_id, null);
    assert.equal(await count(db, 'public.products'), 1);
    assert.deepEqual((await db.query('select profile_id, admin_profile_id from public.ruthie_point_transactions')).rows, [{profile_id: other, admin_profile_id: null}]);
  } finally { await db.close(); }
});

test('anon/authenticated cannot call the public or private deletion function', async () => {
  const db = await fixture();
  try {
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query(invoke), /permission denied/);
      await assert.rejects(db.query(invoke.replace('public.', 'panel_private.')), /permission denied/);
      await db.exec('reset role');
    }
    assert.equal(await count(db, 'auth.users'), 2);
  } finally { await db.close(); }
});

for (const [name, setup, pattern] of [
  ['unexpected business cascade', `create table public.finance_rows(id int, author_id uuid references public.profiles on delete cascade); insert into public.finance_rows values(1,'${profile}');`, /ACCOUNT_RELATIONS_REVIEW_REQUIRED/],
  ['owned Storage object', `insert into storage.objects values(1,'${subject}',null);`, /ACCOUNT_STORAGE_REVIEW_REQUIRED/],
  ['late database error rolls back earlier cleanup', `create function public.reject_delete() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end; $$; create trigger no_delete before delete on auth.users for each row execute function public.reject_delete();`, /forced failure/],
]) test(name + ' leaves every identity/personal/business record intact', async () => {
  const db = await fixture(setup);
  try {
    await assert.rejects(db.query(invoke), pattern);
    assert.equal(await count(db, 'auth.users'), 2);
    assert.equal(await count(db, 'public.profiles'), 2);
    assert.equal(await count(db, 'public.ruthie_messages'), 2);
    assert.equal(await count(db, 'public.customer_addresses'), 1);
    assert.equal((await db.query('select profile_id from public.orders where id=1')).rows[0].profile_id, profile);
  } finally { await db.close(); }
});

test('body target cannot bypass subject/profile binding; a user JWT cannot target another subject', async () => {
  const db = await fixture();
  try {
    await assert.rejects(db.query(invoke.replace(profile, other)), /ACCOUNT_SUBJECT_MISMATCH/);
    await db.exec(`set request.jwt.claim.sub = '${other}'`);
    await assert.rejects(db.query(invoke), /ACCOUNT_SUBJECT_MISMATCH/);
    assert.equal(await count(db, 'auth.users'), 2);
  } finally { await db.close(); }
});
