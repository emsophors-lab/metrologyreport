/**
 * ស្វែងរករបាយការណ៍ — searching the monthly reports.
 *
 * Four dimensions, as NMC asked for: month, year, service type
 * (ផលិត / ដំឡើង / ជួសជុល) and verification result (ជាប់ / ធ្លាក់ / រង់ចាំ),
 * plus free text over serial number, instrument, customer and enterprise.
 *
 * The layout deliberately copies the legacy "តារាងរបាយការណ៍លម្អិត" table in
 * App.tsx — same card, same filter grid, same navy #353C96 header row, same
 * pagination footer — so the two screens read as one system rather than two.
 *
 * It searches annex8_activity_union through /api/annex8/search, so one search
 * covers both the new Annex 8 reports and the frozen legacy ones. Rows are
 * instrument and repair entries, which is the level a search is actually asked
 * at ("which weighbridge failed in September?"), not whole reports.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, MapPin, RotateCcw, Search } from 'lucide-react';

import { CATEGORIES } from '../annex8/constants';
import { apiRequest } from '../supabaseSync';
import { MetrologyUser } from '../types';

const MONTH_OPTIONS = [
  ['01', 'មករា'], ['02', 'កុម្ភៈ'], ['03', 'មីនា'], ['04', 'មេសា'],
  ['05', 'ឧសភា'], ['06', 'មិថុនា'], ['07', 'កក្កដា'], ['08', 'សីហា'],
  ['09', 'កញ្ញា'], ['10', 'តុលា'], ['11', 'វិច្ឆិកា'], ['12', 'ធ្នូ'],
];

const OP_LABELS: Record<string, { kh: string; cls: string }> = {
  M: { kh: 'ផលិត', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  I: { kh: 'តម្លើង', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  R: { kh: 'ជួសជុល', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const VERIFICATION_LABELS: Record<string, { kh: string; cls: string }> = {
  PASSED: { kh: 'ជាប់', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  FAILED: { kh: 'ធ្លាក់', cls: 'bg-red-50 text-red-700 border-red-200' },
  PENDING: { kh: 'រង់ចាំ', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

interface ActivityRow {
  format_version: string;
  row_id: string;
  licence_no: string;
  company_name_kh: string;
  category: string | null;
  instrument_name: string;
  serial_no: string;
  customer_name: string;
  province: string | null;
  op_code: string;
  activity_date: string | null;
  verification_status: string | null;
  report_month: string;
  report_year: string;
}

interface SearchCounts {
  total: number;
  manufactured: number; installed: number; repaired: number;
  passed: number; failed: number; pending: number;
  enterprises: number;
}

const BLANK: SearchCounts = {
  total: 0, manufactured: 0, installed: 0, repaired: 0,
  passed: 0, failed: 0, pending: 0, enterprises: 0,
};

const ITEMS_PER_PAGE = 15;
const dash = (v: unknown) => (String(v ?? '').trim() === '' ? '-' : String(v));

/** The legacy screen's select and label styling, reused verbatim. */
const SELECT_CLASS = 'w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#353C96] focus:bg-white';
const LABEL_CLASS = 'block text-[10px] font-bold text-slate-500 mb-1';

