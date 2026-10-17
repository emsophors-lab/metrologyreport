/**
 * Annex 8 exports — Word, Excel and the print view used for PDF.
 *
 * The page plan is taken from the official Word annex
 * (ឧបសម្ព័ន្ធទី៨_របាយការណ៍ប្រចាំខែ_បញ្ចូលគ្នា.docx):
 *
 *   portrait   cover letter
 *   portrait   Part 1 + Part 2 + carry-over line
 *   landscape  Part 3, Part 3A, Part 4
 *   portrait   Part 5, Part 6, Part 7, "For NMC Use Only"
 *
 * PDF is produced by the browser's own print pipeline rather than jsPDF,
 * because jsPDF cannot shape Khmer script without an embedded font; printing
 * uses Khmer OS Siemreap / Khmer OS Muol Light exactly like the paper form.
 */

import { CATEGORIES, CATEGORY_CODES, EVENTS } from './constants';
import { Annex8State, Annex8Summary } from './types';
import { computeSummary, khmerMonthLabel, toKhmerDigits } from './summary';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const dash = (v: unknown) => (String(v ?? '').trim() === '' ? '—' : String(v));

const catLabel = (code: string) =>
  CATEGORIES[code as keyof typeof CATEGORIES]?.kh || code || '—';

/* ==================================================================== *
 *  PRINT VIEW  (→ PDF via the browser)
 * ==================================================================== */

const PRINT_CSS = `
@page portrait { size: A4 portrait; margin: 18mm 20mm; }
@page landscape { size: A4 landscape; margin: 14mm 14mm; }
#a8-print { font-family: "Khmer OS Siemreap", "Noto Sans Khmer", "Kantumruy Pro", sans-serif; color: #000; font-size: 10pt; }
#a8-print .page { page: portrait; page-break-after: always; }
#a8-print .page.landscape { page: landscape; }
#a8-print .page:last-child { page-break-after: auto; }
#a8-print .moul { font-family: "Khmer OS Muol Light", "Moul", serif; }
#a8-print .c { text-align: center; }
#a8-print .r { text-align: right; }
#a8-print .j { text-align: justify; }
#a8-print h3 { font-size: 10.5pt; margin: 10pt 0 4pt; }
#a8-print p { margin: 0 0 4pt; }
#a8-print table { border-collapse: collapse; width: 100%; font-size: 8.5pt; margin-bottom: 8pt; }
#a8-print th, #a8-print td { border: .6pt solid #000; padding: 2pt 3pt; vertical-align: middle; text-align: center; }
#a8-print th { background: #DCE3EE !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
#a8-print th small { display: block; font-weight: 400; font-size: 7pt; }
#a8-print .lt td { text-align: left; }
#a8-print .dots { letter-spacing: 1px; }
@media screen { #a8-print { background: #fff; padding: 16px; } #a8-print .page { border-bottom: 1px dashed #cbd5e1; padding-bottom: 20px; margin-bottom: 20px; } }
@media print {
  body > *:not(#a8-print-root) { display: none !important; }
  #a8-print-root, #a8-print { display: block !important; }
}
`;

