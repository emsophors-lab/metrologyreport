/**
 * The Annex 8 sample scenario, end to end, against a running server.
 *
 *   npm run annex8:scenario            (month defaults to the current one)
 *   npm run annex8:scenario -- 2026-09
 *
 * Needs the dev server up and a database behind it. Locally that means:
 *   .\scripts\mysql-local.ps1 start   and  DB_DRIVER=mysql in .env
 *
 * This is the scenario the brief asks for after every stage: three separate
 * sessions in one month adding a weighbridge with eight load cells, an
 * electronic scale and a fuel-dispenser repair with a broken seal; then edit
 * one, delete one, undo, submit, and download the Word document.
 *
 * It exists because the entry and submit endpoints were written, typechecked
 * and built without ever being run — and the first time this ran it found
 * four real bugs: ISO timestamps rejected by MySQL, the Article 21 deadline
 * computed as the 7th of the wrong month, ownership resolved from a bearer
 * token only (so the owner was refused their own report), and the local
 * header auth skipped whenever there was no Supabase client.
 *
 * It authenticates through the local development header auth, so the server
 * must be running with ALLOW_LEGACY_API_HEADER_AUTH=true. Never in production.
 */
const BASE = process.env.MLRS_BASE || 'http://localhost:3000';
const LICENCE = 'LIC-2026-001';
const PERIOD = process.argv[2] || new Date().toISOString().slice(0, 7);

const H = {
  'Content-Type': 'application/json',
  'X-NMC-User-ID': 'user-co-001',
  'X-NMC-Username': 'company01',
  'X-NMC-User-Role': 'company',
};

let step = 0;
const say = (msg) => console.log(`\n[${++step}] ${msg}`);
const detail = (msg) => console.log(`      ${msg}`);

async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method, headers: H, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json };
}

const must = (cond, what, extra) => {
  if (!cond) { console.error(`   ✗ ${what}`, extra ? JSON.stringify(extra).slice(0, 500) : ''); process.exitCode = 1; }
  else console.log(`   ✓ ${what}`);
};

const entry = (part, values) =>
  call('POST', '/api/annex8/entries', { licence_no: LICENCE, period: PERIOD, part, entry: values });

