/**
 * Does supabase_annex8_complete.sql create what the application needs?
 *
 *   npm run annex8:check:sql
 *
 * There is no PostgreSQL on the development machine, so this cannot be run
 * against a real database the way the MySQL schema is. What it CAN do is
 * compare the generated Supabase script against two things that are already
 * known to be right:
 *
 *  1. mysql/01_schema.sql — the MySQL schema, which the application runs
 *     against every day here, so its table and column set is correct by
 *     demonstration rather than by reading.
 *
 *  2. The columns the server actually writes, taken from ENTRY_CONFIG in
 *     src/annex8/entries.ts.
 *
 * A column the code writes but the script does not create would fail at
 * runtime on Supabase, after deployment, on a licensee's first submission.
 * That is the failure this guards against.
 *
 * It also checks the things a hand-assembled SQL file gets wrong: unbalanced
 * dollar-quoted blocks, and a view or function defined twice.
 */
import { readFileSync } from 'node:fs';

const COMPLETE = 'supabase_annex8_complete.sql';
const MYSQL = 'mysql/01_schema.sql';

let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) console.log(`  OK   ${name}`);
  else { fail++; console.error(`  FAIL ${name}`, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); }
};

const sql = readFileSync(COMPLETE, 'utf8');
const mysql = readFileSync(MYSQL, 'utf8');

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

// Inline comments must go too, not just whole comment lines: several contain
// commas and parentheses, and the column splitter below counts both.
const stripComments = (s) => s.replace(/--.*/g, '');

/** table -> Set(columns), from CREATE TABLE bodies and ALTER TABLE ADD COLUMN. */
function columnsOf(text, { backticks = false } = {}) {
  const src = stripComments(text);
  const tables = new Map();
  const put = (t, c) => {
    const key = t.replace(/^public\./, '').replace(/`/g, '').toLowerCase();
    const col = c.replace(/`/g, '').toLowerCase();
    if (!tables.has(key)) tables.set(key, new Set());
    tables.get(key).add(col);
  };

  const createRe = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([`\w.]+)\s*\(/gi;
  let m;
  while ((m = createRe.exec(src))) {
    // Walk to the matching close paren so nested CHECK(...) does not end it.
    let depth = 1, i = createRe.lastIndex;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
      i++;
    }
    const body = src.slice(createRe.lastIndex, i - 1);

    // Split on commas at depth 0 — a column definition per piece.
    const parts = [];
    let d = 0, start = 0;
    for (let j = 0; j < body.length; j++) {
      if (body[j] === '(') d++;
      else if (body[j] === ')') d--;
      else if (body[j] === ',' && d === 0) { parts.push(body.slice(start, j)); start = j + 1; }
    }
    parts.push(body.slice(start));

    for (const raw of parts) {
      const line = raw.trim();
      if (!line) continue;
      if (/^(PRIMARY\s+KEY|UNIQUE|KEY|CONSTRAINT|FOREIGN\s+KEY|INDEX|CHECK)\b/i.test(line)) continue;
      const name = line.match(/^([`\w]+)/);
      if (name) put(m[1], name[1]);
    }
  }

  const alterRe = /ALTER TABLE\s+([`\w.]+)\s+ADD COLUMN(?:\s+IF NOT EXISTS)?\s+([`\w]+)/gi;
  while ((m = alterRe.exec(src))) put(m[1], m[2]);

  // Columns added inside a DO block that loops over a table list:
  //   FOREACH t IN ARRAY ARRAY['a','b'] LOOP
  //     EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at ...', t);
  // The soft-delete and attribution columns are all added this way, so a
  // parser that ignores it reports them missing when they are not.
  const loopRe = /FOREACH\s+\w+\s+IN ARRAY ARRAY\[([\s\S]*?)\]\s*LOOP([\s\S]*?)END LOOP/gi;
  while ((m = loopRe.exec(src))) {
    const loopTables = [...m[1].matchAll(/'([\w.]+)'/g)].map((x) => x[1]);
    const added = [...m[2].matchAll(/ALTER TABLE %I ADD COLUMN(?:\s+IF NOT EXISTS)?\s+(\w+)/gi)]
      .map((x) => x[1]);
    for (const t of loopTables) for (const col of added) put(t, col);
  }

  // MySQL generated columns are an implementation detail of that dialect.
  if (backticks) {
    for (const cols of tables.values()) {
      for (const c of [...cols]) if (c.startsWith('uniq_')) cols.delete(c);
    }
  }
  return tables;
}

