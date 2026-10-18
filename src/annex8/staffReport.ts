/**
 * The NMC management report over Annex 8 submissions.
 *
 * NOT the official Annex 8. That document comes from
 * templates/Annex8_template_v1.docx, belongs to one licensee for one month,
 * and its layout is never built in code. This is a different thing entirely:
 * NMC's own summary of what the licensees have filed — one enterprise or all
 * of them — for internal review and reporting upward. Its layout IS built
 * here, because there is no template for it and no legal form it must take.
 *
 * One aggregation, three renderings. `collectOverview()` is the single
 * computation; the dashboard, the Word file and the Excel workbook all read
 * its output. If they each counted for themselves they would eventually
 * disagree, and a figure on screen that differs from the figure in the file
 * sent to the Ministry is the kind of discrepancy nobody can explain later.
 *
 * PDF is the Word file converted by Gotenberg — the same LibreOffice path the
 * official annex already uses, rather than a second PDF engine with its own
 * opinions about Khmer.
 */
import { CATEGORIES } from './constants';
import { khmerMonthLabel, toKhmerDigits } from './summary';

export interface OverviewScope {
  /** A single licence, or null for every licensee. */
  licenceNo?: string | null;
  /** Four-digit year, or null for all time. */
  year?: string | null;
}

export interface Annex8OverviewData {
  licence_no: string | null;
  year: string | null;
  years: string[];
  summary: Record<string, number>;
  totals: { manufactured: number; installed: number; repaired: number; passed: number; failed: number; pending: number };
  due_period: string;
  missing_for_due: Array<{ licence_no: string; company_name_kh: string; company_name: string }>;
  by_category: Array<{ code: string; total: number; manufactured: number; installed: number; repaired: number; passed: number; failed: number; pending: number }>;
  by_province: Array<{ province: string; count: number }>;
  by_month: Array<{ period_month: string; manufactured: number; installed: number; repaired: number; total: number }>;
  licensees: Array<{ licence_no: string; company_name: string; company_name_kh: string; reports_filed: number; late: number; last_period: string | null; licence_active: boolean }>;
  /** Row-level detail, for the Excel workbook. Not sent to the dashboard. */
  rows: Array<Record<string, any>>;
}

const blankTotals = () => ({ manufactured: 0, installed: 0, repaired: 0, passed: 0, failed: 0, pending: 0 });

