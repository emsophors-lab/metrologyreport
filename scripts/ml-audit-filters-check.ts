/**
 * Audit filter parsing, including the platform's routing parameter.
 *
 *   npm run ml:filters:check
 *
 * This exists because of a production-only failure that took a while to find.
 * vercel.json rewrites `/api/:path*` to `/api`; Vercel appends a route
 * parameter the destination does not consume to the query string, so every
 * deployed request arrived carrying `path=analytics/ml-insights`. The filter
 * allow-list rejected it, and the Smart Analytics page showed "Briefing
 * filters are invalid" while the same code worked perfectly on a developer's
 * machine, where there is no rewrite.
 *
 * Two things therefore have to stay true at once, and a test is the only way
 * to keep both:
 *
 *   - a routing parameter must be ignored, so the deployed site works;
 *   - a genuinely unknown filter must still be REFUSED, because silently
 *     ignoring one would widen the scope of an audit export without saying
 *     so, which is the whole reason the allow-list exists.
 */
import assert from 'node:assert/strict';

import { auditFiltersFromUrl, parseAuditFilters } from '../src/ml/auditService';

let failures = 0;
const check = (name: string, run: () => void) => {
  try { run(); console.log(`  OK   ${name}`); }
  catch (err: any) { failures++; console.error(`  FAIL ${name}\n       ${err?.message || err}`); }
};

const base = '/api/analytics/ml-insights?from=2026-09-01&to=2026-10-23';

console.log('\nThe routing parameter the rewrite adds');

check('a plain request parses', () => {
  const f = auditFiltersFromUrl(base);
  assert.equal(f.from, '2026-09-01');
  assert.equal(f.to, '2026-10-23');
});

check('`path` is ignored, as Vercel adds it to every deployed request', () => {
  const f = auditFiltersFromUrl(`/api?path=analytics/ml-insights&from=2026-09-01&to=2026-10-23`);
  assert.equal(f.from, '2026-09-01');
  assert.equal(f.to, '2026-10-23');
  assert.ok(!('path' in f), 'path must not survive into the filters');
});

check('and on the export routes too', () => {
  for (const route of ['analytics/export/pdf', 'analytics/export/excel']) {
    const f = auditFiltersFromUrl(`/api?path=${route}&from=2026-09-01&to=2026-10-23&risk_level=High`);
    assert.equal(f.risk_level, 'High');
  }
});

console.log('\nEverything else is still refused');

check('an unknown filter is refused by name', () => {
  assert.throws(() => auditFiltersFromUrl(`${base}&bogus=1`), /Unknown export filter: bogus/);
});

check('a filter that merely looks like routing is still refused', () => {
  assert.throws(() => auditFiltersFromUrl(`${base}&pathname=x`), /Unknown export filter: pathname/);
});

check('an invalid risk level is refused', () => {
  assert.throws(() => auditFiltersFromUrl(`${base}&risk_level=Nope`), /Invalid risk level/);
});

check('a malformed date is refused', () => {
  assert.throws(() => auditFiltersFromUrl('/api?from=2026-13-45&to=2026-10-23'), /YYYY-MM-DD/);
});

check('a reversed range is refused', () => {
  assert.throws(() => auditFiltersFromUrl('/api?from=2026-10-23&to=2026-09-01'),
    /Start date must not follow end date/);
});

check('a duplicated filter is still refused', () => {
  assert.throws(() => auditFiltersFromUrl(`${base}&q=a&q=b`), /Duplicate export filter/);
});

check('a duplicated routing parameter does not trip the duplicate check', () => {
  const f = auditFiltersFromUrl('/api?path=a&path=b&from=2026-09-01&to=2026-10-23');
  assert.equal(f.from, '2026-09-01');
});

check('an over-long value is refused', () => {
  assert.throws(() => parseAuditFilters({ q: 'x'.repeat(201) }), /Invalid export filter/);
});

check('parseAuditFilters itself still refuses `path`', () => {
  // The exemption belongs to URL parsing, where the platform adds it — not to
  // the validator, which should keep refusing anything it is handed directly.
  assert.throws(() => parseAuditFilters({ path: 'analytics/ml-insights' }),
    /Unknown export filter: path/);
});

console.log(failures ? `\n${failures} check(s) FAILED\n` : '\nAudit filter parsing holds.\n');
assert.equal(failures, 0, `${failures} audit filter check(s) failed`);