function coverLetterHtml(state: Annex8State, summary: Annex8Summary): string {
  const m = state.meta;
  const isNil = m.report_type === 'NIL';
  const provinces = summary.provinces.length ? summary.provinces.join(', ') : '.'.repeat(60);

  return `<section class="page">
    <p class="c moul">ព្រះរាជាណាចក្រកម្ពុជា</p>
    <p class="c moul">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
    <p class="c">❀❀❀</p>
    <p style="margin-top:10pt">ឈ្មោះក្រុមហ៊ុន/សហគ្រាស៖ ${esc(dash(m.enterprise_name_kh))}</p>
    <p>លេខ៖ ${esc(m.report_id || '.'.repeat(24))}</p>
    <p class="c moul" style="margin-top:12pt">សូមគោរពជូន</p>
    <p class="c">ឯកឧត្តម/លោកជំទាវ ប្រធានមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
    <p style="margin-top:10pt"><b>កម្មវត្ថុ៖</b> គោរពជូនរបាយការណ៍ប្រចាំខែ ${esc(khmerMonthLabel(m.period_month))}
      ស្ដីពីសកម្មភាពផលិត ដំឡើង និងជួសជុលឧបករណ៍មាត្រាសាស្ត្រ។</p>
    <p><b>យោង៖</b> - ប្រការ២១ នៃប្រកាសស្ដីពីការគ្រប់គ្រង និងផ្ដល់អាជ្ញាប័ណ្ណ ផលិត ដំឡើង និងជួសជុលឧបករណ៍មាត្រាសាស្ត្រ</p>
    <p style="padding-left:28pt">- អាជ្ញាប័ណ្ណលេខ ${esc(dash(m.licence_no))} មានសុពលភាពរហូតដល់ ${esc(dash(m.licence_valid_to))}</p>
    <p class="j" style="margin-top:10pt">
      សេចក្ដីដូចមានចែងក្នុងកម្មវត្ថុ និងយោងខាងលើ ខ្ញុំបាទ/នាងខ្ញុំ សូមគោរពជម្រាបជូន ឯកឧត្តម/លោកជំទាវ ប្រធាន
      មេត្តាជ្រាបដ៏ខ្ពង់ខ្ពស់ថា ក្នុងខែ${esc(khmerMonthLabel(m.period_month))} សហគ្រាសខ្ញុំបាទ/នាងខ្ញុំ បានអនុវត្តសកម្មភាព
      ផលិតឧបករណ៍មាត្រាសាស្ត្រចំនួន <b>${esc(toKhmerDigits(summary.total.manufactured))}</b> គ្រឿង
      ដំឡើងចំនួន <b>${esc(toKhmerDigits(summary.total.installed))}</b> គ្រឿង
      និងជួសជុលចំនួន <b>${esc(toKhmerDigits(summary.total.repaired))}</b> គ្រឿង
      នៅទីតាំង (រាជធានី/ខេត្ត) ${esc(provinces)} ដូចមានព័ត៌មានលម្អិតក្នុងរបាយការណ៍ភ្ជាប់ជាមួយ។
    </p>
    <p style="margin-top:6pt">${isNil ? '☒' : '☐'} ក្នុងខែនេះ សហគ្រាសពុំមានសកម្មភាពផលិត ដំឡើង ឬជួសជុលឧបករណ៍មាត្រាសាស្ត្រឡើយ (No activity / Nil report)។</p>
    <p class="j" style="margin-top:8pt">អាស្រ័យហេតុនេះ សូម ឯកឧត្តម/លោកជំទាវប្រធាន មេត្តាជ្រាបជារបាយការណ៍ និងផ្ដល់ការណែនាំជាយថាហេតុ។</p>
    <p class="j">សូម ឯកឧត្តម/លោកជំទាវប្រធាន មេត្តាទទួលនូវការគោរពដ៏ខ្ពង់ខ្ពស់ពីខ្ញុំបាទ/នាងខ្ញុំ។</p>
    <div class="r" style="margin-top:22pt">
      <p>ធ្វើនៅ................ ថ្ងៃទី........ ខែ............ ឆ្នាំ........</p>
      <p class="moul" style="margin-top:6pt">ម្ចាស់សហគ្រាស ឬអ្នកតំណាងស្របច្បាប់</p>
      <p style="font-size:9pt"><i>${state.submitted_at
        ? `ដាក់ជូនតាមប្រព័ន្ធ MLRS លេខ ${esc(m.report_id)} · ${esc(state.submitted_at)}`
        : '(ឈ្មោះ ហត្ថលេខា និងត្រា)'}</i></p>
    </div>
  </section>`;
}

