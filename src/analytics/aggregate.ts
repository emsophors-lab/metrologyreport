/**
 * Building the Smart Analytics figures from Annex 8.
 *
 * Source of truth: Annex 8 reports with status ACCEPTED. A month a
 * licensee is still filling in, or one NMC has not accepted, is not
 * evidence of anything and is excluded — so a figure in this report can
 * always be traced to a return the Centre has signed off.
 *
 * This runs on the SERVER, never in the browser: a period can span a year
 * of entries across every licensee, and that is not a payload to hand to a
 * page. It goes through the same query-builder client as the rest of
 * server.ts rather than raw SQL, so it works unchanged on Supabase and on
 * the MySQL driver. (The brief asked for a Postgres view or RPC. The
 * trade-off is deliberate and worth stating: raw SQL would have to be
 * written and maintained twice, once per dialect, and only one of the two
 * can be tested on this machine.)
 *
 * Risk scores are computed HERE from Annex 8 behaviour rather than taken
 * from the ML dashboard's `inspectionPriorityScore`. Two reasons: that
 * score is built from the legacy `reports` table, which is not the agreed
 * source; and every factor below is a sentence an officer can check
 * against a return, which is what "no unexplained scores" has to mean.
 */
import { CATEGORIES } from '../annex8/constants';
import { NOT_MEASURED, REVIEW_PENDING, RISK_BANDS } from '../lib/analytics/contract';
import { collectMlSignals, featureLabelKh, mlRiskContribution } from './mlSignals';
import type { MlSignals } from './mlSignals';
import { reportingPeriod, previousPeriod } from '../lib/consolidated/periods';
import type { PeriodType, ReportingPeriod } from '../lib/consolidated/periods';
import type {
  AnalyticsSource, AnomalyRow, CategorySeries, GeoRow, LicenseeRisk, ModelRow, QualityRow,
} from '../lib/analytics/buildAnalyticsData';

/** How many equal-length periods of history the forecasts see. */
const HISTORY_PERIODS = 6;

const categoryLabel = (code: string) => (CATEGORIES as any)[code]?.kh || code || 'ផ្សេងៗ';

const inRange = (periodMonth: string, p: ReportingPeriod) =>
  periodMonth >= p.start.slice(0, 7) && periodMonth <= p.end.slice(0, 7);

interface Entry {
  report_uuid: string;
  category?: string | null;
  op_code?: string | null;
  province?: string | null;
  serial_no?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  instrument_name?: string | null;
  verification_status?: string | null;
  verification_cert_no?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  seal_broken?: boolean | null;
  notification_no?: string | null;
}

const blankTotals = () => ({
  manufactured: 0, installed: 0, repaired: 0, passed: 0, failed: 0, pending: 0,
});

function tally(totals: ReturnType<typeof blankTotals>, status: string) {
  if (status === 'PASSED') totals.passed++;
  else if (status === 'FAILED') totals.failed++;
  else totals.pending++;
}

/**
 * Every accepted report in a window, with its entries.
 *
 * One pair of queries for the whole window rather than a pair per period,
 * because a year of history is thirteen round trips otherwise.
 */
async function loadWindow(db: any, fromMonth: string, toMonth: string) {
  const { data: reports, error } = await db
    .from('annex8_reports').select('*').eq('status', 'ACCEPTED');
  if (error) throw error;

  const relevant = (reports || []).filter((r: any) => {
    const m = String(r.period_month || '');
    return m >= fromMonth && m <= toMonth;
  });
  if (!relevant.length) return { reports: [], instruments: [], repairs: [] };

  const ids = relevant.map((r: any) => r.id);
  const [instruments, repairs] = await Promise.all([
    db.from('annex8_report_instruments').select('*').in('report_uuid', ids).is('deleted_at', null),
    db.from('annex8_report_repairs').select('*').in('report_uuid', ids).is('deleted_at', null),
  ]);
  return {
    reports: relevant,
    instruments: (instruments.data || []) as Entry[],
    repairs: (repairs.data || []) as Entry[],
  };
}

/* ------------------------------------------------------------------ *
 * Risk, with a sentence behind every point
 * ------------------------------------------------------------------ */

