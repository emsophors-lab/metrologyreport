/**
 * តារាងរបាយការណ៍របស់ខ្ញុំ — the licensee's own register of monthly reports.
 *
 * One row per month, which is the level the question is actually asked at:
 * how many reports have we filed, what was in each, which are still open, and
 * which went in late. The instrument-level search answers a different
 * question ("which weighbridge failed in September?") and stays where it is.
 *
 * A row expands into that month's instruments and repairs, so the detail is
 * one click away without leaving the register.
 *
 * Styled to match the legacy តារាងរបាយការណ៍លម្អិត table — same navy #353C96
 * header, same card, same 15-row pagination — so the screens read as one
 * system rather than two.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock,
  Download, FileText, Loader2, RotateCcw,
} from 'lucide-react';

import { CATEGORIES } from '../annex8/constants';
import { khmerMonthLabel, toKhmerDigits } from '../annex8/summary';
import { apiRequest } from '../supabaseSync';
import { getApiAuthHeaders } from '../apiAuth';
import { MetrologyUser } from '../types';

interface Counts {
  manufactured: number; installed: number; repaired: number;
  passed: number; failed: number; pending: number;
  instruments: number; modules: number; repairs: number; standards: number;
}

interface ReportRow {
  id: string;
  period_month: string;
  report_id: string | null;
  report_type: string;
  status: string;
  on_time: boolean | null;
  submitted_at: string | null;
  updated_at: string | null;
  editable: boolean;
  deadline: string;
  has_document: boolean;
  nmc_remarks: string | null;
  categories: string[];
  counts: Counts;
  total_entries: number;
}

const STATUS: Record<string, { kh: string; cls: string }> = {
  OPEN:      { kh: 'កំពុងបំពេញ',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  DRAFT:     { kh: 'ព្រាង',        cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  SUBMITTED: { kh: 'បានដាក់ជូន',   cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  RETURNED:  { kh: 'ត្រឡប់មកវិញ',  cls: 'bg-red-50 text-red-700 border-red-200' },
  ACCEPTED:  { kh: 'បានទទួលយក',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const TYPE_KH: Record<string, string> = {
  REGULAR: 'ធម្មតា', NIL: 'គ្មានសកម្មភាព', AMENDMENT: 'កែតម្រូវ',
};

const ITEMS_PER_PAGE = 15;
const dash = (v: unknown) => (String(v ?? '').trim() === '' ? '-' : String(v));

// khmerMonthLabel already renders 'កញ្ញា ឆ្នាំ២០២៦' from 'YYYY-MM'.
const periodLabel = (period: string) => khmerMonthLabel(String(period || ''));

const dmy = (iso: string | null) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const categoryLabel = (code: string) => {
  const c = (CATEGORIES as any)[code];
  return c ? c.kh : code;
};

export default function Annex8MyReportsTable({ currentUser }: { currentUser: MetrologyUser }) {
  const licenceNo = String(currentUser.license_number || '').trim();

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');

  const [openRow, setOpenRow] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!licenceNo) { setError('គណនីនេះមិនមានលេខអាជ្ញាបណ្ណទេ។'); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<any>(
        `/api/annex8/reports-list?licence_no=${encodeURIComponent(licenceNo)}`);
      setRows(data?.reports || []);
      setSummary(data?.summary || null);
    } catch (err: any) {
      setError(err?.message || 'មិនអាចផ្ទុកតារាងរបាយការណ៍បានទេ។');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [licenceNo]);

  useEffect(() => { load(); }, [load]);

  const years = useMemo(() => {
    const set = new Set(rows.map((r) => String(r.period_month || '').slice(0, 4)).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) =>
    (statusFilter === 'all' || r.status === statusFilter) &&
    (yearFilter === 'all' || String(r.period_month || '').startsWith(yearFilter)),
  ), [rows, statusFilter, yearFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const pageRows = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  useEffect(() => { setPage(1); }, [statusFilter, yearFilter]);

  const toggle = async (row: ReportRow) => {
    if (openRow === row.id) { setOpenRow(null); return; }
    setOpenRow(row.id);
    if (detail[row.id]) return;
    setDetailLoading(row.id);
    try {
      const data = await apiRequest<any>(
        `/api/annex8/month?licence_no=${encodeURIComponent(licenceNo)}&period=${encodeURIComponent(row.period_month)}`);
      setDetail((d) => ({ ...d, [row.id]: data?.entries || null }));
    } catch {
      setDetail((d) => ({ ...d, [row.id]: null }));
    } finally {
      setDetailLoading(null);
    }
  };

  const downloadWord = async (row: ReportRow) => {
    const headers = await getApiAuthHeaders();
    const res = await fetch(`/api/reports/${row.id}/annex8.docx`, { headers });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Annex8_${licenceNo}_${row.period_month}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectClass =
    'w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] text-slate-600 ' +
    'focus:outline-none focus:ring-1 focus:ring-[#353C96] focus:bg-white';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Headline numbers: what the licensee wants to know at a glance. */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-extrabold text-slate-800">តារាងរបាយការណ៍របស់សហគ្រាស</h4>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Monthly reports filed by {dash(currentUser.company_name_en)} · {dash(licenceNo)}
            </p>
          </div>
          <button
            onClick={load}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-slate-600 flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" /> ផ្ទុកឡើងវិញ
          </button>
        </div>

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-3">
            {[
              { label: 'របាយការណ៍សរុប', value: summary.total, cls: 'text-[#0B2A66]' },
              { label: 'បានដាក់ជូន', value: summary.filed, cls: 'text-sky-700' },
              { label: 'កំពុងបំពេញ', value: summary.open, cls: 'text-amber-700' },
              { label: 'យឺត', value: summary.late, cls: 'text-red-600' },
              { label: 'ឧបករណ៍ ផលិត/ដំឡើង', value: summary.instruments, cls: 'text-slate-700' },
              { label: 'ការជួសជុល', value: summary.repairs, cls: 'text-slate-700' },
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <div className={`text-lg font-extrabold ${s.cls}`}>{toKhmerDigits(s.value ?? 0)}</div>
                <div className="text-[9px] text-slate-500 font-bold leading-tight">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">ឆ្នាំរបាយការណ៍ (Year)</label>
            <select className={selectClass} value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
              <option value="all">គ្រប់ឆ្នាំទាំងអស់ / All years</option>
              {years.map((y) => <option key={y} value={y}>{toKhmerDigits(y)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">ស្ថានភាព (Status)</label>
            <select className={selectClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">គ្រប់ស្ថានភាព / All</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.kh}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="m-4 p-3 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-700 font-bold flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex items-center justify-center text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !filtered.length ? (
        <div className="py-16 text-center">
          <p className="text-xs font-bold text-slate-500">មិនទាន់មានរបាយការណ៍ទេ</p>
          <p className="text-[10px] text-slate-400 mt-1">No monthly report has been started yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-[#353C96] text-white">
              <tr>
                <th className="px-3 py-2.5 text-left font-bold w-8"></th>
                <th className="px-3 py-2.5 text-left font-bold">ខែរបាយការណ៍</th>
                <th className="px-3 py-2.5 text-left font-bold">លេខរបាយការណ៍</th>
                <th className="px-3 py-2.5 text-left font-bold">ប្រភេទ</th>
                <th className="px-3 py-2.5 text-center font-bold">ផលិត</th>
                <th className="px-3 py-2.5 text-center font-bold">ដំឡើង</th>
                <th className="px-3 py-2.5 text-center font-bold">ជួសជុល</th>
                <th className="px-3 py-2.5 text-center font-bold">ជាប់</th>
                <th className="px-3 py-2.5 text-center font-bold">ធ្លាក់</th>
                <th className="px-3 py-2.5 text-center font-bold">រង់ចាំ</th>
                <th className="px-3 py-2.5 text-left font-bold">ស្ថានភាព</th>
                <th className="px-3 py-2.5 text-left font-bold">ដាក់ជូននៅ</th>
                <th className="px-3 py-2.5 text-center font-bold">ឯកសារ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((r) => {
                const st = STATUS[r.status] || { kh: r.status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
                const isOpen = openRow === r.id;
                const entries = detail[r.id];
                return (
                  <>
                    <tr key={r.id} className={`hover:bg-slate-50 ${isOpen ? 'bg-slate-50' : ''}`}>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => toggle(r)}
                          className="text-slate-400 hover:text-[#353C96] cursor-pointer"
                          title="មើលតារាងឧបករណ៍"
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">
                        {periodLabel(r.period_month)}
                        {r.on_time === false && (
                          <span className="ml-1.5 text-[9px] font-extrabold text-red-600">យឺត</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-slate-600 whitespace-nowrap">
                        {dash(r.report_id)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{TYPE_KH[r.report_type] || r.report_type}</td>
                      <td className="px-3 py-2 text-center text-slate-700">{toKhmerDigits(r.counts.manufactured)}</td>
                      <td className="px-3 py-2 text-center text-slate-700">{toKhmerDigits(r.counts.installed)}</td>
                      <td className="px-3 py-2 text-center text-slate-700">{toKhmerDigits(r.counts.repaired)}</td>
                      <td className="px-3 py-2 text-center font-bold text-emerald-700">{toKhmerDigits(r.counts.passed)}</td>
                      <td className="px-3 py-2 text-center font-bold text-red-600">{toKhmerDigits(r.counts.failed)}</td>
                      <td className="px-3 py-2 text-center font-bold text-slate-500">{toKhmerDigits(r.counts.pending)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold whitespace-nowrap ${st.cls}`}>
                          {st.kh}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{dmy(r.submitted_at)}</td>
                      <td className="px-3 py-2 text-center">
                        {r.report_id ? (
                          <button
                            onClick={() => downloadWord(r)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-white text-[9px] font-bold text-slate-600 cursor-pointer"
                            title="ទាញយកឯកសារផ្លូវការ (Word)"
                          >
                            <Download className="h-3 w-3" /> Word
                          </button>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr key={`${r.id}-detail`}>
                        <td colSpan={13} className="px-5 py-4 bg-slate-50/70 border-t border-slate-100">
                          {detailLoading === r.id ? (
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> កំពុងផ្ទុក...
                            </div>
                          ) : !entries ? (
                            <p className="text-[10px] text-slate-400">មិនអាចផ្ទុកលម្អិតបានទេ។</p>
                          ) : (
                            <div className="space-y-4">
                              <div className="flex flex-wrap gap-2">
                                {r.categories.map((c) => (
                                  <span key={c} className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[9px] font-bold text-slate-600">
                                    {categoryLabel(c)}
                                  </span>
                                ))}
                                <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[9px] font-bold text-slate-500">
                                  ម៉ូឌុល {toKhmerDigits(r.counts.modules)} · ស្ដង់ដារ {toKhmerDigits(r.counts.standards)}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[9px] font-bold text-slate-500">
                                  កាលបរិច្ឆេទផុតកំណត់ {r.deadline}
                                </span>
                              </div>

                              {r.nmc_remarks && (
                                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-[10px] text-red-700">
                                  <span className="font-extrabold">មតិយោបល់ ម.ម.ជ៖ </span>{r.nmc_remarks}
                                </div>
                              )}

                              <DetailTable
                                title="ផ្នែកទី៣ · ឧបករណ៍ផលិត និងដំឡើង"
                                columns={['ល.រ', 'ប្រភេទ', 'ឈ្មោះឧបករណ៍', 'ម៉ូដែល', 'លេខសៀរៀល', 'អតិថិជន', 'ខេត្ត/ក្រុង', 'ថ្ងៃបញ្ចប់', 'លទ្ធផល']}
                                rows={(entries.instruments || []).map((x: any) => [
                                  toKhmerDigits(x.row_no), x.op_code === 'M' ? 'ផលិត' : 'ដំឡើង',
                                  dash(x.instrument_name), dash(x.model), dash(x.serial_no),
                                  dash(x.customer_name), dash(x.province), dash(x.completion_date),
                                  x.verification_status === 'PASSED' ? 'ជាប់' : x.verification_status === 'FAILED' ? 'ធ្លាក់' : 'រង់ចាំ',
                                ])}
                              />

                              <DetailTable
                                title="ផ្នែកទី៤ · ការជួសជុល"
                                columns={['ល.រ', 'ឈ្មោះឧបករណ៍', 'លេខសៀរៀល', 'អតិថិជន', 'ខេត្ត/ក្រុង', 'ចាប់ពី', 'ដល់', 'ត្រាបាក់', 'លទ្ធផល']}
                                rows={(entries.repairs || []).map((x: any) => [
                                  toKhmerDigits(x.row_no), dash(x.instrument_name), dash(x.serial_no),
                                  dash(x.customer_name), dash(x.province), dash(x.repair_from), dash(x.repair_to),
                                  x.seal_broken ? `មាន (${dash(x.seal_removed_no)})` : 'គ្មាន',
                                  x.verification_status === 'PASSED' ? 'ជាប់' : x.verification_status === 'FAILED' ? 'ធ្លាក់' : 'រង់ចាំ',
                                ])}
                              />

                              <DetailTable
                                title="ផ្នែកទី៣ក · ម៉ូឌុល និងគ្រឿងបន្លាស់"
                                columns={['ល.រ', 'ឧបករណ៍មេ', 'ឈ្មោះម៉ូឌុល', 'ម៉ូដែល', 'លេខសៀរៀល', 'វិសាលភាព', 'ថ្មី/ប្ដូរ']}
                                rows={(entries.modules || []).map((x: any) => [
                                  toKhmerDigits(x.row_no), dash(x.host_serial_no), dash(x.module_name),
                                  dash(x.model), dash(x.serial_no), dash(x.range_e),
                                  x.new_or_replacement === 'REPLACEMENT' ? 'ប្ដូរ' : 'ថ្មី',
                                ])}
                              />
                            </div>
                          )}
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

      {filtered.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-bold">
            បង្ហាញ {toKhmerDigits((page - 1) * ITEMS_PER_PAGE + 1)}–
            {toKhmerDigits(Math.min(page * ITEMS_PER_PAGE, filtered.length))} ក្នុងចំណោម {toKhmerDigits(filtered.length)}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              មុន
            </button>
            <span className="text-[10px] font-bold text-slate-500">
              {toKhmerDigits(page)} / {toKhmerDigits(totalPages)}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              បន្ទាប់
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailTable(
  { title, columns, rows }: { title: string; columns: string[]; rows: Array<Array<string>> },
) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-[10px] font-extrabold text-[#0B2A66] mb-1.5">{title}</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-[10px]">
          <thead className="bg-slate-100 text-slate-600">
            <tr>{columns.map((c) => <th key={c} className="px-2.5 py-1.5 text-left font-bold whitespace-nowrap">{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((cells, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {cells.map((cell, j) => (
                  <td key={j} className="px-2.5 py-1.5 text-slate-600 whitespace-nowrap">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