function part12Html(state: Annex8State, summary: Annex8Summary): string {
  const m = state.meta;
  const row = (no: string, label: string, value: string) =>
    `<tr class="lt"><td style="width:40pt">${no}</td><td style="width:170pt">${label}</td><td>${esc(value)}</td></tr>`;

  const typeLabel = { REGULAR: 'ធម្មតា | Regular', NIL: 'គ្មានសកម្មភាព | Nil report',
    AMENDMENT: `កែតម្រូវ | Amendment (${esc(m.original_report_id)})` }[m.report_type];

  return `<section class="page">
    <p class="c moul" style="font-size:12pt">របាយការណ៍ប្រចាំខែ</p>
    <p class="c" style="font-size:9pt">MONTHLY REPORT ON MANUFACTURE, INSTALLATION AND REPAIR OF MEASURING INSTRUMENTS</p>
    <p class="c">ខែ | Month ${esc(khmerMonthLabel(m.period_month))}</p>

    <h3>ផ្នែកទី១៖ ព័ត៌មានអ្នកកាន់អាជ្ញាប័ណ្ណ | Part 1: Licensee Information</h3>
    <table>
      ${row('១.១', 'ឈ្មោះសហគ្រាស<br><small>Enterprise\'s Name</small>', `${m.enterprise_name_kh} / ${m.enterprise_name_en}`)}
      ${row('១.២', 'លេខអាជ្ញាប័ណ្ណ និងសុពលភាព<br><small>License No. and Validity</small>', `${m.licence_no} — សុពលភាពដល់ ${dash(m.licence_valid_to)}`)}
      ${row('១.៣', 'ប្រភេទអាជ្ញាប័ណ្ណ<br><small>License Type</small>', m.licence_type === 'REPAIR' ? '☐ ផលិត ដំឡើង    ☒ ជួសជុល' : '☒ ផលិត ដំឡើង    ☐ ជួសជុល')}
      ${row('១.៤', 'លេខវិញ្ញាបនបត្រចុះបញ្ជីមាត្រាសាស្ត្រ<br><small>Metrology Registration No.</small>', dash(m.registration_no))}
      ${row('១.៥', 'អាសយដ្ឋានទីតាំងអនុវត្ត<br><small>Operating Address</small>', dash(m.operating_address))}
      ${row('១.៦', 'អ្នកទទួលខុសត្រូវរបាយការណ៍<br><small>Contact Person</small>',
        `${dash(m.contact.name)} · ${dash(m.contact.position)} · ${dash(m.contact.phone)} · ${dash(m.contact.email)}`)}
      ${row('១.៧', 'ប្រភេទរបាយការណ៍<br><small>Report Type</small>', typeLabel || '')}
    </table>

    <h3>ផ្នែកទី២៖ សង្ខេបសកម្មភាពប្រចាំខែ | Part 2: Monthly Summary</h3>
    <p style="font-size:8pt">គិតជាគ្រឿង។ សមីការជួរនីមួយៗ៖ ផលិត + ដំឡើង + ជួសជុល = ឆ្លង + មិនឆ្លង + រង់ចាំ។</p>
    <table>
      <tr>
        <th style="width:26pt">ល.រ<small>No.</small></th>
        <th class="lt">ប្រភេទឧបករណ៍<small>Instrument Category</small></th>
        <th>ផលិត<small>Manuf.</small></th><th>ដំឡើង<small>Install</small></th><th>ជួសជុល<small>Repair</small></th>
        <th>ឆ្លង<small>Passed</small></th><th>មិនឆ្លង<small>Failed</small></th><th>រង់ចាំ<small>Pending</small></th>
      </tr>
      ${CATEGORY_CODES.map((code, i) => {
        const r = summary.rows[code];
        const oiml = CATEGORIES[code].oiml ? ` (OIML ${CATEGORIES[code].oiml})` : '';
        return `<tr><td>${toKhmerDigits(i + 1)}</td><td style="text-align:left">${esc(CATEGORIES[code].kh)}${oiml}</td>
          <td>${r.manufactured || ''}</td><td>${r.installed || ''}</td><td>${r.repaired || ''}</td>
          <td>${r.passed || ''}</td><td>${r.failed || ''}</td><td>${r.pending || ''}</td></tr>`;
      }).join('')}
      <tr><td></td><td style="text-align:left"><b>សរុប | Total</b></td>
        <td><b>${summary.total.manufactured}</b></td><td><b>${summary.total.installed}</b></td><td><b>${summary.total.repaired}</b></td>
        <td><b>${summary.total.passed}</b></td><td><b>${summary.total.failed}</b></td><td><b>${summary.total.pending}</b></td></tr>
    </table>
    <p style="font-size:8.5pt">ឧបករណ៍រង់ចាំពីខែមុន ដែលបានផ្ទៀងផ្ទាត់ក្នុងខែនេះ | Pending from previous month:
      ចំនួន ${toKhmerDigits(summary.carryOver.count)} គ្រឿង៖
      ឆ្លង ${toKhmerDigits(summary.carryOver.passed)}
      មិនឆ្លង ${toKhmerDigits(summary.carryOver.failed)}
      នៅតែរង់ចាំ ${toKhmerDigits(summary.carryOver.pending)}</p>
  </section>`;
}