(async () => {
  // Leave every other licence and month alone; reset only what this runs on.
  const existing = await call('GET', `/api/annex8/month?licence_no=${LICENCE}&period=${PERIOD}`);
  if (existing.json?.report?.id && existing.json?.report?.status !== 'OPEN') {
    console.error(`
${PERIOD} is already ${existing.json.report.status} for ${LICENCE}. ` +
      `Pick an untouched month:  npm run annex8:scenario -- YYYY-MM
`);
    process.exit(1);
  }

  console.log(`\n=== Annex 8 sample scenario — licence ${LICENCE}, month ${PERIOD} ===`);

  say('SESSION 1 — open the month and install a weighbridge');
  const open = await call('GET', `/api/annex8/month?licence_no=${LICENCE}&period=${PERIOD}&create=1`);
  must(open.status === 200, `month opens (HTTP ${open.status})`, open.json);
  const reportUuid = open.json?.report?.id;
  must(!!reportUuid, 'the month has a report container');
  must(open.json?.deadline === `${PERIOD.slice(0,4)}-${String(Number(PERIOD.slice(5))+1).padStart(2,'0')}-07`,
       `Art. 21 deadline is the 7th of the FOLLOWING month (${open.json?.deadline})`);
  detail(`report ${reportUuid}, status ${open.json?.report?.status}`);

  const wb = await entry('instrument', {
    op_code: 'I', category: 'WEIGHBRIDGE', instrument_name: 'ជញ្ជីងថ្លឹងរថយន្ត',
    model: 'ZSFY-60t', serial_no: 'WB-26-0012', manufacturer: 'Keli', country: 'ចិន',
    max_capacity: '60', min_capacity: '0.4', e_value: '20', unit: 'kg', accuracy_class: 'III',
    type_approval_no: 'TA-KH-2025-017',
    completion_date: `${PERIOD}-05`, customer_name: 'ក្រុមហ៊ុន សែន សុខ',
    province: 'ភ្នំពេញ', address: 'សង្កាត់ចោមចៅ', label_qr_no: 'QR-000981',
    latitude: 11.5564, longitude: 104.8655,
    verification_status: 'PASSED', verification_cert_no: 'VC-26-1102',
    verification_date: `${PERIOD}-08`,
  });
  must(wb.status === 200, `weighbridge saved (HTTP ${wb.status})`, wb.json);
  const wbId = wb.json?.entry?.id;
  detail(`row_no ${wb.json?.entry?.row_no}, serial ${wb.json?.entry?.serial_no}`);

  let loadCells = 0;
  for (let i = 1; i <= 8; i++) {
    const m = await entry('module', {
      host_serial_no: 'WB-26-0012', host_part: 'P3', module_name: 'ឡូដសែល (Load cell)',
      model: 'QS-30t', serial_no: `LC-88${String(i).padStart(2, '0')}`,
      range_e: '30 t / C3', manufacturer: 'Keli', country: 'ចិន',
      cert_no: 'R60/2017-CN1-21.04', new_or_replacement: 'NEW',
    });
    if (m.status === 200) loadCells++;
    else detail(`load cell ${i} failed: ${JSON.stringify(m.json).slice(0, 200)}`);
  }
  must(loadCells === 8, `all 8 load cells saved (${loadCells}/8)`);

  say('SESSION 2 — a separate visit, later in the month: an electronic scale');
  const scale = await entry('instrument', {
    op_code: 'M', category: 'NAWI', instrument_name: 'ជញ្ជីងអេឡិចត្រូនិក',
    model: 'ACS-30', serial_no: 'ES-26-7781', manufacturer: 'Bokor Metrology', country: 'កម្ពុជា',
    max_capacity: '30', min_capacity: '0.1', e_value: '10', unit: 'g', accuracy_class: 'III',
    type_approval_no: 'TA-KH-2025-044', label_qr_no: 'QR-000982',
    completion_date: `${PERIOD}-12`, customer_name: 'ផ្សារទំនើប អ៊ីអន',
    province: 'ភ្នំពេញ', latitude: 11.5449, longitude: 104.8922,
    verification_status: 'PENDING',
  });
  must(scale.status === 200, `electronic scale saved (HTTP ${scale.status})`, scale.json);
  const scaleId = scale.json?.entry?.id;

  say('SESSION 3 — a third visit: a fuel-dispenser repair, seal broken');
  const repair = await entry('repair', {
    category: 'FUEL_DISPENSER', instrument_name: 'ឧបករណ៍ចែកចាយប្រេង',
    model: 'TATSUNO-NV', serial_no: 'FD-77120', customer_name: 'ស្ថានីយ៍ប្រេង តេឡា',
    province: 'ខេត្តកំពត', address: 'ក្រុងកំពត',
    repair_from: `${PERIOD}-09`, repair_to: `${PERIOD}-11`,
    repair_description: 'ជួសជុលម៉ូទ័របូមប្រេង និងប្ដូរឡូដសែល',
    seal_broken: true, seal_removed_no: 'S-55021', notification_no: 'NTF-26-0331',
    technician: 'លោក សុខ វិសាល',
    verification_status: 'PASSED', verification_cert_no: 'VC-26-1150',
    verification_date: `${PERIOD}-13`,
  });
  must(repair.status === 200, `repair saved (HTTP ${repair.status})`, repair.json);
  const repairId = repair.json?.entry?.id;

  say('the month adds up across the three sessions');
  const month = await call('GET', `/api/annex8/month?licence_no=${LICENCE}&period=${PERIOD}`);
  const e = month.json?.entries || {};
  must((e.instruments || []).length === 2, `2 instruments (${(e.instruments || []).length})`);
  must((e.modules || []).length === 8, `8 modules (${(e.modules || []).length})`);
  must((e.repairs || []).length === 1, `1 repair (${(e.repairs || []).length})`);

  say('EDIT — the pending scale comes back verified');
  const edited = await call('PUT', `/api/annex8/entries/instrument/${scaleId}`, {
    licence_no: LICENCE,
    entry: { verification_status: 'PASSED', verification_cert_no: 'VC-26-1177', verification_date: `${PERIOD}-15` },
  });
  must(edited.status === 200, `edit accepted (HTTP ${edited.status})`, edited.json);
  must(edited.json?.entry?.verification_status === 'PASSED', 'the scale now reads ជាប់ (PASSED)');

  say('DELETE — one load cell was typed twice');
  const monthNow = await call('GET', `/api/annex8/month?licence_no=${LICENCE}&period=${PERIOD}`);
  const victim = (monthNow.json?.entries?.modules || []).find((m) => m.serial_no === 'LC-8808');
  const del = await call('DELETE', `/api/annex8/entries/module/${victim.id}`, { licence_no: LICENCE });
  must(del.status === 200, `delete accepted (HTTP ${del.status})`, del.json);
  const afterDel = await call('GET', `/api/annex8/month?licence_no=${LICENCE}&period=${PERIOD}`);
  must((afterDel.json?.entries?.modules || []).length === 7, `7 modules remain (${(afterDel.json?.entries?.modules || []).length})`);

  say('UNDO — it was the wrong one');
  const undo = await call('POST', `/api/annex8/entries/module/${victim.id}/undelete`, { licence_no: LICENCE });
  must(undo.status === 200, `undo accepted (HTTP ${undo.status})`, undo.json);
  const afterUndo = await call('GET', `/api/annex8/month?licence_no=${LICENCE}&period=${PERIOD}`);
  must((afterUndo.json?.entries?.modules || []).length === 8, `back to 8 modules (${(afterUndo.json?.entries?.modules || []).length})`);
  await call('DELETE', `/api/annex8/entries/module/${victim.id}`, { licence_no: LICENCE });
  detail('deleted again, so the month ends with 7 load cells');

  say('REVIEW — Part 2 computed from the entries');
  const review = await call('GET', `/api/annex8/month/review?report_uuid=${reportUuid}`);
  must(review.status === 200, `review loads (HTTP ${review.status})`, review.json);
  const t = review.json?.totals?.total || review.json?.summary?.total || {};
  detail(`ផលិត ${t.manufactured} · ដំឡើង ${t.installed} · ជួសជុល ${t.repaired}`);
  detail(`ជាប់ ${t.passed} · ធ្លាក់ ${t.failed} · រង់ចាំ ${t.pending}`);
  const produced = (t.manufactured || 0) + (t.installed || 0) + (t.repaired || 0);
  const judged = (t.passed || 0) + (t.failed || 0) + (t.pending || 0);
  must(produced === judged && produced === 3, `V01 balance holds: ${produced} = ${judged}`);
  const blocking = review.json?.blocking || [];
  detail(`blocking issues: ${blocking.length}${blocking.length ? ' — ' + blocking.map((i) => i.code + ' ' + i.path).join('; ') : ''}`);
  const notPart6 = blocking.filter((i) => !/^(events|declaration)/.test(i.path || ''));
  must(notPart6.length === 0, `the entries themselves are complete (${notPart6.length} non-Part-6 issues)`);
  must(review.json?.can_submit === false, 'can_submit is false until Part 6 and the declaration are done');
  detail(`can_submit: ${review.json?.can_submit}`);

  say('DECLARATION — Part 6 and Part 7');
  const meta = await call('PUT', '/api/annex8/month/meta', {
    report_uuid: reportUuid,
    events: {
      e6_1: { yes: false }, e6_2: { yes: false }, e6_3: { yes: false },
      e6_4: { yes: false }, e6_5: { yes: false },
      e6_6: { yes: true, details: 'ត្រាលេខ S-55021 ដកពេលជួសជុលឧបករណ៍ចែកចាយប្រេង FD-77120 ហើយបានជូនដំណឹងតាមឧបសម្ព័ន្ធទី១០ លេខ NTF-26-0331' },
    },
    declaration_accepted: true,
  });
  must(meta.status === 200, `declaration accepted (HTTP ${meta.status})`, meta.json);

  const review2 = await call('GET', `/api/annex8/month/review?report_uuid=${reportUuid}`);
  must((review2.json?.blocking || []).length === 0,
       `nothing blocks once Part 6 is answered (${(review2.json?.blocking || []).length})`);
  must(review2.json?.can_submit === true, 'can_submit is now true');

  say('SUBMIT');
  const submit = await call('POST', '/api/annex8/month/submit', { report_uuid: reportUuid });
  must(submit.status === 200, `submitted (HTTP ${submit.status})`, submit.json);
  const r = submit.json?.report || {};
  detail(`receipt ${r.report_id}`);
  detail(`status ${r.status}, on_time ${r.on_time}`);
  must(!!r.report_id && /^NMC-RPT-\d{6}-\d{5}$/.test(r.report_id || ''), 'receipt number has the Art. 21 format');
  must(r.status === 'SUBMITTED', 'the month is locked as SUBMITTED');

  say('LOCKED — a further entry must be refused');
  const late = await entry('instrument', {
    op_code: 'M', category: 'NAWI', instrument_name: 'ក្រោយដាក់ជូន', serial_no: 'X-999',
    completion_date: `${PERIOD}-20`, verification_status: 'PENDING',
  });
  must(late.status === 409, `refused with HTTP ${late.status} (expected 409)`, late.json);

  say('WORD — the official document');
  const doc = await fetch(`${BASE}/api/reports/${reportUuid}/annex8.docx`, { headers: H });
  const buf = Buffer.from(await doc.arrayBuffer());
  must(doc.status === 200, `download returns HTTP ${doc.status}`);
  must(buf[0] === 0x50 && buf[1] === 0x4b, 'the file is a real .docx (PK zip signature)');
  detail(`${buf.length.toLocaleString()} bytes, ${doc.headers.get('content-type')}`);
  detail(`filename: ${doc.headers.get('content-disposition')}`);

  console.log(process.exitCode ? '\n=== SCENARIO FAILED ===\n' : '\n=== SCENARIO PASSED ===\n');
})();
