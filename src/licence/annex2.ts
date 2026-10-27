/**
 * The Annex 2 application form, as the official document defines it.
 *
 * Lists, labels, quantities and applicability are transcribed from
 * 260824_S_Annex2-Form_s3.docx and must keep matching it: this is the paper
 * an enterprise signs and NMC files, so a label edited here is an edit to a
 * government form. The eighteen instrument types are the official set; a
 * Centre that needs a nineteenth adds it per application, in `extra`, rather
 * than by changing this list.
 */

export const REQ_TYPES = [
  'សំណើសុំផ្ដល់អាជ្ញាប័ណ្ណផលិត ដំឡើងឧបករណ៍មាត្រាសាស្ត្រ។',
  'សំណើសុំបន្តសុពលភាពអាជ្ញាប័ណ្ណផលិត ដំឡើងឧបករណ៍មាត្រាសាស្ត្រ។',
  'សំណើសុំអាជ្ញាប័ណ្ណជួសជុលឧបករណ៍មាត្រាសាស្ត្រ។',
  'សំណើសុំបន្តសុពលភាពអាជ្ញាប័ណ្ណជួសជុលឧបករណ៍មាត្រាសាស្ត្រ។',
];

export const ACTS: Array<[string, string]> = [
  ['ការផលិតឧបករណ៍មាត្រាសាស្ត្រ', 'Manufacturing Measuring Instruments'],
  ['ការដំឡើងឧបករណ៍មាត្រាសាស្ត្រ', 'Installing Measuring Instruments'],
  ['ការជួសជុលឧបករណ៍មាត្រាសាស្ត្រ', 'Repairing Measuring Instruments'],
];

export const INSTR: Array<[string, string]> = [
  ['ជញ្ជីងថ្លឹងរថយន្ត', 'Truck Scale / Weighbridge'],
  ['ជញ្ជីងមិនស្វ័យប្រវត្តិ', 'Non-automatic Weighing Instruments'],
  ['ជញ្ជីងស្វ័យប្រវត្តិ', 'Automatic Weighing Instruments'],
  ['កូនទម្ងន់', 'Weight'],
  ['ឧបករណ៍បែងចែកប្រេងឥន្ធនៈ', 'Fuel Dispenser'],
  ['ឧបករណ៍បែងចែកហ្គាស LPG', 'LPG Dispenser'],
  ['ឧបករណ៍បែងចែកហ្គាស CNG', 'CNG Dispenser'],
  ['ស៊ីទែន', 'Tank'],
  ['នាឡិកាស្ទង់ទឹក', 'Water Meter'],
  ['នាឡិកាស្ទង់សម្ពាធ', 'Pressure Gauges'],
  ['ម៉ាស៊ីនតេស្ដសម្ភារៈ', 'Material Testing Machines'],
  ['ឧបករណ៍រង្វាស់រង្វាល់ប្រវែង', 'Length Measuring Instruments'],
  ['ទែរម៉ូម៉ែត្រ', 'Thermometers'],
  ['នាឡិកាស្ទង់អគ្គិសនី', 'Electricity Meters'],
  ['ត្រង់ស្វូម៉ាទ័រអគ្គិសនី', 'Electrical Transformers'],
  ['ឧបករណ៍បញ្ចូលថាមពលយានយន្ដអគ្គិសនី', 'Electric Vehicle Supply Equipment (EVSE)'],
  ['ឧបករណ៍វាស់សំណើម', 'Moisture Meters'],
  ['ឧបករណ៍មាត្រាសាស្ត្រផ្សេងទៀត', 'Other Measuring Instruments'],
];

