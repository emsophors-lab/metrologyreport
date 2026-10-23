/**
 * របាយការណ៍វិភាគ — the official Khmer analysis report, for NMC staff.
 *
 * The department generates this from the Smart Analytics module and sends
 * it to the Director General. The screen does three things in order:
 *
 *   1. Pick a period, and show what the figures actually are.
 *   2. Let the analyst READ and CORRECT the Khmer the system drafted.
 *      The drafts are built only from the computed numbers; nothing is
 *      presented as the analyst's words until they have been through it.
 *   3. Approve, which freezes the snapshot so a reprint gives back what
 *      was sent rather than today's recomputation.
 *
 * Analytics here is decision support. A score or an anomaly produces a row
 * for an officer to look at and nothing else — no sanction, warning or
 * licence action follows from this screen.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, Download, FileText, Loader2,
  RotateCcw, Save, ShieldCheck,
} from 'lucide-react';

import {
  NARRATIVE_SCALARS, OFFICER_SCALARS, REVIEW_STATUSES, RISK_LEVEL_KH,
} from '../lib/analytics/contract';
import type { AnalyticsData, AnalyticsTextInputs, ReviewStatus } from '../lib/analytics/contract';
import { analyticsFileName, downloadAnalyticsDocx } from '../lib/analytics/analyticsDocx';
import { reportingPeriod, toKhmerDigits, KHMER_MONTHS } from '../lib/consolidated/periods';
import type { PeriodType } from '../lib/consolidated/periods';
import { apiRequest } from '../supabaseSync';
import { MetrologyUser } from '../types';

const kh = (v: unknown) => toKhmerDigits(String(v ?? ''));

const PERIOD_TYPES: Array<{ value: PeriodType; kh: string; count: number }> = [
  { value: 'MONTH', kh: 'ប្រចាំខែ', count: 12 },
  { value: 'QUARTER', kh: 'ត្រីមាស', count: 4 },
  { value: 'SEMESTER', kh: 'ឆមាស', count: 2 },
  { value: 'YEAR', kh: 'ប្រចាំឆ្នាំ', count: 1 },
];

const NARRATIVE_LABELS: Record<string, { kh: string; rows: number }> = {
  executive_summary: { kh: '១. សេចក្ដីសង្ខេបសម្រាប់អ្នកដឹកនាំ', rows: 5 },
  trend_commentary: { kh: '៣. អត្ថាធិប្បាយលើនិន្នាការ និងការព្យាករ', rows: 4 },
  geo_commentary: { kh: '៦. អត្ថាធិប្បាយលើការវិភាគភូមិសាស្ត្រ', rows: 3 },
  conclusion: { kh: '១០. សេចក្ដីសន្និដ្ឋាន', rows: 4 },
};

const OFFICER_LABELS: Record<string, string> = {
  letter_no: 'លេខលិខិត',
  lunar_date_line: 'ថ្ងៃខែចន្ទគតិ',
  signed_day_kh: 'ថ្ងៃ', signed_month_kh: 'ខែ', signed_year_kh: 'ឆ្នាំ',
  reviewer_name: 'ឈ្មោះអ្នកពិនិត្យ', reviewer_position: 'តួនាទីអ្នកពិនិត្យ',
  reviewed_date_kh: 'កាលបរិច្ឆេទពិនិត្យ',
  report_no: 'លេខរបាយការណ៍ (ផ្ដល់ដោយស្វ័យប្រវត្តិពេលអនុម័ត)',
};

interface AnomalyRow {
  key: string; type: string; subject: string; description: string;
  score: number; review_status?: ReviewStatus;
}

const now = new Date();
const currentYear = Number(new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Phnom_Penh', year: 'numeric',
}).format(now));

export default function AnalyticsReportPage(
  { currentUser, toastMsg }:
  { currentUser: MetrologyUser; toastMsg: (m: string, t: 'success' | 'error') => void },
) {
  const [periodType, setPeriodType] = useState<PeriodType>('MONTH');
  const [year, setYear] = useState(currentYear);
  const [index, setIndex] = useState(Math.max(1, new Date().getMonth()));

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([]);
  const [finals, setFinals] = useState<any[]>([]);
  const [text, setText] = useState<AnalyticsTextInputs>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ kh: string; detail: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  const period = useMemo(
    () => reportingPeriod(periodType, year, index), [periodType, year, index]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        period_type: periodType, year: String(year), index: String(index),
      });
      const res = await apiRequest<any>(`/api/analytics/preview?${params}`);
      setData(res.data);
      setAnomalies(res.source?.anomalies || []);
      setFinals(res.finals || []);
      // Start the editors from what the report currently says, so the
      // analyst edits real text rather than an empty box.
      const seeded: AnalyticsTextInputs = {};
      for (const key of [...NARRATIVE_SCALARS, ...OFFICER_SCALARS]) {
        (seeded as any)[key] = (res.data as any)[key];
      }
      setText(seeded);
      setDirty(false);
    } catch (err: any) {
      setError({ kh: 'មិនអាចបង្កើតរបាយការណ៍វិភាគបានទេ', detail: err?.message || String(err) });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [periodType, year, index]);

  useEffect(() => { void load(); }, [load]);

  /** What the analyst has in the boxes, over the freshly computed figures. */
  const merged = useMemo<AnalyticsData | null>(() => {
    if (!data) return null;
    const out: any = { ...data };
    for (const [key, value] of Object.entries(text)) {
      if (typeof value === 'string' && value.trim()) out[key] = value;
    }
    out.anomalies = (data.anomalies as any[]).map((a, i) => ({
      ...a, review_status: anomalies[i]?.review_status ?? a.review_status,
    }));
    return out as AnalyticsData;
  }, [data, text, anomalies]);

  const setField = (key: string, value: string) => {
    setText(t => ({ ...t, [key]: value }));
    setDirty(true);
  };

  const saveDraft = async () => {
    setBusy('save');
    try {
      await apiRequest('/api/analytics/draft', {
        method: 'PUT',
        body: { period_type: periodType, year, index, text_inputs: text },
      });
      toastMsg('បានរក្សាទុកសេចក្ដីព្រាង', 'success');
      setDirty(false);
    } catch (err: any) {
      toastMsg(err?.message || 'មិនអាចរក្សាទុកបានទេ', 'error');
    } finally {
      setBusy(null);
    }
  };

  const generate = async (status: 'DRAFT' | 'FINAL', payload?: AnalyticsData) => {
    const source = payload || merged;
    if (!source) return;
    setBusy(status === 'FINAL' ? 'final' : 'docx');
    try {
      await downloadAnalyticsDocx(source, analyticsFileName(period, status));
      toastMsg(status === 'FINAL' ? 'បានបង្កើតឯកសារផ្លូវការ' : 'បានបង្កើតឯកសារព្រាង', 'success');
    } catch (err: any) {
      // Never fail silently: the Khmer tells the analyst what happened, the
      // technical line tells whoever they forward it to.
      setError({ kh: err?.kh || 'មិនអាចបង្កើតឯកសារ Word បានទេ', detail: err?.message || String(err) });
      toastMsg(err?.kh || 'មិនអាចបង្កើតឯកសារបានទេ', 'error');
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    setBusy('final');
    setError(null);
    try {
      const res = await apiRequest<any>('/api/analytics/finalise', {
        method: 'POST',
        body: { period_type: periodType, year, index, text_inputs: text },
      });
      toastMsg(`បានអនុម័ត · ${res.report.report_no}`, 'success');
      await generate('FINAL', res.report.data);
      await load();
    } catch (err: any) {
      toastMsg(err?.message || 'មិនអាចអនុម័តបានទេ', 'error');
      setBusy(null);
    }
  };

  const setReview = async (row: AnomalyRow, status: ReviewStatus) => {
    setAnomalies(list => list.map(a => (a.key === row.key ? { ...a, review_status: status } : a)));
    try {
      await apiRequest('/api/analytics/anomaly-review', {
        method: 'PUT',
        body: {
          period_type: periodType, year, index,
          anomaly_key: row.key, review_status: status,
        },
      });
    } catch (err: any) {
      toastMsg(err?.message || 'មិនអាចកត់ត្រាការផ្ទៀងផ្ទាត់បានទេ', 'error');
      void load();
    }
  };

  const input = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12px] text-slate-800 focus:border-[#C9A227] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#C9A227]/30';
  const isStaff = currentUser.role === 'superadmin' || currentUser.role === 'admin';

  if (!isStaff) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-medium text-slate-500">
        ⚠️ របាយការណ៍វិភាគសម្រាប់មន្ត្រី ម.ម.ជ តែប៉ុណ្ណោះ។
      </div>
    );
  }

  return (
    <div className="space-y-4">

      <div className="rounded-xl bg-[#0B2A66] px-5 py-4 text-white shadow-sm">
        <h3 className="text-lg font-extrabold">របាយការណ៍វិភាគ ប្រព័ន្ធវិភាគឆ្លាតវៃ</h3>
        <p className="mt-1 text-[11px] text-white/70">
          Smart Analytics report · National Metrology Center
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-white/80">
          លទ្ធផលវិភាគជា<strong> ឧបករណ៍គាំទ្រការសម្រេចចិត្ត</strong>ប៉ុណ្ណោះ។
          គ្មានវិធានការរដ្ឋបាលណាមួយកើតឡើងដោយស្វ័យប្រវត្តិពីពិន្ទុ ឬករណីមិនប្រក្រតីទេ។
        </p>
      </div>

      {/* Period */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-500">ប្រភេទរយៈពេល</label>
            <select className={input} value={periodType}
              onChange={e => { setPeriodType(e.target.value as PeriodType); setIndex(1); }}>
              {PERIOD_TYPES.map(p => <option key={p.value} value={p.value}>{p.kh}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-500">ឆ្នាំ</label>
            <select className={input} value={year} onChange={e => setYear(Number(e.target.value))}>
              {Array.from({ length: 6 }, (_, i) => currentYear - i).map(y =>
                <option key={y} value={y}>{kh(y)}</option>)}
            </select>
          </div>
          {periodType !== 'YEAR' && (
            <div>
              <label className="mb-1 block text-[10px] font-bold text-slate-500">
                {periodType === 'MONTH' ? 'ខែ' : periodType === 'QUARTER' ? 'ត្រីមាស' : 'ឆមាស'}
              </label>
              <select className={input} value={index} onChange={e => setIndex(Number(e.target.value))}>
                {Array.from(
                  { length: PERIOD_TYPES.find(p => p.value === periodType)!.count },
                  (_, i) => i + 1,
                ).map(i => (
                  <option key={i} value={i}>
                    {periodType === 'MONTH' ? KHMER_MONTHS[i - 1] : `ទី${kh(i)}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-100">
            <RotateCcw className="h-3.5 w-3.5" /> គណនាឡើងវិញ
          </button>
          {data && (
            <span className="ml-auto text-[11px] font-bold text-slate-500">
              {String(data.period_label_kh)} · ទិន្នន័យត្រឹម {String(data.data_as_of_kh)}
            </span>
          )}
        </div>

        {finals.length > 0 && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800">
            រយៈពេលនេះមានរបាយការណ៍ផ្លូវការរួចហើយ៖ {finals.map(f => f.report_no).join(', ')}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] font-bold text-red-800">
          {error.kh}
          <span className="mt-1 block break-all font-mono text-[10px] font-semibold text-red-600">
            {error.detail}
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-20">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : !data || !merged ? null : (
        <>
          {/* Key figures */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { l: 'អ្នកកាន់អាជ្ញាប័ណ្ណ', v: data.licensees_analyzed, c: 'text-[#0B2A66]' },
              { l: 'កំណត់ត្រាវិភាគ', v: data.records_analyzed, c: 'text-[#0B2A66]' },
              { l: 'ហានិភ័យខ្ពស់', v: data.risk_high, c: 'text-red-600' },
              { l: 'ហានិភ័យមធ្យម', v: data.risk_medium, c: 'text-amber-600' },
              { l: 'ហានិភ័យទាប', v: data.risk_low, c: 'text-emerald-700' },
              { l: 'ភាពពេញលេញ', v: data.data_completeness, c: 'text-slate-700' },
            ].map(card => (
              <div key={card.l} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                <div className={`text-[19px] font-black ${card.c}`}>{kh(card.v)}</div>
                <div className="text-[10px] font-bold text-slate-600">{card.l}</div>
              </div>
            ))}
          </div>

          <Panel title="ការព្យាករ" en="Forecasts, each with its 95% interval">
            <Table
              head={['ល.រ', 'ប្រភេទឧបករណ៍', 'មុន', 'បច្ចុប្បន្ន', 'ព្យាករ', 'ចន្លោះ ៩៥%', 'និន្នាការ']}
              rows={(data.forecasts as any[]).map(r =>
                [r.no, r.category, r.previous, r.current, r.forecast, r.interval, r.trend])}
            />
          </Panel>

          <Panel title="អ្នកកាន់អាជ្ញាប័ណ្ណហានិភ័យខ្ពស់" en="Every score states the facts behind it">
            <Table
              head={['ល.រ', 'ក្រុមហ៊ុន', 'អាជ្ញាប័ណ្ណ', 'ពិន្ទុ', 'មុន', 'កត្តា', 'សកម្មភាព']}
              rows={(data.high_risk as any[]).map(r =>
                [r.no, r.licensee, r.licence_no, r.score, r.previous_score, r.factors, r.action])}
              empty="គ្មានអ្នកកាន់អាជ្ញាប័ណ្ណហានិភ័យខ្ពស់ក្នុងរយៈពេលនេះ"
            />
          </Panel>

          {/* Anomalies — the only place a human verdict is recorded */}
          <Panel title="ករណីមិនប្រក្រតី" en="Signals to check — an officer decides, not the system">
            {!anomalies.length ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-4 text-center text-[11px] font-bold text-slate-400">
                មិនមានករណីមិនប្រក្រតីទេ
              </p>
            ) : (
              <div className="space-y-2">
                {anomalies.map((a, i) => (
                  <div key={a.key} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[12px] font-black text-[#0B1A35]">
                          {kh(i + 1)}. {a.type}
                          <span className="ml-2 font-mono text-[11px] font-bold text-slate-500">
                            {a.subject}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-600">{a.description}</div>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                        {Number(a.score).toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {REVIEW_STATUSES.map(status => {
                        const on = (a.review_status ?? REVIEW_STATUSES[0]) === status;
                        return (
                          <button key={status} type="button"
                            onClick={() => void setReview(a, status)}
                            className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                              on
                                ? status === 'មិនពិត'
                                  ? 'border-slate-300 bg-slate-200 text-slate-700'
                                  : status === 'បានផ្ទៀងផ្ទាត់ – ពិត'
                                    ? 'border-red-300 bg-red-100 text-red-700'
                                    : 'border-amber-300 bg-amber-100 text-amber-800'
                                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                            }`}>
                            {status}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Who did the analysis. Read-only: the machine signs its own work. */}
          <Panel title="អ្នកវិភាគ" en="Analyst — the machine, automatically">
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ['ឈ្មោះអ្នកវិភាគ', data.analyst_name],
                ['តួនាទី', data.analyst_position],
                ['កាលបរិច្ឆេទវិភាគ', data.analysed_date_kh],
              ] as const).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-bold text-slate-500">{label}</p>
                  <p className="mt-0.5 break-words text-[11px] font-black text-[#0B1A35]">{String(value ?? '')}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] font-semibold text-slate-500">
              ការវិភាគធ្វើឡើងដោយស្វ័យប្រវត្តិដោយម៉ូដែលរៀនដោយម៉ាស៊ីន (ML) និងភ្នាក់ងារ AI។
              មន្ត្រីមិនបំពេញប្រអប់នេះទេ — តែអ្នកពិនិត្យជាមនុស្សត្រូវចុះហត្ថលេខាមុនអនុម័ត។
            </p>
          </Panel>

          {/* The Khmer the machine wrote, for an officer to correct */}
          <Panel title="អត្ថបទរបាយការណ៍" en="Written by the machine — correct before approving">
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
              អត្ថបទខាងក្រោមត្រូវបានតាក់តែងដោយស្វ័យប្រវត្តិពីតួលេខដែលបានគណនា។
              សូមអានឱ្យច្បាស់ និងកែសម្រួលមុនពេលអនុម័ត។
            </p>
            <div className="space-y-3">
              {NARRATIVE_SCALARS.map(key => (
                <div key={key}>
                  <label className="mb-1 block text-[11px] font-black text-[#0B1A35]">
                    {NARRATIVE_LABELS[key]?.kh || key}
                  </label>
                  <textarea
                    rows={NARRATIVE_LABELS[key]?.rows || 4}
                    className={input}
                    value={String((text as any)[key] ?? '')}
                    onChange={e => setField(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="ព័ត៌មានលិខិត និងហត្ថលេខា" en="Letter and signatories">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {OFFICER_SCALARS.filter(k => k !== 'report_no').map(key => (
                <div key={key}>
                  <label className="mb-1 block text-[10px] font-bold text-slate-500">
                    {OFFICER_LABELS[key] || key}
                  </label>
                  <input className={input}
                    value={String((text as any)[key] ?? '')}
                    onChange={e => setField(key, e.target.value)} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] font-semibold text-slate-400">
              លេខរបាយការណ៍ត្រូវផ្ដល់ដោយស្វ័យប្រវត្តិពេលអនុម័ត (NMC-ANL-…)។
            </p>
          </Panel>

          {/* Actions */}
          <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
            {dirty && (
              <span className="mr-auto text-[10px] font-bold text-amber-700">
                មានការកែសម្រួលមិនទាន់រក្សាទុក
              </span>
            )}
            <button onClick={() => void saveDraft()} disabled={!!busy}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50">
              {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              រក្សាទុកសេចក្ដីព្រាង / Save draft
            </button>
            <button onClick={() => void generate('DRAFT')} disabled={!!busy}
              className="flex items-center gap-1.5 rounded-lg border border-[#0B2A66]/20 bg-[#0B2A66]/5 px-4 py-2 text-[11px] font-black text-[#0B2A66] hover:bg-[#0B2A66]/10 disabled:opacity-50">
              {busy === 'docx' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              {/* "Khmer / English", the convention useSingleLanguageDisplay in
                  App.tsx understands. The brief's «បង្កើត Word (សេចក្ដីព្រាង)»
                  matches that function's "Latin (Khmer)" rule, so in Khmer mode
                  it rendered as just «សេចក្ដីព្រាង». */}
              បង្កើតឯកសារព្រាង / Generate draft Word
            </button>
            <button onClick={() => void approve()} disabled={!!busy}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[11px] font-black text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy === 'final' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              អនុម័ត និងបង្កើតឯកសារផ្លូវការ / Approve and generate official Word
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Panel({ title, en, children }: { title: string; en: string; children: any }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 border-l-4 border-[#C9A227] pl-3">
        <h4 className="text-[13px] font-black text-[#0B1A35]">{title}</h4>
        <p className="text-[10px] font-bold text-slate-400">{en}</p>
      </div>
      {children}
    </div>
  );
}

function Table(
  { head, rows, empty }: { head: string[]; rows: any[][]; empty?: string },
) {
  if (!rows.length) {
    return empty ? (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-4 text-center text-[11px] font-bold text-slate-400">
        {empty}
      </p>
    ) : null;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-[10px]">
        <thead className="bg-[#353C96] text-white">
          <tr>{head.map(h => (
            <th key={h} className="whitespace-nowrap px-2.5 py-2 text-left font-bold">{h}</th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((cells, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {cells.map((c, j) => (
                <td key={j} className="px-2.5 py-1.5 text-slate-700">{String(c ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