export default function Annex8ReportSearch({ currentUser }: { currentUser: MetrologyUser }) {
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [filterServiceType, setFilterServiceType] = useState('all');
  const [filterVerification, setFilterVerification] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [counts, setCounts] = useState<SearchCounts>(BLANK);
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<{ years: string[]; licences: Array<{ licence_no: string; name: string }> }>({
    years: [], licences: [],
  });

  const isStaff = currentUser.role !== 'company';

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ years: string[]; licences: Array<{ licence_no: string; name: string }> }>(
      '/api/annex8/search-facets',
    )
      .then((data) => { if (!cancelled) setFacets({ years: data.years || [], licences: data.licences || [] }); })
      .catch(() => { /* the dropdowns simply stay on their defaults */ });
    return () => { cancelled = true; };
  }, []);

  const runSearch = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterYear !== 'all') params.set('year', filterYear);
      if (filterMonth !== 'all') params.set('month', filterMonth);
      if (filterServiceType !== 'all') params.set('op_code', filterServiceType);
      if (filterVerification !== 'all') params.set('verification', filterVerification);
      if (filterCompany !== 'all') params.set('licence', filterCompany);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const data = await apiRequest<{ rows: ActivityRow[]; counts: SearchCounts; truncated: boolean }>(
        `/api/annex8/search?${params.toString()}`,
      );
      setRows(data.rows || []);
      setCounts(data.counts || BLANK);
      setTruncated(!!data.truncated);
    } catch (err: any) {
      setError(err?.message || 'Search failed');
      setRows([]);
      setCounts(BLANK);
    } finally {
      setBusy(false);
    }
  }, [filterYear, filterMonth, filterServiceType, filterVerification, filterCompany, searchQuery]);

  // Dropdowns search immediately; free text waits for Enter or the button so
  // typing does not fire a request per keystroke.
  useEffect(() => {
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterYear, filterMonth, filterServiceType, filterVerification, filterCompany]);

  const totalPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
  const paginated = useMemo(
    () => rows.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [rows, currentPage],
  );
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(1); }, [totalPages, currentPage]);

  const reset = () => {
    setFilterMonth('all'); setFilterYear('all'); setFilterServiceType('all');
    setFilterVerification('all'); setFilterCompany('all'); setSearchQuery('');
    setCurrentPage(1);
  };

  const exportCsv = () => {
    const header = ['ល.រ', 'ក្រុមហ៊ុនទទួលបានអាជ្ញាប័ណ្ណ', 'លេខអាជ្ញាប័ណ្ណ', 'ឈ្មោះអតិថិជន', 'ទីតាំង',
      'ឈ្មោះឧបករណ៍វាស់វែង', 'លេខស៊េរី', 'ប្រភេទសេវាកម្ម', 'លទ្ធផលផ្ទៀងផ្ទាត់',
      'កាលបរិច្ឆេទធ្វើសេវាកម្ម', 'ខែ', 'ឆ្នាំ'];
    const body = rows.map((r, i) => [
      i + 1, r.company_name_kh, r.licence_no, r.customer_name, r.province || '',
      r.instrument_name, r.serial_no, OP_LABELS[r.op_code]?.kh || r.op_code,
      VERIFICATION_LABELS[r.verification_status || '']?.kh || '', r.activity_date || '',
      r.report_month, r.report_year,
    ]);
    const csv = [header, ...body]
      .map((line) => line.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    // The BOM makes Excel read it as UTF-8; without it the Khmer comes out as mojibake.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NMC_report_search_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const colSpan = isStaff ? 9 : 8;

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden">

      {/* Filters & search */}
      <div className="p-5 border-b border-slate-100 space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div>
            <h4 className="font-bold text-slate-800 text-sm">
              ស្វែងរករបាយការណ៍ ({rows.length} កំណត់ត្រា)
            </h4>
            <p className="text-[10px] text-slate-400 mt-0.5">
              ចម្រោះតាមខែ ឆ្នាំ ប្រភេទសេវាកម្ម និងលទ្ធផលផ្ទៀងផ្ទាត់
            </p>
          </div>

          <div className="relative max-w-sm w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <input
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#353C96]"
              placeholder="ស្វែងរកតាម អតិថិជន លេខស៊េរី ឧបករណ៍ ក្រុមហ៊ុន..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }}
            />
          </div>
        </div>

        {/* Extended filters grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 pt-2">

          <div>
            <label className={LABEL_CLASS} htmlFor="a8s-month">ចម្រោះតាមខែ (Month)</label>
            <select id="a8s-month" className={SELECT_CLASS} value={filterMonth}
              onChange={(e) => { setFilterMonth(e.target.value); setCurrentPage(1); }}>
              <option value="all">គ្រប់ខែទាំងអស់ / All months</option>
              {MONTH_OPTIONS.map(([v, kh]) => <option key={v} value={v}>{kh} ({v})</option>)}
            </select>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="a8s-year">ឆ្នាំរបាយការណ៍ (Year)</label>
            <select id="a8s-year" className={SELECT_CLASS} value={filterYear}
              onChange={(e) => { setFilterYear(e.target.value); setCurrentPage(1); }}>
              <option value="all">គ្រប់ឆ្នាំទាំងអស់ / All years</option>
              {facets.years.map((y) => <option key={y} value={y}>ឆ្នាំ {y}</option>)}
            </select>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="a8s-op">ប្រភេទសេវាកម្ម (Service Type)</label>
            <select id="a8s-op" className={SELECT_CLASS} value={filterServiceType}
              onChange={(e) => { setFilterServiceType(e.target.value); setCurrentPage(1); }}>
              <option value="all">គ្រប់ប្រភេទទាំងអស់ / All</option>
              <option value="M">ផលិត (Manufacture)</option>
              <option value="I">តម្លើង (Installation)</option>
              <option value="R">ជួសជុល (Repair)</option>
            </select>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="a8s-ver">លទ្ធផលផ្ទៀងផ្ទាត់ (Result)</label>
            <select id="a8s-ver" className={SELECT_CLASS} value={filterVerification}
              onChange={(e) => { setFilterVerification(e.target.value); setCurrentPage(1); }}>
              <option value="all">គ្រប់លទ្ធផលទាំងអស់ / All</option>
              <option value="PASSED">ជាប់ (Passed)</option>
              <option value="FAILED">ធ្លាក់ (Failed)</option>
              <option value="PENDING">រង់ចាំ (Pending)</option>
            </select>
          </div>

          {isStaff && (
            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL_CLASS} htmlFor="a8s-company">ក្រុមហ៊ុន (Company)</label>
              <select id="a8s-company" className={SELECT_CLASS} value={filterCompany}
                onChange={(e) => { setFilterCompany(e.target.value); setCurrentPage(1); }}>
                <option value="all">គ្រប់ក្រុមហ៊ុនទាំងអស់ / All companies</option>
                {facets.licences.map((l) => (
                  <option key={l.licence_no} value={l.licence_no}>{l.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Result summary + actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-slate-500">
            <span>សហគ្រាស <strong className="text-slate-700">{counts.enterprises}</strong></span>
            <span className="text-slate-300">|</span>
            <span>ផលិត <strong className="text-sky-700">{counts.manufactured}</strong></span>
            <span>តម្លើង <strong className="text-indigo-700">{counts.installed}</strong></span>
            <span>ជួសជុល <strong className="text-amber-700">{counts.repaired}</strong></span>
            <span className="text-slate-300">|</span>
            <span>ជាប់ <strong className="text-emerald-700">{counts.passed}</strong></span>
            <span>ធ្លាក់ <strong className="text-red-700">{counts.failed}</strong></span>
            <span>រង់ចាំ <strong className="text-slate-600">{counts.pending}</strong></span>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void runSearch()} disabled={busy}
              className="px-3 py-1.5 bg-[#353C96] hover:bg-[#2b3178] text-white text-[10px] font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              ស្វែងរក
            </button>
            <button type="button" onClick={reset}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer">
              <RotateCcw className="h-3.5 w-3.5" /> សម្អាត
            </button>
            <button type="button" onClick={exportCsv} disabled={!rows.length}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40">
              <Download className="h-3.5 w-3.5 text-emerald-600" /> Export Excel
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-800">
            មិនអាចស្វែងរកបានទេ
            <span className="mt-0.5 block break-all font-mono text-[9px] font-semibold text-red-600">{error}</span>
          </div>
        )}

        {truncated && (
          <p className="text-[10px] font-bold text-amber-700">
            បង្ហាញតែ {rows.length} ជួរដំបូង — សូមបន្ថែមតម្រងដើម្បីបង្រួមលទ្ធផល។
            <span className="block font-semibold text-amber-600">
              Showing the first {rows.length} rows only; narrow the filters to see the rest.
            </span>
          </p>
        )}
      </div>

      {/* Desktop view responsive table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#353C96] text-white text-[10px] font-bold uppercase tracking-wider">
              <th className="p-4 text-center w-12 text-white">ល.រ</th>
              {isStaff && <th className="p-4">ក្រុមហ៊ុនទទួលបានអាជ្ញាប័ណ្ណ</th>}
              <th className="p-4">ឈ្មោះអតិថិជន និងទីតាំង</th>
              <th className="p-4">ឈ្មោះឧបករណ៍វាស់វែង</th>
              <th className="p-4 text-center">លេខស៊េរី</th>
              <th className="p-4 text-center">ប្រភេទសេវាកម្ម</th>
              <th className="p-4 text-center">លទ្ធផលផ្ទៀងផ្ទាត់</th>
              <th className="p-4 text-center">កាលបរិច្ឆេទធ្វើសេវាកម្ម</th>
              <th className="p-4 text-center">ខែ / ឆ្នាំ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginated.map((r, i) => {
              const op = OP_LABELS[r.op_code] || { kh: r.op_code, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
              const ver = VERIFICATION_LABELS[r.verification_status || ''];
              const category = r.category && CATEGORIES[r.category as keyof typeof CATEGORIES];
              return (
                <tr key={`${r.row_id}-${i}`} className="hover:bg-slate-50/70 transition-colors">
                  <td className="p-4 text-center font-mono text-slate-400">
                    {(currentPage - 1) * ITEMS_PER_PAGE + i + 1}
                  </td>

                  {isStaff && (
                    <td className="p-4">
                      <div className="font-bold text-slate-900 leading-snug">{dash(r.company_name_kh)}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">License: {dash(r.licence_no)}</div>
                    </td>
                  )}

                  <td className="p-4">
                    <div className="font-bold text-slate-800 leading-snug">{dash(r.customer_name)}</div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3 inline text-slate-400" />
                      <span className="line-clamp-1">{dash(r.province)}</span>
                    </div>
                  </td>

                  <td className="p-4 leading-normal">
                    <div className="font-semibold text-slate-700">{dash(r.instrument_name)}</div>
                    {category && <div className="text-[10px] text-slate-400 mt-0.5">{category.kh}</div>}
                  </td>

                  <td className="p-4 text-center">
                    <div className="font-mono font-bold text-slate-700 text-[10px]">{dash(r.serial_no)}</div>
                  </td>

                  <td className="p-4 text-center">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${op.cls}`}>
                      {op.kh}
                    </span>
                  </td>

                  <td className="p-4 text-center">
                    {ver
                      ? <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${ver.cls}`}>{ver.kh}</span>
                      : <span className="text-slate-300">-</span>}
                  </td>

                  <td className="p-4 text-center font-mono text-[10px] text-slate-600">
                    {dash(r.activity_date)}
                  </td>

                  <td className="p-4 text-center text-[10px] text-slate-600">
                    {dash(r.report_month)} / {dash(r.report_year)}
                  </td>
                </tr>
              );
            })}

            {!rows.length && !busy && (
              <tr>
                <td colSpan={colSpan} className="p-10 text-center text-slate-400">
                  <Search className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  <span className="block font-bold text-xs">រកមិនឃើញលទ្ធផលទេ</span>
                  <span className="text-[10px]">No rows match these filters.</span>
                </td>
              </tr>
            )}
            {busy && !rows.length && (
              <tr>
                <td colSpan={colSpan} className="p-10 text-center text-slate-400">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer, matching the legacy table */}
      <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          បង្ហាញលទ្ធផលពី <strong>{rows.length ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0}</strong> ដល់{' '}
          <strong>{Math.min(currentPage * ITEMS_PER_PAGE, rows.length)}</strong> នៃទិន្នន័យ{' '}
          <strong>{rows.length}</strong> សរុប
        </p>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="p-1 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            មុន (Prev)
          </button>
          <span className="text-xs font-bold text-slate-700 px-3 font-mono">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="p-1 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            បន្ទាប់ (Next)
          </button>
        </div>
      </div>
    </div>
  );
}