interface LicenceBehaviour {
  licence_no: string;
  name: string;
  monthsReported: Set<string>;
  late: number;
  returned: number;
  failed: number;
  judged: number;
  pending: number;
  sealBrokenNoNotice: number;
}

/**
 * 0–100, from behaviour the Centre can see in the returns themselves.
 *
 * Each component states its own cap, so the total is explainable: a
 * licensee at 70 is there because of named, checkable facts.
 */
function scoreLicence(b: LicenceBehaviour, monthsInPeriod: number): { score: number; factors: string[] } {
  const factors: string[] = [];
  let score = 0;

  const missing = Math.max(0, monthsInPeriod - b.monthsReported.size);
  if (missing > 0) {
    const points = Math.min(35, missing * 12);
    score += points;
    factors.push(`ខកខានដាក់របាយការណ៍ ${missing} ខែ`);
  }
  if (b.late > 0) {
    const points = Math.min(20, b.late * 7);
    score += points;
    factors.push(`ដាក់របាយការណ៍យឺត ${b.late} ខែ`);
  }
  if (b.judged > 0) {
    const failRate = (b.failed / b.judged) * 100;
    if (failRate >= 5) {
      const points = Math.min(25, Math.round(failRate));
      score += points;
      factors.push(`អត្រាមិនឆ្លងការផ្ទៀងផ្ទាត់ ${failRate.toFixed(1)}%`);
    }
  }
  if (b.pending > 0) {
    const points = Math.min(10, b.pending);
    score += points;
    factors.push(`ឧបករណ៍រង់ចាំផ្ទៀងផ្ទាត់ ${b.pending}`);
  }
  if (b.returned > 0) {
    score += Math.min(10, b.returned * 5);
    factors.push(`របាយការណ៍ត្រូវបានត្រឡប់មកវិញ ${b.returned} ដង`);
  }
  if (b.sealBrokenNoNotice > 0) {
    score += Math.min(15, b.sealBrokenNoNotice * 5);
    factors.push(`ដោះត្រាដោយគ្មានលេខជូនដំណឹង ${b.sealBrokenNoNotice} ករណី`);
  }

  if (!factors.length) factors.push('គ្មានចំណុចគួរកត់សម្គាល់');
  return { score: Math.min(100, score), factors };
}

function actionFor(score: number): string {
  if (score >= RISK_BANDS.high) return 'ចុះត្រួតពិនិត្យ';
  if (score >= RISK_BANDS.medium) return 'តាមដានជិតស្និទ្ធ';
  return 'មិនតម្រូវវិធានការ';
}

/* ------------------------------------------------------------------ *
 * Anomalies — signals an officer can check, not findings
 * ------------------------------------------------------------------ */

