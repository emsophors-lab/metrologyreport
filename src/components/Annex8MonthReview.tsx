/**
 * Annex 8 — the month-end check, and submitting.
 *
 * Everything on this page is read from the entries the licensee already made:
 * Part 2 is computed, never typed, and the balance equation
 * (manufactured + installed + repaired = passed + failed + pending) is shown
 * so a mismatch is visible rather than discovered by NMC.
 *
 * The submit button is disabled while anything blocking remains, but the
 * server re-runs the same rules when the button is pressed: this screen is a
 * convenience, not the gate.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CheckCircle2, FileText, Loader2, Send, ShieldCheck,
} from 'lucide-react';

import { CATEGORIES, EVENTS } from '../annex8/constants';
import { khmerMonthLabel, toKhmerDigits } from '../annex8/summary';
import { downloadAnnex8Docx } from '../lib/annex8/annex8Docx';
import { mapRecordToAnnex8 } from '../lib/annex8/mapReportToAnnex8';
import { apiRequest } from '../supabaseSync';
import { captureSubmissionLocation } from '../annex8/submissionLocation';

const kh = (n: number | string) => toKhmerDigits(String(n));

interface Issue {
  severity: string;
  code: string;
  step: number;
  message: string;
  path: string;
}

interface Props {
  reportUuid: string;
  /** Jump to the entry an issue points at. */
  onFixIssue: (issue: Issue) => void;
  onSubmitted: () => void;
  toastMsg: (message: string, type: 'success' | 'error') => void;
}

