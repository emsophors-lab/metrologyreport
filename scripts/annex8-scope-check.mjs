/**
 * Who can see whose data.
 *
 *   npm run annex8:scope
 *
 * The rule, stated by NMC: admin and superadmin see every licensee; a company
 * sees only its own. That is one of those rules which is either true or the
 * system is unusable — a licensee reading a competitor's instrument list is
 * not a bug report, it is an incident.
 *
 * So it is checked rather than assumed, against a running server, for every
 * endpoint that takes a licence: the overview, the register, the pending list
 * and the official document. A company must not be able to widen its scope by
 * asking differently, and the server must decide the scope from the signed-in
 * user rather than from a query parameter.
 *
 * Needs the local header auth (ALLOW_LEGACY_API_HEADER_AUTH=true). Dev only.
 */
const BASE = process.env.MLRS_BASE || 'http://localhost:3000';

const as = (id, username, role) => ({
  'Content-Type': 'application/json',
  'X-NMC-User-ID': id, 'X-NMC-Username': username, 'X-NMC-User-Role': role,
});
const COMPANY1 = as('user-co-001', 'company01', 'company');
const COMPANY2 = as('user-co-002', 'company02', 'company');
const SUPERADMIN = as('user-sa-001', 'superadmin', 'superadmin');
const ADMIN = as('user-ad-001', 'admin', 'admin');

const L1 = 'LIC-2026-001';
const L2 = 'LIC-2026-002';

let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) console.log(`  OK   ${name}`);
  else { fail++; console.error(`  FAIL ${name}`, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); }
};
async function get(url, headers) {
  const r = await fetch(BASE + url, { headers });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 150) }; }
  return { status: r.status, json };
}

(async () => {
  console.log('\nThe overview decides its own scope');
  const c1 = await get('/api/annex8/overview', COMPANY1);
  ok(`a company loads it (HTTP ${c1.status})`, c1.status === 200, c1.json);
  ok("its scope is 'own'", c1.json.scope === 'own', c1.json.scope);
  ok('it is scoped to that company', c1.json.licence_no === L1, c1.json.licence_no);
  ok('with no licensee table', (c1.json.licensees || []).length === 0);
  ok('and no list of who else is missing', (c1.json.missing_for_due || []).length === 0);

  for (const [who, headers] of [['superadmin', SUPERADMIN], ['admin', ADMIN]]) {
    const s = await get('/api/annex8/overview', headers);
    ok(`${who} sees every licensee`, s.status === 200 && s.json.scope === 'all', s.json?.scope);
    ok(`${who} gets the licensee table`, (s.json.licensees || []).length >= 2, (s.json.licensees || []).length);
  }

  console.log('\nA company cannot widen its scope by asking differently');
  for (const [label, url] of [
    ['the overview', `/api/annex8/overview?licence_no=${L2}`],
    ['the register', `/api/annex8/reports-list?licence_no=${L2}`],
    ['the pending list', `/api/annex8/pending?licence_no=${L2}`],
    ['a month', `/api/annex8/month?licence_no=${L2}&period=2026-09`],
  ]) {
    const r = await get(url, COMPANY1);
    ok(`${label} refuses another licence (HTTP ${r.status})`, r.status === 403, r.json);
  }

  const own = await get(`/api/annex8/overview?licence_no=${L1}`, COMPANY1);
  ok('but its own licence is fine', own.status === 200, own.json);

  console.log('\nTwo companies do not see each other');
  const c2 = await get('/api/annex8/overview', COMPANY2);
  ok('the second company is scoped to itself', c2.json.licence_no === L2, c2.json.licence_no);
  ok('and sees none of the first one\'s reports',
    c2.json.summary.filed === 0 && c1.json.summary.filed > 0,
    { second: c2.json.summary.filed, first: c1.json.summary.filed });

  console.log('\nStaff may narrow to one licensee, and see the same figures');
  const narrowed = await get(`/api/annex8/overview?licence_no=${L1}`, SUPERADMIN);
  ok("the narrowed scope is 'licence'", narrowed.json.scope === 'licence', narrowed.json.scope);
  ok('and it agrees with what that company sees',
    narrowed.json.summary.filed === c1.json.summary.filed,
    { staff: narrowed.json.summary.filed, company: c1.json.summary.filed });

  console.log('\nAn unauthenticated caller gets nothing');
  const anon = await get('/api/annex8/overview', { 'Content-Type': 'application/json' });
  ok(`refused (HTTP ${anon.status})`, anon.status === 401, anon.json);

  console.log('\nThe figures hold together');
  const staff = await get('/api/annex8/overview', SUPERADMIN);
  const t = staff.json.totals;
  ok('produced = judged',
    t.manufactured + t.installed + t.repaired === t.passed + t.failed + t.pending, t);
  ok('reporting licensees never exceed licensees',
    staff.json.summary.reporting_licensees <= staff.json.summary.licensees, staff.json.summary);

  console.log(fail ? `\n${fail} check(s) FAILED\n` : '\nEvery scope holds.\n');
  process.exitCode = fail ? 1 : 0;
})();