/** Item 4 carries no ជួសជុល row; that is the official table, not an omission. */
export const DOCS: Array<[string, Array<[string, string]>]> = [
  ['ប្រកាសបង្កើតរោងចក្រ ឬប្រកាសបង្កើតសហគ្រាសធុនតូច ឬប្រកាសបង្កើតសហគ្រាសធុនមធ្យម ឬប្រកាសបង្កើតសិប្បកម្ម ឬវិញ្ញាបនបត្រចុះបញ្ជីពាណិជ្ជកម្ម',
    [['ផលិត', '១ច្បាប់'], ['ដំឡើង', '១ច្បាប់'], ['ជួសជុល', '១ច្បាប់ (បើមាន)']]],
  ['វិញ្ញាបនបត្រចុះបញ្ជីមាត្រាសាស្ត្រ ដែលមានសុពលភាព',
    [['ផលិត', '១ច្បាប់'], ['ដំឡើង', '១ច្បាប់'], ['ជួសជុល', '១ច្បាប់']]],
  ['វិញ្ញាបនបត្រព្យាសកម្មឧបករណ៍មាត្រាសាស្ត្រប្រើប្រាស់ ដែលមានសុពលភាព',
    [['ផលិត', '១ច្បាប់ក្នុង១ប្រភេទ'], ['ដំឡើង', '១ច្បាប់ក្នុង១ប្រភេទ'], ['ជួសជុល', '១ច្បាប់ក្នុង១ប្រភេទ']]],
  ['បទដ្ឋានបច្ចេកទេស និងគំនូសបច្ចេកទេស (Technical Specification and Technical Drawing) ឬវិញ្ញាបនបត្រអនុម័តគំរូ ឬលទ្ធផលតេស្ដគំរូ ឬ OIML-CS',
    [['ផលិត', '១ច្បាប់ក្នុង១ប្រភេទ'], ['ដំឡើង', '១ច្បាប់ក្នុង១ប្រភេទ']]],
  ['វិញ្ញាបនបត្រ ឬលិខិតបញ្ជាក់ជំនាញពាក់ព័ន្ធ',
    [['ផលិត', '១ច្បាប់ក្នុង១នាក់'], ['ដំឡើង', '១ច្បាប់ក្នុង១នាក់'], ['ជួសជុល', '១ច្បាប់ក្នុង១នាក់']]],
  ['ប្លង់សង្ខេបនៃទីតាំងខ្សែច្រវ៉ាក់ផលិតកម្ម ឬរោងជាង ឬឃ្លាំង និង/ឬ មន្ទីរពិសោធន៍ផ្ទៃក្នុង',
    [['ផលិត', '១ច្បាប់'], ['ដំឡើង', '១ច្បាប់'], ['ជួសជុល', '១ច្បាប់']]],
  ['អត្តសញ្ញាណប័ណ្ណ ឬលិខិតឆ្លងដែនរបស់ម្ចាស់សហគ្រាស ឬអ្នកតំណាងស្របច្បាប់',
    [['ផលិត', '១ច្បាប់'], ['ដំឡើង', '១ច្បាប់'], ['ជួសជុល', '១ច្បាប់']]],
  ['រូបថត (4 x 6) របស់ម្ចាស់សហគ្រាស ឬអ្នកតំណាងស្របច្បាប់',
    [['ផលិត', '១សន្លឹក'], ['ដំឡើង', '១សន្លឹក'], ['ជួសជុល', '១សន្លឹក']]],
];

export type LocRow = { site: string; addr: string; geo: string };
export type StaffRow = { staff: string; skill: string; n: string; add: string; cut: string };
export type ReqRow = {
  type: string; model: string; range: string; res: string; acc: string;
  spec: string; type_cert: string; oiml: string; mode: string;
};
export type UseRow = {
  name: string; model: string; serial: string; maker: string; range: string;
  acc: string; cert: string; due: string; place: string;
};
export type ExtraInstrument = { kh: string; en: string; on: boolean };

export interface Annex2Payload {
  subject: string;
  reqTypes: boolean[];
  ref: { no: string; day: string; month: string; year: string };
  owner: { kh: string; lat: string; sex: string; dob: string; id: string; addr: string; role: string; pos: string };
  ent: { kh: string; lat: string; phone: string; email: string; addr: string; geo: string };
  biz: { capital: string; other: string };
  acts: boolean[];
  instr: boolean[];
  extra: ExtraInstrument[];
  loc: LocRow[];
  key: StaffRow[];
  sup: StaffRow[];
  req: ReqRow[];
  use: UseRow[];
  docs: Array<Array<{ ok: boolean; file: string }>>;
  close: { place: string; signer: string; madeOn: string };
}

export const APPLICATION_STATUSES = [
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ISSUED',
] as const;
export type ApplicationStatus = typeof APPLICATION_STATUSES[number];

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  DRAFT: 'ព្រាង',
  SUBMITTED: 'បានដាក់ជូន',
  UNDER_REVIEW: 'កំពុងពិនិត្យ',
  APPROVED: 'បានអនុម័ត',
  REJECTED: 'មិនអនុម័ត',
  ISSUED: 'បានចេញអាជ្ញាប័ណ្ណ',
};

export const STATUS_EN: Record<ApplicationStatus, string> = {
  DRAFT: 'Draft', SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved', REJECTED: 'Rejected', ISSUED: 'Licence issued',
};

export const emptyStaffRow = (): StaffRow => ({ staff: '', skill: '', n: '', add: '', cut: '' });
export const emptyLocRow = (): LocRow => ({ site: '', addr: '', geo: '' });
export const emptyReqRow = (): ReqRow => ({
  type: '', model: '', range: '', res: '', acc: '', spec: '', type_cert: '', oiml: '', mode: 'បន្ថែម (Add)',
});
export const emptyUseRow = (): UseRow => ({
  name: '', model: '', serial: '', maker: '', range: '', acc: '', cert: '', due: '', place: '',
});