function part34Html(state: Annex8State): string {
  const isNil = state.meta.report_type === 'NIL';
  const blank = '<tr><td colspan="13" style="padding:10pt">—</td></tr>';

  const p3 = isNil || state.instruments.length === 0 ? blank : state.instruments.map((x, i) => `
    <tr>
      <td>${toKhmerDigits(i + 1)}</td><td>${x.op_code === 'M' ? 'ផ' : 'ដ'}</td>
      <td style="text-align:left">${esc(x.instrument_name)}<br><small>${esc(catLabel(x.category))}</small></td>
      <td>${esc(dash(x.model))}</td><td>${esc(dash(x.serial_no))}</td>
      <td>${esc(dash(x.manufacturer))}${x.country ? ` / ${esc(x.country)}` : ''}</td>
      <td>${esc(dash([x.max && `Max ${x.max}${x.unit}`, x.min && `Min ${x.min}${x.unit}`, x.e && `e ${x.e}`, x.accuracy_class].filter(Boolean).join(' · ')))}</td>
      <td>${esc(dash(x.type_approval_no))}</td><td>${esc(dash(x.completion_date))}</td>
      <td>${esc(dash(x.customer_name))}</td>
      <td style="text-align:left">${esc(dash(x.province))}${x.lat ? `<br><small>${esc(x.lat)}, ${esc(x.long)}</small>` : ''}</td>
      <td>${esc(dash(x.label_qr_no))}</td>
      <td>${esc(x.verification_status === 'PENDING' ? 'រង់ចាំ' : `${x.verification_cert_no} / ${x.verification_date}`)}</td>
    </tr>`).join('');

  const p3a = isNil || state.modules.length === 0
    ? '<tr><td colspan="11" style="padding:10pt">—</td></tr>'
    : state.modules.map((x, i) => `<tr>
        <td>${toKhmerDigits(i + 1)}</td><td>${esc(x.host_serial_no)}</td><td>${esc(dash(x.range_e ? '' : ''))}${esc(x.host_serial_no ? '' : '')}${esc('')}
        </td><td style="text-align:left">${esc(x.module_name)}</td><td>${esc(dash(x.model))}</td>
        <td>${esc(dash(x.serial_no))}</td><td>${esc(dash(x.range_e))}</td>
        <td>${esc(dash(x.manufacturer))}</td><td>${esc(dash(x.country))}</td>
        <td>${esc(dash(x.cert_no))}</td><td>${x.new_or_replacement === 'NEW' ? 'ថ្មី' : 'ជំនួស'}</td></tr>`).join('');

  const p4 = isNil || state.repairs.length === 0
    ? '<tr><td colspan="11" style="padding:10pt">—</td></tr>'
    : state.repairs.map((x, i) => `<tr>
        <td>${toKhmerDigits(i + 1)}</td>
        <td style="text-align:left">${esc(x.instrument_name)}${x.model ? ` / ${esc(x.model)}` : ''}<br><small>${esc(catLabel(x.category))}</small></td>
        <td>${esc(dash(x.serial_no))}</td><td>${esc(dash(x.customer_name))}</td>
        <td style="text-align:left">${esc(dash(x.province))}${x.lat ? `<br><small>${esc(x.lat)}, ${esc(x.long)}</small>` : ''}</td>
        <td>${esc(dash(x.repair_from))} – ${esc(dash(x.repair_to))}</td>
        <td style="text-align:left">${esc(dash(x.repair_description))}</td>
        <td>${esc(dash(x.seal_removed_no))}</td><td>${esc(dash(x.notification_no))}</td>
        <td>${esc(dash(x.technician))}</td>
        <td>${esc(x.verification_status === 'PENDING' ? 'រង់ចាំ' : `${x.verification_cert_no} / ${x.verification_date}`)}</td></tr>`).join('');

  return `<section class="page landscape">
    <h3>ផ្នែកទី៣៖ ឧបករណ៍មាត្រាសាស្ត្រដែលបានផលិត ឬដំឡើង | Part 3: Instruments Manufactured or Installed</h3>
    <table>
      <tr>
        <th>ល.រ<small>No.</small></th><th>ផ/ដ<small>M/I</small></th>
        <th>ឈ្មោះ/ប្រភេទឧបករណ៍<small>Instrument</small></th><th>ម៉ូដែល<small>Model</small></th>
        <th>លេខស៊េរី<small>Serial No.</small></th><th>សហគ្រាស និងប្រទេសផលិត<small>Manufacturer / Country</small></th>
        <th>Max / Min / e<small>or Accuracy Class</small></th><th>លេខអនុម័តគំរូ<small>Type Approval</small></th>
        <th>ថ្ងៃបញ្ចប់<small>Completion</small></th><th>ឈ្មោះអតិថិជន<small>Customer</small></th>
        <th>អាសយដ្ឋាន និងនិយាមការ<small>Province &amp; GPS</small></th><th>លេខស្លាក/QR<small>Label</small></th>
        <th>ផ្ទៀងផ្ទាត់<small>Verification</small></th>
      </tr>
      ${p3}
    </table>

    <h3>ផ្នែកទី៣ក៖ ម៉ូឌុល ឬគ្រឿងបន្លាស់ | Part 3A: Modules / Spare Parts</h3>
    <table>
      <tr>
        <th>ល.រ<small>No.</small></th><th>លេខស៊េរីឧបករណ៍មេ<small>Host Serial</small></th><th>ផ្នែក<small>Part</small></th>
        <th>ឈ្មោះម៉ូឌុល<small>Module</small></th><th>ម៉ូដែល<small>Model</small></th><th>លេខស៊េរី<small>Serial</small></th>
        <th>កម្រិតរង្វាស់ និង e<small>Range &amp; e</small></th><th>សហគ្រាសផលិត<small>Manufacturer</small></th>
        <th>ប្រទេស<small>Country</small></th><th>លេខវិញ្ញាបនបត្រ<small>Cert. No.</small></th><th>ថ្មី/ជំនួស<small>New/Repl.</small></th>
      </tr>
      ${p3a}
    </table>

    <h3>ផ្នែកទី៤៖ ការជួសជុលឧបករណ៍មាត្រាសាស្ត្រ | Part 4: Repairs</h3>
    <table>
      <tr>
        <th>ល.រ<small>No.</small></th><th>ឈ្មោះ និងម៉ូដែល<small>Instrument &amp; Model</small></th>
        <th>លេខស៊េរី<small>Serial</small></th><th>អតិថិជន<small>Customer</small></th>
        <th>អាសយដ្ឋាន និងនិយាមការ<small>Province &amp; GPS</small></th><th>កាលបរិច្ឆេទ<small>Repair date</small></th>
        <th>ខ្លឹមសារ<small>Description</small></th><th>Seal ដែលបានដក<small>Seal removed</small></th>
        <th>លេខជូនដំណឹង<small>Notification</small></th><th>អ្នកបច្ចេកទេស<small>Technician</small></th>
        <th>ផ្ទៀងផ្ទាត់បន្ទាប់<small>Verification</small></th>
      </tr>
      ${p4}
    </table>
  </section>`;
}