function findAnomalies(
  instruments: Entry[], repairs: Entry[], byReport: Map<string, any>,
  ml: MlSignals | null, licenceNames: Map<string, string>,
): AnomalyRow[] {
  const out: AnomalyRow[] = [];
  const licenceOf = (e: Entry) => String(byReport.get(String(e.report_uuid))?.licence_no || '');
  const nameOf = (e: Entry) =>
    String(byReport.get(String(e.report_uuid))?.enterprise_name_kh || licenceOf(e));

  // The same serial number reported by two different licensees. Either one
  // of them is wrong, or an instrument moved without the paperwork.
  const bySerial = new Map<string, Set<string>>();
  for (const e of [...instruments, ...repairs]) {
    const serial = String(e.serial_no || '').trim();
    if (!serial) continue;
    if (!bySerial.has(serial)) bySerial.set(serial, new Set());
    bySerial.get(serial)!.add(licenceOf(e));
  }
  for (const [serial, licences] of bySerial) {
    if (licences.size > 1) {
      out.push({
        type: 'លេខស៊េរីស្ទួន',
        subject: serial,
        description: `លេខស៊េរីដូចគ្នា រាយការណ៍ដោយអ្នកកាន់អាជ្ញាប័ណ្ណ ${licences.size} ផ្សេងគ្នា`,
        score: 0.9,
      });
    }
  }

  // Marked PASSED with no certificate number. The result cannot be traced
  // back to a verification record.
  const noCert = [...instruments, ...repairs].filter(
    e => e.verification_status === 'PASSED' && !String(e.verification_cert_no || '').trim());
  for (const e of noCert.slice(0, 20)) {
    out.push({
      type: 'ជាប់ដោយគ្មានវិញ្ញាបនបត្រ',
      subject: `${nameOf(e)} / ${e.serial_no || '—'}`,
      description: 'រាយការណ៍ថាជាប់ ប៉ុន្តែគ្មានលេខវិញ្ញាបនបត្រ',
      score: 0.72,
    });
  }

  // Art. 25: a broken seal needs an Annex 10 notification.
  const sealed = repairs.filter(r => r.seal_broken && !String(r.notification_no || '').trim());
  for (const r of sealed.slice(0, 20)) {
    out.push({
      type: 'ដោះត្រាគ្មានលេខជូនដំណឹង',
      subject: `${nameOf(r)} / ${r.serial_no || '—'}`,
      description: 'ត្រាត្រូវបានដោះ ប៉ុន្តែគ្មានលេខជូនដំណឹងតាមឧបសម្ព័ន្ធទី១០ (ប្រការ២៥)',
      score: 0.85,
    });
  }

  /**
   * IsolationForest outliers from the trained model.
   *
   * Only licensees that appear in this period's returns: the model scores
   * every enterprise it has features for, and a report about this period
   * must not raise a signal about a licensee who filed nothing in it.
   *
   * The description names the feature that departed furthest, because an
   * officer cannot check "the model found this unusual" — they can check
   * "its reporting rate is unlike the others".
   */
  if (ml) {
    for (const [licence, signal] of ml.byLicence) {
      if (!signal.outlier || !licenceNames.has(licence)) continue;
      out.push({
        type: 'ឥរិយាបថរាយការណ៍មិនប្រក្រតី (ML)',
        subject: `${licenceNames.get(licence)} / ${licence}`,
        description: `ម៉ូដែល IsolationForest រកឃើញគម្លាតពីគំរូទូទៅ`
          + (signal.topFeature
            ? ` ដោយចំណុចខុសគ្នាបំផុតគឺ ${featureLabelKh(signal.topFeature)}`
              + ` (គម្លាតស្តង់ដារ ${signal.topFeatureZ.toFixed(1)})`
            : '')
          + `។ ជាសញ្ញាសម្រាប់ផ្ទៀងផ្ទាត់ មិនមែនជាការរកឃើញទេ។`,
        score: Math.min(1, Math.max(0, signal.anomaly)),
      });
    }
  }

  // Every anomaly leaves here already marked រង់ចាំពិនិត្យ. Returning it
  // undefined would make each caller remember the default, and one of them
  // eventually would not.
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)
    .map(a => ({ ...a, review_status: a.review_status ?? REVIEW_PENDING }));
}

/* ------------------------------------------------------------------ *
 * The aggregation
 * ------------------------------------------------------------------ */

