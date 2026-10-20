/**
 * Annex 8 — working Excel export.
 *
 * This is a DATA export for the licensee's own records and for pasting into
 * spreadsheets. It is NOT the official annex.
 *
 * The official ឧបសម្ព័ន្ធទី៨ is produced only by filling the Word template,
 * src/lib/annex8/annex8Docx.ts → public/templates/Annex8_template_v1.docx,
 * which is the single source of truth for layout, fonts, sizes, borders and
 * page orientation. The hand-built Word document and print-to-PDF layout that
 * used to live in this file were removed: building the official report's layout
 * in code is exactly what must not happen, and two differently-laid-out
 * "official" Words is worse than none.
 */

import { CATEGORIES, CATEGORY_CODES, EVENTS } from './constants';
import { Annex8State } from './types';
import { computeSummary } from './summary';

const catLabel = (code: string) =>
  CATEGORIES[code as keyof typeof CATEGORIES]?.kh || code || '—';

export async function exportAnnex8Excel(state: Annex8State, serverRender = false): Promise<ArrayBuffer | void> {
  if (!serverRender) {
    const { downloadIssuedExport } = await import('../reports/issuedExportClient');
    if (await downloadIssuedExport({ kind: 'annex8-draft', format: 'xlsx', state },
      `Annex8_${state.meta.licence_no || 'report'}_${state.meta.period_month}.xlsx`)) return;
  }
  const XLSX = await import('xlsx');
  const summary = computeSummary(state);
  const m = state.meta;
  const wb = XLSX.utils.book_new();

  const part1 = [
    ['របាយការណ៍ប្រចាំខែ (ឧបសម្ព័ន្ធទី៨) | Monthly Report — Annex 8'],
    ['Format version', state.format_version],
    ['Report ID', m.report_id || '(draft)'],
    ['ឈ្មោះសហគ្រាស | Enterprise (KH)', m.enterprise_name_kh],
    ['Enterprise (EN)', m.enterprise_name_en],
    ['លេខអាជ្ញាប័ណ្ណ | Licence No.', m.licence_no],
    ['សុពលភាព | Valid to', m.licence_valid_to],
    ['ប្រភេទអាជ្ញាប័ណ្ណ | Licence type', m.licence_type],
    ['លេខចុះបញ្ជី | Registration No.', m.registration_no],
    ['អាសយដ្ឋាន | Operating address', m.operating_address],
    ['ខែរាយការណ៍ | Period', m.period_month],
    ['ប្រភេទរបាយការណ៍ | Report type', m.report_type],
    ['លេខរបាយការណ៍ដើម | Original report', m.original_report_id],
    ['អ្នកទទួលខុសត្រូវ | Contact', `${m.contact.name} · ${m.contact.position} · ${m.contact.phone} · ${m.contact.email}`],
    ['ដាក់ជូន | Submitted at', state.submitted_at || '(not submitted)'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(part1), 'Part 1');

  const part2 = [
    ['ល.រ', 'ប្រភេទឧបករណ៍ | Category', 'ផលិត | Manuf.', 'ដំឡើង | Install', 'ជួសជុល | Repair', 'ជាប់ | Passed', 'ធ្លាក់ | Failed', 'រង់ចាំ | Pending'],
    ...CATEGORY_CODES.map((code, i) => {
      const r = summary.rows[code];
      return [i + 1, CATEGORIES[code].kh, r.manufactured, r.installed, r.repaired, r.passed, r.failed, r.pending];
    }),
    ['', 'សរុប | Total', summary.total.manufactured, summary.total.installed, summary.total.repaired,
      summary.total.passed, summary.total.failed, summary.total.pending],
    [],
    ['V01 identity', `${summary.activity} = ${summary.results}`, summary.balanced ? 'OK' : 'MISMATCH'],
    ['ទីតាំង | Provinces', summary.provinces.join(', ')],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(part2), 'Part 2');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['ល.រ', 'ផ/ដ', 'ប្រភេទ', 'ឈ្មោះឧបករណ៍', 'ម៉ូដែល', 'លេខស៊េរី', 'សហគ្រាសផលិត', 'ប្រទេស',
      'Max', 'Min', 'e', 'ឯកតា', 'ថ្នាក់សុក្រឹតភាព', 'លេខអនុម័តគំរូ', 'ថ្ងៃបញ្ចប់',
      'អតិថិជន', 'ខេត្ត', 'អាសយដ្ឋាន', 'Lat', 'Long', 'លេខស្លាក/QR', 'ផ្ទៀងផ្ទាត់', 'លេខវិញ្ញាបនបត្រ', 'ថ្ងៃផ្ទៀងផ្ទាត់'],
    ...state.instruments.map((x, i) => [i + 1, x.op_code, catLabel(x.category), x.instrument_name, x.model,
      x.serial_no, x.manufacturer, x.country, x.max, x.min, x.e, x.unit, x.accuracy_class,
      x.type_approval_no, x.completion_date, x.customer_name, x.province, x.address, x.lat, x.long,
      x.label_qr_no, x.verification_status, x.verification_cert_no, x.verification_date]),
  ]), 'Part 3');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['ល.រ', 'លេខស៊េរីឧបករណ៍មេ', 'ផ្នែក', 'ឈ្មោះម៉ូឌុល', 'ម៉ូដែល', 'លេខស៊េរី', 'កម្រិតរង្វាស់ និង e',
      'សហគ្រាសផលិត', 'ប្រទេស', 'លេខវិញ្ញាបនបត្រ', 'ថ្មី/ជំនួស'],
    ...state.modules.map((x, i) => [i + 1, x.host_serial_no, '', x.module_name, x.model, x.serial_no,
      x.range_e, x.manufacturer, x.country, x.cert_no, x.new_or_replacement]),
  ]), 'Part 3A');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['ល.រ', 'ប្រភេទ', 'ឈ្មោះឧបករណ៍', 'ម៉ូដែល', 'លេខស៊េរី', 'អតិថិជន', 'ខេត្ត', 'អាសយដ្ឋាន', 'Lat', 'Long',
      'ចាប់ផ្ដើម', 'បញ្ចប់', 'ខ្លឹមសារ', 'Seal ដកចេញ', 'លេខ Seal', 'លេខជូនដំណឹង', 'អ្នកបច្ចេកទេស',
      'ផ្ទៀងផ្ទាត់', 'លេខវិញ្ញាបនបត្រ', 'ថ្ងៃផ្ទៀងផ្ទាត់'],
    ...state.repairs.map((x, i) => [i + 1, catLabel(x.category), x.instrument_name, x.model, x.serial_no,
      x.customer_name, x.province, x.address, x.lat, x.long, x.repair_from, x.repair_to,
      x.repair_description, x.seal_broken ? 'YES' : 'NO', x.seal_removed_no, x.notification_no,
      x.technician, x.verification_status, x.verification_cert_no, x.verification_date]),
  ]), 'Part 4');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['ល.រ', 'ឈ្មោះឧបករណ៍', 'លេខស៊េរី', 'ថ្នាក់/កម្រិត', 'លេខវិញ្ញាបនបត្រ', 'មន្ទីរពិសោធន៍', 'ថ្ងៃព្យាសកម្ម', 'ថ្ងៃកំណត់', 'ស្ថានភាព'],
    ...state.standards.map((x, i) => [i + 1, x.equipment, x.serial_no, x.class_range, x.cal_cert_no,
      x.lab, x.cal_date, x.due_date, x.status]),
  ]), 'Part 5');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['ល.រ', 'ចំណុច | Item', 'មាន/គ្មាន', 'ព័ត៌មានលម្អិត | Details'],
    ...EVENTS.map((ev) => {
      const e = state.events[ev.key];
      return [ev.no, `${ev.kh} | ${ev.en}`, e?.yes === true ? 'មាន' : e?.yes === false ? 'គ្មាន' : '', e?.details || ''];
    }),
    [],
    ['សេចក្ដីប្រកាសអះអាង | Declaration', state.declaration ? 'ACCEPTED' : 'NOT ACCEPTED'],
  ]), 'Part 6-7');

  if (serverRender) return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  XLSX.writeFile(wb, `Annex8_${m.licence_no || 'report'}_${m.period_month}.xlsx`);
}