const pg = columnsOf(sql);
const my = columnsOf(mysql, { backticks: true });

/* ------------------------------------------------------------------ *
 * 1. Structure
 * ------------------------------------------------------------------ */
console.log('\nThe file holds together');

for (const tag of ['$$', '$guard$', '$viewsql$', '$legacy$']) {
  const n = (sql.match(new RegExp(tag.replace(/\$/g, '\\$'), 'g')) || []).length;
  ok(`${tag} quotes are balanced (${n})`, n % 2 === 0, n);
}

const viewDefs = (sql.match(/CREATE OR REPLACE VIEW annex8_activity_union/g) || []).length;
ok('the dashboard view is defined twice — once per branch of the guard', viewDefs === 2, viewDefs);
ok('and both definitions sit inside the guard',
  sql.indexOf('CREATE OR REPLACE VIEW annex8_activity_union') > sql.indexOf('DO $guard$'));

ok('the legacy reports table is only touched behind a guard',
  !/^\s*ALTER TABLE reports /m.test(stripComments(sql).replace(/DO \$legacy\$[\s\S]*?END \$legacy\$;/g, '')),
  'an unguarded ALTER TABLE reports would fail on a fresh project');

for (const fn of ['annex8_next_report_id', 'annex8_part2_totals', 'annex8_deadline', 'annex8_is_on_time']) {
  ok(`${fn} is created`, sql.includes(`FUNCTION ${fn}`), fn);
}

/* ------------------------------------------------------------------ *
 * 2. Every Annex 8 table the MySQL schema has
 * ------------------------------------------------------------------ */
console.log('\nEvery table the application uses');

const annex8Tables = [...my.keys()].filter((t) => t.startsWith('annex8_'))
  .concat(['monthly_report_digest_logs']);

for (const t of annex8Tables) {
  ok(`${t}`, pg.has(t), [...pg.keys()].filter((k) => k.startsWith('annex8_')));
}

/* ------------------------------------------------------------------ *
 * 3. Every column, against the schema the app demonstrably runs on
 * ------------------------------------------------------------------ */
console.log('\nEvery column those tables need');

let missingTotal = 0;
for (const t of annex8Tables) {
  if (!pg.has(t) || !my.has(t)) continue;
  const missing = [...my.get(t)].filter((c) => !pg.get(t).has(c));
  if (missing.length) missingTotal += missing.length;
  ok(`${t} (${my.get(t).size} columns)`, missing.length === 0, { missing });
}
ok('nothing the MySQL schema has is absent from the Supabase script', missingTotal === 0, missingTotal);

/* ------------------------------------------------------------------ *
 * 4. Every column the entry API writes
 * ------------------------------------------------------------------ */
console.log('\nEvery column the entry API writes');

const entries = readFileSync('src/annex8/entries.ts', 'utf8');
const configRe = /(\w+):\s*\{[^}]*?table:\s*'(\w+)'[\s\S]*?columns:\s*\[([\s\S]*?)\]/g;
let c, checked = 0;
while ((c = configRe.exec(entries))) {
  const [, part, table, cols] = c;
  const names = [...cols.matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]);
  if (!names.length) continue;
  checked++;
  const missing = names.filter((n) => !(pg.get(table) || new Set()).has(n));
  ok(`${part} -> ${table} (${names.length} columns)`, missing.length === 0, { missing });
}
ok('all four entry parts were checked', checked === 4, checked);

console.log(fail ? `\n${fail} check(s) FAILED\n` : '\nThe Supabase script creates everything the application needs.\n');
process.exitCode = fail ? 1 : 0;
