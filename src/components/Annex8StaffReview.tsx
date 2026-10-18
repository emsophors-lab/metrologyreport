/**
 * របាយការណ៍សហគ្រាស — NMC's review desk.
 *
 * Every licensee's filed Annex 8 in one place: search by month, year,
 * enterprise, status or free text; open one to read what was actually filed;
 * print the official Word; accept it, return it for correction, or delete it.
 *
 * The Word here is the SAME official document the licensee downloads — the
 * template filled with that month's rows, not a staff rendering of it. NMC
 * and the enterprise must be looking at identical paper.
 *
 * Only filed reports appear. A month a licensee is still filling in has not
 * been reported to anyone, and listing it here would be reading over their
 * shoulder.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, Download,
  History, Loader2, RotateCcw, Search, ShieldCheck, Trash2, Undo2,
} from 'lucide-react';

import { khmerMonthLabel, toKhmerDigits } from '../annex8/summary';
import { apiRequest } from '../supabaseSync';
import { getApiAuthHeaders } from '../apiAuth';
import { MetrologyUser } from '../types';

const kh = (v: unknown) => toKhmerDigits(Number(v ?? 0));

const MONTHS: Array<[string, string]> = [
  ['01', 'មករា'], ['02', 'កុម្ភៈ'], ['03', 'មីនា'], ['04', 'មេសា'],
  ['05', 'ឧសភា'], ['06', 'មិថុនា'], ['07', 'កក្កដា'], ['08', 'សីហា'],
  ['09', 'កញ្ញា'], ['10', 'តុលា'], ['11', 'វិច្ឆិកា'], ['12', 'ធ្នូ'],
];

const STATUS: Record<string, { kh: string; cls: string }> = {
  SUBMITTED: { kh: 'រង់ចាំពិនិត្យ', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  ACCEPTED:  { kh: 'បានទទួលយក',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  RETURNED:  { kh: 'ត្រឡប់មកវិញ',  cls: 'bg-red-50 text-red-700 border-red-200' },
};

const TYPE_KH: Record<string, string> = {
  REGULAR: 'ធម្មតា', NIL: 'គ្មានសកម្មភាព', AMENDMENT: 'កែតម្រូវ',
};

interface StaffReport {
  id: string;
  licence_no: string;
  company_name_kh: string;
  company_name: string;
  period_month: string;
  report_id: string | null;
  report_type: string;
  status: string;
  on_time: boolean | null;
  submitted_at: string | null;
  reviewer: string | null;
  nmc_remarks: string | null;
  counts: {
    manufactured: number; installed: number; repaired: number;
    passed: number; failed: number; pending: number;
    instruments: number; repairs: number; modules: number;
  };
}

const dmy = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export default function Annex8StaffReview(
  { currentUser, toastMsg }: { currentUser: MetrologyUser; toastMsg: (m: string, t: 'success' | 'error') => void },
) {
  const [reports, setReports] = useState<StaffReport[]>([]);
  const [facets, setFacets] = useState<{ months: string[]; years: string[]; licensees: any[] }>(
    { months: [], years: [], licensees: [] });
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState('all');
  const [year, setYear] = useState('all');
  const [licence, setLicence] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any>>({});
  const [audit, setAudit] = useState<Record<string, any[]>>({});
  const [busy, setBusy] = useState<string | null>(null);

  /** The report a staff member is returning or deleting, and their reason. */
  const [prompt, setPrompt] = useState<
    { kind: 'return' | 'delete'; report: StaffReport; text: string } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (month !== 'all') params.set('month', month);
      if (year !== 'all') params.set('year', year);
      if (licence !== 'all') params.set('licence_no', licence);
      if (status !== 'all') params.set('status', status);
      if (debounced) params.set('q', debounced);
      const qs = params.toString();
      const data = await apiRequest<any>(`/api/annex8/staff-reports${qs ? `?${qs}` : ''}`);
      setReports(data?.reports || []);
      setSummary(data?.summary || null);
      // Facets come from the unfiltered register, so narrowing never empties
      // the control that did the narrowing.
      if (licence === 'all' && status === 'all' && !debounced) {
        setFacets({ months: data?.months || [], years: data?.years || [], licensees: data?.licensees || [] });
      } else if (!facets.licensees.length) {
        setFacets({ months: data?.months || [], years: data?.years || [], licensees: data?.licensees || [] });
      }
    } catch (err: any) {
      setError(err?.message || 'មិនអាចផ្ទុករបាយការណ៍បានទេ។');
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [month, year, licence, status, debounced]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const toggle = async (r: StaffReport) => {
    if (open === r.id) { setOpen(null); return; }
    setOpen(r.id);
    if (detail[r.id]) return;
    try {
      const [month_, trail] = await Promise.all([
        apiRequest<any>(`/api/annex8/month?licence_no=${encodeURIComponent(r.licence_no)}&period=${r.period_month}`),
        apiRequest<any>(`/api/annex8/reports/${r.id}/audit`).catch(() => ({ entries: [] })),
      ]);
      setDetail((d) => ({ ...d, [r.id]: month_?.entries || null }));
      setAudit((a) => ({ ...a, [r.id]: trail?.entries || [] }));
    } catch {
      setDetail((d) => ({ ...d, [r.id]: null }));
    }
  };

  /** The official annex — the same file the licensee downloads. */
  const printOfficial = async (r: StaffReport) => {
    setBusy(`print:${r.id}`);
    try {
      const res = await fetch(`/api/reports/${r.id}/annex8.docx`, { headers: await getApiAuthHeaders() });
      if (!res.ok) {
        let message = `${res.status} ${res.statusText}`;
        try { message = (await res.json())?.error || message; } catch { /* not JSON */ }
        throw new Error(message);
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1]
        || `Annex8_${r.licence_no}_${r.period_month}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toastMsg(err?.message || 'មិនអាចទាញយកឯកសារបានទេ', 'error');
    } finally {
      setBusy(null);
    }
  };

  const review = async (r: StaffReport, action: 'accept' | 'return', comment = '') => {
    setBusy(`${action}:${r.id}`);
    try {
      await apiRequest(`/api/annex8/reports/${r.id}/review`, {
        method: 'POST', body: { action, comment },
      });
      toastMsg(action === 'accept' ? 'បានទទួលយករបាយការណ៍' : 'បានត្រឡប់របាយការណ៍ទៅសហគ្រាស', 'success');
      setPrompt(null);
      await load();
    } catch (err: any) {
      toastMsg(err?.message || 'មិនបានសម្រេច', 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (r: StaffReport, reason: string) => {
    setBusy(`delete:${r.id}`);
    try {
      await apiRequest(`/api/annex8/reports/${r.id}`, { method: 'DELETE', body: { reason } });
      toastMsg('បានលុបរបាយការណ៍', 'success');
      setPrompt(null);
      setOpen(null);
      await load();
    } catch (err: any) {
      toastMsg(err?.message || 'មិនអាចលុបបានទេ', 'error');
    } finally {
      setBusy(null);
    }
  };

  const select = 'rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#353C96]';
  const label = 'mb-1 block text-[10px] font-bold text-slate-500';

  const months = useMemo(
    () => MONTHS.filter(([v]) => !facets.months.length || facets.months.includes(v)),
    [facets.months]);

  return (
    <div className="space-y-4">

      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { v: summary.total, l: 'របាយការណ៍', en: 'Reports', c: 'text-[#0B2A66]' },
            { v: summary.submitted, l: 'រង់ចាំពិនិត្យ', en: 'Awaiting review', c: 'text-sky-700' },
            { v: summary.accepted, l: 'បានទទួលយក', en: 'Accepted', c: 'text-emerald-700' },
            { v: summary.returned, l: 'ត្រឡប់មកវិញ', en: 'Returned', c: 'text-red-600' },
            { v: summary.late, l: 'យឺត', en: 'Late', c: 'text-amber-700' },
          ].map((card) => (
            <div key={card.l} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
              <div className={`text-[20px] font-black ${card.c}`}>{kh(card.v)}</div>
              <div className="text-[10px] font-bold text-slate-600">{card.l}</div>
              <div className="text-[9px] font-semibold text-slate-400">{card.en}</div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-extrabold text-slate-800">របាយការណ៍ប្រចាំខែរបស់សហគ្រាស</h4>
              <p className="mt-0.5 text-[10px] text-slate-400">
                Search, print, accept or return each licensee's Annex 8
              </p>
            </div>
            <button
              onClick={() => void load()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100"
            >
              <RotateCcw className="h-3 w-3" /> ផ្ទុកឡើងវិញ
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <label className={label}>ចម្រោះតាមខែ (Month)</label>
              <select className={`${select} w-full`} value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="all">គ្រប់ខែទាំងអស់ / All months</option>
                {months.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>ឆ្នាំរបាយការណ៍ (Year)</label>
              <select className={`${select} w-full`} value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="all">គ្រប់ឆ្នាំទាំងអស់ / All years</option>
                {facets.years.map((y) => <option key={y} value={y}>{toKhmerDigits(y)}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>ក្រុមហ៊ុន (Company)</label>
              <select className={`${select} w-full`} value={licence} onChange={(e) => setLicence(e.target.value)}>
                <option value="all">គ្រប់ក្រុមហ៊ុនទាំងអស់</option>
                {facets.licensees.map((l) => (
                  <option key={l.licence_no} value={l.licence_no}>
                    {l.company_name_kh || l.company_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>ស្ថានភាព (Status)</label>
              <select className={`${select} w-full`} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">គ្រប់ស្ថានភាព</option>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.kh}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>ស្វែងរក (Search)</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  className={`${select} w-full pl-8`}
                  placeholder="លេខរបាយការណ៍ / សៀរៀល / អតិថិជន"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="m-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] font-bold text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !reports.length ? (
          <div className="py-16 text-center">
            <p className="text-xs font-bold text-slate-500">គ្មានរបាយការណ៍ត្រូវនឹងលក្ខខណ្ឌនេះទេ</p>
            <p className="mt-1 text-[10px] text-slate-400">No report matches these filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-[#353C96] text-white">
                <tr>
                  <th className="w-8 px-3 py-2.5"></th>
                  <th className="px-3 py-2.5 text-left font-bold">សហគ្រាស</th>
                  <th className="px-3 py-2.5 text-left font-bold">ខែ</th>
                  <th className="px-3 py-2.5 text-left font-bold">លេខរបាយការណ៍</th>
                  <th className="px-3 py-2.5 text-center font-bold">ផ/ដ/ជ</th>
                  <th className="px-3 py-2.5 text-center font-bold">ជាប់/ធ្លាក់</th>
                  <th className="px-3 py-2.5 text-left font-bold">ដាក់ជូន</th>
                  <th className="px-3 py-2.5 text-left font-bold">ស្ថានភាព</th>
                  <th className="px-3 py-2.5 text-center font-bold">សកម្មភាព</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((r) => {
                  const st = STATUS[r.status] || { kh: r.status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
                  const isOpen = open === r.id;
                  return (
                    <>
                      <tr key={r.id} className={isOpen ? 'bg-slate-50' : 'hover:bg-slate-50'}>
                        <td className="px-3 py-2">
                          <button onClick={() => void toggle(r)} className="text-slate-400 hover:text-[#353C96]">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-bold text-slate-700">{r.company_name_kh || r.company_name}</div>
                          <div className="font-mono text-[9px] text-slate-400">{r.licence_no}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-bold text-slate-600">
                          {khmerMonthLabel(r.period_month)}
                          {r.report_type !== 'REGULAR' && (
                            <span className="ml-1 text-[9px] text-[#C9A227]">{TYPE_KH[r.report_type]}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-slate-600">
                          {r.report_id || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center text-slate-600">
                          {kh(r.counts.manufactured)}/{kh(r.counts.installed)}/{kh(r.counts.repaired)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center">
                          <span className="font-bold text-emerald-700">{kh(r.counts.passed)}</span>
                          <span className="text-slate-300"> / </span>
                          <span className="font-bold text-red-600">{kh(r.counts.failed)}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                          {dmy(r.submitted_at)}
                          {r.on_time === false && <span className="ml-1 text-[9px] font-extrabold text-red-600">យឺត</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[9px] font-bold ${st.cls}`}>
                            {st.kh}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => void printOfficial(r)}
                              disabled={busy === `print:${r.id}`}
                              title="ទាញយកឧបសម្ព័ន្ធទី៨ផ្លូវការ (Word)"
                              className="rounded border border-slate-200 bg-slate-50 p-1.5 text-slate-600 hover:bg-white disabled:opacity-50"
                            >
                              {busy === `print:${r.id}`
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Download className="h-3.5 w-3.5" />}
                            </button>

                            {r.status !== 'ACCEPTED' && (
                              <button
                                onClick={() => void review(r, 'accept')}
                                disabled={busy === `accept:${r.id}`}
                                title="ទទួលយក"
                                className="rounded border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {r.status !== 'RETURNED' && (
                              <button
                                onClick={() => setPrompt({ kind: 'return', report: r, text: '' })}
                                title="ត្រឡប់ទៅសហគ្រាសកែ"
                                className="rounded border border-amber-200 bg-amber-50 p-1.5 text-amber-700 hover:bg-amber-100"
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                              </button>
                            )}

                            <button
                              onClick={() => setPrompt({ kind: 'delete', report: r, text: '' })}
                              title="លុបរបាយការណ៍"
                              className="rounded border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr key={`${r.id}-detail`}>
                          <td colSpan={9} className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
                            <Detail
                              report={r}
                              entries={detail[r.id]}
                              audit={audit[r.id] || []}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Returning and deleting both need a reason, so both ask for one the
          same way rather than one being a bare confirm. */}
      {prompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h5 className={`text-sm font-black ${prompt.kind === 'delete' ? 'text-red-700' : 'text-amber-700'}`}>
              {prompt.kind === 'delete' ? 'លុបរបាយការណ៍' : 'ត្រឡប់របាយការណ៍ទៅសហគ្រាស'}
            </h5>
            <p className="mt-1 text-[11px] font-bold text-slate-600">
              {prompt.report.company_name_kh || prompt.report.company_name} ·{' '}
              {khmerMonthLabel(prompt.report.period_month)}
              {prompt.report.report_id ? ` · ${prompt.report.report_id}` : ''}
            </p>

            <p className="mt-2 text-[11px] text-slate-500">
              {prompt.kind === 'delete'
                ? 'របាយការណ៍ និងធាតុទាំងអស់នឹងត្រូវលុបចោល។ មូលហេតុ និងច្បាប់ចម្លងនៃរបាយការណ៍នឹងត្រូវរក្សាទុកក្នុងកំណត់ហេតុសវនកម្ម។'
                : 'សហគ្រាសនឹងឃើញមតិយោបល់នេះ ហើយអាចកែរួចដាក់ជូនឡើងវិញ ដោយរក្សាលេខរបាយការណ៍ដដែល។'}
            </p>

            <textarea
              autoFocus
              rows={3}
              value={prompt.text}
              onChange={(e) => setPrompt({ ...prompt, text: e.target.value })}
              placeholder={prompt.kind === 'delete' ? 'មូលហេតុនៃការលុប…' : 'មតិយោបល់សម្រាប់សហគ្រាស…'}
              className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[12px] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#353C96]"
            />

            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setPrompt(null)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
              >
                បោះបង់
              </button>
              <button
                disabled={!prompt.text.trim() || !!busy}
                onClick={() => prompt.kind === 'delete'
                  ? void remove(prompt.report, prompt.text.trim())
                  : void review(prompt.report, 'return', prompt.text.trim())}
                className={`rounded-lg px-4 py-2 text-[11px] font-black text-white disabled:opacity-40 ${
                  prompt.kind === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {busy ? 'កំពុងដំណើរការ…' : prompt.kind === 'delete' ? 'លុប' : 'ត្រឡប់'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * What was filed, and what has happened to it
 * ------------------------------------------------------------------ */

function Detail(
  { report, entries, audit }:
  { report: StaffReport; entries: any; audit: any[] },
) {
  if (entries === undefined) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> កំពុងផ្ទុក…
      </div>
    );
  }
  if (!entries) return <p className="text-[10px] text-slate-400">មិនអាចផ្ទុកលម្អិតបានទេ។</p>;

  return (
    <div className="space-y-4">
      {report.nmc_remarks && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[10px] text-amber-800">
          <span className="font-extrabold">មតិយោបល់ ម.ម.ជ៖ </span>{report.nmc_remarks}
          {report.reviewer && <span className="ml-1 opacity-70">({report.reviewer})</span>}
        </div>
      )}

      <Rows
        title="ផ្នែកទី៣ · ឧបករណ៍ផលិត និងដំឡើង"
        columns={['ល.រ', 'ប្រភេទ', 'ឈ្មោះឧបករណ៍', 'ម៉ូដែល', 'លេខសៀរៀល', 'អតិថិជន', 'ខេត្ត/ក្រុង', 'ថ្ងៃបញ្ចប់', 'លទ្ធផល']}
        rows={(entries.instruments || []).map((x: any) => [
          toKhmerDigits(x.row_no), x.op_code === 'M' ? 'ផលិត' : 'ដំឡើង',
          x.instrument_name || '-', x.model || '-', x.serial_no || '-',
          x.customer_name || '-', x.province || '-', x.completion_date || '-',
          x.verification_status === 'PASSED' ? 'ជាប់' : x.verification_status === 'FAILED' ? 'ធ្លាក់' : 'រង់ចាំ',
        ])}
      />

      <Rows
        title="ផ្នែកទី៤ · ការជួសជុល"
        columns={['ល.រ', 'ឈ្មោះឧបករណ៍', 'លេខសៀរៀល', 'អតិថិជន', 'ខេត្ត/ក្រុង', 'ចាប់ពី', 'ដល់', 'ត្រាបាក់', 'លទ្ធផល']}
        rows={(entries.repairs || []).map((x: any) => [
          toKhmerDigits(x.row_no), x.instrument_name || '-', x.serial_no || '-',
          x.customer_name || '-', x.province || '-', x.repair_from || '-', x.repair_to || '-',
          x.seal_broken ? `មាន (${x.seal_removed_no || '-'})` : 'គ្មាន',
          x.verification_status === 'PASSED' ? 'ជាប់' : x.verification_status === 'FAILED' ? 'ធ្លាក់' : 'រង់ចាំ',
        ])}
      />

      <Rows
        title="ផ្នែកទី៣ក · ម៉ូឌុល និងគ្រឿងបន្លាស់"
        columns={['ល.រ', 'ឧបករណ៍មេ', 'ឈ្មោះម៉ូឌុល', 'ម៉ូដែល', 'លេខសៀរៀល', 'ថ្មី/ប្ដូរ']}
        rows={(entries.modules || []).map((x: any) => [
          toKhmerDigits(x.row_no), x.host_serial_no || '-', x.module_name || '-',
          x.model || '-', x.serial_no || '-',
          x.new_or_replacement === 'REPLACEMENT' ? 'ប្ដូរ' : 'ថ្មី',
        ])}
      />

      {audit.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold text-[#0B2A66]">
            <History className="h-3 w-3" /> កំណត់ហេតុសវនកម្ម · Audit trail
          </p>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-[10px]">
              <tbody className="divide-y divide-slate-100">
                {audit.slice(0, 50).map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-slate-500">{dmy(a.created_at)}</td>
                    <td className="px-2.5 py-1.5 font-bold text-slate-700">{a.entity}</td>
                    <td className="px-2.5 py-1.5 text-slate-600">{a.action}</td>
                    <td className="px-2.5 py-1.5 text-slate-500">{a.actor_role || ''}</td>
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

function Rows(
  { title, columns, rows }: { title: string; columns: string[]; rows: string[][] },
) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-extrabold text-[#0B2A66]">{title}</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-[10px]">
          <thead className="bg-slate-100 text-slate-600">
            <tr>{columns.map((c) => <th key={c} className="whitespace-nowrap px-2.5 py-1.5 text-left font-bold">{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((cells, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {cells.map((c, j) => <td key={j} className="whitespace-nowrap px-2.5 py-1.5 text-slate-600">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