/** The month that is currently owed: the one that has just ended. */
export function owedPeriod(now = new Date()): string {
  const kh = new Date(now.getTime() + 7 * 60 * 60 * 1000);      // Phnom Penh
  const d = new Date(Date.UTC(kh.getUTCFullYear(), kh.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Everything the dashboard and the exports are built from.
 *
 * `db` is the query-builder client (Supabase or the MySQL stand-in). The
 * caller has already decided the scope and checked that the requester is
 * allowed it — this function does no access control of its own, and must
 * never be called with a licence the requester has not been cleared for.
 */
export async function collectOverview(db: any, scope: OverviewScope): Promise<Annex8OverviewData> {
  const scopeLicence = scope.licenceNo || null;
  const year = scope.year && /^\d{4}$/.test(scope.year) ? scope.year : null;

  let query = db.from('annex8_reports').select('*');
  if (scopeLicence) query = query.eq('licence_no', scopeLicence);
  const { data: allReports, error } = await query;
  if (error) throw error;

  const reports = (allReports || []).filter((r: any) =>
    !year || String(r.period_month || '').startsWith(year));

  // A month still being filled in has not been reported to anyone, so it is
  // counted as open and contributes no instruments.
  const filed = reports.filter((r: any) => r.status !== 'OPEN' && r.status !== 'DRAFT');
  const ids = filed.map((r: any) => r.id);
  const byId = new Map<string, any>(filed.map((r: any) => [String(r.id), r]));

  const none = { data: [] as any[] };
  const [instruments, repairs] = ids.length
    ? await Promise.all([
        db.from('annex8_report_instruments').select('*').in('report_uuid', ids).is('deleted_at', null),
        db.from('annex8_report_repairs').select('*').in('report_uuid', ids).is('deleted_at', null),
      ])
    : [none, none];

  const totals = blankTotals();
  const byCategory = new Map<string, ReturnType<typeof blankTotals>>();
  const byProvince = new Map<string, number>();
  const byMonth = new Map<string, { manufactured: number; installed: number; repaired: number; total: number }>();
  const rows: Array<Record<string, any>> = [];

  const catBucket = (c: string) => {
    const key = c || 'OTHER';
    if (!byCategory.has(key)) byCategory.set(key, blankTotals());
    return byCategory.get(key)!;
  };
  const monthBucket = (m: string) => {
    if (!byMonth.has(m)) byMonth.set(m, { manufactured: 0, installed: 0, repaired: 0, total: 0 });
    return byMonth.get(m)!;
  };
  const judge = (bucket: any, status: string) => {
    if (status === 'PASSED') bucket.passed++;
    else if (status === 'FAILED') bucket.failed++;
    else bucket.pending++;
  };

  for (const i of instruments.data || []) {
    const report = byId.get(String(i.report_uuid));
    if (!report) continue;
    const made = i.op_code === 'M';
    const status = String(i.verification_status || 'PENDING');
    totals[made ? 'manufactured' : 'installed']++;
    judge(totals, status);
    const cat = catBucket(String(i.category || ''));
    cat[made ? 'manufactured' : 'installed']++;
    judge(cat, status);
    if (i.province) byProvince.set(String(i.province), (byProvince.get(String(i.province)) || 0) + 1);
    const m = monthBucket(String(report.period_month));
    m[made ? 'manufactured' : 'installed']++; m.total++;

    rows.push({
      period_month: report.period_month,
      licence_no: report.licence_no,
      enterprise: report.enterprise_name_kh || report.enterprise_name_en || '',
      report_id: report.report_id || '',
      part: made ? 'ផលិត' : 'ដំឡើង',
      category: (CATEGORIES as any)[String(i.category)]?.kh || i.category || '',
      instrument_name: i.instrument_name || '',
      model: i.model || '',
      serial_no: i.serial_no || '',
      customer_name: i.customer_name || '',
      province: i.province || '',
      activity_date: i.completion_date || '',
      verification: status === 'PASSED' ? 'ជាប់' : status === 'FAILED' ? 'ធ្លាក់' : 'រង់ចាំ',
      cert_no: i.verification_cert_no || '',
      verification_date: i.verification_date || '',
    });
  }

  for (const p of repairs.data || []) {
    const report = byId.get(String(p.report_uuid));
    if (!report) continue;
    const status = String(p.verification_status || 'PENDING');
    totals.repaired++;
    judge(totals, status);
    const cat = catBucket(String(p.category || ''));
    cat.repaired++;
    judge(cat, status);
    if (p.province) byProvince.set(String(p.province), (byProvince.get(String(p.province)) || 0) + 1);
    const m = monthBucket(String(report.period_month));
    m.repaired++; m.total++;

    rows.push({
      period_month: report.period_month,
      licence_no: report.licence_no,
      enterprise: report.enterprise_name_kh || report.enterprise_name_en || '',
      report_id: report.report_id || '',
      part: 'ជួសជុល',
      category: (CATEGORIES as any)[String(p.category)]?.kh || p.category || '',
      instrument_name: p.instrument_name || '',
      model: p.model || '',
      serial_no: p.serial_no || '',
      customer_name: p.customer_name || '',
      province: p.province || '',
      activity_date: p.repair_to || p.repair_from || '',
      verification: status === 'PASSED' ? 'ជាប់' : status === 'FAILED' ? 'ធ្លាក់' : 'រង់ចាំ',
      cert_no: p.verification_cert_no || '',
      verification_date: p.verification_date || '',
      seal_broken: p.seal_broken ? 'មាន' : 'គ្មាន',
      notification_no: p.notification_no || '',
    });
  }

  /* ---------------- licensees, and who has not reported ---------------- */

  let licensees: Annex8OverviewData['licensees'] = [];
  if (!scopeLicence) {
    const { data: licences } = await db
      .from('enterprise_licenses')
      .select('license_number, company_name, company_name_kh, license_status');

    const perLicence = new Map<string, { filed: number; late: number; last: string | null }>();
    for (const r of filed) {
      const key = String(r.licence_no);
      if (!perLicence.has(key)) perLicence.set(key, { filed: 0, late: 0, last: null });
      const row = perLicence.get(key)!;
      row.filed++;
      if (r.on_time === false) row.late++;
      const period = String(r.period_month || '');
      if (!row.last || period > row.last) row.last = period;
    }

    licensees = (licences || []).map((l: any) => {
      const row = perLicence.get(String(l.license_number)) || { filed: 0, late: 0, last: null };
      return {
        licence_no: String(l.license_number),
        company_name: l.company_name || '',
        company_name_kh: l.company_name_kh || '',
        licence_active: String(l.license_status || '').toLowerCase() !== 'expired',
        reports_filed: row.filed,
        late: row.late,
        last_period: row.last,
      };
    }).sort((a, b) => b.reports_filed - a.reports_filed);
  }

  const duePeriod = owedPeriod();
  const submittedForDue = new Set(
    filed.filter((r: any) => r.period_month === duePeriod).map((r: any) => String(r.licence_no)));
  const missingForDue = scopeLicence ? [] : licensees
    .filter((l) => l.licence_active && !submittedForDue.has(l.licence_no))
    .map((l) => ({ licence_no: l.licence_no, company_name_kh: l.company_name_kh, company_name: l.company_name }));

  return {
    licence_no: scopeLicence,
    year,
    years: Array.from(new Set<string>((allReports || [])
      .map((r: any) => String(r.period_month || '').slice(0, 4)).filter(Boolean))).sort().reverse(),
    summary: {
      reports: reports.length,
      filed: filed.length,
      open: reports.length - filed.length,
      accepted: filed.filter((r: any) => r.status === 'ACCEPTED').length,
      returned: filed.filter((r: any) => r.status === 'RETURNED').length,
      late: filed.filter((r: any) => r.on_time === false).length,
      on_time: filed.filter((r: any) => r.on_time === true).length,
      nil: filed.filter((r: any) => r.report_type === 'NIL').length,
      licensees: scopeLicence ? 1 : licensees.length,
      reporting_licensees: new Set(filed.map((r: any) => String(r.licence_no))).size,
    },
    totals,
    due_period: duePeriod,
    missing_for_due: missingForDue,
    by_category: Array.from(byCategory.entries())
      .map(([code, v]) => ({ code, ...v, total: v.manufactured + v.installed + v.repaired }))
      .sort((a, b) => b.total - a.total),
    by_province: Array.from(byProvince.entries())
      .map(([province, count]) => ({ province, count }))
      .sort((a, b) => b.count - a.count),
    by_month: Array.from(byMonth.entries())
      .map(([period_month, v]) => ({ period_month, ...v }))
      .sort((a, b) => a.period_month.localeCompare(b.period_month)),
    licensees,
    rows: rows.sort((a, b) =>
      String(b.period_month).localeCompare(String(a.period_month))
      || String(a.licence_no).localeCompare(String(b.licence_no))),
  };
}

/* ------------------------------------------------------------------ *
 * Naming
 * ------------------------------------------------------------------ */

export function staffReportTitle(d: Annex8OverviewData): string {
  const scope = d.licence_no ? d.licence_no : 'សហគ្រាសទាំងអស់';
  const period = d.year ? `ឆ្នាំ${toKhmerDigits(d.year)}` : 'គ្រប់ឆ្នាំ';
  return `របាយការណ៍សង្ខេប ឧបសម្ព័ន្ធទី៨ · ${scope} · ${period}`;
}

export function staffReportFileName(d: Annex8OverviewData, ext: string): string {
  const scope = d.licence_no || 'ALL';
  const period = d.year || 'all-years';
  return `Annex8_NMC_Summary_${scope}_${period}.${ext}`;
}

/* ------------------------------------------------------------------ *
 * Excel
 * ------------------------------------------------------------------ */

export async function buildStaffReportXlsx(d: Annex8OverviewData): Promise<Buffer> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const sheet = (name: string, aoa: any[][]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);

  const s = d.summary;
  sheet('សង្ខេប', [
    [staffReportTitle(d)],
    ['បង្កើតនៅ | Generated', new Date().toISOString()],
    [],
    ['វិសាលភាព | Scope', d.licence_no || 'All licensees'],
    ['ឆ្នាំ | Year', d.year || 'All'],
    [],
    ['សហគ្រាសមានអាជ្ញាបណ្ណ | Licensees', s.licensees],
    ['បានផ្តល់របាយការណ៍ | Have reported', s.reporting_licensees],
    ['របាយការណ៍បានដាក់ជូន | Reports filed', s.filed],
    ['ទាន់ពេល | On time', s.on_time],
    ['យឺត | Late (Art. 21)', s.late],
    ['កំពុងបំពេញ | Still open', s.open],
    ['គ្មានសកម្មភាព | NIL returns', s.nil],
    ['ត្រឡប់មកវិញ | Returned', s.returned],
    [],
    ['ផលិត | Manufactured', d.totals.manufactured],
    ['ដំឡើង | Installed', d.totals.installed],
    ['ជួសជុល | Repaired', d.totals.repaired],
    ['ជាប់ | Passed', d.totals.passed],
    ['ធ្លាក់ | Failed', d.totals.failed],
    ['រង់ចាំ | Pending', d.totals.pending],
    [],
    ['សមីការ V01 | Balance',
      `${d.totals.manufactured + d.totals.installed + d.totals.repaired} = ${d.totals.passed + d.totals.failed + d.totals.pending}`,
      d.totals.manufactured + d.totals.installed + d.totals.repaired
        === d.totals.passed + d.totals.failed + d.totals.pending ? 'OK' : 'MISMATCH'],
  ]);

  sheet('តាមប្រភេទ', [
    ['ប្រភេទឧបករណ៍ | Category', 'ផលិត', 'ដំឡើង', 'ជួសជុល', 'សរុប', 'ជាប់', 'ធ្លាក់', 'រង់ចាំ'],
    ...d.by_category.map((c) => [
      (CATEGORIES as any)[c.code]?.kh || c.code,
      c.manufactured, c.installed, c.repaired, c.total, c.passed, c.failed, c.pending,
    ]),
  ]);

  sheet('តាមខែ', [
    ['ខែ | Period', 'ផលិត', 'ដំឡើង', 'ជួសជុល', 'សរុប'],
    ...d.by_month.map((m) => [m.period_month, m.manufactured, m.installed, m.repaired, m.total]),
  ]);

  sheet('តាមខេត្ត', [
    ['រាជធានី-ខេត្ត | Province', 'ចំនួន | Count'],
    ...d.by_province.map((p) => [p.province, p.count]),
  ]);

  if (d.licensees.length) {
    sheet('សហគ្រាស', [
      ['ឈ្មោះសហគ្រាស', 'Enterprise', 'លេខអាជ្ញាបណ្ណ', 'របាយការណ៍', 'យឺត', 'ខែចុងក្រោយ', 'ស្ថានភាពអាជ្ញាបណ្ណ'],
      ...d.licensees.map((l) => [
        l.company_name_kh, l.company_name, l.licence_no,
        l.reports_filed, l.late, l.last_period || '', l.licence_active ? 'Active' : 'Expired',
      ]),
    ]);
  }

  if (d.missing_for_due.length) {
    sheet('មិនទាន់ផ្តល់', [
      [`មិនទាន់ផ្តល់របាយការណ៍ខែ ${d.due_period}`],
      ['ឈ្មោះសហគ្រាស', 'Enterprise', 'លេខអាជ្ញាបណ្ណ'],
      ...d.missing_for_due.map((m) => [m.company_name_kh, m.company_name, m.licence_no]),
    ]);
  }

  sheet('លម្អិត', [
    ['ខែ', 'លេខអាជ្ញាបណ្ណ', 'សហគ្រាស', 'លេខរបាយការណ៍', 'ប្រភេទការងារ', 'ប្រភេទឧបករណ៍',
      'ឈ្មោះឧបករណ៍', 'ម៉ូដែល', 'លេខសៀរៀល', 'អតិថិជន', 'ខេត្ត/ក្រុង', 'កាលបរិច្ឆេទ',
      'លទ្ធផល', 'លេខវិញ្ញាបនបត្រ', 'ថ្ងៃផ្ទៀងផ្ទាត់', 'ត្រាបាក់', 'លេខជូនដំណឹង'],
    ...d.rows.map((r) => [
      r.period_month, r.licence_no, r.enterprise, r.report_id, r.part, r.category,
      r.instrument_name, r.model, r.serial_no, r.customer_name, r.province, r.activity_date,
      r.verification, r.cert_no, r.verification_date, r.seal_broken || '', r.notification_no || '',
    ]),
  ]);

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  return Buffer.from(out);
}

/* ------------------------------------------------------------------ *
 * Word
 * ------------------------------------------------------------------ */

export async function buildStaffReportDocx(d: Annex8OverviewData): Promise<Buffer> {
  const {
    AlignmentType, BorderStyle, Document, HeadingLevel, Packer,
    Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
  } = await import('docx');

  // Khmer needs a font that has the script; Word falls back silently and
  // renders boxes otherwise.
  const KH = 'Khmer OS Battambang';

  const text = (value: string, opts: any = {}) =>
    new Paragraph({ children: [new TextRun({ text: value, font: KH, size: opts.size || 20, bold: opts.bold })], ...opts.para });

  const heading = (value: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: value, font: KH, size: 24, bold: true, color: '0B2A66' })],
    });

  const cell = (value: any, opts: { bold?: boolean; align?: any } = {}) =>
    new TableCell({
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [new Paragraph({
        alignment: opts.align,
        children: [new TextRun({ text: String(value ?? ''), font: KH, size: 18, bold: opts.bold })],
      })],
    });

  const table = (header: string[], body: any[][]) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'D7DCE5' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D7DCE5' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'D7DCE5' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'D7DCE5' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E8ECF2' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E8ECF2' },
    },
    rows: [
      new TableRow({ tableHeader: true, children: header.map((h) => cell(h, { bold: true })) }),
      ...body.map((r) => new TableRow({ children: r.map((v, i) => cell(v, { align: i === 0 ? undefined : AlignmentType.CENTER })) })),
    ],
  });

  const s = d.summary;
  const produced = d.totals.manufactured + d.totals.installed + d.totals.repaired;
  const judged = d.totals.passed + d.totals.failed + d.totals.pending;
  const compliance = s.licensees > 0 ? Math.round((s.reporting_licensees / s.licensees) * 100) : 0;

  const children: any[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ', font: KH, size: 28, bold: true, color: '0B2A66' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: 'National Metrology Center · MISTI', font: KH, size: 18, color: '64748B' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: staffReportTitle(d), font: KH, size: 24, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({
        text: `បង្កើតនៅ ${new Date().toISOString().slice(0, 10)} · សេចក្ដីសង្ខេបផ្ទៃក្នុង មិនមែនជាឧបសម្ព័ន្ធទី៨ផ្លូវការទេ`,
        font: KH, size: 16, color: '94A3B8', italics: true,
      })],
    }),

    heading('១. សេចក្ដីសង្ខេប'),
    table(
      ['ប្រការ', 'ចំនួន'],
      [
        ['សហគ្រាសមានអាជ្ញាបណ្ណ', s.licensees],
        ['បានផ្តល់របាយការណ៍', s.reporting_licensees],
        ['អត្រាអនុលោម', `${compliance}%`],
        ['របាយការណ៍បានដាក់ជូន', s.filed],
        ['ទាន់ពេល', s.on_time],
        ['យឺត (ប្រការ២១)', s.late],
        ['កំពុងបំពេញ', s.open],
        ['គ្មានសកម្មភាព (NIL)', s.nil],
      ],
    ),

    heading('២. សកម្មភាពមាត្រាសាស្ត្រ'),
    table(
      ['ប្រការ', 'ចំនួន'],
      [
        ['ផលិត', d.totals.manufactured],
        ['ដំឡើង', d.totals.installed],
        ['ជួសជុល', d.totals.repaired],
        ['ជាប់', d.totals.passed],
        ['ធ្លាក់', d.totals.failed],
        ['រង់ចាំផ្ទៀងផ្ទាត់', d.totals.pending],
      ],
    ),
    text(
      `សមីការត្រួតពិនិត្យ V01៖ ផលិត + ដំឡើង + ជួសជុល = ${produced} · ជាប់ + ធ្លាក់ + រង់ចាំ = ${judged}` +
      (produced === judged ? ' — ត្រឹមត្រូវ' : ' — មិនស៊ីគ្នា'),
      { size: 18, para: { spacing: { before: 120 } } },
    ),
  ];

  if (d.by_category.length) {
    children.push(
      heading('៣. តាមប្រភេទឧបករណ៍'),
      table(
        ['ប្រភេទឧបករណ៍', 'ផលិត', 'ដំឡើង', 'ជួសជុល', 'សរុប', 'ជាប់', 'ធ្លាក់', 'រង់ចាំ'],
        d.by_category.map((c) => [
          (CATEGORIES as any)[c.code]?.kh || c.code,
          c.manufactured, c.installed, c.repaired, c.total, c.passed, c.failed, c.pending,
        ]),
      ),
    );
  }

  if (d.by_month.length) {
    children.push(
      heading('៤. តាមខែ'),
      table(
        ['ខែ', 'ផលិត', 'ដំឡើង', 'ជួសជុល', 'សរុប'],
        d.by_month.map((m) => [khmerMonthLabel(m.period_month), m.manufactured, m.installed, m.repaired, m.total]),
      ),
    );
  }

  if (d.by_province.length) {
    children.push(
      heading('៥. តាមរាជធានី-ខេត្ត'),
      table(['រាជធានី-ខេត្ត', 'ចំនួន'], d.by_province.map((p) => [p.province, p.count])),
    );
  }

  if (d.licensees.length) {
    children.push(
      heading('៦. សហគ្រាសមានអាជ្ញាបណ្ណ'),
      table(
        ['ឈ្មោះសហគ្រាស', 'លេខអាជ្ញាបណ្ណ', 'របាយការណ៍', 'យឺត', 'ខែចុងក្រោយ'],
        d.licensees.map((l) => [
          l.company_name_kh || l.company_name, l.licence_no, l.reports_filed, l.late,
          l.last_period ? khmerMonthLabel(l.last_period) : '—',
        ]),
      ),
    );
  }

  if (d.missing_for_due.length) {
    children.push(
      heading(`៧. មិនទាន់ផ្តល់របាយការណ៍ខែ ${khmerMonthLabel(d.due_period)}`),
      table(
        ['ឈ្មោះសហគ្រាស', 'លេខអាជ្ញាបណ្ណ'],
        d.missing_for_due.map((m) => [m.company_name_kh || m.company_name, m.licence_no]),
      ),
    );
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: KH, size: 20 } } } },
    sections: [{ properties: {}, children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
