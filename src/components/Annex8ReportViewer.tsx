/**
 * មើលរបាយការណ៍ — one Annex 8, read-only, Part 1 through Part 7.
 *
 * NMC opens this to READ a report before accepting or returning it. Without
 * it the only way to see what was filed was to download the Word, look at it
 * in another application, and come back to the list to decide — which is how
 * reports get accepted without being read. The accept and return buttons are
 * therefore on this screen, at the bottom, after the content.
 *
 * It renders the STORED ROWS in the annex's own order. It is not a second
 * rendering of the official document: that still comes only from
 * Annex8_template_v1.docx, and the download button here fetches exactly that
 * file. Both are driven by the same rows, so what is read here is what prints.
 *
 * A licensee can open it too, for its own submitted reports.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Download, Loader2, Printer, Undo2, X,
} from 'lucide-react';

import { CATEGORIES, EVENTS } from '../annex8/constants';
import { khmerMonthLabel, toKhmerDigits } from '../annex8/summary';
import { apiRequest } from '../supabaseSync';
import { getApiAuthHeaders } from '../apiAuth';

const kh = (v: unknown) => toKhmerDigits(Number(v ?? 0));
const dash = (v: unknown) => (String(v ?? '').trim() === '' ? '—' : String(v));

const VERIFICATION: Record<string, { kh: string; cls: string }> = {
  PASSED:  { kh: 'ជាប់',   cls: 'text-emerald-700' },
  FAILED:  { kh: 'ធ្លាក់',  cls: 'text-red-600' },
  PENDING: { kh: 'រង់ចាំ', cls: 'text-slate-500' },
};

const STATUS: Record<string, { kh: string; cls: string }> = {
  OPEN:      { kh: 'កំពុងបំពេញ',  cls: 'bg-amber-100 text-amber-800' },
  DRAFT:     { kh: 'ព្រាង',       cls: 'bg-amber-100 text-amber-800' },
  SUBMITTED: { kh: 'រង់ចាំពិនិត្យ', cls: 'bg-sky-100 text-sky-800' },
  ACCEPTED:  { kh: 'បានទទួលយក',   cls: 'bg-emerald-100 text-emerald-800' },
  RETURNED:  { kh: 'ត្រឡប់មកវិញ',  cls: 'bg-red-100 text-red-800' },
};

const categoryLabel = (code: string) => (CATEGORIES as any)[code]?.kh || code || '—';

interface Props {
  reportId: string;
  onClose: () => void;
  /** Called after an accept or return, so the list behind can refresh. */
  onReviewed?: () => void;
  toastMsg: (msg: string, type: 'success' | 'error') => void;
}