function part567Html(state: Annex8State): string {
  const isNil = state.meta.report_type === 'NIL';
  const p5 = isNil || state.standards.length === 0
    ? '<tr><td colspan="8" style="padding:10pt">—</td></tr>'
    : state.standards.map((x, i) => `<tr>
        <td>${toKhmerDigits(i + 1)}</td><td style="text-align:left">${esc(x.equipment)}</td>
        <td>${esc(dash(x.serial_no))}</td><td>${esc(dash(x.class_range))}</td>
        <td>${esc(dash(x.cal_cert_no))}</td><td>${esc(dash(x.lab))}</td>
        <td>${esc(dash(x.due_date))}</td><td>${esc(x.status)}</td></tr>`).join('');

  return `<section class="page">
    <h3>ផ្នែកទី៥៖ ឧបករណ៍ស្ដង់ដារ និងឧបករណ៍តេស្ត | Part 5: Measurement Standards &amp; Test Equipment</h3>
    <table>
      <tr><th>ល.រ<small>No.</small></th><th>ឈ្មោះឧបករណ៍<small>Equipment</small></th><th>លេខស៊េរី<small>Serial</small></th>
        <th>ថ្នាក់/កម្រិត<small>Class / Range</small></th><th>លេខវិញ្ញាបនបត្រ<small>Cal. Cert.</small></th>
        <th>មន្ទីរពិសោធន៍<small>Lab</small></th><th>ថ្ងៃកំណត់បន្ទាប់<small>Due Date</small></th><th>ស្ថានភាព<small>Status</small></th></tr>
      ${p5}
    </table>

    <h3>ផ្នែកទី៦៖ ការផ្លាស់ប្ដូរ និងព្រឹត្តិការណ៍ក្នុងខែ | Part 6: Changes and Events</h3>
    <table>
      <tr><th style="width:34pt">ល.រ</th><th class="lt">ចំណុច | Item</th><th style="width:70pt">មាន/គ្មាន</th><th>ព័ត៌មានលម្អិត | Details</th></tr>
      ${EVENTS.map((ev) => {
        const e = state.events[ev.key];
        return `<tr class="lt"><td style="text-align:center">${ev.no}</td><td>${esc(ev.kh)}<br><small>${esc(ev.en)}</small></td>
          <td style="text-align:center">${e?.yes === true ? '☒ មាន' : e?.yes === false ? '☒ គ្មាន' : '☐'}</td>
          <td>${esc(e?.details || '')}</td></tr>`;
      }).join('')}
    </table>

    <h3>ផ្នែកទី៧៖ សេចក្ដីប្រកាសអះអាង | Part 7: Declaration</h3>
    <p class="j" style="font-size:9pt">ខ្ញុំបាទ/នាងខ្ញុំ សូមធានាអះអាងថា ព័ត៌មានក្នុងរបាយការណ៍នេះ ពិតជាត្រឹមត្រូវ ពេញលេញ
      និងស្របតាមកំណត់ត្រាដែលរក្សាទុកនៅសហគ្រាស។ ការផ្ដល់ព័ត៌មានមិនពិត ឬមិនពេញលេញ អាចត្រូវរងវិធានការរដ្ឋបាល
      ដូចមានចែងក្នុងប្រការ២២ និងប្រការ២៦ នៃប្រកាស។ ${state.declaration ? '☒' : '☐'}</p>
    <table>
      <tr class="lt"><td style="width:50%">អ្នករៀបចំរបាយការណ៍ | Prepared by<br>
        ឈ្មោះ ${esc(dash(state.meta.contact.name))} · តួនាទី ${esc(dash(state.meta.contact.position))}</td>
        <td>ធ្វើនៅ................ ថ្ងៃទី...... ខែ............ ឆ្នាំ........<br>
        ម្ចាស់សហគ្រាស ឬអ្នកតំណាងស្របច្បាប់ (ហត្ថលេខា និងត្រា)</td></tr>
    </table>

    <table style="margin-top:10pt">
      <tr><th colspan="4" class="lt" style="text-align:left">សម្រាប់មន្ត្រីមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ | For NMC Use Only</th></tr>
      <tr class="lt"><td>ថ្ងៃទទួល៖ ....../....../.........</td><td>លេខចុះបញ្ជី៖ ${esc(state.meta.report_id || '.....................')}</td>
        <td>☐ ទាន់ពេល   ☐ យឺត</td><td>☐ ពេញលេញ   ☐ បំពេញបន្ថែម</td></tr>
      <tr class="lt"><td colspan="2">មន្ត្រីពិនិត្យ (ឈ្មោះ ហត្ថលេខា)</td><td colspan="2">កំណត់សម្គាល់៖</td></tr>
    </table>
    <p style="font-size:8pt;margin-top:6pt">${state.submitted_at
      ? `ដាក់ជូនតាមប្រព័ន្ធ MLRS៖ ${esc(state.meta.report_id)} · ${esc(state.submitted_at)}`
      : 'សេចក្ដីព្រាង — មិនទាន់ដាក់ជូន / Draft — not yet submitted'}</p>
  </section>`;
}

