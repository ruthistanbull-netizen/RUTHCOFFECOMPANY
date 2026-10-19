const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { NextResponse } = require('next/server');
const root = path.resolve(__dirname, '../../..');
const actor = '00000000-0000-0000-0000-000000000001';
const sqlPath = path.join(root, 'supabase/migrations/20261019012412_entertainment_watch_rooms.sql');

// Small SQL transport adapter: tests run the actual route handlers and migration
// against Postgres, including constraints, row locks, privilege checks and CAS.
class Query {
  constructor(db, table) { this.db = db; this.table = table; this.op = 'select'; this.columns = '*'; this.filters = []; this.sort = []; this.params = []; }
  select(columns = '*', options = {}) { this.columns = columns; this.options = options; return this; }
  insert(data) { this.op = 'insert'; this.data = data; return this; }
  update(data) { this.op = 'update'; this.data = data; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filters.push([c, '=', v]); return this; }
  gt(c, v) { this.filters.push([c, '>', v]); return this; }
  lt(c, v) { this.filters.push([c, '<', v]); return this; }
  is(c, v) { this.filters.push([c, 'is', v]); return this; }
  or(value) { this.orValue = value; return this; }
  order(c, opts = {}) { this.sort.push(`${c} ${opts.ascending === false ? 'desc' : 'asc'}`); return this; }
  limit(n) { this.max = n; return this; }
  maybeSingle() { this.singleRow = true; return this; }
  single() { this.singleRow = true; return this; }
  param(v) { this.params.push(v && typeof v === 'object' ? JSON.stringify(v) : v); return `$${this.params.length}`; }
  async run() {
    try {
      this.params = [];
      let statement;
      const fields = this.columns;
      if (this.op === 'insert') statement = `insert into ${this.table} (${Object.keys(this.data).join(',')}) values (${Object.values(this.data).map(v => this.param(v)).join(',')})`;
      else if (this.op === 'update') statement = `update ${this.table} set ${Object.entries(this.data).map(([k, v]) => `${k}=${this.param(v)}`).join(',')}`;
      else statement = this.op === 'delete' ? `delete from ${this.table}` : `select ${fields} from ${this.table}`;
      const filters = this.filters.map(([c, op, v]) => op === 'is' ? `${c} is null` : `${c} ${op} ${this.param(v)}`);
      if (this.orValue) {
        const match = this.orValue.match(/^recipient_id.is.null,recipient_id.eq.([a-f0-9-]+)$/);
        assert.ok(match); filters.push(`(recipient_id is null or recipient_id = ${this.param(match[1])})`);
      }
      if (filters.length) statement += ` where ${filters.join(' and ')}`;
      if (this.op === 'select') {
        if (this.sort.length) statement += ` order by ${this.sort.join(',')}`;
        if (this.max) statement += ` limit ${Number(this.max)}`;
      } else statement += ` returning ${fields}`;
      const rows = JSON.parse(JSON.stringify((await this.db.query(statement, this.params)).rows));
      return { data: this.options?.head ? null : this.singleRow ? rows[0] || null : rows, error: null, count: rows.length };
    } catch (error) { return { data: null, error, count: null }; }
  }
  then(resolve, reject) { return this.run().then(resolve, reject); }
}

function loadRoutes(db) {
  const client = { from: table => new Query(db, table) };
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const js = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const resolve = name => {
      if (name === '@/lib/supabaseAdmin') return { getSupabaseAdmin: () => client };
      if (name === '@/lib/auth') return { requireAdmin: async request => request.headers.get('authorization') === 'Bearer admin'
        ? { user: { id: actor }, supabase: client }
        : { error: NextResponse.json({ ok: false }, { status: 401 }) } };
      if (name.startsWith('@/')) return load(path.join(root, 'apps/admin/src', `${name.slice(2)}.ts`));
      if (name.startsWith('.')) return load(path.join(path.dirname(filename), `${name}.ts`));
      return require(name);
    };
    new Function('require', 'module', 'exports', js)(resolve, module, module.exports);
    return module.exports;
  }
  return {
    rooms: load(path.join(root, 'apps/admin/src/app/api/entertainment/rooms/route.ts')),
    join: load(path.join(root, 'apps/admin/src/app/api/entertainment/rooms/[id]/join/route.ts')),
    room: load(path.join(root, 'apps/admin/src/app/api/entertainment/rooms/[id]/route.ts')),
    model: load(path.join(root, 'apps/admin/src/lib/entertainment/model.ts')),
  };
}
const req = (method, body, token, admin = false, suffix = '') => new Request(`https://panel.example.com/api/entertainment/rooms${suffix}`, {
  method, headers: { 'content-type': 'application/json', ...(token ? { 'x-watch-token': token } : {}), ...(admin ? { authorization: 'Bearer admin' } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

module.exports = { loadRoutes, req, sqlPath, PGlite, actor };