export default function Annex8ReportViewer({ reportId, onClose, onReviewed, toastMsg }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [returning, setReturning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiRequest<any>(`/api/annex8/reports/${reportId}/full`));
    } catch (err: any) {
      setError(err?.message || 'មិនអាចផ្ទុករបាយការណ៍បានទេ។');
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { void load(); }, [load]);

  // Escape closes, as it does for every other dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && returning === null) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, returning]);

  const downloadWord = async () => {
    setBusy('download');
    try {
      const res = await fetch(`/api/reports/${reportId}/annex8.docx`, { headers: await getApiAuthHeaders() });
      if (!res.ok) {
        let message = `${res.status} ${res.statusText}`;
        try { message = (await res.json())?.error || message; } catch { /* not JSON */ }
        throw new Error(message);
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1]
        || `Annex8_${reportId}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toastMsg(err?.message || 'មិនអាចទាញយកបានទេ', 'error');
    } finally {
      setBusy(null);
    }
  };

  const review = async (action: 'accept' | 'return', comment = '') => {
    setBusy(action);
    try {
      await apiRequest(`/api/annex8/reports/${reportId}/review`, {
        method: 'POST', body: { action, comment },
      });
      toastMsg(action === 'accept' ? 'បានទទួលយករបាយការណ៍' : 'បានត្រឡប់ទៅសហគ្រាស', 'success');
      setReturning(null);
      onReviewed?.();
      await load();
    } catch (err: any) {
      toastMsg(err?.message || 'មិនបានសម្រេច', 'error');
    } finally {
      setBusy(null);
    }
  };

  const report = data?.report;
  const entries = data?.entries;
  const totals = data?.totals?.total || {};
  const rowsByCategory = data?.totals?.rows || {};
  const st = STATUS[report?.status] || { kh: report?.status, cls: 'bg-slate-100 text-slate-700' };

  const produced = (totals.manufactured || 0) + (totals.installed || 0) + (totals.repaired || 0);
  const judged = (totals.passed || 0) + (totals.failed || 0) + (totals.pending || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:p-6">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl">

        {/* Header stays put while the report scrolls under it. */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b border-slate-200 bg-[#0B2A66] px-5 py-3 text-white">
          <div>
            <h3 className="text-sm font-black">របាយការណ៍ប្រចាំខែ ឧបសម្ព័ន្ធទី៨</h3>
            <p className="text-[10px] text-white/70">
              {report ? `${khmerMonthLabel(report.period_month)} · ${report.licence_no}` : 'កំពុងផ្ទុក…'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <button
                onClick={() => void downloadWord()}
                disabled={busy === 'download' || report.status === 'OPEN' || report.status === 'DRAFT'}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-bold hover:bg-white/20 disabled:opacity-40"
                title="ទាញយកឯកសារផ្លូវការពីទម្រង់ Annex8_template_v1.docx"
              >
                {busy === 'download'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Download className="h-3.5 w-3.5 text-[#E6C45A]" />}
                Word
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-bold hover:bg-white/20"
            >
              <Printer className="h-3.5 w-3.5" /> បោះពុម្ព
            </button>
            <button onClick={onClose} className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20" title="បិទ">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="m-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-[12px] font-bold text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
          </div>
        ) : (
          <div className="space-y-5 p-5">

            {/* The NMC block, first, because it is what a reviewer checks. */}
            <div className="grid gap-2 sm:grid-cols-4">
              <Field label="លេខរបាយការណ៍" value={report.report_id || 'មិនទាន់ចេញលេខ'} mono bold />
              <Field label="ស្ថានភាព" value={<span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${st.cls}`}>{st.kh}</span>} />
              <Field label="ដាក់ជូននៅ" value={report.submitted_at ? new Date(report.submitted_at).toLocaleString('en-GB') : '—'} />
              <Field
                label="ទាន់ពេល (ប្រការ២១)"
                value={report.on_time === null || report.on_time === undefined
                  ? '—'
                  : <span className={report.on_time ? 'font-black text-emerald-700' : 'font-black text-red-600'}>
                      {report.on_time ? 'ទាន់ពេល' : 'យឺត'}
                    </span>}
              />
            </div>

            {report.nmc_remarks && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
                <span className="font-extrabold">មតិយោបល់ ម.ម.ជ៖ </span>{report.nmc_remarks}
                {report.reviewer && <span className="ml-1 opacity-70">({report.reviewer})</span>}
              </div>
            )}

            <Part no="១" title="ព័ត៌មានសហគ្រាស និងរយៈពេល" en="Licensee & period">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="ឈ្មោះសហគ្រាស (ខ្មែរ)" value={dash(data.licence.company_name_kh)} />
                <Field label="ឈ្មោះសហគ្រាស (ឡាតាំង)" value={dash(data.licence.company_name)} />
                <Field label="លេខអាជ្ញាបណ្ណ" value={dash(report.licence_no)} mono />
                <Field label="ប្រភេទអាជ្ញាបណ្ណ" value={report.licence_type === 'REPAIR' ? 'ជួសជុល' : 'ផលិត និងដំឡើង'} />
                <Field label="លេខវិញ្ញាបនបត្រចុះបញ្ជី" value={dash(data.profile.registration_no)} />
                <Field label="សុពលភាពដល់" value={dash(data.licence.expiry)} />
                <Field label="អាសយដ្ឋានប្រតិបត្តិការ" value={dash(data.profile.operating_address)} wide />
                <Field label="ខែរបាយការណ៍" value={khmerMonthLabel(report.period_month)} />
                <Field label="ប្រភេទរបាយការណ៍" value={
                  report.report_type === 'NIL' ? 'គ្មានសកម្មភាព'
                    : report.report_type === 'AMENDMENT' ? 'កែតម្រូវ' : 'ធម្មតា'} />
                <Field label="ថ្ងៃផុតកំណត់" value={dash(data.deadline)} />
              </div>
            </Part>

            <Part no="២" title="តារាងសង្ខេប" en="Summary — computed, never typed">
              <Table
                head={['ប្រភេទឧបករណ៍', 'ផលិត', 'ដំឡើង', 'ជួសជុល', 'ជាប់', 'ធ្លាក់', 'រង់ចាំ']}
                rows={Object.entries(rowsByCategory).map(([code, r]: [string, any]) => [
                  categoryLabel(code), kh(r.manufactured), kh(r.installed), kh(r.repaired),
                  kh(r.passed), kh(r.failed), kh(r.pending),
                ])}
                foot={['សរុប', kh(totals.manufactured), kh(totals.installed), kh(totals.repaired),
                  kh(totals.passed), kh(totals.failed), kh(totals.pending)]}
                empty="គ្មានសកម្មភាពក្នុងខែនេះ"
              />
              <p className={`mt-2 text-[11px] font-bold ${produced === judged ? 'text-emerald-700' : 'text-red-600'}`}>
                ផលិត + ដំឡើង + ជួសជុល = {kh(produced)} · ជាប់ + ធ្លាក់ + រង់ចាំ = {kh(judged)}
                {produced === judged ? ' — តុល្យភាព' : ' — មិនស៊ីគ្នា'}
              </p>
            </Part>

            <Part no="៣" title="ឧបករណ៍ផលិត និងដំឡើង" en="Manufactured / installed"
              count={entries.instruments.length}>
              <Table
                head={['ល.រ', 'ប្រភេទការងារ', 'ប្រភេទឧបករណ៍', 'ឈ្មោះឧបករណ៍', 'ម៉ូដែល', 'លេខសៀរៀល',
                  'សហគ្រាសផលិត', 'Max', 'e', 'លេខអនុម័តគំរូ', 'អតិថិជន', 'ខេត្ត/ក្រុង',
                  'ថ្ងៃបញ្ចប់', 'លេខស្លាក/QR', 'លទ្ធផល', 'វិញ្ញាបនបត្រ']}
                rows={entries.instruments.map((x: any) => [
                  kh(x.row_no), x.op_code === 'M' ? 'ផលិត' : 'ដំឡើង', categoryLabel(x.category),
                  dash(x.instrument_name), dash(x.model), dash(x.serial_no), dash(x.manufacturer),
                  dash(x.max_capacity), dash(x.e_value), dash(x.type_approval_no),
                  dash(x.customer_name), dash(x.province), dash(x.completion_date), dash(x.label_qr_no),
                  <span className={VERIFICATION[x.verification_status]?.cls}>
                    {VERIFICATION[x.verification_status]?.kh || x.verification_status}
                  </span>,
                  dash(x.verification_cert_no),
                ])}
                empty="គ្មានឧបករណ៍ផលិត ឬដំឡើងក្នុងខែនេះ"
              />
            </Part>

            <Part no="៣ក" title="ម៉ូឌុល និងគ្រឿងបន្លាស់" en="Modules / spare parts"
              count={entries.modules.length}>
              <Table
                head={['ល.រ', 'ឧបករណ៍មេ (លេខសៀរៀល)', 'ឈ្មោះម៉ូឌុល', 'ម៉ូដែល', 'លេខសៀរៀល',
                  'វិសាលភាព', 'សហគ្រាសផលិត', 'វិញ្ញាបនបត្រ', 'ថ្មី/ប្ដូរ']}
                rows={entries.modules.map((x: any) => [
                  kh(x.row_no), dash(x.host_serial_no), dash(x.module_name), dash(x.model),
                  dash(x.serial_no), dash(x.range_e), dash(x.manufacturer), dash(x.cert_no),
                  x.new_or_replacement === 'REPLACEMENT' ? 'ប្ដូរ' : 'ថ្មី',
                ])}
                empty="គ្មានម៉ូឌុលក្នុងខែនេះ"
              />
            </Part>

            <Part no="៤" title="ការជួសជុល" en="Repairs" count={entries.repairs.length}>
              <Table
                head={['ល.រ', 'ប្រភេទឧបករណ៍', 'ឈ្មោះឧបករណ៍', 'លេខសៀរៀល', 'អតិថិជន', 'ខេត្ត/ក្រុង',
                  'ចាប់ពី', 'ដល់', 'ការងារ', 'ត្រាបាក់', 'លេខជូនដំណឹង', 'ជាង', 'លទ្ធផល']}
                rows={entries.repairs.map((x: any) => [
                  kh(x.row_no), categoryLabel(x.category), dash(x.instrument_name), dash(x.serial_no),
                  dash(x.customer_name), dash(x.province), dash(x.repair_from), dash(x.repair_to),
                  dash(x.repair_description), x.seal_broken ? `មាន (${dash(x.seal_removed_no)})` : 'គ្មាន',
                  dash(x.notification_no), dash(x.technician),
                  <span className={VERIFICATION[x.verification_status]?.cls}>
                    {VERIFICATION[x.verification_status]?.kh || x.verification_status}
                  </span>,
                ])}
                empty="គ្មានការជួសជុលក្នុងខែនេះ"
              />
            </Part>

            <Part no="៥" title="ឧបករណ៍ស្ដង់ដារ" en="Measurement standards"
              count={entries.standards.length}>
              <Table
                head={['ល.រ', 'ឧបករណ៍', 'លេខសៀរៀល', 'ថ្នាក់/វិសាលភាព', 'វិញ្ញាបនបត្រ',
                  'មន្ទីរពិសោធន៍', 'ថ្ងៃក្រិត', 'ផុតកំណត់', 'ស្ថានភាព']}
                rows={entries.standards.map((x: any) => [
                  kh(x.row_no), dash(x.equipment), dash(x.serial_no), dash(x.class_range),
                  dash(x.cal_cert_no), dash(x.lab), dash(x.cal_date), dash(x.due_date),
                  x.status === 'VALID' ? 'មានសុពលភាព' : x.status === 'EXPIRED' ? 'ផុតកំណត់' : 'ឈប់ប្រើ',
                ])}
                empty="គ្មានការផ្លាស់ប្ដូរឧបករណ៍ស្ដង់ដារក្នុងខែនេះ"
              />
            </Part>

            {data.carry_over.length > 0 && (
              <Part no="" title="លទ្ធផលពីខែមុន" en="Carry-over results (Art. 17)"
                count={data.carry_over.length}>
                <Table
                  head={['លេខសៀរៀល', 'ផ្នែកដើម', 'របាយការណ៍ដើម', 'លទ្ធផល', 'វិញ្ញាបនបត្រ', 'ថ្ងៃផ្ទៀងផ្ទាត់']}
                  rows={data.carry_over.map((c: any) => [
                    dash(c.serial_no), c.source_part === 'P4' ? 'ផ្នែកទី៤' : 'ផ្នែកទី៣',
                    dash(c.source_report_id),
                    <span className={VERIFICATION[c.new_status]?.cls}>
                      {VERIFICATION[c.new_status]?.kh || c.new_status}
                    </span>,
                    dash(c.cert_no), dash(c.verification_date),
                  ])}
                  empty=""
                />
              </Part>
            )}

            <Part no="៦" title="ការផ្លាស់ប្ដូរ និងព្រឹត្តិការណ៍" en="Changes and events">
              <div className="space-y-1.5">
                {EVENTS.map((e: any) => {
                  const v = report.events?.[e.key];
                  const yes = v?.yes === true;
                  return (
                    <div key={e.key} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${
                        v?.yes === undefined || v?.yes === null ? 'bg-slate-200 text-slate-500'
                          : yes ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {v?.yes === undefined || v?.yes === null ? '—' : yes ? 'មាន' : 'គ្មាន'}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-slate-700">{e.no} {e.kh}</div>
                        {yes && v?.details && (
                          <div className="mt-0.5 text-[11px] text-slate-600">{v.details}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Part>

            <Part no="៧" title="សេចក្ដីប្រកាស" en="Declaration">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-[11px] font-bold text-slate-700">
                  {report.declaration_accepted
                    ? '☑ សហគ្រាសបានបញ្ជាក់ថាព័ត៌មានទាំងអស់ពិតប្រាកដ និងពេញលេញ។'
                    : '☐ មិនទាន់បានបញ្ជាក់។'}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Field label="អ្នករៀបចំរបាយការណ៍"
                    value={`${dash(data.profile.contact_name)}${data.profile.contact_position ? ` · ${data.profile.contact_position}` : ''}`} />
                  <Field label="ម្ចាស់សហគ្រាស ឬអ្នកតំណាងស្របច្បាប់"
                    value={`${dash(data.profile.legal_rep_name || data.licence.owner_name)}${
                      (data.profile.legal_rep_position || data.licence.owner_position)
                        ? ` · ${data.profile.legal_rep_position || data.licence.owner_position}` : ''}`} />
                </div>
              </div>
            </Part>

            {/* The decision, after the content — so it is made having read it. */}
            {data.is_staff && report.status !== 'OPEN' && report.status !== 'DRAFT' && (
              <div className="sticky bottom-0 -mx-5 -mb-5 rounded-b-2xl border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
                {returning === null ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="mr-auto text-[10px] font-bold text-slate-400">
                      សេចក្ដីសម្រេចរបស់ ម.ម.ជ
                    </span>
                    {report.status !== 'RETURNED' && (
                      <button
                        onClick={() => setReturning('')}
                        className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-[11px] font-black text-amber-800 hover:bg-amber-100"
                      >
                        <Undo2 className="h-3.5 w-3.5" /> ត្រឡប់ឱ្យកែ
                      </button>
                    )}
                    {report.status !== 'ACCEPTED' && (
                      <button
                        onClick={() => void review('accept')}
                        disabled={busy === 'accept'}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[11px] font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busy === 'accept'
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <CheckCircle2 className="h-3.5 w-3.5" />}
                        ទទួលយក
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500">
                      មតិយោបល់សម្រាប់សហគ្រាស (ចាំបាច់) — គេនឹងឃើញអត្ថបទនេះ
                    </label>
                    <textarea
                      autoFocus
                      rows={2}
                      value={returning}
                      onChange={(e) => setReturning(e.target.value)}
                      placeholder="ឧ. លេខវិញ្ញាបនបត្រខ្វះនៅផ្នែកទី៣ ជួរទី២"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[12px] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#353C96]"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setReturning(null)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                      >
                        បោះបង់
                      </button>
                      <button
                        disabled={!returning.trim() || busy === 'return'}
                        onClick={() => void review('return', returning.trim())}
                        className="rounded-lg bg-amber-600 px-4 py-2 text-[11px] font-black text-white hover:bg-amber-700 disabled:opacity-40"
                      >
                        {busy === 'return' ? 'កំពុងដំណើរការ…' : 'ត្រឡប់របាយការណ៍'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function Part(
  { no, title, en, count, children }:
  { no: string; title: string; en: string; count?: number; children: any },
) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2 border-l-4 border-[#C9A227] pl-3">
        <h4 className="text-[13px] font-black text-[#0B1A35]">
          {no ? `ផ្នែកទី${no} · ` : ''}{title}
        </h4>
        <span className="text-[10px] font-bold text-slate-400">{en}</span>
        {count !== undefined && (
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
            {toKhmerDigits(count)}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Field(
  { label, value, mono, bold, wide }:
  { label: string; value: any; mono?: boolean; bold?: boolean; wide?: boolean },
) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 ${wide ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
      <div className="text-[10px] font-bold text-slate-500">{label}</div>
      <div className={`mt-0.5 break-words text-[12px] text-[#0B1A35] ${mono ? 'font-mono' : ''} ${bold === false ? '' : 'font-black'}`}>
        {value}
      </div>
    </div>
  );
}

function Table(
  { head, rows, foot, empty }:
  { head: string[]; rows: any[][]; foot?: any[]; empty: string },
) {
  if (!rows.length) {
    return empty
      ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-4 text-center text-[11px] font-bold text-slate-400">{empty}</p>
      : null;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-[10px]">
        <thead className="bg-[#353C96] text-white">
          <tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-2.5 py-2 text-left font-bold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((cells, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {cells.map((c, j) => (
                <td key={j} className="whitespace-nowrap px-2.5 py-1.5 text-slate-700">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot className="bg-slate-100">
            <tr>{foot.map((c, i) => (
              <td key={i} className="whitespace-nowrap px-2.5 py-2 font-black text-[#0B1A35]">{c}</td>
            ))}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