export function buildPrintHtml(state: Annex8State): string {
  const summary = computeSummary(state);
  return `<style>${PRINT_CSS}</style><div id="a8-print">
    ${coverLetterHtml(state, summary)}
    ${part12Html(state, summary)}
    ${part34Html(state)}
    ${part567Html(state)}
  </div>`;
}

/** Render the Annex 8 layout into a hidden host and invoke the print dialog. */
export function printAnnex8(state: Annex8State) {
  const hostId = 'a8-print-root';
  document.getElementById(hostId)?.remove();

  const host = document.createElement('div');
  host.id = hostId;
  host.innerHTML = buildPrintHtml(state);
  document.body.appendChild(host);

  const cleanup = () => {
    host.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  // Safari/Firefox do not always fire afterprint.
  window.setTimeout(cleanup, 60000);
}

/* ==================================================================== *
 *  EXCEL
 * ==================================================================== */

export async function exportAnnex8Excel(state: Annex8State) {
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
    ['ល.រ', 'ប្រភេទឧបករណ៍ | Category', 'ផលិត | Manuf.', 'ដំឡើង | Install', 'ជួសជុល | Repair', 'ឆ្លង | Passed', 'មិនឆ្លង | Failed', 'រង់ចាំ | Pending'],
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

  XLSX.writeFile(wb, `Annex8_${m.licence_no || 'report'}_${m.period_month}.xlsx`);
}

/* ==================================================================== *
 *  WORD
 * ==================================================================== */

export async function exportAnnex8Word(state: Annex8State) {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, HeadingLevel, WidthType, PageOrientation,
  } = await import('docx');
  const summary = computeSummary(state);
  const m = state.meta;

  const KH = 'Khmer OS Siemreap';
  const text = (s: string, opts: any = {}) =>
    new Paragraph({ children: [new TextRun({ text: s, font: KH, size: 20, ...opts })], ...(opts.align ? { alignment: opts.align } : {}) });
  const centred = (s: string, opts: any = {}) =>
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s, font: KH, size: 20, ...opts })] });
  const heading = (s: string) =>
    new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: s, font: KH, bold: true, size: 22 })] });

  const cell = (s: string, opts: any = {}) => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: s, font: KH, size: 16, bold: !!opts.bold })],
      alignment: opts.left ? AlignmentType.LEFT : AlignmentType.CENTER })],
  });
  const table = (rows: any[][]) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells) => new TableRow({ children: cells })),
  });

  // Page 1–2: cover letter, Part 1, Part 2 (portrait)
  const portraitFirst = [
    centred('ព្រះរាជាណាចក្រកម្ពុជា', { bold: true }),
    centred('ជាតិ សាសនា ព្រះមហាក្សត្រ', { bold: true }),
    centred('❀❀❀'),
    text(''),
    text(`ឈ្មោះក្រុមហ៊ុន/សហគ្រាស៖ ${m.enterprise_name_kh}`),
    text(`លេខ៖ ${m.report_id || '....................'}`),
    centred('សូមគោរពជូន', { bold: true }),
    centred('ឯកឧត្តម/លោកជំទាវ ប្រធានមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ'),
    text(''),
    text(`កម្មវត្ថុ៖ គោរពជូនរបាយការណ៍ប្រចាំខែ ${khmerMonthLabel(m.period_month)} ស្ដីពីសកម្មភាពផលិត ដំឡើង និងជួសជុលឧបករណ៍មាត្រាសាស្ត្រ។`),
    text(`យោង៖ ប្រការ២១ នៃប្រកាស · អាជ្ញាប័ណ្ណលេខ ${m.licence_no} មានសុពលភាពរហូតដល់ ${m.licence_valid_to || '—'}`),
    text(''),
    text(`ក្នុងខែ${khmerMonthLabel(m.period_month)} សហគ្រាសបានអនុវត្តសកម្មភាព ផលិតចំនួន ${summary.total.manufactured} គ្រឿង ` +
      `ដំឡើងចំនួន ${summary.total.installed} គ្រឿង និងជួសជុលចំនួន ${summary.total.repaired} គ្រឿង ` +
      `នៅទីតាំង (រាជធានី/ខេត្ត) ${summary.provinces.join(', ') || '—'}។`),
    text(m.report_type === 'NIL'
      ? '☒ ក្នុងខែនេះ សហគ្រាសពុំមានសកម្មភាពឡើយ (Nil report)។'
      : '☐ ក្នុងខែនេះ សហគ្រាសពុំមានសកម្មភាពឡើយ (Nil report)។'),
    text(''),
    heading('ផ្នែកទី១៖ ព័ត៌មានអ្នកកាន់អាជ្ញាប័ណ្ណ | Part 1: Licensee Information'),
    table([
      [cell('១.១', { bold: true }), cell('ឈ្មោះសហគ្រាស | Enterprise', { left: true }), cell(`${m.enterprise_name_kh} / ${m.enterprise_name_en}`, { left: true })],
      [cell('១.២', { bold: true }), cell('លេខអាជ្ញាប័ណ្ណ និងសុពលភាព', { left: true }), cell(`${m.licence_no} — ${m.licence_valid_to || '—'}`, { left: true })],
      [cell('១.៣', { bold: true }), cell('ប្រភេទអាជ្ញាប័ណ្ណ | Licence type', { left: true }), cell(m.licence_type, { left: true })],
      [cell('១.៤', { bold: true }), cell('លេខវិញ្ញាបនបត្រចុះបញ្ជី', { left: true }), cell(m.registration_no || '—', { left: true })],
      [cell('១.៥', { bold: true }), cell('អាសយដ្ឋានទីតាំងអនុវត្ត', { left: true }), cell(m.operating_address || '—', { left: true })],
      [cell('១.៦', { bold: true }), cell('អ្នកទទួលខុសត្រូវ | Contact', { left: true }), cell(`${m.contact.name} · ${m.contact.position} · ${m.contact.phone} · ${m.contact.email}`, { left: true })],
      [cell('១.៧', { bold: true }), cell('ប្រភេទរបាយការណ៍ | Report type', { left: true }), cell(m.report_type, { left: true })],
    ]),
    text(''),
    heading('ផ្នែកទី២៖ សង្ខេបសកម្មភាពប្រចាំខែ | Part 2: Monthly Summary'),
    table([
      ['ល.រ', 'ប្រភេទឧបករណ៍', 'ផលិត', 'ដំឡើង', 'ជួសជុល', 'ឆ្លង', 'មិនឆ្លង', 'រង់ចាំ'].map((h) => cell(h, { bold: true })),
      ...CATEGORY_CODES.map((code, i) => {
        const r = summary.rows[code];
        return [cell(String(i + 1)), cell(CATEGORIES[code].kh, { left: true }), cell(String(r.manufactured)),
          cell(String(r.installed)), cell(String(r.repaired)), cell(String(r.passed)),
          cell(String(r.failed)), cell(String(r.pending))];
      }),
      [cell(''), cell('សរុប | Total', { bold: true, left: true }), cell(String(summary.total.manufactured), { bold: true }),
        cell(String(summary.total.installed), { bold: true }), cell(String(summary.total.repaired), { bold: true }),
        cell(String(summary.total.passed), { bold: true }), cell(String(summary.total.failed), { bold: true }),
        cell(String(summary.total.pending), { bold: true })],
    ]),
    text(`ឧបករណ៍រង់ចាំពីខែមុន៖ ចំនួន ${summary.carryOver.count} គ្រឿង · ឆ្លង ${summary.carryOver.passed} · មិនឆ្លង ${summary.carryOver.failed} · នៅតែរង់ចាំ ${summary.carryOver.pending}`),
  ];

  // Page 3: Parts 3, 3A, 4 (landscape)
  const landscape = [
    heading('ផ្នែកទី៣៖ ឧបករណ៍ដែលបានផលិត ឬដំឡើង | Part 3'),
    table([
      ['ល.រ', 'ផ/ដ', 'ឈ្មោះឧបករណ៍', 'ម៉ូដែល', 'លេខស៊េរី', 'ផលិតដោយ/ប្រទេស', 'Max/Min/e', 'អនុម័តគំរូ', 'ថ្ងៃបញ្ចប់', 'អតិថិជន', 'ខេត្ត & GPS', 'ស្លាក/QR', 'ផ្ទៀងផ្ទាត់'].map((h) => cell(h, { bold: true })),
      ...(state.instruments.length ? state.instruments.map((x, i) => [
        cell(String(i + 1)), cell(x.op_code), cell(x.instrument_name, { left: true }), cell(x.model || '—'),
        cell(x.serial_no), cell(`${x.manufacturer || '—'} / ${x.country || '—'}`),
        cell([x.max && `Max ${x.max}${x.unit}`, x.min && `Min ${x.min}`, x.e && `e ${x.e}`, x.accuracy_class].filter(Boolean).join(' · ') || '—'),
        cell(x.type_approval_no || '—'), cell(x.completion_date || '—'), cell(x.customer_name || '—'),
        cell(`${x.province || '—'}${x.lat ? ` (${x.lat}, ${x.long})` : ''}`), cell(x.label_qr_no || '—'),
        cell(x.verification_status === 'PENDING' ? 'រង់ចាំ' : `${x.verification_cert_no} / ${x.verification_date}`),
      ]) : [[cell('—'), ...Array(12).fill(null).map(() => cell(''))]]),
    ]),
    text(''),
    heading('ផ្នែកទី៣ក៖ ម៉ូឌុល ឬគ្រឿងបន្លាស់ | Part 3A'),
    table([
      ['ល.រ', 'លេខស៊េរីមេ', 'ម៉ូឌុល', 'ម៉ូដែល', 'លេខស៊េរី', 'Range & e', 'ផលិតដោយ', 'ប្រទេស', 'វិញ្ញាបនបត្រ', 'ថ្មី/ជំនួស'].map((h) => cell(h, { bold: true })),
      ...(state.modules.length ? state.modules.map((x, i) => [
        cell(String(i + 1)), cell(x.host_serial_no), cell(x.module_name, { left: true }), cell(x.model || '—'),
        cell(x.serial_no || '—'), cell(x.range_e || '—'), cell(x.manufacturer || '—'), cell(x.country || '—'),
        cell(x.cert_no || '—'), cell(x.new_or_replacement),
      ]) : [[cell('—'), ...Array(9).fill(null).map(() => cell(''))]]),
    ]),
    text(''),
    heading('ផ្នែកទី៤៖ ការជួសជុល | Part 4'),
    table([
      ['ល.រ', 'ឧបករណ៍/ម៉ូដែល', 'លេខស៊េរី', 'អតិថិជន', 'ខេត្ត & GPS', 'កាលបរិច្ឆេទ', 'ខ្លឹមសារ', 'Seal', 'លេខជូនដំណឹង', 'អ្នកបច្ចេកទេស', 'ផ្ទៀងផ្ទាត់'].map((h) => cell(h, { bold: true })),
      ...(state.repairs.length ? state.repairs.map((x, i) => [
        cell(String(i + 1)), cell(`${x.instrument_name}${x.model ? ` / ${x.model}` : ''}`, { left: true }),
        cell(x.serial_no), cell(x.customer_name || '—'),
        cell(`${x.province || '—'}${x.lat ? ` (${x.lat}, ${x.long})` : ''}`),
        cell(`${x.repair_from || '—'} – ${x.repair_to || '—'}`), cell(x.repair_description || '—', { left: true }),
        cell(x.seal_removed_no || '—'), cell(x.notification_no || '—'), cell(x.technician || '—'),
        cell(x.verification_status === 'PENDING' ? 'រង់ចាំ' : `${x.verification_cert_no} / ${x.verification_date}`),
      ]) : [[cell('—'), ...Array(10).fill(null).map(() => cell(''))]]),
    ]),
  ];

  // Page 4: Parts 5, 6, 7 (portrait)
  const portraitLast = [
    heading('ផ្នែកទី៥៖ ឧបករណ៍ស្ដង់ដារ | Part 5'),
    table([
      ['ល.រ', 'ឧបករណ៍', 'លេខស៊េរី', 'ថ្នាក់/កម្រិត', 'វិញ្ញាបនបត្រ', 'មន្ទីរពិសោធន៍', 'ថ្ងៃកំណត់', 'ស្ថានភាព'].map((h) => cell(h, { bold: true })),
      ...(state.standards.length ? state.standards.map((x, i) => [
        cell(String(i + 1)), cell(x.equipment, { left: true }), cell(x.serial_no || '—'), cell(x.class_range || '—'),
        cell(x.cal_cert_no || '—'), cell(x.lab || '—'), cell(x.due_date || '—'), cell(x.status),
      ]) : [[cell('—'), ...Array(7).fill(null).map(() => cell(''))]]),
    ]),
    text(''),
    heading('ផ្នែកទី៦៖ ការផ្លាស់ប្ដូរ និងព្រឹត្តិការណ៍ | Part 6'),
    table([
      ['ល.រ', 'ចំណុច', 'មាន/គ្មាន', 'ព័ត៌មានលម្អិត'].map((h) => cell(h, { bold: true })),
      ...EVENTS.map((ev) => {
        const e = state.events[ev.key];
        return [cell(ev.no), cell(ev.kh, { left: true }),
          cell(e?.yes === true ? 'មាន' : e?.yes === false ? 'គ្មាន' : '—'), cell(e?.details || '—', { left: true })];
      }),
    ]),
    text(''),
    heading('ផ្នែកទី៧៖ សេចក្ដីប្រកាសអះអាង | Part 7: Declaration'),
    text('ខ្ញុំបាទ/នាងខ្ញុំ សូមធានាអះអាងថា ព័ត៌មានក្នុងរបាយការណ៍នេះ ពិតជាត្រឹមត្រូវ ពេញលេញ និងស្របតាមកំណត់ត្រាដែលរក្សាទុកនៅសហគ្រាស។ (ប្រការ២២ និង២៦)'),
    text(state.declaration ? '☒ បានយល់ព្រម | Accepted' : '☐ មិនទាន់យល់ព្រម'),
    text(''),
    text(state.submitted_at
      ? `ដាក់ជូនតាមប្រព័ន្ធ MLRS៖ ${m.report_id} · ${state.submitted_at}`
      : 'សេចក្ដីព្រាង — មិនទាន់ដាក់ជូន / Draft — not yet submitted', { italics: true }),
  ];

  const doc = new Document({
    sections: [
      { properties: {}, children: portraitFirst },
      { properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } }, children: landscape },
      { properties: {}, children: portraitLast },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Annex8_${m.licence_no || 'report'}_${m.period_month}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
