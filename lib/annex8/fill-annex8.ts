/**
 * MLRS · Annex 8 – fill the official Word template with report data.
 *
 *   npm i docxtemplater@3.47.4 pizzip@3.1.7
 *   npx tsx lib/annex8/fill-annex8.ts templates/Annex8_template_v1.docx lib/annex8/sample-payload.json out.docx
 *
 * The template is the single source of truth for layout and formatting.
 * This file ONLY prepares values for the tags; it never styles anything.
 * Input = the JSON payload produced by the MLRS form (format_version A8-2026.2).
 *
 * TypeScript port of the reference fill-annex8.js. The logic is unchanged —
 * every helper, every tag and every fallback is the same; only type
 * annotations and the module syntax were added. If the printed document looks
 * wrong, the fix belongs in the template, not here.
 */

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

// ---------- formatting helpers ----------
const KD = '០១២៣៤៥៦៧៨៩';
const kh = (v: unknown) => String(v ?? '').replace(/\d/g, (d) => KD[Number(d)]);
const KM = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
const BOX = (on: boolean) => (on ? '☑' : '☐');
const dmy = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '');   // 2026-09-30 -> 30/09/2026
const parts = (iso?: string): [string, string, string] => {
  if (!iso) return ['', '', ''];
  const [y, m, d] = iso.split('-');
  return [d, m, y];
};
const or = (v: unknown, fallback: string) =>
  (v === undefined || v === null || String(v).trim() === '' ? fallback : (v as string));
// Hand-fill fields keep their dotted line when the system has no value, so the printout still looks official.
const DOTS = (n: number) => '.'.repeat(n);

const CAT_CODE: Record<string, string> = {
  NAWI: 'nawi', WEIGHBRIDGE: 'weighbridge', WEIGHTS: 'weights', FUEL_DISPENSER: 'fuel', LPG_DISPENSER: 'lpg',
  ELEC_METER: 'elec', WATER_METER: 'water', EV_CHARGER: 'ev', OTHER: 'other',
};
const VTXT = (st?: string, no?: string, date?: string) =>
  (st === 'PENDING' || !st ? 'រង់ចាំ' : `${st === 'PASSED' ? 'ឆ្លង' : 'មិនឆ្លង'} ${or(no, '')} ${dmy(date)}`.trim());
const STD_KH: Record<string, string> = { VALID: 'មានសុពលភាព', EXPIRED: 'ផុតកំណត់', OUT_OF_SERVICE: 'ឈប់ប្រើ' };
const loc = (x: any) =>
  [x.province, x.address, (x.lat && x.long) ? `(${x.lat}, ${x.long})` : ''].filter(Boolean).join(' ');

/** Values the payload does not carry: taken from the licence record and the submission. */
export interface Annex8Extra {
  decision_no?: string;
  decision_date?: string;
  letter_no?: string;
  preparer_name?: string;
  preparer_position?: string;
  legal_rep_name?: string;
  /** Khmer lunar date text; left as the dotted line when absent. */
  lunar_date_line?: string;
  signed_place?: string;
  submitted_at?: string;
  received_at?: string;
  report_id?: string;
  on_time?: boolean;
}

type Counters = { m: number; i: number; r: number; passed: number; failed: number; pending: number };

/**
 * @param r      report payload (see MLRS_Annex8_field_spec.xlsx)
 * @param extra  data not in the payload: decision_no, decision_date, letter_no, preparer, legal_rep,
 *               lunar_date_line (Khmer lunar date text), received_at, report_id, on_time
 */