export function emptyPayload(): Annex2Payload {
  return {
    subject: '',
    reqTypes: REQ_TYPES.map(() => false),
    ref: { no: '', day: '', month: '', year: '' },
    owner: { kh: '', lat: '', sex: '', dob: '', id: '', addr: '', role: '', pos: '' },
    ent: { kh: '', lat: '', phone: '', email: '', addr: '', geo: '' },
    biz: { capital: '', other: '' },
    acts: ACTS.map(() => false),
    instr: INSTR.map(() => false),
    extra: [],
    loc: [emptyLocRow()],
    key: [emptyStaffRow()],
    sup: [emptyStaffRow()],
    req: [emptyReqRow()],
    use: [emptyUseRow()],
    docs: DOCS.map(d => d[1].map(() => ({ ok: false, file: '' }))),
    close: { place: 'រាជធានីភ្នំពេញ', signer: '', madeOn: '' },
  };
}

/**
 * Fills in whatever a stored payload is missing.
 *
 * Applications outlive the code that wrote them: a form saved today is read
 * back after the shape has gained a field, and an officer opening a year-old
 * draft must not meet a blank screen because `extra` did not exist then.
 */
export function normalisePayload(raw: any): Annex2Payload {
  const base = emptyPayload();
  if (!raw || typeof raw !== 'object') return base;
  const arr = <T,>(v: any, fallback: T[], fill: () => T): T[] =>
    Array.isArray(v) && v.length ? v.map((row: any) => ({ ...fill(), ...(row || {}) })) : fallback;
  const flags = (v: any, n: number) =>
    Array.from({ length: n }, (_, i) => !!(Array.isArray(v) ? v[i] : false));

  return {
    subject: String(raw.subject ?? ''),
    reqTypes: flags(raw.reqTypes, REQ_TYPES.length),
    ref: { ...base.ref, ...(raw.ref || {}) },
    owner: { ...base.owner, ...(raw.owner || {}) },
    ent: { ...base.ent, ...(raw.ent || {}) },
    biz: { ...base.biz, ...(raw.biz || {}) },
    acts: flags(raw.acts, ACTS.length),
    instr: flags(raw.instr, INSTR.length),
    extra: Array.isArray(raw.extra)
      ? raw.extra.map((e: any) => ({ kh: String(e?.kh || ''), en: String(e?.en || ''), on: e?.on !== false }))
      : [],
    loc: arr(raw.loc, base.loc, emptyLocRow),
    key: arr(raw.key, base.key, emptyStaffRow),
    sup: arr(raw.sup, base.sup, emptyStaffRow),
    req: arr(raw.req, base.req, emptyReqRow),
    use: arr(raw.use, base.use, emptyUseRow),
    docs: DOCS.map((d, i) => d[1].map((_, j) => ({
      ok: !!raw?.docs?.[i]?.[j]?.ok,
      file: String(raw?.docs?.[i]?.[j]?.file || ''),
    }))),
    close: { ...base.close, ...(raw.close || {}) },
  };
}

/** Column totals for section ង, which the official form carries as rows. */
export function staffTotals(rows: StaffRow[]): [number, number, number] {
  const sum = (c: keyof StaffRow) =>
    rows.reduce((a, r) => a + (Number(r[c] || 0) || 0), 0);
  return [sum('n'), sum('add'), sum('cut')];
}

/** What blocks an application from being handed in. */
export function blockingIssues(p: Annex2Payload): string[] {
  const out: string[] = [];
  if (!p.reqTypes.some(Boolean)) out.push('សូមជ្រើសរើសប្រភេទនៃការស្នើសុំ');
  if (!String(p.ent.kh || '').trim() && !String(p.ent.lat || '').trim()) out.push('សូមបំពេញឈ្មោះសហគ្រាស');
  if (!String(p.ent.phone || '').trim()) out.push('សូមបំពេញលេខទូរសព្ទសហគ្រាស');
  if (!String(p.owner.kh || '').trim()) out.push('សូមបំពេញគោត្តនាម - នាម ម្ចាស់សហគ្រាស');
  if (!p.acts.some(Boolean)) out.push('សូមជ្រើសរើសសកម្មភាពអាជីវកម្មយ៉ាងតិចមួយ');
  if (!p.instr.some(Boolean) && !p.extra.some(e => e.on)) out.push('សូមជ្រើសរើសឧបករណ៍មាត្រាសាស្ត្រចម្បងយ៉ាងតិចមួយ');
  if (!p.req.some(r => String(r.type || '').trim())) out.push('ផ្នែក ច៖ សូមបញ្ចូលប្រភេទឧបករណ៍ស្នើសុំយ៉ាងតិចមួយជួរ');
  if (!String(p.close.signer || '').trim()) out.push('សូមបំពេញឈ្មោះអ្នកចុះហត្ថលេខា');
  return out;
}
