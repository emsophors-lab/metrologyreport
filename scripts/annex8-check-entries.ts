/**
 * Annex 8 entry rules — run in CI.
 *
 *   npm run annex8:check:entries
 *
 * Two rules decide things a user would never forgive getting wrong, and
 * neither needs a database to check:
 *
 *  1. Which month an entry is filed under. It is the month the WORK happened,
 *     not the month it was typed, so a job finished on 31 August and entered
 *     on 2 September belongs to August.
 *
 *  2. What a duplicate copies. Duplicate exists so eight load cells on one
 *     weighbridge are not typed eight times — but it must never carry over a
 *     serial number, a label, or a verification result, or one unit's
 *     certificate would end up attached to another.
 */
import {
  ENTRY_CONFIG, ENTRY_PARTS, duplicateValues, isEditableStatus,
  periodForEntry, periodOfDate, pickEntryColumns,
} from '../src/annex8/entries';

let failures = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.error(`  ✗ ${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
};

/* ---------------------------------------------------------------- *
 * 1. Which month
 * ---------------------------------------------------------------- */
console.log('\nMonth an entry is filed under');

check('plain date', periodOfDate('2026-09-18'), '2026-09');
check('empty date', periodOfDate(''), '');
check('null date', periodOfDate(null), '');
check('month 13 refused', periodOfDate('2026-13-01'), '');
check('month 00 refused', periodOfDate('2026-00-01'), '');

check(
  'instrument completed 31 Aug, typed in Sep, files to August',
  periodForEntry('instrument', { completion_date: '2026-08-31' }, '2026-09'),
  '2026-08',
);
check(
  'repair finished 2 Sep files to September',
  periodForEntry('repair', { repair_to: '2026-09-02' }, '2026-09'),
  '2026-09',
);
check(
  'instrument with no date falls back to the month being worked in',
  periodForEntry('instrument', {}, '2026-09'),
  '2026-09',
);
check(
  'module follows the month being worked in, it has no date of its own',
  periodForEntry('module', { serial_no: 'LC-1' }, '2026-09'),
  '2026-09',
);
check(
  'standard likewise',
  periodForEntry('standard', { due_date: '2027-01-01' }, '2026-09'),
  '2026-09',
);

/* ---------------------------------------------------------------- *
 * 2. What a duplicate copies
 * ---------------------------------------------------------------- */
console.log('\nDuplicating an entry');

const weighbridgeLoadCell = {
  id: 'row-1', report_uuid: 'r1', row_no: 3,
  host_serial_no: 'WB-26-0012', host_part: 'P3',
  module_name: 'Load cell', model: 'ZSFY-30t',
  serial_no: 'LC-8812', range_e: '30 t / C3',
  manufacturer: 'Keli', country: 'China',
  cert_no: 'R60/2017-CN1-21.04', new_or_replacement: 'NEW',
};
const copy = duplicateValues('module', weighbridgeLoadCell);

check('keeps the host instrument', copy.host_serial_no, 'WB-26-0012');
check('keeps the model', copy.model, 'ZSFY-30t');
check('keeps the manufacturer', copy.manufacturer, 'Keli');
check('does NOT copy the serial', copy.serial_no, undefined);
check('does NOT copy the certificate', copy.cert_no, undefined);
check('does not copy the row number', copy.row_no, undefined);
check('does not copy the id', (copy as any).id, undefined);

const verifiedInstrument = {
  id: 'i1', row_no: 1, op_code: 'I', category: 'WEIGHBRIDGE',
  instrument_name: 'ជញ្ជីងថ្លឹងរថយន្ត', model: 'WB-60', serial_no: 'WB-26-0012',
  manufacturer: 'Example Scale', country: 'Cambodia', customer_name: 'ក្រុមហ៊ុន ក',
  completion_date: '2026-09-18', label_qr_no: 'QR-000981',
  verification_status: 'PASSED', verification_cert_no: 'VC-26-1102', verification_date: '2026-09-22',
};
const instrumentCopy = duplicateValues('instrument', verifiedInstrument);

check('keeps the customer', instrumentCopy.customer_name, 'ក្រុមហ៊ុន ក');
check('keeps the completion date', instrumentCopy.completion_date, '2026-09-18');
check('does NOT copy the serial', instrumentCopy.serial_no, undefined);
check('does NOT copy the QR label', instrumentCopy.label_qr_no, undefined);
check('does NOT copy the certificate', instrumentCopy.verification_cert_no, undefined);
check('does NOT copy the verification date', instrumentCopy.verification_date, undefined);
check('a copy starts unverified', instrumentCopy.verification_status, 'PENDING');

const sealedRepair = {
  id: 'p1', row_no: 1, category: 'FUEL_DISPENSER', instrument_name: 'ឧបករណ៍ចែកចាយប្រេង',
  serial_no: 'FD-77120', seal_broken: true, seal_removed_no: 'S-55021',
  notification_no: 'NTF-26-0331', repair_to: '2026-09-11',
  verification_status: 'PASSED', verification_cert_no: 'VC-26-1150',
};
const repairCopy = duplicateValues('repair', sealedRepair);
check('keeps that a seal was broken', repairCopy.seal_broken, true);
check('does NOT copy the seal number', repairCopy.seal_removed_no, undefined);
check('does NOT copy the Annex 10 notification', repairCopy.notification_no, undefined);

/* ---------------------------------------------------------------- *
 * 3. Only the licensee's own months may be edited
 * ---------------------------------------------------------------- */
console.log('\nWhich months accept changes');
check('OPEN', isEditableStatus('OPEN'), true);
check('RETURNED by NMC', isEditableStatus('RETURNED'), true);
check('legacy DRAFT', isEditableStatus('DRAFT'), true);
check('SUBMITTED', isEditableStatus('SUBMITTED'), false);
check('ACCEPTED', isEditableStatus('ACCEPTED'), false);

/* ---------------------------------------------------------------- *
 * 4. A client cannot write a column it was not given
 * ---------------------------------------------------------------- */
console.log('\nColumn allow-list');
const sneaky = pickEntryColumns('instrument', {
  serial_no: 'X-1', report_uuid: 'someone-elses-report',
  deleted_at: null, created_by: 'admin', id: 'forced-id', row_no: 99,
});
check('keeps an allowed column', sneaky.serial_no, 'X-1');
check('drops report_uuid', sneaky.report_uuid, undefined);
check('drops deleted_at', sneaky.deleted_at, undefined);
check('drops created_by', sneaky.created_by, undefined);
check('drops id', sneaky.id, undefined);

/* Every configured column must be one the database actually has — guarded by
 * the shape of the config rather than a live connection. */
console.log('\nConfiguration sanity');
for (const part of ENTRY_PARTS) {
  const config = ENTRY_CONFIG[part];
  check(`${part}: has a table`, typeof config.table === 'string' && config.table.length > 0, true);
  check(`${part}: row_no is writable`, config.columns.includes('row_no'), true);
  const unknown = config.uniquePerEntry.filter((c) => !config.columns.includes(c));
  check(`${part}: duplicate exclusions all exist`, unknown, []);
  if (config.activityDate) {
    check(`${part}: activity date is a real column`, config.columns.includes(config.activityDate), true);
  }
}

console.log('');
if (failures) {
  console.error(`✗ ${failures} check(s) failed\n`);
  process.exit(1);
}
console.log('✓ All entry rules hold.\n');
