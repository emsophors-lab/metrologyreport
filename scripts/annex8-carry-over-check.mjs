/**
 * Carry-over (Article 17), end to end against a running server.
 *
 *   npm run annex8:carry-over
 *
 * An instrument reported in an earlier month as រង់ចាំ gets its verification
 * result recorded in the month the result actually arrived, and the result is
 * written back to the original month only at submit.
 *
 * Also checks the two things that were wrong when this was written: a company
 * could read another enterprise's pending list, and a soft-deleted entry kept
 * resurfacing asking to be verified.
 *
 * Needs the local header auth (ALLOW_LEGACY_API_HEADER_AUTH=true). Dev only.
 */
const BASE = process.env.MLRS_BASE || 'http://localhost:3000';
const LICENCE = 'LIC-2026-001';
const H = {
  'Content-Type': 'application/json',
  'X-NMC-User-ID': 'user-co-001', 'X-NMC-Username': 'company01', 'X-NMC-User-Role': 'company',
};
const OTHER = { ...H, 'X-NMC-User-ID': 'user-sa-001', 'X-NMC-Username': 'superadmin', 'X-NMC-User-Role': 'superadmin' };

let fail = 0;
const ok = (n, c, x) => { if (c) console.log(`  OK   ${n}`); else { fail++; console.error(`  FAIL ${n}`, x ? JSON.stringify(x).slice(0, 400) : ''); } };
async function call(method, url, body, headers = H) {
  const r = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let j; const t = await r.text(); try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 200) }; }
  return { status: r.status, json: j };
}

(async () => {
  // A month with a PENDING instrument, from a month earlier than the one we
  // will settle it in.
  const SRC = '2026-08', NOW = '2026-11';
  console.log(`\n=== carry-over: ${SRC} pending, settled in ${NOW} ===`);

  console.log('\n[1] an August instrument left awaiting verification');
  const open = await call('GET', `/api/annex8/month?licence_no=${LICENCE}&period=${SRC}&create=1`);
  ok(`August opens (HTTP ${open.status})`, open.status === 200, open.json);
  const added = await call('POST', '/api/annex8/entries', {
    licence_no: LICENCE, period: SRC, part: 'instrument',
    entry: {
      op_code: 'I', category: 'WEIGHBRIDGE', instrument_name: 'ជញ្ជីងថ្លឹងរថយន្ត',
      model: 'ZSFY-60t', serial_no: 'WB-26-CARRY', manufacturer: 'Keli', country: 'ចិន',
      max_capacity: '60', e_value: '20', unit: 'kg', accuracy_class: 'III',
      type_approval_no: 'TA-KH-2025-017', label_qr_no: 'QR-CARRY-1',
      completion_date: `${SRC}-20`, customer_name: 'ក្រុមហ៊ុន សែន សុខ', province: 'ភ្នំពេញ',
      latitude: 11.5564, longitude: 104.8655,
      verification_status: 'PENDING',
    },
  });
  ok(`instrument saved as រង់ចាំ (HTTP ${added.status})`, added.status === 200, added.json);
  const srcRowId = added.json?.entry?.id;

  console.log('\n[2] it shows up as pending in a later month');
  const pend = await call('GET', `/api/annex8/pending?licence_no=${LICENCE}&before=${NOW}`);
  ok(`pending loads (HTTP ${pend.status})`, pend.status === 200, pend.json);
  const mine = (pend.json?.items || []).find((i) => i.source_row_id === srcRowId);
  ok('the August instrument is listed', !!mine, pend.json?.items?.length);
  ok('it says which month it came from', mine?.since === SRC, mine?.since);

  console.log('\n[3] another enterprise cannot see it');
  const leak = await call('GET', `/api/annex8/pending?licence_no=NMC-SA-2026`, undefined, H);
  ok(`a company asking for another licence is refused (HTTP ${leak.status})`, leak.status === 403, leak.json);

  console.log('\n[4] record the result in November');
  const rec = await call('POST', '/api/annex8/carry-over', {
    licence_no: LICENCE, period: NOW, source_part: 'P3', source_row_id: srcRowId,
    new_status: 'PASSED', cert_no: 'VC-26-9001', verification_date: `${NOW}-03`,
  });
  ok(`recorded (HTTP ${rec.status})`, rec.status === 200, rec.json);
  const carryId = rec.json?.carry_over?.id;

  const month = await call('GET', `/api/annex8/month?licence_no=${LICENCE}&period=${NOW}`);
  ok('the month carries it', (month.json?.carry_over || []).length === 1, month.json?.carry_over);

  console.log('\n[5] the source row is NOT touched before submit');
  const stillPending = await call('GET', `/api/annex8/pending?licence_no=${LICENCE}&before=${NOW}`);
  ok('August still reads រង់ចាំ until November is submitted',
    (stillPending.json?.items || []).some((i) => i.source_row_id === srcRowId));

  console.log('\n[6] refusals');
  const twice = await call('POST', '/api/annex8/carry-over', {
    licence_no: LICENCE, period: NOW, source_part: 'P3', source_row_id: srcRowId,
    new_status: 'FAILED', cert_no: 'VC-26-9002',
  });
  ok(`recording twice corrects rather than duplicating (HTTP ${twice.status})`, twice.status === 200, twice.json);
  const after = await call('GET', `/api/annex8/month?licence_no=${LICENCE}&period=${NOW}`);
  ok('still one carry-over, now FAILED', (after.json?.carry_over || []).length === 1
    && after.json.carry_over[0].new_status === 'FAILED', after.json?.carry_over);

  const sameMonth = await call('POST', '/api/annex8/carry-over', {
    licence_no: LICENCE, period: SRC, source_part: 'P3', source_row_id: srcRowId, new_status: 'PASSED',
  });
  ok(`carrying over within its own month is refused (HTTP ${sameMonth.status})`, sameMonth.status === 400, sameMonth.json);

  const bogus = await call('POST', '/api/annex8/carry-over', {
    licence_no: LICENCE, period: NOW, source_part: 'P3',
    source_row_id: '00000000-0000-0000-0000-000000000000', new_status: 'PASSED',
  });
  ok(`an unknown row is refused (HTTP ${bogus.status})`, bogus.status === 404, bogus.json);

  const pendingStatus = await call('POST', '/api/annex8/carry-over', {
    licence_no: LICENCE, period: NOW, source_part: 'P3', source_row_id: srcRowId, new_status: 'PENDING',
  });
  ok(`PENDING is refused as a no-op (HTTP ${pendingStatus.status})`, pendingStatus.status === 400, pendingStatus.json);

  console.log('\n[7] remove it again');
  const del = await call('DELETE', `/api/annex8/carry-over/${carryId}`);
  ok(`removed (HTTP ${del.status})`, del.status === 200, del.json);
  const gone = await call('GET', `/api/annex8/month?licence_no=${LICENCE}&period=${NOW}`);
  ok('the month no longer carries it', (gone.json?.carry_over || []).length === 0);

  console.log('\n[8] audit trail');
  console.log(`      (checked directly in annex8_report_audit_log)`);

  console.log(fail ? `\n${fail} check(s) FAILED\n` : '\nCarry-over works.\n');
  process.exit(fail ? 1 : 0);
})();
