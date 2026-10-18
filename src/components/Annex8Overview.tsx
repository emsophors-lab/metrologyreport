/**
 * ទិដ្ឋភាពរួម — the Annex 8 dashboard.
 *
 * One screen, two audiences, decided by the server:
 *
 *   ម.ម.ជ (superadmin / admin)  every licensee, plus who has not reported
 *   សហគ្រាស (company)            its own licence, and nothing else
 *
 * The scope is NOT a prop and NOT a query parameter the page chooses. It
 * comes back from /api/annex8/overview, which decides it from the signed-in
 * user — so a company cannot widen it by editing a URL, and this file cannot
 * leak another enterprise's figures by passing the wrong argument.
 *
 * The charts are drawn here rather than pulled from a library: the app
 * already draws its donuts and bars this way, and one more dependency to
 * render six numbers is not worth the weight.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, CalendarClock, CheckCircle2, Clock, FileSpreadsheet,
  FileText, Loader2, MapPin, RotateCcw, TrendingUp,
} from 'lucide-react';

import { CATEGORIES } from '../annex8/constants';
import { khmerMonthLabel, toKhmerDigits } from '../annex8/summary';
import { apiRequest } from '../supabaseSync';
import { getApiAuthHeaders } from '../apiAuth';
import { MetrologyUser } from '../types';

const kh = (v: unknown) => toKhmerDigits(Number(v ?? 0));

const CATEGORY_COLOURS: Record<string, string> = {
  NAWI: '#0EA5E9', WEIGHBRIDGE: '#6366F1', WEIGHTS: '#14B8A6',
  FUEL_DISPENSER: '#F59E0B', LPG_DISPENSER: '#F97316', ELEC_METER: '#8B5CF6',
  WATER_METER: '#06B6D4', EV_CHARGER: '#10B981', OTHER: '#94A3B8',
};

const categoryLabel = (code: string) => (CATEGORIES as any)[code]?.kh || code;

interface Overview {
  scope: 'all' | 'licence' | 'own';
  role: string;
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
}

export default function Annex8Overview({ currentUser }: { currentUser: MetrologyUser }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState('all');
  const [licence, setLicence] = useState('all');
  /* The licensee list only comes back when the scope is 'all', so it is kept
     here — otherwise narrowing to one company would empty the picker that
     did the narrowing. */
  const [allLicensees, setAllLicensees] = useState<Overview['licensees']>([]);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (year !== 'all') params.set('year', year);
      if (licence !== 'all') params.set('licence_no', licence);
      const qs = params.toString();
      const next = await apiRequest<Overview>(`/api/annex8/overview${qs ? `?${qs}` : ''}`);
      setData(next);
      if (next.scope === 'all') setAllLicensees(next.licensees || []);
    } catch (err: any) {
      setError(err?.message || 'មិនអាចផ្ទុកទិន្នន័យបានទេ។');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [year, licence]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Download the NMC summary. Goes through fetch rather than a plain link
   * because the endpoint needs the auth headers, and a failure has to be
   * shown rather than landing the browser on a JSON error page.
   */
  const download = async (format: 'xlsx' | 'docx' | 'pdf') => {
    setExporting(format);
    setExportError(null);
    try {
      const params = new URLSearchParams({ format });
      if (year !== 'all') params.set('year', year);
      if (licence !== 'all') params.set('licence_no', licence);

      const res = await fetch(`/api/annex8/export?${params}`, { headers: await getApiAuthHeaders() });
      if (!res.ok) {
        let message = `${res.status} ${res.statusText}`;
        try { message = (await res.json())?.error || message; } catch { /* not JSON */ }
        throw new Error(message);
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1]
        || `Annex8_summary.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError(err?.message || 'មិនអាចបង្កើតឯកសារបានទេ។');
    } finally {
      setExporting(null);
    }
  };

  /* Named for what it actually gates: the panels that only make sense across
     every licensee. A staff member who narrows to one enterprise sees the
     same page a company sees of itself, which is the point. */
  const isAllLicensees = data?.scope === 'all';
  const t = data?.totals;

  const verification = useMemo(() => {
    if (!t) return [];
    return [
      { label: 'ជាប់', value: t.passed, colour: '#10B981' },
      { label: 'ធ្លាក់', value: t.failed, colour: '#EF4444' },
      { label: 'រង់ចាំ', value: t.pending, colour: '#94A3B8' },
    ];
  }, [t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-20">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-[12px] font-bold text-red-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error || 'គ្មានទិន្នន័យ'}</span>
      </div>
    );
  }

  const s = data.summary;
  const judged = (t?.passed || 0) + (t?.failed || 0) + (t?.pending || 0);
  const compliance = s.licensees > 0
    ? Math.round((s.reporting_licensees / s.licensees) * 100) : 0;

  return (
    <div className="space-y-4">

      {/* Who is looking, and at what */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h4 className="text-[14px] font-black text-[#0B1A35]">
            {data.scope === 'all' ? 'ទិដ្ឋភាពរួម · សហគ្រាសទាំងអស់'
              : data.scope === 'licence' ? 'ទិដ្ឋភាពរួម · សហគ្រាសមួយ'
                : 'ទិដ្ឋភាពរួមរបស់សហគ្រាស'}
          </h4>
          <p className="mt-0.5 text-[10px] font-bold text-slate-400">
            {data.scope === 'all'
              ? `Annex 8 across every licensee · ${kh(s.licensees)} licences`
              : data.scope === 'licence'
                ? `${allLicensees.find((l) => l.licence_no === data.licence_no)?.company_name || ''} · ${data.licence_no || ''}`
                : `${currentUser.company_name_en || ''} · ${data.licence_no || ''}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Staff only: narrow the whole page, and the exports with it, to
              one enterprise. A company has nothing to choose. */}
          {(data.scope === 'all' || data.scope === 'licence') && (
            <select
              value={licence}
              onChange={(e) => setLicence(e.target.value)}
              className="max-w-[16rem] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-black text-[#0B1A35] focus:outline-none focus:ring-1 focus:ring-[#C9A227]"
            >
              <option value="all">សហគ្រាសទាំងអស់ · All licensees</option>
              {allLicensees.map((l) => (
                <option key={l.licence_no} value={l.licence_no}>
                  {l.company_name_kh || l.company_name} · {l.licence_no}
                </option>
              ))}
            </select>
          )}
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-black text-[#0B1A35] focus:outline-none focus:ring-1 focus:ring-[#C9A227]"
          >
            <option value="all">គ្រប់ឆ្នាំទាំងអស់</option>
            {data.years.map((y) => <option key={y} value={y}>{toKhmerDigits(y)}</option>)}
          </select>
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100"
          >
            <RotateCcw className="h-3 w-3" /> ផ្ទុកឡើងវិញ
          </button>
        </div>

        {/* Export. This is NMC's summary of the submissions, not the official
            Annex 8 — that one is downloaded per report from the register. */}
        <div className="flex w-full flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-[10px] font-bold text-slate-400">ទាញយករបាយការណ៍សង្ខេប៖</span>
          {([
            ['xlsx', 'Excel', FileSpreadsheet, 'text-emerald-600'],
            ['docx', 'Word', FileText, 'text-blue-600'],
            ['pdf', 'PDF', FileText, 'text-red-500'],
          ] as const).map(([fmt, label, Icon, tone]) => (
            <button
              key={fmt}
              type="button"
              disabled={!!exporting}
              onClick={() => void download(fmt)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {exporting === fmt
                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                : <Icon className={`h-3.5 w-3.5 ${tone}`} />}
              {label}
            </button>
          ))}
          <span className="text-[9px] font-semibold text-slate-400">
            {data.scope === 'all' ? 'សហគ្រាសទាំងអស់' : data.licence_no}
            {year !== 'all' ? ` · ឆ្នាំ${toKhmerDigits(year)}` : ''}
          </span>
        </div>

        {exportError && (
          <div className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-bold text-red-700">
            {exportError}
          </div>
        )}
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Card label="របាយការណ៍បានដាក់ជូន" en="Reports filed" value={s.filed} tone="text-[#0B2A66]" icon={CalendarClock} />
        <Card label="ទាន់ពេល" en="On time" value={s.on_time} tone="text-emerald-700" icon={CheckCircle2} />
        <Card label="យឺត (ប្រការ២១)" en="Late" value={s.late} tone="text-red-600" icon={Clock} />
        <Card label="ផលិត" en="Manufactured" value={t?.manufactured} tone="text-sky-700" icon={TrendingUp} />
        <Card label="ដំឡើង" en="Installed" value={t?.installed} tone="text-indigo-700" icon={TrendingUp} />
        <Card label="ជួសជុល" en="Repaired" value={t?.repaired} tone="text-amber-700" icon={TrendingUp} />
      </div>

      {isAllLicensees && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card label="សហគ្រាសមានអាជ្ញាបណ្ណ" en="Licensees" value={s.licensees} tone="text-[#0B2A66]" icon={Building2} />
          <Card label="បានផ្តល់របាយការណ៍" en="Have reported" value={s.reporting_licensees} tone="text-emerald-700" icon={CheckCircle2} />
          <Card label="អត្រាអនុលោម" en="Compliance" value={`${kh(compliance)}%`} tone="text-[#C9A227]" icon={TrendingUp} raw />
          <Card label="កំពុងបំពេញ" en="Still open" value={s.open} tone="text-slate-600" icon={Clock} />
        </div>
      )}

      {/* NMC: who still owes the month that just ended. The most useful thing
          on this page, so it is not buried below the charts. */}
      {isAllLicensees && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h5 className="text-[12px] font-black text-[#0B1A35]">
                មិនទាន់ផ្តល់របាយការណ៍ខែ {khmerMonthLabel(data.due_period)}
              </h5>
              <p className="text-[10px] font-bold text-slate-400">
                Licensees with nothing filed for the month that has just ended
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-[12px] font-black ${
              data.missing_for_due.length ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
            }`}>
              {kh(data.missing_for_due.length)}
            </span>
          </div>
          {!data.missing_for_due.length ? (
            <p className="rounded-xl bg-emerald-50 p-3 text-[11px] font-bold text-emerald-700">
              សហគ្រាសទាំងអស់បានផ្តល់របាយការណ៍រួចហើយ។
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.missing_for_due.map((m) => (
                <span key={m.licence_no}
                  className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-700">
                  {m.company_name_kh || m.company_name}
                  <span className="ml-1.5 font-mono text-[9px] opacity-70">{m.licence_no}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Verification outcome */}
        <Panel title="លទ្ធផលផ្ទៀងផ្ទាត់" en="Verification outcome">
          {!judged ? <Empty /> : (
            <div className="flex items-center gap-5">
              <Donut segments={verification} total={judged} />
              <div className="space-y-1.5">
                {verification.map((v) => (
                  <div key={v.label} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: v.colour }} />
                    <span className="text-[11px] font-bold text-slate-600">{v.label}</span>
                    <span className="text-[12px] font-black text-[#0B1A35]">{kh(v.value)}</span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {judged ? `${kh(Math.round((v.value / judged) * 100))}%` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        {/* Categories */}
        <Panel title="តាមប្រភេទឧបករណ៍" en="By instrument category">
          {!data.by_category.length ? <Empty /> : (
            <div className="space-y-2">
              {data.by_category.slice(0, 7).map((c) => {
                const max = data.by_category[0].total || 1;
                return (
                  <div key={c.code}>
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span className="text-slate-600">{categoryLabel(c.code)}</span>
                      <span className="text-[#0B1A35]">{kh(c.total)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(3, (c.total / max) * 100)}%`, background: CATEGORY_COLOURS[c.code] || '#94A3B8' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Month by month */}
        <Panel title="តាមខែ" en="Month by month">
          {!data.by_month.length ? <Empty /> : (
            <div className="flex h-40 items-end gap-1.5 overflow-x-auto">
              {data.by_month.slice(-12).map((m) => {
                const max = Math.max(...data.by_month.map((x) => x.total), 1);
                const stack = [
                  { v: m.manufactured, c: '#0EA5E9' },
                  { v: m.installed, c: '#6366F1' },
                  { v: m.repaired, c: '#F59E0B' },
                ];
                return (
                  <div key={m.period_month} className="flex min-w-[34px] flex-1 flex-col items-center gap-1">
                    <span className="text-[9px] font-black text-slate-500">{kh(m.total)}</span>
                    <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-md"
                      style={{ height: `${Math.max(4, (m.total / max) * 100)}%` }}>
                      {stack.map((s2, i) => s2.v > 0 && (
                        <div key={i} style={{ flexGrow: s2.v, background: s2.c }} />
                      ))}
                    </div>
                    <span className="text-[8px] font-bold text-slate-400">
                      {toKhmerDigits(m.period_month.slice(5))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <Legend items={[
            { label: 'ផលិត', colour: '#0EA5E9' },
            { label: 'ដំឡើង', colour: '#6366F1' },
            { label: 'ជួសជុល', colour: '#F59E0B' },
          ]} />
        </Panel>

        {/* Provinces */}
        <Panel title="តាមរាជធានី-ខេត្ត" en="By province">
          {!data.by_province.length ? <Empty /> : (
            <div className="space-y-2">
              {data.by_province.slice(0, 7).map((p) => {
                const max = data.by_province[0].count || 1;
                return (
                  <div key={p.province}>
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span className="flex items-center gap-1 text-slate-600">
                        <MapPin className="h-3 w-3 text-[#C9A227]" />{p.province}
                      </span>
                      <span className="text-[#0B1A35]">{kh(p.count)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[#0B2A66]"
                        style={{ width: `${Math.max(3, (p.count / max) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* NMC: the licensee league table */}
      {isAllLicensees && data.licensees.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h5 className="text-[12px] font-black text-[#0B1A35]">សហគ្រាសមានអាជ្ញាបណ្ណ</h5>
            <p className="text-[10px] font-bold text-slate-400">Reporting by licensee</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-[#353C96] text-white">
                <tr>
                  <th className="px-3 py-2.5 text-left font-bold">សហគ្រាស</th>
                  <th className="px-3 py-2.5 text-left font-bold">លេខអាជ្ញាបណ្ណ</th>
                  <th className="px-3 py-2.5 text-center font-bold">របាយការណ៍</th>
                  <th className="px-3 py-2.5 text-center font-bold">យឺត</th>
                  <th className="px-3 py-2.5 text-left font-bold">ខែចុងក្រោយ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.licensees.map((l) => (
                  <tr key={l.licence_no} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-700">
                      {l.company_name_kh || l.company_name || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{l.licence_no}</td>
                    <td className="px-3 py-2 text-center font-black text-[#0B1A35]">{kh(l.reports_filed)}</td>
                    <td className={`px-3 py-2 text-center font-black ${l.late ? 'text-red-600' : 'text-slate-300'}`}>
                      {l.late ? kh(l.late) : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {l.last_period ? khmerMonthLabel(l.last_period) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Small pieces
 * ------------------------------------------------------------------ */

function Card(
  { label, en, value, tone, icon: Icon, raw }:
  { label: string; en: string; value: any; tone: string; icon: any; raw?: boolean },
) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className={`text-[20px] font-black ${tone}`}>{raw ? value : kh(value)}</span>
        <Icon className="h-4 w-4 text-slate-300" />
      </div>
      <div className="mt-0.5 text-[10px] font-bold leading-tight text-slate-600">{label}</div>
      <div className="text-[9px] font-semibold text-slate-400">{en}</div>
    </div>
  );
}

function Panel({ title, en, children }: { title: string; en: string; children: any }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 border-l-4 border-[#C9A227] pl-3">
        <h5 className="text-[12px] font-black text-[#0B1A35]">{title}</h5>
        <p className="text-[10px] font-bold text-slate-400">{en}</p>
      </div>
      {children}
    </div>
  );
}

const Empty = () => (
  <p className="py-8 text-center text-[11px] font-bold text-slate-400">មិនទាន់មានទិន្នន័យ</p>
);

function Legend({ items }: { items: Array<{ label: string; colour: string }> }) {
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.colour }} />{i.label}
        </span>
      ))}
    </div>
  );
}

/** A donut, drawn with stroke-dasharray the way the rest of the app does. */
function Donut({ segments, total }: { segments: Array<{ value: number; colour: string }>; total: number }) {
  const r = 14;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="#F1F5F9" strokeWidth="4" />
        {segments.map((s, i) => {
          const dash = total > 0 ? (s.value / total) * circumference : 0;
          const el = (
            <circle key={i} cx="18" cy="18" r={r} fill="none" stroke={s.colour} strokeWidth="4"
              strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset} />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[18px] font-black text-[#0B1A35]">{kh(total)}</span>
        <span className="text-[9px] font-bold text-slate-400">សរុប</span>
      </div>
    </div>
  );
}
