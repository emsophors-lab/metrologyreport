/**
 * Annex 8 overview — KPI cards, charts and the detail table for the report
 * currently being prepared.
 *
 * Everything here is derived from the live wizard state, so the numbers always
 * agree with Part 2 rather than being a second, drifting calculation.
 */

import React, { useMemo } from 'react';
import {
  Building2, CheckCircle2, Clock3, Hammer, MapPin, PackageCheck, Wrench, XCircle,
} from 'lucide-react';
import { CATEGORIES, CATEGORY_CODES, InstrumentCategory } from '../annex8/constants';
import { Annex8State } from '../annex8/types';
import { computeSummary } from '../annex8/summary';

const catKh = (code: string) =>
  CATEGORIES[code as InstrumentCategory]?.kh || code || '—';

const STATUS_STYLE: Record<string, string> = {
  PASSED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
};

const STATUS_KH: Record<string, string> = {
  PASSED: 'ឆ្លង', FAILED: 'មិនឆ្លង', PENDING: 'រង់ចាំ',
};

function StatCard({
  icon, kh, en, value, tone,
}: {
  icon: React.ReactNode; kh: string; en: string; value: number | string; tone: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl border p-3 shadow-xs ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black uppercase tracking-wide opacity-70">{kh}</p>
          <p className="truncate text-[9px] font-bold opacity-50">{en}</p>
          <p className="mt-1 text-2xl font-black leading-none">{value}</p>
        </div>
        <span className="shrink-0 opacity-80">{icon}</span>
      </div>
    </div>
  );
}

