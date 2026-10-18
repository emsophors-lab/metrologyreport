/**
 * The MySQL adapter, checked against a real database.
 *
 *   npm run mysql:check          (needs a local MySQL with the mlrs schema:
 *                                 .\scripts\mysql-local.ps1 start, load, seed)
 *
 * Every check here is something that would be wrong in a way nobody notices
 * until it matters: a boolean arriving as 0, a date arriving as a Date, Khmer
 * arriving mangled, an unfiltered DELETE going through, two open months for
 * one licensee. The query builder is a translation layer, and a translation
 * layer is exactly the kind of code that looks right and is not.
 */
import { createMysqlClient } from '../src/db/mysqlClient';

const db = createMysqlClient('mysql://root@127.0.0.1:3306/mlrs');

let fail = 0;
const ok = (name: string, cond: boolean, extra?: any) => {
  if (cond) console.log(`  OK   ${name}`);
  else { fail++; console.error(`  FAIL ${name}`, extra === undefined ? '' : JSON.stringify(extra)); }
};

(async () => {
  // Start from a known state. A run that fails part way leaves its test month
  // behind, and the next run would then fail for the wrong reason — which is
  // exactly what happened the first time this was run.
  await db.from('annex8_report_drafts').delete().eq('period_month', '2026-10');
  await db.from('annex8_reports').delete().eq('period_month', '2026-10');
  await db.from('annex8_report_counters').delete().eq('period_month', '2026-11');

  console.log('\nselect / filters');
  const { data: users, error: e1 } = await db.from('users').select('*').eq('role', 'company');
  ok('eq returns the company account', !e1 && users.length === 1, e1 || users);
  ok('TINYINT(1) comes back as a boolean', users[0]?.is_active === true, typeof users[0]?.is_active);
  ok('a deactivated check would work', users[0]?.is_active !== false);
  ok('Khmer survives the round trip', users[0]?.company_name_kh === 'ក្រុមហ៊ុន មាត្រាសាស្ត្រ បូកគោ', users[0]?.company_name_kh);
  ok('created_at is an ISO string', typeof users[0]?.created_at === 'string' && users[0].created_at.endsWith('Z'), users[0]?.created_at);

  const { data: one } = await db.from('users').select('*').eq('username', 'superadmin').maybeSingle();
  ok('maybeSingle returns a row', one?.role === 'superadmin');
  const { data: none } = await db.from('users').select('*').eq('username', 'nobody').maybeSingle();
  ok('maybeSingle returns null when absent', none === null);
  const { error: eSingle } = await db.from('users').select('*').eq('username', 'nobody').single();
  ok('single errors when absent', !!eSingle);

  const { data: inRows } = await db.from('annex8_licence_scope')
    .select('*').in('category_code', ['NAWI', 'WEIGHBRIDGE']);
  ok('in() filters', inRows.length === 2, inRows.length);
  const { data: emptyIn } = await db.from('annex8_licence_scope').select('*').in('category_code', []);
  ok('in([]) matches nothing instead of erroring', emptyIn.length === 0);

  const { data: notNull } = await db.from('annex8_licence_standards')
    .select('*').not('cal_cert_no', 'is', null);
  ok('not(is null)', notNull.length === 2, notNull.length);
  const { data: isNull } = await db.from('annex8_report_instruments').select('*').is('deleted_at', null);
  ok('is(null)', Array.isArray(isNull));

  const { data: ordered } = await db.from('annex8_licence_technicians')
    .select('*').order('full_name', { ascending: false }).limit(1);
  ok('order + limit', ordered.length === 1);

  const { data: ored } = await db.from('annex8_licence_standards')
    .select('*').or('equipment.ilike.%ធុង%,serial_no.ilike.%F1%');
  ok('or() with ilike', ored.length === 2, ored.length);

  console.log('\ninsert / update / delete');
  const { data: inserted, error: e2 } = await db.from('annex8_reports')
    .insert({ licence_no: 'LIC-2026-001', period_month: '2026-10', status: 'OPEN', report_type: 'REGULAR' })
    .select('*').single();
  ok('insert().select().single() reads the row back', !e2 && !!inserted?.id, e2 || inserted);
  ok('the generated id is a uuid', /^[0-9a-f-]{36}$/.test(inserted?.id || ''), inserted?.id);
  ok('declaration_accepted defaults to boolean false', inserted?.declaration_accepted === false);

  const reportId = inserted.id;

  const { error: e3 } = await db.from('annex8_reports')
    .insert({ licence_no: 'LIC-2026-001', period_month: '2026-10', status: 'OPEN', report_type: 'REGULAR' });
  ok('a second OPEN month is refused by the database', !!e3 && /Duplicate/i.test(e3.message), e3);

  const { data: updated } = await db.from('annex8_reports')
    .update({ contact_name: 'លោក សុខ វិសាល' }).eq('id', reportId).select('*').single();
  ok('update().select() returns the new value', updated?.contact_name === 'លោក សុខ វិសាល', updated?.contact_name);

  const { data: entry, error: e4 } = await db.from('annex8_report_instruments')
    .insert({
      report_uuid: reportId, row_no: 1, op_code: 'I', category: 'WEIGHBRIDGE',
      instrument_name: 'ជញ្ជីងថ្លឹងរថយន្ត', serial_no: 'WB-26-9001',
      completion_date: '2026-10-05', verification_status: 'PASSED',
    }).select('*').single();
  ok('an entry row inserts', !e4 && !!entry?.id, e4);
  ok('DATE stays YYYY-MM-DD', entry?.completion_date === '2026-10-05', entry?.completion_date);

  console.log('\ntimestamps');
  // server.ts writes instants as ISO strings. MySQL rejects that format
  // outright, so the adapter has to convert — this is what broke the first
  // run of the sample scenario.
  const nowIso = new Date().toISOString();
  const { error: eIso } = await db.from('annex8_reports')
    .update({ opened_at: nowIso, opened_by: 'user-co-001' }).eq('id', reportId);
  ok('an ISO instant writes into a DATETIME column', !eIso, eIso);
  const { data: tsRow } = await db.from('annex8_reports').select('*').eq('id', reportId).single();
  ok('and reads back as the same instant',
    tsRow?.opened_at && Math.abs(new Date(tsRow.opened_at).getTime() - new Date(nowIso).getTime()) < 1000,
    tsRow?.opened_at);
  ok('a plain date is left alone', tsRow?.licence_valid_to === null || typeof tsRow?.licence_valid_to === 'string');

  console.log('\nJSON columns');
  await db.from('annex8_reports')
    .update({ events: { seal_broken: true, note: 'ត្រាបាក់' } }).eq('id', reportId);
  const { data: withJson } = await db.from('annex8_reports').select('*').eq('id', reportId).single();
  ok('an object writes and reads back as an object', withJson?.events?.seal_broken === true, withJson?.events);
  ok('Khmer inside JSON survives', withJson?.events?.note === 'ត្រាបាក់', withJson?.events?.note);

  console.log('\nupsert');
  await db.from('annex8_report_drafts').upsert(
    { licence_no: 'LIC-2026-001', period_month: '2026-10', payload: { a: 1 }, draft_kind: 'ENTRY' },
    { onConflict: 'licence_no,period_month' });
  await db.from('annex8_report_drafts').upsert(
    { licence_no: 'LIC-2026-001', period_month: '2026-10', payload: { a: 2 }, draft_kind: 'ENTRY' },
    { onConflict: 'licence_no,period_month' });
  const { data: drafts } = await db.from('annex8_report_drafts').select('*').eq('period_month', '2026-10');
  ok('upsert on a composite key replaces, not duplicates', drafts.length === 1, drafts.length);
  ok('the upserted payload is the second one', drafts[0]?.payload?.a === 2, drafts[0]?.payload);

  console.log('\nrpc');
  const { data: totals, error: e5 } = await db.rpc('annex8_part2_totals', { p_report_uuid: reportId });
  ok('part2 totals come back as an object', !e5 && totals?.total?.installed === 1, e5 || totals);
  const { data: num } = await db.rpc('annex8_next_report_id', { p_period: '2026-11' });
  ok('report numbering through a procedure', num === 'NMC-RPT-202611-00001', num);
  const { data: onTime } = await db.rpc('annex8_is_on_time', { p_period: '2026-10' });
  ok('on_time is a boolean', onTime === true, onTime);
  const { error: e6 } = await db.rpc('no_such_routine', {});
  ok('an unknown routine is an error, not a silent null', !!e6);

  console.log('\nrefusals');
  const { error: e7 } = await db.from('users').delete();
  ok('an unfiltered DELETE is refused', !!e7 && /unfiltered/i.test(e7.message), e7);
  const { error: e8 } = await db.from('users').select('id, companies(name)');
  ok('an embedded select is refused rather than ignored', !!e8, e8);

  console.log('\ncleanup');
  await db.from('annex8_report_drafts').delete().eq('period_month', '2026-10');
  await db.from('annex8_reports').delete().eq('id', reportId);
  const { data: left } = await db.from('annex8_reports').select('*').eq('period_month', '2026-10');
  ok('delete removed the report', left.length === 0);
  ok('and cascaded to its entries',
    (await db.from('annex8_report_instruments').select('*').eq('report_uuid', reportId)).data.length === 0);

  await db.end();
  console.log(fail ? `\n${fail} check(s) FAILED\n` : '\nAll adapter checks pass.\n');
  process.exit(fail ? 1 : 0);
})();