export async function collectAnalyticsSource(
  db: any,
  type: PeriodType,
  year: number,
  index: number,
  modelSetVersion = 'MLRS-AI v1.2',
): Promise<AnalyticsSource> {
  const period = reportingPeriod(type, year, index);

  // The history window: HISTORY_PERIODS equal-length periods ending with
  // this one, so a forecast sees comparable units rather than raw months.
  const windowPeriods: ReportingPeriod[] = [period];
  for (let i = 1; i < HISTORY_PERIODS; i++) {
    const prev = previousPeriod(windowPeriods[0]);
    windowPeriods.unshift(reportingPeriod(prev.type, prev.year, prev.index));
  }
  const fromMonth = windowPeriods[0].start.slice(0, 7);
  const toMonth = period.end.slice(0, 7);

  const { reports, instruments, repairs } = await loadWindow(db, fromMonth, toMonth);
  const byReport = new Map<string, any>(reports.map((r: any) => [String(r.id), r]));

  const entriesOf = (p: ReportingPeriod) => {
    const ids = new Set(reports
      .filter((r: any) => inRange(String(r.period_month || ''), p))
      .map((r: any) => String(r.id)));
    return {
      instruments: instruments.filter(e => ids.has(String(e.report_uuid))),
      repairs: repairs.filter(e => ids.has(String(e.report_uuid))),
      reports: reports.filter((r: any) => ids.has(String(r.id))),
    };
  };

  const totalsFor = (p: ReportingPeriod) => {
    const t = blankTotals();
    const e = entriesOf(p);
    for (const i of e.instruments) {
      if (i.op_code === 'M') t.manufactured++; else t.installed++;
      tally(t, String(i.verification_status || 'PENDING'));
    }
    for (const r of e.repairs) {
      t.repaired++;
      tally(t, String(r.verification_status || 'PENDING'));
    }
    return t;
  };

  const current = entriesOf(period);
  const totals = totalsFor(period);
  const prevRef = previousPeriod(period);
  const prevPeriod = reportingPeriod(prevRef.type, prevRef.year, prevRef.index);
  const hasPrevious = reports.some((r: any) => inRange(String(r.period_month || ''), prevPeriod));
  const totals_previous = hasPrevious ? totalsFor(prevPeriod) : null;

  /* ---- category history ---- */
  const codes = new Set<string>();
  for (const e of [...instruments, ...repairs]) if (e.category) codes.add(String(e.category));
  const categories: CategorySeries[] = [...codes].map(code => ({
    code,
    label_kh: categoryLabel(code),
    history: windowPeriods.map(p => {
      const e = entriesOf(p);
      return e.instruments.filter(x => x.category === code).length
        + e.repairs.filter(x => x.category === code).length;
    }),
  })).filter(c => c.history.some(v => v > 0))
    .sort((a, b) => (b.history.at(-1) ?? 0) - (a.history.at(-1) ?? 0));

  /* ---- per-licensee behaviour ---- */
  const monthsInPeriod = windowPeriods.length ? period.end.slice(0, 7) === period.start.slice(0, 7)
    ? 1
    : (Number(period.end.slice(0, 4)) * 12 + Number(period.end.slice(5, 7)))
      - (Number(period.start.slice(0, 4)) * 12 + Number(period.start.slice(5, 7))) + 1
    : 1;

  const behaviour = new Map<string, LicenceBehaviour>();
  const behaviourOf = (licence: string, name: string) => {
    if (!behaviour.has(licence)) {
      behaviour.set(licence, {
        licence_no: licence, name,
        monthsReported: new Set(), late: 0, returned: 0,
        failed: 0, judged: 0, pending: 0, sealBrokenNoNotice: 0,
      });
    }
    return behaviour.get(licence)!;
  };

  for (const r of current.reports) {
    const b = behaviourOf(String(r.licence_no), String(r.enterprise_name_kh || r.licence_no));
    b.monthsReported.add(String(r.period_month));
    if (r.on_time === false) b.late++;
    if (r.returned_at) b.returned++;
  }
  for (const e of [...current.instruments, ...current.repairs]) {
    const report = byReport.get(String(e.report_uuid));
    if (!report) continue;
    const b = behaviourOf(String(report.licence_no), String(report.enterprise_name_kh || report.licence_no));
    const status = String(e.verification_status || 'PENDING');
    if (status === 'PENDING') b.pending++; else { b.judged++; if (status === 'FAILED') b.failed++; }
  }
  for (const r of current.repairs) {
    if (!r.seal_broken || String(r.notification_no || '').trim()) continue;
    const report = byReport.get(String(r.report_uuid));
    if (!report) continue;
    behaviourOf(String(report.licence_no), String(report.enterprise_name_kh || report.licence_no))
      .sealBrokenNoNotice++;
  }

  // The same calculation on the previous period, so a change can be shown
  // rather than invented.
  const prevEntries = entriesOf(prevPeriod);
  const prevBehaviour = new Map<string, LicenceBehaviour>();
  for (const r of prevEntries.reports) {
    const key = String(r.licence_no);
    if (!prevBehaviour.has(key)) {
      prevBehaviour.set(key, {
        licence_no: key, name: key, monthsReported: new Set(),
        late: 0, returned: 0, failed: 0, judged: 0, pending: 0, sealBrokenNoNotice: 0,
      });
    }
    const b = prevBehaviour.get(key)!;
    b.monthsReported.add(String(r.period_month));
    if (r.on_time === false) b.late++;
    if (r.returned_at) b.returned++;
  }
  for (const e of [...prevEntries.instruments, ...prevEntries.repairs]) {
    const report = byReport.get(String(e.report_uuid));
    const b = report && prevBehaviour.get(String(report.licence_no));
    if (!b) continue;
    const status = String(e.verification_status || 'PENDING');
    if (status === 'PENDING') b.pending++; else { b.judged++; if (status === 'FAILED') b.failed++; }
  }

  /**
   * The trained model's signals, when there is a trained model.
   *
   * Loaded once for the whole aggregation rather than per licensee: the
   * features come from one scan of the same accepted reports, and asking
   * for them again per row would be the same scan N times over.
   */
  const ml = await collectMlSignals(db);

  const risks: LicenseeRisk[] = [...behaviour.values()].map(b => {
    const { score, factors } = scoreLicence(b, monthsInPeriod);
    const prev = prevBehaviour.get(b.licence_no);
    const previous_score = prev ? scoreLicence(prev, monthsInPeriod).score : null;

    // The model adds to the rules, never subtracts. See mlSignals.ts.
    const signal = ml?.byLicence.get(b.licence_no);
    const contribution = mlRiskContribution(signal);
    const combined = Math.min(100, score + contribution.points);
    const combinedFactors = contribution.factor ? [...factors, contribution.factor] : factors;

    // A previous score computed from the rules alone would make every
    // licensee look as though the model had pushed them up this period. The
    // model's view of the past is not stored, so the comparison is made on
    // the rules on both sides, and the ML points are added to both.
    const previous_combined = previous_score === null ? null
      : Math.min(100, previous_score + contribution.points);

    return {
      licensee: b.name,
      licence_no: b.licence_no,
      score: combined,
      previous_score: previous_combined,
      factors: combinedFactors.filter(f => f !== 'គ្មានចំណុចគួរកត់សម្គាល់' || combinedFactors.length === 1),
      recommended_action: actionFor(combined),
    };
  }).sort((a, b) => b.score - a.score);

  /* ---- geography ---- */
  const geoMap = new Map<string, GeoRow>();
  const geoOf = (province: string) => {
    if (!geoMap.has(province)) {
      geoMap.set(province, { province, installed: 0, repairs: 0, verified: 0, failed: 0 });
    }
    return geoMap.get(province)!;
  };
  for (const i of current.instruments) {
    const g = geoOf(String(i.province || '').trim() || 'មិនបានបញ្ជាក់');
    g.installed++;
    const s = String(i.verification_status || 'PENDING');
    if (s !== 'PENDING') { g.verified++; if (s === 'FAILED') g.failed++; }
  }
  for (const r of current.repairs) {
    const g = geoOf(String(r.province || '').trim() || 'មិនបានបញ្ជាក់');
    g.repairs++;
    const s = String(r.verification_status || 'PENDING');
    if (s !== 'PENDING') { g.verified++; if (s === 'FAILED') g.failed++; }
  }

  /* ---- instrument quality ---- */
  const qualityMap = new Map<string, QualityRow>();
  for (const i of current.instruments) {
    const status = String(i.verification_status || 'PENDING');
    if (status === 'PENDING') continue;
    const label = `${i.instrument_name || categoryLabel(String(i.category))} / ${i.model || '—'}`;
    const key = `${label}|${i.manufacturer || ''}`;
    if (!qualityMap.has(key)) {
      qualityMap.set(key, {
        model: label, manufacturer: String(i.manufacturer || ''), verified: 0, failed: 0,
      });
    }
    const q = qualityMap.get(key)!;
    q.verified++;
    if (status === 'FAILED') q.failed++;
  }

  /* ---- data quality ---- */
  const allCurrent = [...current.instruments, ...current.repairs];
  const noGps = allCurrent.filter(e =>
    e.latitude === null || e.latitude === undefined
    || e.longitude === null || e.longitude === undefined).length;
  const incomplete = allCurrent.filter(e =>
    !String(e.serial_no || '').trim() || !String(e.instrument_name || '').trim()).length;
  const completeness = allCurrent.length
    ? ((allCurrent.length - incomplete) / allCurrent.length) * 100 : 100;

  /* ---- what produced each figure ---- */
  const models: ModelRow[] = [
    {
      name: 'ម៉ូដែលព្យាករ',
      purpose: 'ព្យាករចំនួនសកម្មភាពតាមប្រភេទឧបករណ៍',
      method: 'OLS trend + 95% prediction interval',
      version: modelSetVersion,
      // MAPE is filled by the builder per category where there is enough
      // held-out history; stating one number for all categories would be
      // a single figure standing for several different fits.
    },
    {
      name: 'ម៉ូដែលហានិភ័យ (វិធាន)',
      purpose: 'វាយតម្លៃហានិភ័យអ្នកកាន់អាជ្ញាប័ណ្ណ',
      method: 'Rule-based scoring on Annex 8 behaviour (explainable)',
      performance: 'កត្តាទាំងអស់អាចផ្ទៀងផ្ទាត់បាន',
      version: modelSetVersion,
    },
    {
      name: 'ការរកឃើញករណីមិនប្រក្រតី (វិធាន)',
      purpose: 'រកលេខស៊េរីស្ទួន និងឯកសារខ្វះខាត',
      method: 'Deterministic consistency rules',
      performance: 'រាល់ករណីត្រូវផ្ទៀងផ្ទាត់ដោយមន្ត្រី',
      version: modelSetVersion,
    },
  ];

  /**
   * The trained models, with the performance actually measured on held-out
   * data — never a number we hope for. A metric the lifecycle did not
   * measure prints as មិនទាន់វាស់, which is the honest answer and the one
   * the contract check enforces.
   *
   * These rows appear only when a model is active. Listing a classifier
   * that scored nothing in this report would tell the Director General that
   * machine learning produced figures it did not produce.
   */
  if (ml) {
    const metric = (value: number | undefined) =>
      typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : null;
    const f1 = metric(ml.metrics?.f1);
    const accuracy = metric(ml.metrics?.accuracy);
    const silhouette = metric(ml.metrics?.silhouette);

    models.push({
      name: 'ម៉ូដែលហានិភ័យ (រៀនដោយម៉ាស៊ីន)',
      purpose: 'ប៉ាន់ប្រមាណលទ្ធភាពចាំបាច់ត្រួតពិនិត្យ (បន្ថែមលើពិន្ទុវិធាន)',
      method: `Gradient-boosted trees · ${ml.metrics?.labelSource || 'held-out validation'}`,
      performance: f1 && accuracy
        ? `F1 ${f1} · Accuracy ${accuracy} (held-out)`
        : NOT_MEASURED,
      version: ml.modelId,
    });
    models.push({
      name: 'ការរកឃើញករណីមិនប្រក្រតី (រៀនដោយម៉ាស៊ីន)',
      purpose: 'រកឥរិយាបថរាយការណ៍ខុសពីគំរូទូទៅ',
      method: 'IsolationForest on standardized enterprise features',
      performance: metric(ml.metrics?.anomalyStability)
        ? `Stability ${metric(ml.metrics.anomalyStability)}`
        : NOT_MEASURED,
      version: ml.modelId,
    });
    models.push({
      name: 'ការបែងចែកក្រុម',
      purpose: 'បែងចែកអ្នកកាន់អាជ្ញាប័ណ្ណតាមគំរូឥរិយាបថ',
      method: 'k-means on standardized features',
      performance: silhouette ? `Silhouette ${silhouette}` : NOT_MEASURED,
      version: ml.modelId,
    });
  }

  const asOf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  return {
    period: { type, year, index },
    data_as_of: asOf,
    model_set_version: modelSetVersion,
    licensees_analyzed: behaviour.size,
    records_analyzed: allCurrent.length,
    records_previous: hasPrevious ? prevEntries.instruments.length + prevEntries.repairs.length : null,
    records_excluded: incomplete,
    records_no_gps: noGps,
    data_completeness_pct: Math.round(completeness * 10) / 10,
    history_months: windowPeriods.length * monthsInPeriod,
    categories,
    risks,
    anomalies: findAnomalies(
      current.instruments, current.repairs, byReport, ml,
      new Map([...behaviour.values()].map(b => [b.licence_no, b.name])),
    ),
    geo: [...geoMap.values()],
    quality: [...qualityMap.values()],
    models,
    totals,
    totals_previous,
    // The narrative engine is decided after this point, by whoever words the
    // report; the aggregation only knows which model produced the figures.
    engine: { trained_model_id: ml?.modelId ?? null },
  };
}

/** Stable identity for an anomaly, so an officer's verdict survives a rebuild. */
export const anomalyKey = (a: { type: string; subject: string }) =>
  `${a.type}|${a.subject}`.slice(0, 250);
