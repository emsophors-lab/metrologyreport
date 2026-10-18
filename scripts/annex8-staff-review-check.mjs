/**
 * NMC's review desk, end to end.
 *
 *   npm run annex8:review
 *
 * NMC staff search every licensee's filed reports, print the official annex,
 * accept, return for correction, correct in place, and delete.
 *
 * The checks that matter most here are the ones about authority and about
 * what survives:
 *
 *  - a company can reach none of it;
 *  - the Word NMC prints is byte-for-byte the file the licensee downloads,
 *    because the two must be looking at identical paper;
 *  - a returned report keeps its receipt number, so one month's return does
 *    not acquire two numbers;
 *  - an accepted report cannot be deleted, and nothing can be deleted without
 *    a reason;
 *  - a deleted report leaves its audit trail, the reason, a copy of itself
 *    and a count of what it contained.
 *
 * It CREATES a disposable month and deletes it again, so it does not consume
 * reports that are already in the database. Needs the local header auth
 * (ALLOW_LEGACY_API_HEADER_AUTH=true). Dev only.
 */
const BASE = process.env.MLRS_BASE || 'http://localhost:3000';

const as = (id, username, role) => ({
  'Content-Type': 'application/json',
  'X-NMC-User-ID': id, 'X-NMC-Username': username, 'X-NMC-User-Role': role,
});
const STAFF = as('user-sa-001', 'superadmin', 'superadmin');
const COMPANY = as('user-co-001', 'company01', 'company');
const LICENCE = 'LIC-2026-001';

/** A month far enough back that it will not collide with other fixtures. */
const PERIOD = process.argv[2] || '2025-11';

let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) console.log(`  OK   ${name}`);
  else { fail++; console.error(`  FAIL ${name}`, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); }
};
async function call(method, url, body, headers = STAFF) {
  const r = await fetch(BASE + url, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: r.status, json };
}