export function buildAnnex8Data(r: any, extra: Annex8Extra = {}): Record<string, any> {
  const m = r.meta;
  const [y, mo] = String(m.period_month).split('-').map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  const isNil = m.report_type === 'NIL';
  const ins: any[] = isNil ? [] : (r.part3_instruments || []);
  const mods: any[] = isNil ? [] : (r.part3a_modules || []);
  const reps: any[] = isNil ? [] : (r.part4_repairs || []);
  const stds: any[] = isNil ? [] : (r.part5_standards || []);

  // Part 2 – ALWAYS recomputed here from the rows (never trust client totals)
  const sum: Record<string, Counters> = {};
  Object.values(CAT_CODE).forEach((c) => { sum[c] = { m: 0, i: 0, r: 0, passed: 0, failed: 0, pending: 0 }; });
  const vkey = (s?: string) => (({ PASSED: 'passed', FAILED: 'failed' } as Record<string, string>)[s || ''] || 'pending');
  ins.forEach((x) => {
    const c = CAT_CODE[x.category];
    if (!c) return;
    sum[c][x.op_code === 'M' ? 'm' : 'i']++;
    (sum[c] as any)[vkey(x.verification_status)]++;
  });
  reps.forEach((x) => {
    const c = CAT_CODE[x.category];
    if (!c) return;
    sum[c].r++;
    (sum[c] as any)[vkey(x.verification_status)]++;
  });
  const total: Counters = { m: 0, i: 0, r: 0, passed: 0, failed: 0, pending: 0 };
  Object.values(sum).forEach((s) => Object.keys(total).forEach((k) => { (total as any)[k] += (s as any)[k]; }));
  const flat: Record<string, number> = {};
  Object.entries(sum).forEach(([c, s]) => Object.entries(s).forEach(([k, v]) => { flat[`${c}_${k}`] = v; }));
  Object.entries(total).forEach(([k, v]) => { flat[`total_${k}`] = v; });
  const others = [...new Set(ins.concat(reps).filter((x) => x.category === 'OTHER').map((x) => x.category_other).filter(Boolean))];

  const co: any[] = r.carry_over_updates || [];
  const coCount = (s: string) => co.filter((x) => x.status === s).length;
  const provinces = [...new Set(ins.concat(reps).map((x) => x.province).filter(Boolean))];
  const [vd, vm, vy] = parts(m.licence_valid_to);
  const [dd, dm, dy] = parts(extra.decision_date);
  const signed = extra.submitted_at ? new Date(extra.submitted_at) : null;
  const ev = r.part6_events || {};

  return {
    // cover letter
    enterprise_name_kh: m.enterprise_name_kh,
    enterprise_name_en: m.enterprise_name_en,
    letter_no: or(extra.letter_no, DOTS(45)),
    period_month_name_kh: KM[mo - 1],
    period_year_kh: kh(y),
    period_start_day_kh: kh('01'),
    period_end_day_kh: kh(lastDay),
    licence_no: m.licence_no,
    licence_valid_day_kh: kh(vd),
    licence_valid_month_kh: vm ? KM[Number(vm) - 1] : '',
    licence_valid_year_kh: kh(vy),
    licence_valid_to_kh: kh(dmy(m.licence_valid_to)),
    decision_no: or(extra.decision_no, DOTS(30)),
    decision_day_kh: or(kh(dd), DOTS(9)),
    decision_month_kh: dm ? KM[Number(dm) - 1] : DOTS(12),
    decision_year_kh: or(kh(dy), DOTS(14)),
    total_m_kh: kh(total.m), total_i_kh: kh(total.i), total_r_kh: kh(total.r),
    provinces_kh: provinces.length ? provinces.join(' ') : (isNil ? '—' : DOTS(40)),
    chk_nil: BOX(isNil),
    lunar_date_line: or(extra.lunar_date_line, 'ថ្ងៃ.................. ខែ............... ឆ្នាំ............... ព.ស.............'),
    signed_place_kh: or(extra.signed_place, DOTS(20)),
    signed_day_kh: signed ? kh(signed.getDate()) : DOTS(8),
    signed_month_kh: signed ? KM[signed.getMonth()] : DOTS(15),
    signed_year_kh: signed ? kh(signed.getFullYear()) : DOTS(15),

    // Part 1
    registration_no: m.registration_no,
    operating_address: m.operating_address,
    contact_line: [m.contact?.name, m.contact?.position, m.contact?.phone, m.contact?.email].filter(Boolean).join(', '),
    chk_lt_manuf: BOX(m.licence_type === 'MANUF_INSTALL'),
    chk_lt_repair: BOX(m.licence_type === 'REPAIR'),
    chk_regular: BOX(m.report_type === 'REGULAR'),
    chk_amendment: BOX(m.report_type === 'AMENDMENT'),
    original_report_id: m.report_type === 'AMENDMENT' ? m.original_report_id : DOTS(17),

    // Part 2
    ...flat,
    other_category_label: others.length ? `(${others.join(', ')})` : '(សូមបញ្ជាក់)....................',
    co_total: co.length, co_passed: coCount('PASSED'), co_failed: coCount('FAILED'), co_pending: coCount('PENDING'),

    // Parts 3, 3A, 4, 5 (loops: an empty array prints the "គ្មាន | None" row)
    instruments: ins.map((x, i) => ({
      no: i + 1,
      op_code_kh: x.op_code === 'M' ? 'ផ' : 'ដ',
      instrument_name: [x.instrument_name, x.category === 'OTHER' ? x.category_other : ''].filter(Boolean).join(' – '),
      model: x.model,
      serial_no: x.serial_no,
      manufacturer_country: [x.manufacturer, x.country].filter(Boolean).join(' / '),
      metrology_spec: [
        [x.max, x.min, x.e].filter((v: any) => v !== '' && v != null).join(' / '),
        x.unit,
        x.accuracy_class,
      ].filter(Boolean).join(' '),
      type_approval_no: x.type_approval_no,
      completion_date: dmy(x.completion_date),
      customer_name: x.customer_name || '',
      location: loc(x),
      label_qr_no: x.label_qr_no,
      verification_text: VTXT(x.verification_status, x.verification_cert_no, x.verification_date),
    })),
    modules: mods.map((x, i) => ({
      no: i + 1,
      host_serial_no: x.host_serial_no,
      part_kh: x.part === 'P4' ? '៤' : '៣',
      module_name: x.module_name,
      model: x.model,
      serial_no: x.serial_no,
      range_e: x.range_e || '',
      manufacturer: x.manufacturer,
      country: x.country,
      cert_no: x.cert_no,
      new_or_replacement_kh: x.new_or_replacement === 'REPLACEMENT' ? 'ជំនួស' : 'ថ្មី',
    })),
    repairs: reps.map((x, i) => ({
      no: i + 1,
      instrument_model: [x.instrument_name, x.model].filter(Boolean).join(' '),
      serial_no: x.serial_no,
      customer_name: x.customer_name,
      location: loc(x),
      repair_period: `${dmy(x.repair_from)} – ${dmy(x.repair_to)}`,
      repair_description: x.repair_description,
      seal_removed_no: x.seal_broken ? x.seal_removed_no : '—',
      notification_no: x.seal_broken ? x.notification_no : '—',
      technician: x.technician,
      verification_text: VTXT(x.verification_status, x.verification_cert_no, x.verification_date),
    })),
    standards: stds.map((x, i) => ({
      no: i + 1,
      equipment: x.equipment,
      serial_no: x.serial_no,
      class_range: x.class_range || '',
      cal_cert_no: x.cal_cert_no,
      lab: x.lab,
      due_date: dmy(x.due_date),
      status_kh: STD_KH[x.status] || x.status,
    })),

    // Part 6
    ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((n) => {
      const e = ev[`e6_${n}`] || {};
      return [
        [`e6_${n}_yes`, BOX(e.yes === true)],
        [`e6_${n}_no`, BOX(e.yes === false)],
        [`e6_${n}_details`, e.yes ? (e.details || '') : ''],
      ];
    })),

    // Part 7 & NMC box
    preparer_name: or(extra.preparer_name ?? m.contact?.name, DOTS(40)),
    preparer_position: or(extra.preparer_position ?? m.contact?.position, DOTS(39)),
    legal_rep_name: or(extra.legal_rep_name, DOTS(40)),
    received_date_kh: extra.received_at ? kh(dmy(extra.received_at.slice(0, 10))) : '....../....../.........',
    report_id: or(extra.report_id, DOTS(21)),
    chk_on_time: BOX(extra.on_time === true),
    chk_late: BOX(extra.on_time === false),
  };
}