export default function Annex8MonthReview({ reportUuid, onFixIssue, onSubmitted, toastMsg }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'' | 'saving' | 'submitting' | 'draft'>('');
  const [error, setError] = useState<{ kh: string; detail: string } | null>(null);
  const [shareSubmissionLocation, setShareSubmissionLocation] = useState(false);
  const [notificationWarning, setNotificationWarning] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiRequest<any>(`/api/annex8/month/review?report_uuid=${encodeURIComponent(reportUuid)}`));
    } catch (err: any) {
      setError({ kh: 'មិនអាចបើកទំព័រពិនិត្យបានទេ', detail: err?.message || String(err) });
    } finally {
      setLoading(false);
    }
  }, [reportUuid]);

  useEffect(() => { void load(); }, [load]);

  const patchMeta = async (patch: Record<string, any>) => {
    setBusy('saving');
    try {
      await apiRequest('/api/annex8/month/meta', { method: 'PUT', body: { report_uuid: reportUuid, ...patch } });
      await load();
    } catch (err: any) {
      const message = String(err?.message || err);
      // The NIL refusal carries its own Khmer explanation; show that, not a generic failure.
      toastMsg(message.includes('NIL_WITH_ENTRIES')
        ? 'ខែនេះមានធាតុរួចហើយ។ សូមលុបធាតុមុន ទើបអាចជ្រើស «គ្មានសកម្មភាព»។'
        : `មិនអាចរក្សាទុកបានទេ / ${message}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const downloadDraft = async () => {
    setBusy('draft');
    try {
      const report = data.report;
      const entries = await apiRequest<any>(
        `/api/annex8/month?licence_no=${encodeURIComponent(report.licence_no)}&period=${report.period_month}&create=0`,
      );
      const { payload, extra } = mapRecordToAnnex8(report, {
        instruments: entries.entries?.instruments || [],
        modules: entries.entries?.modules || [],
        repairs: entries.entries?.repairs || [],
        standards: entries.entries?.standards || [],
        carryOver: [],
      }, null);

      // A draft has no receipt number, and the file name must say so: nobody
      // should be able to mistake a preview for the submitted annex.
      const name = `Annex8_${report.licence_no}_${report.period_month}_DRAFT.docx`
        .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+\./, '.');
      await downloadAnnex8Docx(payload, { ...extra, report_id: '' }, { fileName: name });
      toastMsg('បានទាញយកសេចក្ដីព្រាង', 'success');
    } catch (err: any) {
      toastMsg(`មិនអាចបង្កើតសេចក្ដីព្រាងបានទេ / ${err?.kh || err?.message || err}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const submit = async () => {
    if (busy) return;
    if (!window.confirm(
      'ដាក់ជូនរបាយការណ៍ទៅ ម.ម.ជ?\n\nបន្ទាប់ពីដាក់ជូន របាយការណ៍នឹងចាក់សោ។ ការកែប្រែត្រូវធ្វើតាមការស្នើកែតម្រូវ។',
    )) return;

    setBusy('submitting');
    try {
      const submissionLocation = await captureSubmissionLocation(shareSubmissionLocation);
      const result = await apiRequest<any>('/api/annex8/month/submit', {
        method: 'POST', body: { report_uuid: reportUuid, submission_location: submissionLocation },
      });
      const notices = [];
      if (result.telegram_notification?.status !== 'sent') notices.push(
        'របាយការណ៍បានដាក់ជូនរួច ប៉ុន្តែសារ Telegram មិនទាន់បានផ្ញើ។ សូមទាក់ទងអ្នកគ្រប់គ្រង។ / Report submitted, but Telegram delivery was not confirmed. Contact the administrator.');
      if (shareSubmissionLocation && result.submission_location_status !== 'captured') notices.push(
        'មិនអាចចាប់ទីតាំងបានទេ ប៉ុន្តែរបាយការណ៍បានរក្សាទុករួច។ / Device location was unavailable; your report was saved.');
      setNotificationWarning(notices.join(' '));
      setShareSubmissionLocation(false);
      toastMsg(`បានដាក់ជូន · ${result.report_id}${result.on_time ? ' · ទាន់ពេល' : ' · យឺត'}${result.telegram_notification?.status === 'sent' ? ' · Telegram បានផ្ញើ' : ' · Telegram មិនទាន់ផ្ញើ'}`, 'success');
      onSubmitted();
      await load();
    } catch (err: any) {
      const message = String(err?.message || err);
      if (message.includes('BLOCKING_ISSUES')) {
        toastMsg('នៅមានបញ្ហាត្រូវដោះស្រាយ', 'error');
        await load();
      } else if (message.includes('DECLARATION_REQUIRED')) {
        toastMsg('សូមធីកការប្រកាសក្នុងផ្នែក៧ មុនដាក់ជូន', 'error');
      } else if (message.includes('EMPTY_REPORT')) {
        toastMsg('ខែនេះគ្មានធាតុ។ សូមជ្រើស «គ្មានសកម្មភាពក្នុងខែនេះ» បើត្រឹមត្រូវ', 'error');
      } else {
        toastMsg(`មិនអាចដាក់ជូនបានទេ / ${message}`, 'error');
      }
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-slate-400"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] font-bold text-red-800">
        {error.kh}
        <span className="mt-1 block break-all font-mono text-[10px] font-semibold text-red-600">{error.detail}</span>
      </div>
    );
  }
  if (!data?.report) return null;

  const { report, summary, blocking = [], warnings = [], editable, can_submit } = data;
  const total = summary?.total || {};
  const activity = (total.manufactured || 0) + (total.installed || 0) + (total.repaired || 0);
  const results = (total.passed || 0) + (total.failed || 0) + (total.pending || 0);
  const balanced = activity === results;
  const isNil = report.report_type === 'NIL';
  const submitted = !editable;

  return (
    <div className="space-y-4">

      {notificationWarning && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">{notificationWarning}</div>}

      {/* Submitted receipt */}
      {submitted && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-bold text-emerald-800">
            <CheckCircle2 className="h-5 w-5" />
            <span>
              បានដាក់ជូន · លេខ <b>{report.report_id}</b>
              {report.submitted_at && <> · {new Date(report.submitted_at).toLocaleString('en-CA')}</>}
              {report.on_time === false && <span className="text-red-600"> · យឺត (ប្រការ២១)</span>}
              {report.on_time === true && ' · ទាន់ពេល'}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-semibold text-emerald-700">
            របាយការណ៍ចាក់សោហើយ · This report is locked. Changes go through an amendment.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`/api/reports/${report.id}/annex8.docx`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1A35] px-3 py-2 text-[11px] font-black text-white hover:bg-[#15284d]">
              <FileText className="h-4 w-4" /> ទាញយក Word សម្រាប់បោះពុម្ព (ឧបសម្ព័ន្ធទី៨)
            </a>
          </div>
        </div>
      )}

      {/* Part 2 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="text-[13px] font-black text-[#0B1A35]">
          ផ្នែក២ · សេចក្ដីសង្ខេប
          <span className="ml-1 font-bold text-slate-400">Part 2 — computed from your entries</span>
        </h4>

        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[
            { v: total.manufactured || 0, l: 'ផលិត', c: 'text-sky-700' },
            { v: total.installed || 0, l: 'ដំឡើង', c: 'text-indigo-700' },
            { v: total.repaired || 0, l: 'ជួសជុល', c: 'text-amber-700' },
            { v: total.passed || 0, l: 'ជាប់', c: 'text-emerald-700' },
            { v: total.failed || 0, l: 'ធ្លាក់', c: 'text-red-700' },
            { v: total.pending || 0, l: 'រង់ចាំ', c: 'text-slate-600' },
          ].map((card) => (
            <div key={card.l} className="rounded-xl border border-slate-200 bg-slate-50/60 px-2 py-2 text-center">
              <div className={`text-[17px] font-black ${card.c}`}>{kh(card.v)}</div>
              <div className="text-[10px] font-bold text-slate-500">{card.l}</div>
            </div>
          ))}
        </div>

        <div className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-bold ${
          balanced ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {balanced ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          ផលិត + ដំឡើង + ជួសជុល = ជាប់ + ធ្លាក់ + រង់ចាំ &nbsp;
          <span className="font-mono">{kh(activity)} = {kh(results)}</span>
          {!balanced && <span className="ml-1">— មិនស្មើគ្នា (V01)</span>}
        </div>
      </div>

      {/* Blocking issues */}
      {editable && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-[13px] font-black text-[#0B1A35]">
            បញ្ហាត្រូវដោះស្រាយ
            <span className="ml-1 font-bold text-slate-400">Before you can submit</span>
          </h4>

          {!blocking.length ? (
            <p className="mt-2 flex items-center gap-2 text-[12px] font-bold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> គ្មានបញ្ហា · Nothing blocking.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {blocking.map((issue: Issue, i: number) => (
                <li key={`${issue.code}-${i}`}
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-[10px] text-red-500">{issue.code}</span> {issue.message}
                  </span>
                  {issue.path && (
                    <button type="button" onClick={() => onFixIssue(issue)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[10px] font-black text-white hover:bg-red-700">
                      ទៅកែ <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!!warnings.length && (
            <ul className="mt-2 space-y-1">
              {warnings.map((issue: Issue, i: number) => (
                <li key={`${issue.code}-w-${i}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-bold text-amber-800">
                  <span className="font-mono text-amber-600">{issue.code}</span> {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Part 6 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="text-[13px] font-black text-[#0B1A35]">
          ផ្នែក៦ · ព្រឹត្តិការណ៍ក្នុងខែ
          <span className="ml-1 font-bold text-slate-400">Part 6 — events</span>
        </h4>
        <div className="mt-2 space-y-2">
          {EVENTS.map((event: any) => {
            const current = report.events?.[event.key] || {};
            return (
              <div key={event.key} className="rounded-lg border border-slate-200 p-2.5">
                <p className="text-[11px] font-bold text-slate-700">
                  <span className="text-slate-400">{event.no}</span> {event.kh}
                </p>
                <p className="text-[10px] text-slate-400">{event.en}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  {[{ v: true, l: 'បាទ/ចាស' }, { v: false, l: 'ទេ' }].map((opt) => (
                    <button key={String(opt.v)} type="button" disabled={!editable || busy === 'saving'}
                      onClick={() => patchMeta({
                        events: { ...report.events, [event.key]: { ...current, yes: opt.v } },
                      })}
                      className={`rounded-lg border px-3 py-1 text-[11px] font-black transition-colors disabled:opacity-50 ${
                        current.yes === opt.v
                          ? 'border-[#0B1A35] bg-[#0B1A35] text-white'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}>
                      {opt.l}
                    </button>
                  ))}
                  {current.yes === true && (
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#C9A227]"
                      placeholder="សូមបញ្ជាក់ / details"
                      defaultValue={current.details || ''}
                      disabled={!editable}
                      onBlur={(e) => patchMeta({
                        events: { ...report.events, [event.key]: { ...current, yes: true, details: e.target.value } },
                      })}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* NIL, declaration, submit */}
      {editable && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="flex items-start gap-2 text-[12px] font-bold text-slate-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={isNil} disabled={busy === 'saving'}
              onChange={(e) => patchMeta({ report_type: e.target.checked ? 'NIL' : 'REGULAR' })} />
            <span>
              គ្មានសកម្មភាពក្នុងខែនេះ
              <span className="block text-[10px] font-semibold text-slate-400">
                No manufacture, installation or repair this month.
              </span>
            </span>
          </label>

          <label className="mt-3 flex items-start gap-2 border-t border-slate-100 pt-3 text-[12px] font-bold text-slate-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={!!report.declaration_accepted}
              disabled={busy === 'saving'}
              onChange={(e) => patchMeta({ declaration_accepted: e.target.checked })} />
            <span>
              ខ្ញុំសូមបញ្ជាក់ថា ព័ត៌មានក្នុងរបាយការណ៍នេះ ពិតប្រាកដ ពេញលេញ
              និងស្របនឹងកំណត់ត្រាដែលរក្សាទុកនៅសហគ្រាស។ (ផ្នែក៧)
              <span className="block text-[10px] font-semibold text-slate-400">
                Art. 22 and 26 — a false or incomplete report may carry administrative measures.
              </span>
            </span>
          </label>

          <label className="mt-3 flex items-start gap-2 border-t border-slate-100 pt-3 text-xs text-slate-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={shareSubmissionLocation}
              disabled={!!busy} onChange={e => setShareSubmissionLocation(e.target.checked)} />
            <span>ខ្ញុំអនុញ្ញាតឱ្យកត់ត្រា និងផ្ញើទីតាំងឧបករណ៍ពេលដាក់ជូន ទៅក្រុម Telegram របស់ ម.ម.ជ។
              <span className="mt-1 block text-[11px] text-slate-500">I consent to recording this device’s submission location and sharing it with the NMC Telegram group. Optional; this does not change the company’s registered location.</span>
            </span>
          </label>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={() => void downloadDraft()} disabled={busy === 'draft'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[11px] font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              {busy === 'draft' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              មើលមុន Word (សេចក្ដីព្រាង)
            </button>
            <button type="button" onClick={() => void submit()}
              disabled={!can_submit || !report.declaration_accepted || busy === 'submitting'}
              title={!can_submit ? 'នៅមានបញ្ហាត្រូវដោះស្រាយ' : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9A227] px-4 py-2 text-[11px] font-black text-[#0B1A35] hover:bg-[#E6C45A] disabled:cursor-not-allowed disabled:opacity-50">
              {busy === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              ដាក់ជូន ម.ម.ជ
            </button>
          </div>
        </div>
      )}

      {/* Per-category detail */}
      {!!summary?.rows && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <th className="p-3">ប្រភេទឧបករណ៍</th>
                <th className="p-3 text-center">ផលិត</th>
                <th className="p-3 text-center">ដំឡើង</th>
                <th className="p-3 text-center">ជួសជុល</th>
                <th className="p-3 text-center">ជាប់</th>
                <th className="p-3 text-center">ធ្លាក់</th>
                <th className="p-3 text-center">រង់ចាំ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(summary.rows).map(([code, row]: [string, any]) => {
                const label = (CATEGORIES as any)[code];
                const empty = !row.manufactured && !row.installed && !row.repaired;
                if (empty) return null;
                return (
                  <tr key={code}>
                    <td className="p-3 font-bold text-slate-800">{label?.kh || code}</td>
                    <td className="p-3 text-center">{kh(row.manufactured)}</td>
                    <td className="p-3 text-center">{kh(row.installed)}</td>
                    <td className="p-3 text-center">{kh(row.repaired)}</td>
                    <td className="p-3 text-center text-emerald-700">{kh(row.passed)}</td>
                    <td className="p-3 text-center text-red-700">{kh(row.failed)}</td>
                    <td className="p-3 text-center text-slate-500">{kh(row.pending)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
