/**
 * Annex 8 (A8-2026.2) monthly report — 7-step wizard.
 *
 * Behaviour ported from the reference implementation
 * `mlrs_annex8_report_form.html`, which is the functional specification:
 * step order, field set, validation, Part 2 computation, carry-over and the
 * submitted payload. Rendering uses this app's own components and styling.
 *
 * This form runs alongside the legacy monthly report form; neither replaces
 * the other until the new one is signed off.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, FileSpreadsheet,
  FileText, Loader2, LocateFixed, Plus, Printer, Save, Send, Trash2,
} from 'lucide-react';
import { EnterpriseLicense, MetrologyUser } from '../types';
import {
  CATEGORIES, CATEGORY_CODES, COUNTRIES, EVENTS, FORMAT_VERSION,
  InstrumentCategory, MODULE_ORIGIN_LABELS, OP_CODE_LABELS, PROVINCES,
  UNITS, VERIFICATION_LABELS, VerificationStatus,
} from '../annex8/constants';
import {
  Annex8CarryOverItem, Annex8Instrument, Annex8Issue, Annex8Licensee,
  Annex8Module, Annex8Repair, Annex8Standard, Annex8State,
} from '../annex8/types';
import { computeSummary, deadlineFor, isOnTime, khmerMonthLabel, previousMonth } from '../annex8/summary';
import { blockingIssues, hostOptions, hostPart, STEP_INDEX, validateAnnex8 } from '../annex8/validation';
import { exportAnnex8Excel, exportAnnex8Word, printAnnex8 } from '../annex8/exports';
import { getApiAuthHeaders } from '../apiAuth';

interface Annex8ReportFormProps {
  currentUser: MetrologyUser;
  licence?: EnterpriseLicense | null;
  toastMsg: (msg: string, type: 'success' | 'error') => void;
  language?: 'km' | 'en';
}

const uid = () => Math.random().toString(36).slice(2, 9);

const newInstrument = (): Annex8Instrument => ({
  _id: uid(), op_code: 'I', category: '', category_other: '', instrument_name: '',
  model: '', serial_no: '', manufacturer: '', country: '', max: '', min: '', e: '',
  unit: 'kg', accuracy_class: '', type_approval_no: '', completion_date: '',
  customer_name: '', province: '', address: '', lat: '', long: '', label_qr_no: '',
  verification_status: 'PENDING', verification_cert_no: '', verification_date: '',
});

const newModule = (): Annex8Module => ({
  _id: uid(), host_serial_no: '', module_name: '', model: '', serial_no: '',
  range_e: '', manufacturer: '', country: '', cert_no: '', new_or_replacement: 'NEW',
});

const newRepair = (): Annex8Repair => ({
  _id: uid(), category: '', instrument_name: '', model: '', serial_no: '',
  customer_name: '', province: '', address: '', lat: '', long: '',
  repair_from: '', repair_to: '', repair_description: '', seal_broken: false,
  seal_removed_no: '', notification_no: '', technician: '',
  verification_status: 'PENDING', verification_cert_no: '', verification_date: '',
});

const newStandard = (): Annex8Standard => ({
  _id: uid(), equipment: '', serial_no: '', class_range: '', cal_cert_no: '',
  lab: '', cal_date: '', due_date: '', status: 'VALID',
});

/**
 * Build the Part 1 pre-fill from whatever the licence record holds today.
 *
 * Licence scope categories, registered technicians and registered standards do
 * not exist in the schema yet (see docs/annex8-migration-plan.md §2.7). Until
 * they do, scope is left empty — which makes V06 stand down rather than block
 * every row — and technician/standard become free text.
 */
function deriveLicensee(user: MetrologyUser, licence?: EnterpriseLicense | null): Annex8Licensee {
  return {
    licence_no: licence?.license_number || user.license_number || '',
    licence_type: 'MANUF_INSTALL',
    licence_valid_to: licence?.license_expiry_date || '',
    decision_no: '',
    decision_date: '',
    enterprise_name_kh: licence?.company_name_kh || user.company_name_kh || '',
    enterprise_name_en: licence?.company_name || user.company_name_en || '',
    registration_no: '',
    operating_address: licence?.company_address || user.address || '',
    scope: [],
    staff: [],
    standards: [],
  };
}

function blankState(licensee: Annex8Licensee): Annex8State {
  return {
    format_version: FORMAT_VERSION,
    meta: {
      report_id: null,
      licence_no: licensee.licence_no,
      licence_type: licensee.licence_type,
      enterprise_name_kh: licensee.enterprise_name_kh,
      enterprise_name_en: licensee.enterprise_name_en,
      registration_no: licensee.registration_no,
      licence_valid_to: licensee.licence_valid_to,
      operating_address: licensee.operating_address,
      period_month: previousMonth(),
      report_type: 'REGULAR',
      original_report_id: '',
      contact: { name: '', position: '', phone: '', email: '' },
    },
    instruments: [], modules: [], repairs: [], standards: [], carry_over: [],
    events: Object.fromEntries(EVENTS.map((e) => [e.key, { yes: null, details: '' }])) as Annex8State['events'],
    declaration: false,
    submitted_at: null,
  };
}

/* ------------------------------------------------------------------ *
 * Small field primitives — match the app's existing input styling
 * ------------------------------------------------------------------ */

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 ' +
  'focus:border-[#0B2A66] focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/15';