export function renderAnnex8(templateBuf: Buffer, data: Record<string, any>): Buffer {
  const doc = new Docxtemplater(new PizZip(templateBuf), {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',               // unknown/missing value -> empty, never "undefined"
  });
  doc.render(data);                     // throws with the tag name if the template is broken
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Lists every tag in the template (use in CI to compare against buildAnnex8Data keys). */
export function listTags(templateBuf: Buffer): string[] {
  const zip = new PizZip(templateBuf);
  const xml = (zip.file('word/document.xml') as any).asText().replace(/<[^>]+>/g, '');
  return [...new Set([...xml.matchAll(/\{([#^/]?)([a-z0-9_]+)\}/gi)].map((mm: any) => mm[1] + mm[2]))];
}

/**
 * Keys that only exist inside a loop item, so a tag check must not expect them
 * among buildAnnex8Data's top-level keys.
 */
export const LOOP_ITEM_KEYS = [
  'no', 'op_code_kh', 'instrument_name', 'model', 'serial_no', 'manufacturer_country', 'metrology_spec',
  'type_approval_no', 'completion_date', 'customer_name', 'location', 'label_qr_no', 'verification_text',
  'host_serial_no', 'part_kh', 'module_name', 'range_e', 'manufacturer', 'country', 'cert_no',
  'new_or_replacement_kh', 'instrument_model', 'repair_period', 'repair_description', 'seal_removed_no',
  'notification_no', 'technician', 'equipment', 'class_range', 'cal_cert_no', 'lab', 'due_date', 'status_kh',
];

/*
 * The reference file's CLI lives in fill-cli.ts instead: this project is an ESM
 * package, so `require.main === module` never fires here, and `import.meta`
 * cannot survive the CJS server bundle. Keeping the library import-only means
 * it bundles cleanly into dist/server.cjs.
 */