(async () => {
  console.log(`\n=== NMC review desk · disposable month ${PERIOD} ===`);

  console.log('\nSetting up a month to act on');
  await call('GET', `/api/annex8/month?licence_no=${LICENCE}&period=${PERIOD}&create=1`, undefined, COMPANY);
  const added = await call('POST', '/api/annex8/entries', {
    licence_no: LICENCE, period: PERIOD, part: 'instrument',
    entry: {
      op_code: 'I', category: 'WEIGHBRIDGE', instrument_name: 'ជញ្ជីងថ្លឹងរថយន្ត',
      model: 'ZSFY-60t', serial_no: `WB-REVIEW-${PERIOD}`, manufacturer: 'Keli', country: 'ចិន',
      max_capacity: '60', e_value: '20', unit: 'kg', accuracy_class: 'III',
      type_approval_no: 'TA-KH-2025-017', label_qr_no: `QR-REVIEW-${PERIOD}`,
      completion_date: `${PERIOD}-10`, customer_name: 'ក្រុមហ៊ុន សែន សុខ', province: 'ភ្នំពេញ',
      latitude: 11.5564, longitude: 104.8655,
      verification_status: 'PASSED', verification_cert_no: 'VC-REVIEW-1',
      verification_date: `${PERIOD}-12`,
    },
  }, COMPANY);
  ok(`an entry is filed (HTTP ${added.status})`, added.status === 200, added.json);
  const entryId = added.json?.entry?.id;

  const month = await call('GET', `/api/annex8/month?licence_no=${LICENCE}&period=${PERIOD}`, undefined, COMPANY);
  const reportId = month.json?.report?.id;
  await call('PUT', '/api/annex8/month/meta', {
    report_uuid: reportId,
    events: { e6_1: { yes: false }, e6_2: { yes: false }, e6_3: { yes: false },
              e6_4: { yes: false }, e6_5: { yes: false }, e6_6: { yes: false } },
    declaration_accepted: true,
  }, COMPANY);
  const submitted = await call('POST', '/api/annex8/month/submit', { report_uuid: reportId }, COMPANY);
  ok(`and submitted (HTTP ${submitted.status})`, submitted.status === 200, submitted.json);
  const receipt = submitted.json?.report?.report_id;

  console.log('\nIt appears on the review desk');
  const listed = await call('GET', `/api/annex8/staff-reports?month=${PERIOD.slice(5)}&year=${PERIOD.slice(0, 4)}`);
  ok(`the list loads (HTTP ${listed.status})`, listed.status === 200, listed.json);
  const mine = (listed.json.reports || []).find((r) => r.id === reportId);
  ok('the new report is there', !!mine, listed.json.reports?.length);
  ok('with the enterprise name resolved', !!(mine?.company_name_kh || mine?.company_name));
  ok('and its counts', mine?.counts?.installed === 1, mine?.counts);

  console.log('\nSearching');
  const byMonth = await call('GET', `/api/annex8/staff-reports?month=${PERIOD.slice(5)}`);
  ok('by month returns only that month',
    byMonth.json.reports.every((r) => r.period_month.slice(5, 7) === PERIOD.slice(5)),
    byMonth.json.reports.map((r) => r.period_month));
  const byText = await call('GET', `/api/annex8/staff-reports?q=WB-REVIEW-${PERIOD}`);
  ok('free text finds a serial number', byText.json.reports.some((r) => r.id === reportId));
  const byCompany = await call('GET', `/api/annex8/staff-reports?licence_no=${LICENCE}`);
  ok('by company returns only that company',
    byCompany.json.reports.every((r) => r.licence_no === LICENCE));
  const nothing = await call('GET', '/api/annex8/staff-reports?q=no-such-thing-at-all');
  ok('and nothing when there is nothing', nothing.json.reports.length === 0);

  console.log('\nA company can reach none of it');
  for (const [label, url] of [
    ['the list', '/api/annex8/staff-reports'],
    ['the audit trail', `/api/annex8/reports/${reportId}/audit`],
  ]) {
    const r = await call('GET', url, undefined, COMPANY);
    ok(`${label} refuses a company (HTTP ${r.status})`, r.status === 403, r.json);
  }
  const coReview = await call('POST', `/api/annex8/reports/${reportId}/review`, { action: 'accept' }, COMPANY);
  ok(`reviewing refuses a company (HTTP ${coReview.status})`, coReview.status === 403, coReview.json);
  const coDelete = await call('DELETE', `/api/annex8/reports/${reportId}`, { reason: 'x' }, COMPANY);
  ok(`deleting refuses a company (HTTP ${coDelete.status})`, coDelete.status === 403, coDelete.json);

  console.log('\nThe official annex is the same paper for both');
  const staffDoc = await fetch(`${BASE}/api/reports/${reportId}/annex8.docx`, { headers: STAFF });
  const ownerDoc = await fetch(`${BASE}/api/reports/${reportId}/annex8.docx`, { headers: COMPANY });
  ok(`NMC can print it (HTTP ${staffDoc.status})`, staffDoc.status === 200);
  ok(`the licensee can too (HTTP ${ownerDoc.status})`, ownerDoc.status === 200);
  const a = Buffer.from(await staffDoc.arrayBuffer());
  const b = Buffer.from(await ownerDoc.arrayBuffer());
  ok('it is a real .docx', a[0] === 0x50 && a[1] === 0x4b);
  ok('byte-for-byte identical', a.equals(b), { nmc: a.length, licensee: b.length });

  console.log('\nReturning for correction');
  const noComment = await call('POST', `/api/annex8/reports/${reportId}/review`, { action: 'return' });
  ok(`refused without a comment (HTTP ${noComment.status})`, noComment.status === 400, noComment.json);
  const badAction = await call('POST', `/api/annex8/reports/${reportId}/review`, { action: 'maybe' });
  ok(`an unknown action is refused (HTTP ${badAction.status})`, badAction.status === 400);

  const returned = await call('POST', `/api/annex8/reports/${reportId}/review`,
    { action: 'return', comment: 'លេខវិញ្ញាបនបត្រខ្វះ' });
  ok(`returned (HTTP ${returned.status})`, returned.status === 200, returned.json);
  ok('status is RETURNED', returned.json.report?.status === 'RETURNED', returned.json.report?.status);
  ok('the receipt number is unchanged', returned.json.report?.report_id === receipt,
    { was: receipt, now: returned.json.report?.report_id });
  ok('the comment reaches the licensee', (returned.json.report?.nmc_remarks || '').includes('វិញ្ញាបនបត្រ'));

  console.log('\nNMC correcting in place');
  const reSubmitted = await call('POST', `/api/annex8/reports/${reportId}/review`,
    { action: 'accept', comment: '' });
  ok('accepted again', reSubmitted.json.report?.status === 'ACCEPTED', reSubmitted.json.report?.status);
  const lockedForStaff = await call('PUT', `/api/annex8/entries/instrument/${entryId}`,
    { licence_no: LICENCE, entry: { model: 'SHOULD-NOT-APPLY' } });
  ok(`an ACCEPTED report is locked even for NMC (HTTP ${lockedForStaff.status})`,
    lockedForStaff.status === 409, lockedForStaff.json);

  await call('POST', `/api/annex8/reports/${reportId}/review`, { action: 'return', comment: 'បើកវិញសម្រាប់កែ' });
  await call('PUT', '/api/annex8/month/meta', { report_uuid: reportId, declaration_accepted: true }, COMPANY);
  await call('POST', '/api/annex8/month/submit', { report_uuid: reportId }, COMPANY);

  const ownerBlocked = await call('PUT', `/api/annex8/entries/instrument/${entryId}`,
    { licence_no: LICENCE, entry: { model: 'COMPANY-TRIED' } }, COMPANY);
  ok(`the licensee cannot edit a submitted report (HTTP ${ownerBlocked.status})`,
    ownerBlocked.status === 409, ownerBlocked.json);

  const corrected = await call('PUT', `/api/annex8/entries/instrument/${entryId}`,
    { licence_no: LICENCE, entry: { model: 'NMC-CORRECTED' } });
  ok(`NMC can correct it (HTTP ${corrected.status})`, corrected.status === 200, corrected.json);
  ok('the correction took', corrected.json.entry?.model === 'NMC-CORRECTED', corrected.json.entry?.model);

  const trail = await call('GET', `/api/annex8/reports/${reportId}/audit`);
  const nmcEdit = (trail.json.entries || []).find(
    (e) => e.action === 'update' && e.actor_role === 'superadmin');
  ok('and is audited as an NMC change, not the licensee\'s', !!nmcEdit);
  ok('with the previous value kept', !!nmcEdit?.old_value);

  console.log('\nDeleting');
  const noReason = await call('DELETE', `/api/annex8/reports/${reportId}`, {});
  ok(`refused without a reason (HTTP ${noReason.status})`, noReason.status === 400, noReason.json);

  await call('POST', `/api/annex8/reports/${reportId}/review`, { action: 'accept' });
  const deleteAccepted = await call('DELETE', `/api/annex8/reports/${reportId}`, { reason: 'test' });
  ok(`an ACCEPTED report cannot be deleted (HTTP ${deleteAccepted.status})`,
    deleteAccepted.status === 409, deleteAccepted.json);

  await call('POST', `/api/annex8/reports/${reportId}/review`, { action: 'return', comment: 'សម្រាប់លុប' });
  const deleted = await call('DELETE', `/api/annex8/reports/${reportId}`,
    { reason: 'សាកល្បង — ទិន្នន័យស្ទួន' });
  ok(`deleted (HTTP ${deleted.status})`, deleted.status === 200, deleted.json);
  ok('and says what it removed', deleted.json.counts?.instruments === 1, deleted.json.counts);

  const after = await call('GET', '/api/annex8/staff-reports');
  ok('it is gone from the register', !after.json.reports.some((r) => r.id === reportId));

  const survived = await call('GET', `/api/annex8/reports/${reportId}/audit`);
  const deleteRow = (survived.json.entries || []).find((e) => e.action === 'delete');
  ok('but the audit trail survives it', !!deleteRow, survived.json.entries?.length);
  ok('with the reason', (deleteRow?.old_value?.reason || '').includes('ស្ទួន'), deleteRow?.old_value?.reason);
  ok('a copy of the report', deleteRow?.old_value?.report?.report_id === receipt,
    deleteRow?.old_value?.report?.report_id);
  ok('and what it contained', !!deleteRow?.old_value?.counts, deleteRow?.old_value?.counts);

  console.log(fail ? `\n${fail} check(s) FAILED\n` : '\nThe review desk works.\n');
  process.exitCode = fail ? 1 : 0;
})();