/** Horizontal bar chart — no chart library, so it prints cleanly too. */
function CategoryChart({ rows }: { rows: Array<{ label: string; m: number; i: number; r: number }> }) {
  const max = Math.max(1, ...rows.map((x) => x.m + x.i + x.r));
  if (rows.length === 0) {
    return <p className="py-6 text-center text-[11px] font-semibold text-slate-400">មិនទាន់មានទិន្នន័យ / No data yet</p>;
  }
  return (
    <div className="space-y-2.5">
      {rows.map((row) => {
        const total = row.m + row.i + row.r;
        return (
          <div key={row.label} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-right text-[10px] font-bold text-slate-500 sm:w-40">{row.label}</span>
            <div className="flex h-6 flex-1 overflow-hidden rounded-md bg-slate-100">
              {row.m > 0 && (
                <div className="flex items-center justify-center bg-[#0B2A66] text-[9px] font-black text-white"
                  style={{ width: `${(row.m / max) * 100}%` }} title={`ផលិត ${row.m}`}>{row.m}</div>
              )}
              {row.i > 0 && (
                <div className="flex items-center justify-center bg-[#2F6682] text-[9px] font-black text-white"
                  style={{ width: `${(row.i / max) * 100}%` }} title={`ដំឡើង ${row.i}`}>{row.i}</div>
              )}
              {row.r > 0 && (
                <div className="flex items-center justify-center bg-[#C9A227] text-[9px] font-black text-[#0B1A35]"
                  style={{ width: `${(row.r / max) * 100}%` }} title={`ជួសជុល ${row.r}`}>{row.r}</div>
              )}
            </div>
            <span className="w-7 shrink-0 text-[10px] font-black text-slate-600">{total}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Verification donut, drawn with a conic gradient so it needs no library. */
function VerificationDonut({ passed, failed, pending }: { passed: number; failed: number; pending: number }) {
  const total = passed + failed + pending;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  const p = pct(passed), f = pct(failed);
  const gradient = total === 0
    ? 'conic-gradient(#e2e8f0 0 100%)'
    : `conic-gradient(#10b981 0 ${p}%, #ef4444 ${p}% ${p + f}%, #f59e0b ${p + f}% 100%)`;

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-24 w-24 shrink-0 rounded-full" style={{ background: gradient }}>
        <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-white">
          <span className="text-xl font-black leading-none text-[#0B2A66]">{total}</span>
          <span className="text-[8px] font-bold text-slate-400">សរុប</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-[11px] font-bold">
        {[
          ['ឆ្លង / Passed', passed, 'bg-emerald-500'],
          ['មិនឆ្លង / Failed', failed, 'bg-red-500'],
          ['រង់ចាំ / Pending', pending, 'bg-amber-500'],
        ].map(([label, value, dot]) => (
          <li key={String(label)} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
            <span className="min-w-0 flex-1 truncate text-slate-600">{label as string}</span>
            <span className="text-slate-800">{value as number}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Panel({ kh, en, children, action }: {
  kh: string; en: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-1 rounded-full bg-gradient-to-b from-[#C9A227] to-[#E6C45A]" />
          <div>
            <h3 className="text-xs font-black text-[#0B2A66]">{kh}</h3>
            <p className="text-[10px] font-bold text-slate-400">{en}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function Annex8ReportOverview({ state }: { state: Annex8State }) {
  const summary = useMemo(() => computeSummary(state), [state]);
  const isNil = state.meta.report_type === 'NIL';

  const chartRows = useMemo(() =>
    CATEGORY_CODES
      .map((code) => ({
        label: catKh(code),
        m: summary.rows[code].manufactured,
        i: summary.rows[code].installed,
        r: summary.rows[code].repaired,
      }))
      .filter((x) => x.m + x.i + x.r > 0),
    [summary]);

  /** One flat row per activity, which is what the detail table shows. */
  const detailRows = useMemo(() => {
    if (isNil) return [];
    return [
      ...state.instruments.map((x, i) => ({
        key: `i-${x._id}`, no: i + 1, part: 'ផ្នែកទី៣',
        action: x.op_code === 'M' ? 'ផលិត' : 'ដំឡើង',
        category: catKh(x.category), name: x.instrument_name, model: x.model,
        serial: x.serial_no, customer: x.customer_name, province: x.province,
        date: x.completion_date, status: x.verification_status,
        cert: x.verification_cert_no, label: x.label_qr_no,
      })),
      ...state.repairs.map((x, i) => ({
        key: `r-${x._id}`, no: state.instruments.length + i + 1, part: 'ផ្នែកទី៤',
        action: 'ជួសជុល', category: catKh(x.category), name: x.instrument_name,
        model: x.model, serial: x.serial_no, customer: x.customer_name,
        province: x.province, date: x.repair_to, status: x.verification_status,
        cert: x.verification_cert_no, label: x.seal_removed_no,
      })),
    ];
  }, [state, isNil]);

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={<Hammer className="h-5 w-5" />} kh="ផលិត" en="Manufactured"
          value={summary.total.manufactured} tone="border-[#0B2A66]/20 bg-[#0B2A66]/5 text-[#0B2A66]" />
        <StatCard icon={<PackageCheck className="h-5 w-5" />} kh="ដំឡើង" en="Installed"
          value={summary.total.installed} tone="border-[#2F6682]/25 bg-[#2F6682]/5 text-[#2F6682]" />
        <StatCard icon={<Wrench className="h-5 w-5" />} kh="ជួសជុល" en="Repaired"
          value={summary.total.repaired} tone="border-[#C9A227]/30 bg-[#C9A227]/10 text-[#8a6f14]" />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} kh="ឆ្លង" en="Passed"
          value={summary.total.passed} tone="border-emerald-200 bg-emerald-50 text-emerald-700" />
        <StatCard icon={<XCircle className="h-5 w-5" />} kh="មិនឆ្លង" en="Failed"
          value={summary.total.failed} tone="border-red-200 bg-red-50 text-red-700" />
        <StatCard icon={<Clock3 className="h-5 w-5" />} kh="រង់ចាំ" en="Pending"
          value={summary.total.pending} tone="border-amber-200 bg-amber-50 text-amber-700" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Panel kh="សកម្មភាពតាមប្រភេទឧបករណ៍" en="Activity by instrument category"
            action={
              <div className="flex flex-wrap gap-2 text-[9px] font-black">
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#0B2A66]" />ផលិត</span>
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#2F6682]" />ដំឡើង</span>
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#C9A227]" />ជួសជុល</span>
              </div>
            }>
            <CategoryChart rows={chartRows} />
          </Panel>
        </div>
        <div className="lg:col-span-2">
          <Panel kh="លទ្ធផលផ្ទៀងផ្ទាត់" en="Verification results">
            <VerificationDonut passed={summary.total.passed} failed={summary.total.failed} pending={summary.total.pending} />
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-[11px] font-bold">
              <div className="flex items-center gap-2 text-slate-600">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#C9A227]" />
                <span className="min-w-0 flex-1 truncate">
                  {summary.provinces.length ? summary.provinces.join(', ') : 'មិនទាន់មានទីតាំង'}
                </span>
                <span className="text-slate-800">{summary.provinces.length}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-[#C9A227]" />
                <span className="min-w-0 flex-1">ឧបករណ៍រង់ចាំពីខែមុន / Carried over</span>
                <span className="text-slate-800">{summary.carryOver.count}</span>
              </div>
              <div className={`rounded-lg px-2.5 py-1.5 text-center text-[10px] font-black ${
                summary.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                V01 · {summary.activity} = {summary.results} {summary.balanced ? '✓' : '✗'}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* Detail table */}
      <Panel kh={`តារាងរបាយការណ៍លម្អិត (${detailRows.length} កំណត់ត្រា)`} en="Detailed report table">
        {detailRows.length === 0 ? (
          <p className="py-8 text-center text-[11px] font-semibold text-slate-400">
            {isNil
              ? 'របាយការណ៍គ្មានសកម្មភាព / Nil report — no activity rows'
              : 'មិនទាន់មានជួរទិន្នន័យ — សូមបញ្ចូលក្នុងផ្នែកទី៣ ឬទី៤ / No rows yet'}
          </p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[920px] text-[11px]">
              <thead>
                <tr className="bg-[#0B1A35] text-white">
                  {['ល.រ', 'ផ្នែក', 'សកម្មភាព', 'ប្រភេទ', 'ឈ្មោះឧបករណ៍', 'ម៉ូដែល', 'លេខស៊េរី',
                    'អតិថិជន', 'ខេត្ត', 'កាលបរិច្ឆេទ', 'ស្លាក/Seal', 'ផ្ទៀងផ្ទាត់'].map((h) => (
                    <th key={h} className="whitespace-nowrap p-2 text-left font-black first:rounded-tl-lg last:rounded-tr-lg">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detailRows.map((r, idx) => (
                  <tr key={r.key} className={`border-b border-slate-100 font-semibold text-slate-700 ${idx % 2 ? 'bg-slate-50/60' : ''}`}>
                    <td className="p-2 font-black text-slate-400">{r.no}</td>
                    <td className="whitespace-nowrap p-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                        r.part === 'ផ្នែកទី៣' ? 'bg-[#0B2A66]/10 text-[#0B2A66]' : 'bg-[#C9A227]/15 text-[#8a6f14]'}`}>
                        {r.part}
                      </span>
                    </td>
                    <td className="whitespace-nowrap p-2">{r.action}</td>
                    <td className="max-w-[140px] truncate p-2" title={r.category}>{r.category}</td>
                    <td className="max-w-[160px] truncate p-2" title={r.name}>{r.name || '—'}</td>
                    <td className="whitespace-nowrap p-2">{r.model || '—'}</td>
                    <td className="whitespace-nowrap p-2 font-mono text-[10px]">{r.serial || '—'}</td>
                    <td className="max-w-[140px] truncate p-2" title={r.customer}>{r.customer || '—'}</td>
                    <td className="whitespace-nowrap p-2">{r.province || '—'}</td>
                    <td className="whitespace-nowrap p-2 font-mono text-[10px]">{r.date || '—'}</td>
                    <td className="whitespace-nowrap p-2 font-mono text-[10px]">{r.label || '—'}</td>
                    <td className="whitespace-nowrap p-2">
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-black ${STATUS_STYLE[r.status]}`}>
                        {STATUS_KH[r.status]}{r.cert ? ` · ${r.cert}` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