function Field({
  kh, en, value, onChange, type = 'text', required, options, placeholder, hint, invalid, disabled,
}: {
  kh: string; en: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; options?: Array<[string, string]>;
  placeholder?: string; hint?: string; invalid?: boolean; disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-bold leading-snug text-slate-600">
        {kh} {required && <span className="text-red-500">*</span>}
        <span className="block text-[10px] font-semibold text-slate-400">{en}</span>
      </span>
      {options ? (
        <select
          className={`${inputCls} ${invalid ? 'border-red-400' : ''}`}
          value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— សូមជ្រើស / Select —</option>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          className={`${inputCls} min-h-[72px] ${invalid ? 'border-red-400' : ''}`}
          value={value} placeholder={placeholder} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={type} className={`${inputCls} ${invalid ? 'border-red-400' : ''}`}
          value={value} placeholder={placeholder} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint && <span className="mt-1 block text-[10px] font-semibold text-slate-400">{hint}</span>}
    </label>
  );
}

// `key` is declared explicitly: this project has no @types/react, so React's
// reserved props are not stripped from a custom component's prop check.
function RowCard({
  title, onRemove, children,
}: { title: string; onRemove: () => void; children: React.ReactNode; key?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-xs font-black text-[#0B2A66]">{title}</h4>
        <button
          type="button" onClick={onRemove}
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> លុប
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg bg-[#0B2A66] px-4 py-2 text-xs font-black text-white hover:bg-[#09204f]"
    >
      <Plus className="h-4 w-4" /> {label}
    </button>
  );
}

const EmptyHint = ({ text }: { text: string }) => (
  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs font-semibold text-slate-400">
    {text}
  </div>
);

/* ------------------------------------------------------------------ */

export default function Annex8ReportForm({
  currentUser, licence, toastMsg,
}: Annex8ReportFormProps) {
  const fallbackLicensee = useMemo(() => deriveLicensee(currentUser, licence), [currentUser, licence]);
  const [licensee, setLicensee] = useState<Annex8Licensee>(fallbackLicensee);
  const draftKey = `mlrs_a8_draft_${fallbackLicensee.licence_no || currentUser.id}`;

  const [state, setState] = useState<Annex8State>(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.format_version === FORMAT_VERSION) return parsed as Annex8State;
      }
    } catch { /* fall through to a blank report */ }
    return blankState(fallbackLicensee);
  });
  const [step, setStep] = useState(0);
  const [showJson, setShowJson] = useState(false);
  const [busy, setBusy] = useState<'' | 'saving' | 'submitting' | 'word' | 'excel'>('');
  const [receipt, setReceipt] = useState<{ report_id: string; submitted_at: string; on_time: boolean } | null>(null);

  /* Pull the real licence record, server draft and carry-over items. All three
     degrade quietly: if the API is unavailable the form still works offline
     from the local draft. */
  useEffect(() => {
    let cancelled = false;
    const licenceNo = fallbackLicensee.licence_no;
    if (!licenceNo) return;

    (async () => {
      try {
        const headers = await getApiAuthHeaders();
        const qs = `licence_no=${encodeURIComponent(licenceNo)}`;

        const licRes = await fetch(`/api/annex8/licence?${qs}`, { headers });
        if (licRes.ok && !cancelled) {
          const data = await licRes.json().catch(() => null);
          if (data?.licence) {
            setLicensee((prev) => ({ ...prev, ...data.licence }));
            setState((prev) => ({
              ...prev,
              meta: {
                ...prev.meta,
                licence_type: data.licence.licence_type || prev.meta.licence_type,
                registration_no: prev.meta.registration_no || data.licence.registration_no || '',
                licence_valid_to: prev.meta.licence_valid_to || data.licence.licence_valid_to || '',
                operating_address: prev.meta.operating_address || data.licence.operating_address || '',
                contact: {
                  name: prev.meta.contact.name || data.licence.contact?.name || '',
                  position: prev.meta.contact.position || data.licence.contact?.position || '',
                  phone: prev.meta.contact.phone || data.licence.contact?.phone || '',
                  email: prev.meta.contact.email || data.licence.contact?.email || '',
                },
              },
            }));
          }
        }

        const pendRes = await fetch(`/api/annex8/pending?${qs}&before=${encodeURIComponent(state.meta.period_month)}`, { headers });
        if (pendRes.ok && !cancelled) {
          const data = await pendRes.json().catch(() => null);
          if (Array.isArray(data?.items) && data.items.length) {
            setState((prev) => (prev.carry_over.length ? prev : { ...prev, carry_over: data.items }));
          }
        }
      } catch {
        // Offline or API not reachable — the local draft remains usable.
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackLicensee.licence_no]);

  const isNil = state.meta.report_type === 'NIL';
  const isRepairOnly = state.meta.licence_type === 'REPAIR';

  const issues = useMemo(
    () => validateAnnex8(state, { licence: { scope: licensee.scope, licence_valid_to: licensee.licence_valid_to, staff: licensee.staff } }),
    [state, licensee],
  );
  const blocking = useMemo(() => blockingIssues(issues), [issues]);
  const summary = useMemo(() => computeSummary(state), [state]);

  const steps = useMemo(() => {
    const all = [
      { k: 'p1', idx: STEP_INDEX.PART1, no: '១', kh: 'ព័ត៌មាន និងរយៈពេល', en: 'Part 1 · Licensee & period' },
      { k: 'p3', idx: STEP_INDEX.PART3, no: '៣', kh: 'ផលិត ឬដំឡើង', en: 'Part 3 · Manufactured / installed' },
      { k: 'p3a', idx: STEP_INDEX.PART3A, no: '៣ក', kh: 'ម៉ូឌុល និងគ្រឿងបន្លាស់', en: 'Part 3A · Modules / spare parts' },
      { k: 'p4', idx: STEP_INDEX.PART4, no: '៤', kh: 'ការជួសជុល', en: 'Part 4 · Repairs' },
      { k: 'p5', idx: STEP_INDEX.PART5, no: '៥', kh: 'ឧបករណ៍ស្ដង់ដារ', en: 'Part 5 · Standards' },
      { k: 'p6', idx: STEP_INDEX.PART6, no: '៦', kh: 'ការផ្លាស់ប្ដូរ និងព្រឹត្តិការណ៍', en: 'Part 6 · Changes & events' },
      { k: 'p7', idx: STEP_INDEX.REVIEW, no: '២·៧', kh: 'ពិនិត្យ និងដាក់ជូន', en: 'Parts 2 & 7 · Review & submit' },
    ];
    return all.filter((s) => {
      if (isNil && ['p3', 'p3a', 'p4', 'p5'].includes(s.k)) return false;   // V05
      if (isRepairOnly && s.k === 'p3') return false;                        // REPAIR licences
      return true;
    });
  }, [isNil, isRepairOnly]);

  // Keep the cursor inside the visible steps when the step set shrinks.
  useEffect(() => {
    if (step >= steps.length) setStep(Math.max(0, steps.length - 1));
  }, [step, steps.length]);

  const patch = useCallback((fn: (draft: Annex8State) => void) => {
    setState((prev) => {
      const next: Annex8State = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });
  }, []);

  /** Draft goes to the server so it can be continued on another device, with
      localStorage as the offline fallback. */
  const saveDraft = async () => {
    setBusy('saving');
    try { localStorage.setItem(draftKey, JSON.stringify(state)); } catch { /* quota or private mode */ }
    try {
      const headers = await getApiAuthHeaders();
      const res = await fetch('/api/annex8/draft', {
        method: 'PUT', headers,
        body: JSON.stringify({ payload: state, updated_by: currentUser.id }),
      });
      toastMsg(res.ok
        ? 'បានរក្សាទុកសេចក្ដីព្រាងលើម៉ាស៊ីនមេ / Draft saved to server'
        : 'បានរក្សាទុកក្នុងឧបករណ៍នេះប៉ុណ្ណោះ / Saved on this device only', res.ok ? 'success' : 'error');
    } catch {
      toastMsg('បានរក្សាទុកក្នុងឧបករណ៍នេះប៉ុណ្ណោះ / Saved on this device only', 'error');
    } finally {
      setBusy('');
    }
  };

  /** Submit. The server re-validates, recomputes Part 2 and issues the number. */
  const submitReport = async () => {
    setBusy('submitting');
    try {
      const headers = await getApiAuthHeaders();
      const res = await fetch('/api/annex8/reports', {
        method: 'POST', headers,
        body: JSON.stringify({ report: state, user_id: currentUser.id }),
      });
      const data = await res.json().catch(() => null);

      if (res.status === 422 && Array.isArray(data?.issues)) {
        toastMsg(`ម៉ាស៊ីនមេបដិសេធ៖ ${data.issues[0]?.message || data.issues.length + ' issue(s)'}`, 'error');
        return;
      }
      if (!res.ok) {
        toastMsg(data?.message || 'មិនអាចដាក់ជូនរបាយការណ៍បានទេ / Submission failed', 'error');
        return;
      }

      setReceipt({ report_id: data.report_id, submitted_at: data.submitted_at, on_time: !!data.on_time });
      setState((prev) => ({ ...prev, submitted_at: data.submitted_at, meta: { ...prev.meta, report_id: data.report_id } }));
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      toastMsg(`បានដាក់ជូនរបាយការណ៍ ${data.report_id}`, 'success');
    } catch {
      toastMsg('មិនអាចតភ្ជាប់ម៉ាស៊ីនមេបានទេ / Cannot reach the server', 'error');
    } finally {
      setBusy('');
    }
  };

  const doExport = async (kind: 'word' | 'excel') => {
    setBusy(kind);
    try {
      if (kind === 'word') await exportAnnex8Word(state);
      else await exportAnnex8Excel(state);
      toastMsg(kind === 'word' ? 'បានទាញយកឯកសារ Word' : 'បានទាញយកឯកសារ Excel', 'success');
    } catch {
      toastMsg('មិនអាចបង្កើតឯកសារបានទេ / Export failed', 'error');
    } finally {
      setBusy('');
    }
  };

  const captureGps = (apply: (lat: string, lng: string) => void) => {
    if (!navigator.geolocation) {
      toastMsg('ឧបករណ៍នេះមិនស្គាល់ទីតាំង GPS ទេ', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        apply(coords.latitude.toFixed(6), coords.longitude.toFixed(6));
        toastMsg('បានចាប់យកទីតាំង GPS', 'success');
      },
      () => toastMsg('មិនអាចចាប់យកទីតាំងបានទេ', 'error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const current = steps[step];
  const stepHasBlocker = (idx: number) => blocking.some((b) => b.step === idx);
  const categoryOptions: Array<[string, string]> = CATEGORY_CODES.map((c) => [
    c, `${CATEGORIES[c].kh}${CATEGORIES[c].oiml ? ` (OIML ${CATEGORIES[c].oiml})` : ''}`,
  ]);
  const provinceOptions: Array<[string, string]> = PROVINCES.map((p) => [p, p]);
  const countryOptions: Array<[string, string]> = COUNTRIES.map((c) => [c, c]);
  const verificationOptions: Array<[string, string]> = (Object.keys(VERIFICATION_LABELS) as VerificationStatus[])
    .map((k) => [k, `${VERIFICATION_LABELS[k].kh} | ${VERIFICATION_LABELS[k].en}`]);

  return (
    <div className="space-y-4">
      {/* Header — navy/gold official chrome */}
      <div className="overflow-hidden rounded-2xl border border-[#0B1A35]/15 bg-white shadow-sm">
        <div className="relative bg-gradient-to-br from-[#0B1A35] via-[#122244] to-[#16294F] px-4 py-4 sm:px-6 sm:py-5">
          <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#C9A227] via-[#E6C45A] to-[#C9A227]" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-white sm:text-2xl">
                  របាយការណ៍ប្រចាំខែ
                </h2>
                <span className="rounded-full border border-[#C9A227]/50 bg-[#C9A227]/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#E6C45A]">
                  ឧបសម្ព័ន្ធទី៨ · {FORMAT_VERSION}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-300 sm:text-xs">
                Monthly Report on Manufacture, Installation and Repair of Measuring Instruments
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-slate-300">
                <span>អាជ្ញាប័ណ្ណ: <span className="text-white">{state.meta.licence_no || '—'}</span></span>
                <span>ខែ: <span className="text-white">{khmerMonthLabel(state.meta.period_month)}</span></span>
                <span className={`rounded-full px-2 py-0.5 ${
                  receipt ? 'bg-emerald-500/20 text-emerald-300'
                    : blocking.length ? 'bg-red-500/20 text-red-300' : 'bg-[#C9A227]/20 text-[#E6C45A]'}`}>
                  {receipt ? `បានដាក់ជូន · ${receipt.report_id}`
                    : blocking.length ? `${blocking.length} បញ្ហាត្រូវដោះស្រាយ` : 'ត្រៀមដាក់ជូន'}
                </span>
              </div>
            </div>

            {/* Document actions */}
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => printAnnex8(state)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-[11px] font-black text-white backdrop-blur hover:bg-white/20">
                <Printer className="h-4 w-4" /> Print / PDF
              </button>
              <button type="button" onClick={() => doExport('word')} disabled={busy === 'word'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-[11px] font-black text-white backdrop-blur hover:bg-white/20 disabled:opacity-50">
                {busy === 'word' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Word
              </button>
              <button type="button" onClick={() => doExport('excel')} disabled={busy === 'excel'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-[11px] font-black text-white backdrop-blur hover:bg-white/20 disabled:opacity-50">
                {busy === 'excel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel
              </button>
              <button type="button" onClick={saveDraft} disabled={busy === 'saving'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9A227] px-3 py-2 text-[11px] font-black text-[#0B1A35] hover:bg-[#E6C45A] disabled:opacity-50">
                {busy === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} រក្សាទុក
              </button>
              <button type="button" onClick={() => setShowJson((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-2.5 py-2 text-[11px] font-black text-white/80 hover:bg-white/10">
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Completion progress */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-gradient-to-r from-[#C9A227] to-[#E6C45A] transition-all duration-500"
              style={{ width: `${Math.round(((step + 1) / Math.max(1, steps.length)) * 100)}%` }} />
          </div>
        </div>

        <div className="p-4 sm:px-6">
          {receipt && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-bold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                បានដាក់ជូនជោគជ័យ · លេខ <b>{receipt.report_id}</b> · {new Date(receipt.submitted_at).toLocaleString('en-CA')}
                {receipt.on_time ? ' · ទាន់ពេល' : ' · យឺត (ប្រការ២១)'}
              </span>
            </div>
          )}

        {/* Licence pre-fill gaps — honest about what is not wired yet */}
        {(!licensee.scope.length || !licensee.staff.length) && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              វិសាលភាពអាជ្ញាប័ណ្ណ បញ្ជីបុគ្គលិកបច្ចេកទេស និងឧបករណ៍ស្ដង់ដារ មិនទាន់មានក្នុងមូលដ្ឋានទិន្នន័យនៅឡើយ។
              <span className="block text-amber-700">
                Licence scope, technicians and standards are not stored yet, so V06 scope checking and the
                technician/standard dropdowns fall back to free text.
              </span>
            </span>
          </div>
        )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        {/* Step rail */}
        <nav className="h-fit rounded-2xl border border-[#0B1A35]/20 bg-gradient-to-b from-[#0B1A35] to-[#16294F] p-2.5 text-white shadow-sm xl:sticky xl:top-4">
          <ol className="flex gap-1 overflow-x-auto xl:block xl:space-y-1 xl:overflow-visible">
            {steps.map((s, i) => {
              const bad = stepHasBlocker(s.idx);
              return (
                <li key={s.k} className="shrink-0 xl:shrink">
                  <button
                    type="button" onClick={() => setStep(i)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                      i === step ? 'bg-white/10 ring-1 ring-[#C9A227]' : 'hover:bg-white/5'
                    }`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                      i === step ? 'bg-[#C9A227] text-[#0B1A35]'
                        : bad ? 'bg-red-500/20 text-red-300 ring-1 ring-red-400/50'
                        : 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/40'
                    }`}>{s.no}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[11px] font-bold">
                        <span className="truncate">{s.kh}</span>
                        <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${bad ? 'bg-red-400' : 'bg-emerald-400'}`} />
                      </span>
                      <span className="hidden truncate text-[10px] text-slate-400 xl:block">{s.en}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Live activity = results balance */}
          <div className="mt-2 rounded-lg bg-white/5 p-3 text-[11px]">
            <div className="flex justify-between font-bold">
              <span className="text-slate-300">សកម្មភាព / Activity</span>
              <span className="text-white">{summary.activity}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span className="text-slate-300">លទ្ធផល / Results</span>
              <span className="text-white">{summary.results}</span>
            </div>
            <div className={`mt-1.5 rounded px-2 py-1 text-center text-[10px] font-black ${
              summary.balanced ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
            }`}>
              {summary.balanced ? 'តុល្យភាព ✓ balanced' : 'មិនតុល្យភាព ✗'}
            </div>
            <div className="mt-2 text-[10px] font-semibold text-slate-400">
              ថិរវេលា / Due: {deadlineFor(state.meta.period_month).toLocaleDateString('en-CA')}
            </div>
          </div>
        </nav>

        {/* Step body */}
        <section className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-3">
              <span className="h-8 w-1 rounded-full bg-gradient-to-b from-[#C9A227] to-[#E6C45A]" />
              <div>
                <h3 className="text-sm font-black text-[#0B2A66] sm:text-base">{current?.kh}</h3>
                <p className="text-[11px] font-bold text-slate-400">{current?.en}</p>
              </div>
            </div>

            {current?.k === 'p1' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field kh="ឈ្មោះសហគ្រាស (ខ្មែរ)" en="Enterprise name (Khmer)" value={state.meta.enterprise_name_kh}
                  onChange={(v) => patch((d) => { d.meta.enterprise_name_kh = v; })} disabled />
                <Field kh="ឈ្មោះសហគ្រាស (ឡាតាំង)" en="Enterprise name (Latin)" value={state.meta.enterprise_name_en}
                  onChange={(v) => patch((d) => { d.meta.enterprise_name_en = v; })} disabled />
                <Field kh="លេខអាជ្ញាប័ណ្ណ" en="Licence No." value={state.meta.licence_no}
                  onChange={(v) => patch((d) => { d.meta.licence_no = v; })} disabled />
                <Field kh="សុពលភាពដល់" en="Valid until" type="date" value={state.meta.licence_valid_to}
                  onChange={(v) => patch((d) => { d.meta.licence_valid_to = v; })} />
                <Field kh="ប្រភេទអាជ្ញាប័ណ្ណ" en="Licence type" value={state.meta.licence_type} required
                  options={[['MANUF_INSTALL', 'ផលិត ដំឡើង | Manufacture & Installation'], ['REPAIR', 'ជួសជុល | Repair']]}
                  onChange={(v) => patch((d) => { d.meta.licence_type = v as any; })} />
                <Field kh="លេខវិញ្ញាបនបត្រចុះបញ្ជីមាត្រាសាស្ត្រ" en="Metrology registration No." value={state.meta.registration_no}
                  onChange={(v) => patch((d) => { d.meta.registration_no = v; })} />
                <Field kh="អាសយដ្ឋានទីតាំងអនុវត្ត" en="Operating address" value={state.meta.operating_address}
                  onChange={(v) => patch((d) => { d.meta.operating_address = v; })} />
                <Field kh="ខែរាយការណ៍" en="Reporting month" type="month" required value={state.meta.period_month}
                  onChange={(v) => patch((d) => { d.meta.period_month = v; })}
                  hint={khmerMonthLabel(state.meta.period_month)} />
                <Field kh="ប្រភេទរបាយការណ៍" en="Report type" required value={state.meta.report_type}
                  options={[['REGULAR', 'ធម្មតា | Regular'], ['NIL', 'គ្មានសកម្មភាព | Nil report'], ['AMENDMENT', 'កែតម្រូវ | Amendment']]}
                  onChange={(v) => patch((d) => { d.meta.report_type = v as any; })} />
                {state.meta.report_type === 'AMENDMENT' && (
                  <Field kh="លេខរបាយការណ៍ដើម" en="Original report No." required value={state.meta.original_report_id}
                    onChange={(v) => patch((d) => { d.meta.original_report_id = v; })} />
                )}
                <Field kh="អ្នកទទួលខុសត្រូវ (ឈ្មោះ)" en="Contact name" required value={state.meta.contact.name}
                  onChange={(v) => patch((d) => { d.meta.contact.name = v; })} />
                <Field kh="តួនាទី" en="Position" value={state.meta.contact.position}
                  onChange={(v) => patch((d) => { d.meta.contact.position = v; })} />
                <Field kh="ទូរសព្ទ" en="Phone" required value={state.meta.contact.phone} placeholder="+855…"
                  onChange={(v) => patch((d) => { d.meta.contact.phone = v; })} />
                <Field kh="អ៊ីម៉ែល" en="Email" type="email" value={state.meta.contact.email}
                  onChange={(v) => patch((d) => { d.meta.contact.email = v; })} />
              </div>
            )}

            {current?.k === 'p3' && (
              <div className="space-y-3">
                {state.instruments.length === 0 && <EmptyHint text="មិនទាន់មានឧបករណ៍ — សូមបន្ថែមជួរ / No instruments yet" />}
                {state.instruments.map((row, i) => (
                  <RowCard key={row._id} title={`ជួរ ${i + 1}`}
                    onRemove={() => patch((d) => { d.instruments.splice(i, 1); })}>
                    <Field kh="ផលិត ឬ ដំឡើង" en="Manufacture / Install" required value={row.op_code}
                      options={[['M', OP_CODE_LABELS.M.kh], ['I', OP_CODE_LABELS.I.kh]]}
                      onChange={(v) => patch((d) => { d.instruments[i].op_code = v as any; })} />
                    <Field kh="ប្រភេទឧបករណ៍" en="Category" required value={row.category} options={categoryOptions}
                      onChange={(v) => patch((d) => { d.instruments[i].category = v as InstrumentCategory; })} />
                    {row.category === 'OTHER' && (
                      <Field kh="បញ្ជាក់ប្រភេទ" en="Specify other" required value={row.category_other}
                        onChange={(v) => patch((d) => { d.instruments[i].category_other = v; })} />
                    )}
                    <Field kh="ឈ្មោះឧបករណ៍" en="Instrument name" required value={row.instrument_name}
                      onChange={(v) => patch((d) => { d.instruments[i].instrument_name = v; })} />
                    <Field kh="ម៉ូដែល" en="Model" required value={row.model}
                      onChange={(v) => patch((d) => { d.instruments[i].model = v; })} />
                    <Field kh="លេខស៊េរី" en="Serial No." required value={row.serial_no}
                      onChange={(v) => patch((d) => { d.instruments[i].serial_no = v; })} />
                    <Field kh="សហគ្រាសផលិត" en="Manufacturer" required value={row.manufacturer}
                      onChange={(v) => patch((d) => { d.instruments[i].manufacturer = v; })} />
                    <Field kh="ប្រទេសផលិត" en="Country" required value={row.country} options={countryOptions}
                      onChange={(v) => patch((d) => { d.instruments[i].country = v; })} />
                    <Field kh="Max" en="Max capacity" required value={row.max}
                      onChange={(v) => patch((d) => { d.instruments[i].max = v; })} />
                    <Field kh="Min" en="Min capacity" value={row.min}
                      onChange={(v) => patch((d) => { d.instruments[i].min = v; })} />
                    <Field kh="e (ចន្លោះផ្ទៀងផ្ទាត់)" en="Verification scale interval e" value={row.e}
                      hint="e មិនមែនកម្រិតអាន d ទេ / e is not the resolution d"
                      onChange={(v) => patch((d) => { d.instruments[i].e = v; })} />
                    <Field kh="ឯកតា" en="Unit" value={row.unit} options={UNITS.map((u) => [u, u])}
                      onChange={(v) => patch((d) => { d.instruments[i].unit = v; })} />
                    <Field kh="ថ្នាក់សុក្រឹតភាព" en="Accuracy class" value={row.accuracy_class}
                      onChange={(v) => patch((d) => { d.instruments[i].accuracy_class = v; })} />
                    <Field kh="លេខអនុម័តគំរូ / OIML-CS" en="Type approval No." required value={row.type_approval_no}
                      onChange={(v) => patch((d) => { d.instruments[i].type_approval_no = v; })} />
                    <Field kh="ថ្ងៃបញ្ចប់" en="Completion date" type="date" required value={row.completion_date}
                      onChange={(v) => patch((d) => { d.instruments[i].completion_date = v; })} />
                    <Field kh="ឈ្មោះអតិថិជន" en="Customer name" required={row.op_code === 'I'} value={row.customer_name}
                      onChange={(v) => patch((d) => { d.instruments[i].customer_name = v; })} />
                    <Field kh="រាជធានី/ខេត្ត" en="Province" required={row.op_code === 'I'} value={row.province} options={provinceOptions}
                      onChange={(v) => patch((d) => { d.instruments[i].province = v; })} />
                    <Field kh="អាសយដ្ឋាន" en="Address" value={row.address}
                      onChange={(v) => patch((d) => { d.instruments[i].address = v; })} />
                    <Field kh="Latitude" en="Latitude (WGS 84)" required={row.op_code === 'I'} value={row.lat}
                      onChange={(v) => patch((d) => { d.instruments[i].lat = v; })} />
                    <Field kh="Longitude" en="Longitude (WGS 84)" value={row.long}
                      onChange={(v) => patch((d) => { d.instruments[i].long = v; })} />
                    <div className="flex items-end">
                      <button type="button"
                        onClick={() => captureGps((lat, lng) => patch((d) => { d.instruments[i].lat = lat; d.instruments[i].long = lng; }))}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#0B2A66] px-3 py-2 text-[11px] font-black text-[#0B2A66] hover:bg-[#0B2A66]/5">
                        <LocateFixed className="h-4 w-4" /> ចាប់យក GPS
                      </button>
                    </div>
                    <Field kh="លេខស្លាក / QR" en="Label / QR No." required value={row.label_qr_no}
                      onChange={(v) => patch((d) => { d.instruments[i].label_qr_no = v; })} />
                    <Field kh="ស្ថានភាពផ្ទៀងផ្ទាត់" en="Verification status" required value={row.verification_status}
                      options={verificationOptions}
                      onChange={(v) => patch((d) => { d.instruments[i].verification_status = v as VerificationStatus; })} />
                    {row.verification_status !== 'PENDING' && (
                      <>
                        <Field kh="លេខវិញ្ញាបនបត្រ" en="Certificate No." required value={row.verification_cert_no}
                          onChange={(v) => patch((d) => { d.instruments[i].verification_cert_no = v; })} />
                        <Field kh="ថ្ងៃផ្ទៀងផ្ទាត់" en="Verification date" type="date" required value={row.verification_date}
                          onChange={(v) => patch((d) => { d.instruments[i].verification_date = v; })} />
                      </>
                    )}
                  </RowCard>
                ))}
                <AddRowButton label="បន្ថែមឧបករណ៍ / Add instrument"
                  onClick={() => patch((d) => { d.instruments.push(newInstrument()); })} />
              </div>
            )}

            {current?.k === 'p3a' && (
              <div className="space-y-3">
                {hostOptions(state).length === 0 && (
                  <EmptyHint text="សូមបញ្ចូលឧបករណ៍ក្នុងផ្នែកទី៣ ឬទី៤ ជាមុនសិន / Add a Part 3 or Part 4 row first" />
                )}
                {state.modules.map((row, i) => (
                  <RowCard key={row._id} title={`ជួរ ${i + 1}`}
                    onRemove={() => patch((d) => { d.modules.splice(i, 1); })}>
                    <Field kh="លេខស៊េរីឧបករណ៍មេ" en="Host instrument serial" required value={row.host_serial_no}
                      options={hostOptions(state).map((h) => [h.serial_no, h.label])}
                      onChange={(v) => patch((d) => { d.modules[i].host_serial_no = v; })}
                      hint={row.host_serial_no ? `ផ្នែក ${hostPart(state, row.host_serial_no)}` : ''} />
                    <Field kh="ឈ្មោះម៉ូឌុល" en="Module name" required value={row.module_name}
                      onChange={(v) => patch((d) => { d.modules[i].module_name = v; })} />
                    <Field kh="ម៉ូដែល" en="Model" required value={row.model}
                      onChange={(v) => patch((d) => { d.modules[i].model = v; })} />
                    <Field kh="លេខស៊េរី" en="Serial No." required value={row.serial_no}
                      onChange={(v) => patch((d) => { d.modules[i].serial_no = v; })} />
                    <Field kh="កម្រិតរង្វាស់ និង e" en="Range & e / Resolution" value={row.range_e}
                      onChange={(v) => patch((d) => { d.modules[i].range_e = v; })} />
                    <Field kh="សហគ្រាសផលិត" en="Manufacturer" required value={row.manufacturer}
                      onChange={(v) => patch((d) => { d.modules[i].manufacturer = v; })} />
                    <Field kh="ប្រទេសផលិត" en="Country" required value={row.country} options={countryOptions}
                      onChange={(v) => patch((d) => { d.modules[i].country = v; })} />
                    <Field kh="លេខ OIML-CS / វិញ្ញាបនបត្រ" en="OIML-CS / Test cert. No." required value={row.cert_no}
                      onChange={(v) => patch((d) => { d.modules[i].cert_no = v; })} />
                    <Field kh="ថ្មី ឬ ជំនួស" en="New / Replacement" required value={row.new_or_replacement}
                      options={[['NEW', MODULE_ORIGIN_LABELS.NEW.kh], ['REPLACEMENT', MODULE_ORIGIN_LABELS.REPLACEMENT.kh]]}
                      onChange={(v) => patch((d) => { d.modules[i].new_or_replacement = v as any; })} />
                  </RowCard>
                ))}
                <AddRowButton label="បន្ថែមម៉ូឌុល / Add module"
                  onClick={() => patch((d) => { d.modules.push(newModule()); })} />
              </div>
            )}

            {current?.k === 'p4' && (
              <div className="space-y-3">
                {state.repairs.length === 0 && <EmptyHint text="មិនទាន់មានការជួសជុល / No repairs yet" />}
                {state.repairs.map((row, i) => (
                  <RowCard key={row._id} title={`ជួរ ${i + 1}`}
                    onRemove={() => patch((d) => { d.repairs.splice(i, 1); })}>
                    <Field kh="ប្រភេទឧបករណ៍" en="Category" required value={row.category} options={categoryOptions}
                      onChange={(v) => patch((d) => { d.repairs[i].category = v as InstrumentCategory; })} />
                    <Field kh="ឈ្មោះឧបករណ៍" en="Instrument name" required value={row.instrument_name}
                      onChange={(v) => patch((d) => { d.repairs[i].instrument_name = v; })} />
                    <Field kh="ម៉ូដែល" en="Model" value={row.model}
                      onChange={(v) => patch((d) => { d.repairs[i].model = v; })} />
                    <Field kh="លេខស៊េរី" en="Serial No." required value={row.serial_no}
                      onChange={(v) => patch((d) => { d.repairs[i].serial_no = v; })} />
                    <Field kh="ឈ្មោះអតិថិជន" en="Customer name" required value={row.customer_name}
                      onChange={(v) => patch((d) => { d.repairs[i].customer_name = v; })} />
                    <Field kh="រាជធានី/ខេត្ត" en="Province" required value={row.province} options={provinceOptions}
                      onChange={(v) => patch((d) => { d.repairs[i].province = v; })} />
                    <Field kh="អាសយដ្ឋាន" en="Address" value={row.address}
                      onChange={(v) => patch((d) => { d.repairs[i].address = v; })} />
                    <Field kh="Latitude" en="Latitude" value={row.lat}
                      onChange={(v) => patch((d) => { d.repairs[i].lat = v; })} />
                    <Field kh="Longitude" en="Longitude" value={row.long}
                      onChange={(v) => patch((d) => { d.repairs[i].long = v; })} />
                    <div className="flex items-end">
                      <button type="button"
                        onClick={() => captureGps((lat, lng) => patch((d) => { d.repairs[i].lat = lat; d.repairs[i].long = lng; }))}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#0B2A66] px-3 py-2 text-[11px] font-black text-[#0B2A66] hover:bg-[#0B2A66]/5">
                        <LocateFixed className="h-4 w-4" /> ចាប់យក GPS
                      </button>
                    </div>
                    <Field kh="ថ្ងៃចាប់ផ្ដើម" en="Repair from" type="date" required value={row.repair_from}
                      onChange={(v) => patch((d) => { d.repairs[i].repair_from = v; })} />
                    <Field kh="ថ្ងៃបញ្ចប់" en="Repair to" type="date" required value={row.repair_to}
                      onChange={(v) => patch((d) => { d.repairs[i].repair_to = v; })} />
                    <div className="sm:col-span-2 lg:col-span-3">
                      <Field kh="ខ្លឹមសារនៃការជួសជុល" en="Description of repair (min. 20 characters)" type="textarea"
                        required value={row.repair_description}
                        hint={`${row.repair_description.trim().length}/20`}
                        onChange={(v) => patch((d) => { d.repairs[i].repair_description = v; })} />
                    </div>
                    <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                      <input type="checkbox" checked={row.seal_broken} className="h-4 w-4"
                        onChange={(e) => patch((d) => { d.repairs[i].seal_broken = e.target.checked; })} />
                      បានដកសញ្ញាត្រួតពិនិត្យ / Seal removed
                    </label>
                    {row.seal_broken && (
                      <>
                        <Field kh="លេខ Sticker/Seal ដែលបានដក" en="Seal No. removed" required value={row.seal_removed_no}
                          onChange={(v) => patch((d) => { d.repairs[i].seal_removed_no = v; })} />
                        <Field kh="លេខសេចក្ដីជូនដំណឹង (ឧបសម្ព័ន្ធទី១០)" en="Notification No. (Annex 10)" required
                          value={row.notification_no}
                          onChange={(v) => patch((d) => { d.repairs[i].notification_no = v; })} />
                      </>
                    )}
                    <Field kh="អ្នកបច្ចេកទេស" en="Technician" required value={row.technician}
                      options={licensee.staff.length ? licensee.staff.map((s) => [s, s]) : undefined}
                      onChange={(v) => patch((d) => { d.repairs[i].technician = v; })} />
                    <Field kh="ផ្ទៀងផ្ទាត់បន្ទាប់" en="Subsequent verification" required value={row.verification_status}
                      options={verificationOptions}
                      onChange={(v) => patch((d) => { d.repairs[i].verification_status = v as VerificationStatus; })} />
                    {row.verification_status !== 'PENDING' && (
                      <>
                        <Field kh="លេខវិញ្ញាបនបត្រ" en="Certificate No." required value={row.verification_cert_no}
                          onChange={(v) => patch((d) => { d.repairs[i].verification_cert_no = v; })} />
                        <Field kh="ថ្ងៃផ្ទៀងផ្ទាត់" en="Verification date" type="date" required value={row.verification_date}
                          onChange={(v) => patch((d) => { d.repairs[i].verification_date = v; })} />
                      </>
                    )}
                  </RowCard>
                ))}
                <AddRowButton label="បន្ថែមការជួសជុល / Add repair"
                  onClick={() => patch((d) => { d.repairs.push(newRepair()); })} />
              </div>
            )}

            {current?.k === 'p5' && (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold text-slate-500">
                  បំពេញតែករណីមានការព្យាសកម្មថ្មី ឧបករណ៍ផុតកំណត់ ឬការផ្លាស់ប្ដូរក្នុងខែ (ប្រការ២៣)។
                </p>
                {state.standards.map((row, i) => (
                  <RowCard key={row._id} title={`ជួរ ${i + 1}`}
                    onRemove={() => patch((d) => { d.standards.splice(i, 1); })}>
                    <Field kh="ឈ្មោះឧបករណ៍ស្ដង់ដារ" en="Equipment" required value={row.equipment}
                      onChange={(v) => patch((d) => { d.standards[i].equipment = v; })} />
                    <Field kh="លេខស៊េរី" en="Serial No." required value={row.serial_no}
                      onChange={(v) => patch((d) => { d.standards[i].serial_no = v; })} />
                    <Field kh="ថ្នាក់ / កម្រិត" en="Class / Range" value={row.class_range}
                      onChange={(v) => patch((d) => { d.standards[i].class_range = v; })} />
                    <Field kh="លេខវិញ្ញាបនបត្រព្យាសកម្ម" en="Calibration cert. No." required value={row.cal_cert_no}
                      onChange={(v) => patch((d) => { d.standards[i].cal_cert_no = v; })} />
                    <Field kh="មន្ទីរពិសោធន៍" en="Calibration lab" required value={row.lab}
                      onChange={(v) => patch((d) => { d.standards[i].lab = v; })} />
                    <Field kh="ថ្ងៃព្យាសកម្ម" en="Calibration date" type="date" value={row.cal_date}
                      onChange={(v) => patch((d) => { d.standards[i].cal_date = v; })} />
                    <Field kh="ថ្ងៃកំណត់បន្ទាប់" en="Due date" type="date" required value={row.due_date}
                      onChange={(v) => patch((d) => { d.standards[i].due_date = v; })} />
                    <Field kh="ស្ថានភាព" en="Status" required value={row.status}
                      options={[['VALID', 'មានសុពលភាព | Valid'], ['EXPIRED', 'ផុតកំណត់ | Expired'], ['OUT_OF_SERVICE', 'ឈប់ប្រើ | Out of service']]}
                      onChange={(v) => patch((d) => { d.standards[i].status = v as any; })} />
                  </RowCard>
                ))}
                <AddRowButton label="បន្ថែមឧបករណ៍ស្ដង់ដារ / Add standard"
                  onClick={() => patch((d) => { d.standards.push(newStandard()); })} />
              </div>
            )}

            {current?.k === 'p6' && (
              <div className="space-y-3">
                {EVENTS.map((ev) => {
                  const e = state.events[ev.key];
                  return (
                    <div key={ev.key} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-black text-[#0B2A66]">{ev.no} {ev.kh}</p>
                          <p className="text-[10px] font-semibold text-slate-400">{ev.en}</p>
                        </div>
                        <div className="flex gap-1.5">
                          {[['yes', true, 'មាន'], ['no', false, 'គ្មាន']].map(([k, val, lab]) => (
                            <button key={String(k)} type="button"
                              onClick={() => patch((d) => { d.events[ev.key].yes = val as boolean; })}
                              className={`rounded-lg px-3 py-1.5 text-[11px] font-black ${
                                e.yes === val ? 'bg-[#0B2A66] text-white' : 'border border-slate-300 text-slate-600'
                              }`}>{lab as string}</button>
                          ))}
                        </div>
                      </div>
                      {e.yes && (
                        <textarea className={`${inputCls} mt-2 min-h-[64px]`} value={e.details}
                          placeholder="ព័ត៌មានលម្អិត / Details"
                          onChange={(ev2) => patch((d) => { d.events[ev.key].details = ev2.target.value; })} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {current?.k === 'p7' && (
              <div className="space-y-4">
                {/* Part 2 — computed */}
                <div>
                  <h4 className="mb-2 text-xs font-black text-[#0B2A66]">ផ្នែកទី២ · សង្ខេបសកម្មភាព / Part 2 · Monthly summary</h4>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[520px] text-[11px]">
                      <thead className="bg-[#0B1A35] font-black text-white">
                        <tr>
                          <th className="p-2 text-left">ប្រភេទ / Category</th>
                          <th className="p-2">ផលិត</th><th className="p-2">ដំឡើង</th><th className="p-2">ជួសជុល</th>
                          <th className="p-2">ឆ្លង</th><th className="p-2">មិនឆ្លង</th><th className="p-2">រង់ចាំ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CATEGORY_CODES.map((code) => {
                          const r = summary.rows[code];
                          const empty = r.manufactured + r.installed + r.repaired + r.passed + r.failed + r.pending === 0;
                          return (
                            <tr key={code} className={`border-t border-slate-100 ${empty ? 'text-slate-300' : 'font-bold text-slate-700'}`}>
                              <td className="p-2 text-left">{CATEGORIES[code].kh}</td>
                              <td className="p-2 text-center">{r.manufactured}</td>
                              <td className="p-2 text-center">{r.installed}</td>
                              <td className="p-2 text-center">{r.repaired}</td>
                              <td className="p-2 text-center">{r.passed}</td>
                              <td className="p-2 text-center">{r.failed}</td>
                              <td className="p-2 text-center">{r.pending}</td>
                            </tr>
                          );
                        })}
                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-[#0B2A66]">
                          <td className="p-2 text-left">សរុប / Total</td>
                          <td className="p-2 text-center">{summary.total.manufactured}</td>
                          <td className="p-2 text-center">{summary.total.installed}</td>
                          <td className="p-2 text-center">{summary.total.repaired}</td>
                          <td className="p-2 text-center">{summary.total.passed}</td>
                          <td className="p-2 text-center">{summary.total.failed}</td>
                          <td className="p-2 text-center">{summary.total.pending}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className={`mt-2 text-[11px] font-black ${summary.balanced ? 'text-emerald-600' : 'text-red-600'}`}>
                    V01: ផលិត + ដំឡើង + ជួសជុល ({summary.activity}) = ឆ្លង + មិនឆ្លង + រង់ចាំ ({summary.results}) {summary.balanced ? '✓' : '✗'}
                  </p>
                  {summary.provinces.length > 0 && (
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      ទីតាំង / Provinces: {summary.provinces.join(', ')}
                    </p>
                  )}
                </div>

                {/* Issues */}
                <div>
                  <h4 className="mb-2 text-xs font-black text-[#0B2A66]">បញ្ហាដែលត្រូវដោះស្រាយ / Issues</h4>
                  {issues.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-bold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> គ្មានបញ្ហា / No issues
                    </div>
                  ) : (
                    <ul className="max-h-60 space-y-1 overflow-y-auto">
                      {issues.map((it, i) => (
                        <li key={i} className={`rounded-lg border p-2 text-[11px] font-semibold ${
                          it.severity === 'block' ? 'border-red-200 bg-red-50 text-red-700'
                            : it.severity === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}>
                          <span className="font-black">{it.code}</span> · {it.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Part 7 — declaration */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <h4 className="mb-1 text-xs font-black text-[#0B2A66]">ផ្នែកទី៧ · សេចក្ដីប្រកាសអះអាង / Declaration</h4>
                  <p className="mb-2 text-[11px] leading-relaxed text-slate-600">
                    ខ្ញុំបាទ/នាងខ្ញុំ សូមធានាអះអាងថា ព័ត៌មានក្នុងរបាយការណ៍នេះ ពិតជាត្រឹមត្រូវ ពេញលេញ
                    និងស្របតាមកំណត់ត្រាដែលរក្សាទុកនៅសហគ្រាស។ (ប្រការ២២ និង២៦)
                  </p>
                  <label className="flex items-start gap-2 text-[11px] font-bold text-slate-700">
                    <input type="checkbox" checked={state.declaration} className="mt-0.5 h-4 w-4"
                      onChange={(e) => patch((d) => { d.declaration = e.target.checked; })} />
                    ខ្ញុំយល់ព្រម / I agree
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={blocking.length > 0 || busy === 'submitting' || !!receipt}
                    onClick={submitReport}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#C9A227] to-[#E6C45A] px-5 py-3 text-xs font-black text-[#0B1A35] shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:text-slate-500 sm:w-auto">
                    {busy === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {receipt ? 'បានដាក់ជូនរួចហើយ' : 'ដាក់ជូនរបាយការណ៍ / Submit'}
                    {blocking.length > 0 && ` (${blocking.length})`}
                  </button>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {isOnTime(state.meta.period_month)
                      ? 'ទាន់ថិរវេលា / Within deadline'
                      : 'ហួសថិរវេលា — នឹងកត់ត្រាជាការដាក់ជូនយឺត (ប្រការ២១)'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Step navigation */}
          <div className="flex items-center justify-between gap-2">
            <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-4 py-2 text-xs font-black text-slate-600 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" /> ថយក្រោយ
            </button>
            <span className="text-[11px] font-bold text-slate-400">{step + 1} / {steps.length}</span>
            <button type="button" disabled={step >= steps.length - 1}
              onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
              className="inline-flex items-center gap-1 rounded-lg bg-[#0B2A66] px-4 py-2 text-xs font-black text-white disabled:opacity-40">
              បន្ទាប់ <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {showJson && (
            <pre className="max-h-80 overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-3 text-[10px] leading-relaxed text-emerald-300">
              {JSON.stringify(state, null, 2)}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}
