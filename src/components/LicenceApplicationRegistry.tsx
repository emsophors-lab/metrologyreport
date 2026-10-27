/**
 * ពាក្យស្នើសុំអាជ្ញាប័ណ្ណ (ឧបសម្ព័ន្ធទី២) — the stage before a licence exists.
 *
 * This screen is additive and deliberately separate from the licence
 * registry. It records what an enterprise applied for on the official Annex 2
 * form, carries that application through review, and — once approved — is
 * linked to the licence an officer issues on the existing registration
 * screen. It never writes enterprise_licenses itself: the path that issued
 * every live licence stays the only thing that creates one.
 *
 * So an application is a document, not a licence. Approving one does not
 * grant anything; it records that the Centre is willing to.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, FileText, Loader2, Plus,
  Printer, Save, Search, Send, Trash2, X,
} from 'lucide-react';

import {
  ACTS, APPLICATION_STATUSES, Annex2Payload, ApplicationStatus, DOCS, INSTR, REQ_TYPES,
  STATUS_EN, STATUS_LABEL, blockingIssues, emptyLocRow, emptyPayload, emptyReqRow,
  emptyStaffRow, emptyUseRow, normalisePayload, staffTotals,
} from '../licence/annex2';
import { formatKhmerOfficialDateBlock, toKhmerNumerals } from '../utils/khmerOfficialDate';
import { apiRequest } from '../supabaseSync';
import { MetrologyUser } from '../types';

const kh = (v: unknown) => toKhmerNumerals(String(v ?? ''));

interface ApplicationRow {
  id: string; application_no: string; status: ApplicationStatus;
  enterprise_name_kh: string; enterprise_name_en: string; owner_name_kh: string;
  phone: string; subject: string; made_on: string | null;
  created_at: string; submitted_at: string | null;
  issued_licence_id: string | null; decision_note: string | null;
}

const STATUS_STYLE: Record<ApplicationStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
  UNDER_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  ISSUED: 'bg-[#0B1A35] text-[#E6C45A] border-[#0B1A35]',
};

/** The date the form is filled, written the way the Centre's reports write it. */
function madeOnLines(iso: string) {
  const date = iso ? new Date(`${iso}T00:00:00`) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const block = formatKhmerOfficialDateBlock(safe, { includeUnavailableLunarLine: false });
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    iso: `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())}`,
    lunar: block.lunarLine,
    gregorian: block.gregorianLine,
  };
}

interface Props {
  currentUser: MetrologyUser;
  toastMsg?: (message: string, kind?: 'success' | 'error' | 'info') => void;
}

export default function LicenceApplicationRegistry({ currentUser, toastMsg }: Props) {
  const say = useCallback((message: string, kind: 'success' | 'error' | 'info' = 'info') => {
    if (toastMsg) toastMsg(message, kind); else console.log(`[${kind}] ${message}`);
  }, [toastMsg]);

  const [view, setView] = useState<'list' | 'form'>('list');
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'' | ApplicationStatus>('');
  const [query, setQuery] = useState('');

  const [appId, setAppId] = useState<string | null>(null);
  const [appNo, setAppNo] = useState('');
  const [status, setStatus] = useState<ApplicationStatus>('DRAFT');
  const [form, setForm] = useState<Annex2Payload>(emptyPayload());
  const [note, setNote] = useState('');
  const [licenceRef, setLicenceRef] = useState('');
  const [showPrint, setShowPrint] = useState(false);

  const editable = status === 'DRAFT';
  const issues = useMemo(() => blockingIssues(form), [form]);
  const made = useMemo(() => madeOnLines(form.close.madeOn), [form.close.madeOn]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (query.trim()) params.set('q', query.trim());
      const data = await apiRequest<{ applications: ApplicationRow[] }>(
        `/api/licence-applications${params.toString() ? `?${params}` : ''}`);
      setRows(data.applications || []);
    } catch (err: any) {
      say(`មិនអាចទាញបញ្ជីបានទេ / ${err?.message || err}`, 'error');
    } finally { setLoading(false); }
  }, [statusFilter, query, say]);

  useEffect(() => { if (view === 'list') void loadList(); }, [view, loadList]);

  function startNew() {
    const year = new Date().getFullYear();
    const seq = rows.filter(r => r.application_no.startsWith(`NMC-LIC-${year}`)).length + 1;
    const fresh = emptyPayload();
    fresh.close.madeOn = madeOnLines('').iso;
    setAppId(null);
    setAppNo(`NMC-LIC-${year}-${String(seq).padStart(4, '0')}`);
    setStatus('DRAFT'); setForm(fresh); setNote(''); setLicenceRef(''); setShowPrint(false);
    setView('form');
  }

  async function open(row: ApplicationRow) {
    setBusy('open');
    try {
      const data = await apiRequest<{ application: any }>(`/api/licence-applications/${row.id}`);
      const a = data.application;
      setAppId(a.id); setAppNo(a.application_no); setStatus(a.status);
      setForm(normalisePayload(a.payload));
      setNote(a.decision_note || ''); setLicenceRef(a.issued_licence_id || '');
      setShowPrint(false); setView('form');
    } catch (err: any) {
      say(`មិនអាចបើកពាក្យស្នើសុំបានទេ / ${err?.message || err}`, 'error');
    } finally { setBusy(null); }
  }

  async function saveDraft() {
    if (!appNo.trim()) { say('សូមបំពេញលេខកូដសម្គាល់ជាមុន', 'error'); return; }
    setBusy('save');
    try {
      const payload = { ...form, close: { ...form.close, madeOn: made.iso } };
      const data = await apiRequest<{ application: any; created: boolean }>(
        '/api/licence-applications', { method: 'POST', body: { application_no: appNo.trim(), payload } });
      setAppId(data.application.id);
      setForm(normalisePayload(data.application.payload));
      say(data.created ? `បានរក្សាទុកព្រាង ${appNo}` : `បានធ្វើបច្ចុប្បន្នភាពព្រាង ${appNo}`, 'success');
    } catch (err: any) {
      say(`មិនអាចរក្សាទុកបានទេ / ${err?.message || err}`, 'error');
    } finally { setBusy(null); }
  }

  async function move(to: ApplicationStatus) {
    if (!appId) { say('សូមរក្សាទុកព្រាងជាមុនសិន', 'error'); return; }
    if (to === 'SUBMITTED' && issues.length) {
      say(`នៅមាន ${issues.length} បញ្ហាត្រូវដោះស្រាយមុនដាក់ជូន`, 'error'); return;
    }
    setBusy(to);
    try {
      await apiRequest(`/api/licence-applications/${appId}/status`,
        { method: 'POST', body: { status: to, note } });
      setStatus(to);
      say(`${STATUS_LABEL[to]} · ${STATUS_EN[to]}`, 'success');
    } catch (err: any) {
      say(`មិនអាចប្ដូរស្ថានភាពបានទេ / ${err?.message || err}`, 'error');
    } finally { setBusy(null); }
  }

  async function linkLicence() {
    if (!appId || !licenceRef.trim()) { say('សូមបញ្ចូលលេខសម្គាល់អាជ្ញាប័ណ្ណ', 'error'); return; }
    setBusy('issue');
    try {
      const data = await apiRequest<{ licence_no: string | null }>(
        `/api/licence-applications/${appId}/issue`, { method: 'POST', body: { licence_id: licenceRef.trim() } });
      setStatus('ISSUED');
      say(`បានភ្ជាប់អាជ្ញាប័ណ្ណ ${data.licence_no || licenceRef}`, 'success');
    } catch (err: any) {
      say(`មិនអាចភ្ជាប់អាជ្ញាប័ណ្ណបានទេ / ${err?.message || err}`, 'error');
    } finally { setBusy(null); }
  }

  /**
   * Edits go through a copy, never the live object.
   *
   * The payload is nested and holds arrays the sections splice; mutating it
   * in place would leave React comparing a value to itself and skipping the
   * render, so a typed character would simply not appear.
   */
  const patch = (fn: (draft: Annex2Payload) => void) =>
    setForm(prev => { const next = JSON.parse(JSON.stringify(prev)) as Annex2Payload; fn(next); return next; });

  /* ---------------------------- list ---------------------------- */
  if (view === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <h3 className="text-[15px] font-black text-[#0B1A35]">ពាក្យស្នើសុំអាជ្ញាប័ណ្ណ (ឧបសម្ព័ន្ធទី២)</h3>
            <p className="text-[11.5px] text-slate-500">
              Licence applications · ពាក្យស្នើសុំមុនពេលចេញអាជ្ញាប័ណ្ណ — បញ្ជីអាជ្ញាប័ណ្ណដែលមានស្រាប់មិនប៉ះពាល់ទេ
            </p>
          </div>
          <button type="button" onClick={startNew}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#0B1A35] px-4 py-2.5 text-[12px] font-black text-white hover:bg-[#15284d]">
            <Plus className="h-4 w-4" />ពាក្យស្នើសុំថ្មី
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="ស្វែងរកតាមលេខ ឈ្មោះសហគ្រាស ឬទូរសព្ទ"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#C9A227]" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-[13px]">
            <option value="">ស្ថានភាពទាំងអស់</option>
            {APPLICATION_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : !rows.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 py-12 text-center">
            <FileText className="mx-auto h-7 w-7 text-slate-300" />
            <p className="mt-2 text-[13px] font-bold text-slate-500">មិនទាន់មានពាក្យស្នើសុំទេ</p>
            <p className="text-[11.5px] text-slate-400">
              បើតារាងមិនទាន់បង្កើត សូមដំណើរការ <code>supabase_licence_applications.sql</code> ជាមុនសិន។
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[760px] text-left text-[12.5px]">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-3">លេខពាក្យស្នើសុំ</th><th className="p-3">សហគ្រាស</th>
                  <th className="p-3">ម្ចាស់សហគ្រាស</th><th className="p-3">ស្ថានភាព</th><th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-mono text-[11.5px] font-bold">{r.application_no}</td>
                    <td className="p-3">
                      <div className="font-bold text-[#0B1A35]">{r.enterprise_name_kh || r.enterprise_name_en || '—'}</div>
                      <div className="text-[11px] text-slate-400">{r.enterprise_name_en}</div>
                    </td>
                    <td className="p-3">{r.owner_name_kh || '—'}<div className="text-[11px] text-slate-400">{r.phone}</div></td>
                    <td className="p-3">
                      <span className={`inline-block rounded-full border px-2.5 py-1 text-[10.5px] font-black ${STATUS_STYLE[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button type="button" onClick={() => void open(r)} disabled={busy === 'open'}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11.5px] font-black text-[#0B1A35] hover:bg-slate-100">
                        បើកមើល
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  /* ---------------------------- form ---------------------------- */
  const [kN, kA, kC] = staffTotals(form.key);
  const [sN, sA, sC] = staffTotals(form.sup);

  return (
    <div className="space-y-4">
      <style>{`@media print{body *{visibility:hidden}#a2-print,#a2-print *{visibility:visible}
        #a2-print{position:absolute;inset:0;padding:0}@page{size:A4;margin:12mm}}`}</style>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button type="button" onClick={() => setView('list')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[12px] font-black text-slate-600 hover:bg-slate-100">
          <ArrowLeft className="h-4 w-4" />បញ្ជី
        </button>
        <div className="min-w-0">
          <div className="font-mono text-[12px] font-black text-[#0B1A35]">{appNo || '(ពាក្យស្នើសុំថ្មី)'}</div>
          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-black ${STATUS_STYLE[status]}`}>
            {STATUS_LABEL[status]} · {STATUS_EN[status]}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={() => { setShowPrint(true); setTimeout(() => window.print(), 80); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[12px] font-black text-slate-600 hover:bg-slate-100">
            <Printer className="h-4 w-4" />បោះពុម្ព
          </button>
          {editable && (
            <button type="button" onClick={() => void saveDraft()} disabled={busy === 'save'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1A35] px-4 py-2 text-[12px] font-black text-white hover:bg-[#15284d] disabled:opacity-50">
              {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}រក្សាទុកព្រាង
            </button>
          )}
        </div>
      </div>

      {/* workflow */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 print:hidden">
        <h4 className="text-[12.5px] font-black text-[#0B1A35]">ដំណើរការពាក្យស្នើសុំ <span className="font-bold uppercase tracking-wider text-slate-400">Workflow</span></h4>
        {status === 'DRAFT' && !!issues.length && (
          <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11.5px] font-bold text-rose-800">
            <AlertTriangle className="mr-1 inline h-4 w-4" />
            មិនទាន់អាចដាក់ជូនបានទេ៖ នៅមាន <b>{kh(issues.length)}</b> បញ្ហា
            <ul className="mt-1 list-disc ps-5 font-semibold">{issues.map(i => <li key={i}>{i}</li>)}</ul>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {status === 'DRAFT' && (
            <button type="button" onClick={() => void move('SUBMITTED')} disabled={!appId || !!issues.length || busy === 'SUBMITTED'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9A227] px-4 py-2 text-[12px] font-black text-[#0B1A35] hover:bg-[#E6C45A] disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="h-4 w-4" />ដាក់ជូន
            </button>
          )}
          {status === 'SUBMITTED' && (
            <button type="button" onClick={() => void move('UNDER_REVIEW')} disabled={busy === 'UNDER_REVIEW'}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-[12px] font-black text-amber-800">ចាប់ផ្ដើមពិនិត្យ</button>
          )}
          {['SUBMITTED', 'UNDER_REVIEW'].includes(status) && (
            <>
              <button type="button" onClick={() => void move('APPROVED')} disabled={busy === 'APPROVED'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle2 className="h-4 w-4" />អនុម័ត
              </button>
              <button type="button" onClick={() => void move('REJECTED')} disabled={busy === 'REJECTED'}
                className="rounded-lg bg-rose-600 px-4 py-2 text-[12px] font-black text-white hover:bg-rose-700 disabled:opacity-50">មិនអនុម័ត</button>
            </>
          )}
          {status === 'APPROVED' && (
            <div className="flex w-full flex-wrap items-end gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <label className="min-w-0 flex-1">
                <span className="block text-[11.5px] font-bold text-emerald-900">លេខសម្គាល់អាជ្ញាប័ណ្ណដែលបានចេញ (enterprise_licenses.id)</span>
                <span className="block text-[10.5px] text-emerald-700">សូមចេញអាជ្ញាប័ណ្ណនៅទំព័រ «ចុះបញ្ជីថ្មី» ជាមុនសិន រួចភ្ជាប់នៅទីនេះ</span>
                <input value={licenceRef} onChange={e => setLicenceRef(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-emerald-300 px-2.5 py-2 text-[12px]" />
              </label>
              <button type="button" onClick={() => void linkLicence()} disabled={busy === 'issue'}
                className="rounded-lg bg-[#0B1A35] px-4 py-2 text-[12px] font-black text-white disabled:opacity-50">ភ្ជាប់អាជ្ញាប័ណ្ណ</button>
            </div>
          )}
          {status === 'ISSUED' && (
            <p className="text-[12px] font-bold text-emerald-700">
              <CheckCircle2 className="mr-1 inline h-4 w-4" />បានចេញអាជ្ញាប័ណ្ណរួចហើយ · {licenceRef}
            </p>
          )}
        </div>
        {['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'].includes(status) && (
          <label className="mt-3 block">
            <span className="text-[11.5px] font-bold text-slate-600">កំណត់សម្គាល់ការសម្រេច <span className="uppercase tracking-wider text-slate-400">Decision note</span></span>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-[12.5px]" />
          </label>
        )}
      </div>

      {/* ---- the form itself ---- */}
      <div className="space-y-4 print:hidden">
        <Section tag="០" title="ប្រភេទនៃការស្នើសុំ កម្មវត្ថុ និងយោង" en="Request type, subject & reference">
          <div className="grid gap-2 sm:grid-cols-2">
            {REQ_TYPES.map((t, i) => (
              <Toggle editable={editable} key={t} on={form.reqTypes[i]} kh={t}
                onChange={v => patch(d => {
                  d.reqTypes[i] = v;
                  d.subject = REQ_TYPES.filter((_, j) => (j === i ? v : d.reqTypes[j])).join(' ');
                })} />
            ))}
          </div>
          <label className="mt-3 block">
            <span className="text-[12px] font-semibold text-slate-600">កម្មវត្ថុ <span className="uppercase tracking-wider text-slate-400">Subject</span></span>
            <textarea value={form.subject} disabled={!editable} rows={2}
              onChange={e => patch(d => { d.subject = e.target.value; })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-[12.5px] disabled:bg-slate-50" />
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Field editable={editable} label="យោង៖ ប្រកាសលេខ" value={form.ref.no} onChange={v => patch(d => { d.ref.no = v; })} />
            <Field editable={editable} label="ចុះថ្ងៃទី" value={form.ref.day} onChange={v => patch(d => { d.ref.day = v; })} />
            <Field editable={editable} label="ខែ" value={form.ref.month} onChange={v => patch(d => { d.ref.month = v; })} />
            <Field editable={editable} label="ឆ្នាំ" value={form.ref.year} onChange={v => patch(d => { d.ref.year = v; })} />
          </div>
        </Section>

        <Section tag="ក" title="ព័ត៌មានម្ចាស់សហគ្រាស ឬអ្នកតំណាងស្របច្បាប់" en="Owner or legal representative">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field editable={editable} label="គោត្តនាម - នាម" required value={form.owner.kh} onChange={v => patch(d => { d.owner.kh = v; })} />
            <Field editable={editable} label="Family Name - Name" value={form.owner.lat} onChange={v => patch(d => { d.owner.lat = v; })} />
            <Field editable={editable} label="ភេទ" en="Gender" value={form.owner.sex} onChange={v => patch(d => { d.owner.sex = v; })} />
            <Field editable={editable} label="ថ្ងៃខែឆ្នាំកំណើត" en="Date of birth" type="date" value={form.owner.dob} onChange={v => patch(d => { d.owner.dob = v; })} />
            <Field editable={editable} label="លេខអត្តសញ្ញាណប័ណ្ណ ឬលិខិតឆ្លងដែន" value={form.owner.id} onChange={v => patch(d => { d.owner.id = v; })} />
            <Field editable={editable} label="អាសយដ្ឋាន" en="Address" value={form.owner.addr} onChange={v => patch(d => { d.owner.addr = v; })} />
            <Field editable={editable} label="តួនាទីក្នុងសហគ្រាស" value={form.owner.role} onChange={v => patch(d => { d.owner.role = v; })} />
            <Field editable={editable} label="Position in Enterprise" value={form.owner.pos} onChange={v => patch(d => { d.owner.pos = v; })} />
          </div>
        </Section>

        <Section tag="ខ" title="ព័ត៌មានសហគ្រាស" en="Enterprise information">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field editable={editable} label="ឈ្មោះសហគ្រាស" required value={form.ent.kh} onChange={v => patch(d => { d.ent.kh = v; })} />
            <Field editable={editable} label="Enterprise’s Name" value={form.ent.lat} onChange={v => patch(d => { d.ent.lat = v; })} />
            <Field editable={editable} label="លេខទូរសព្ទ" required en="Phone" value={form.ent.phone} onChange={v => patch(d => { d.ent.phone = v; })} />
            <Field editable={editable} label="សារអេឡិចត្រូនិក (Email)" type="email" value={form.ent.email} onChange={v => patch(d => { d.ent.email = v; })} />
            <Field editable={editable} label="អាសយដ្ឋាន" en="Address" value={form.ent.addr} onChange={v => patch(d => { d.ent.addr = v; })} />
            <Field editable={editable} label="និយាមកា (X, Y)" en="Coordinates" value={form.ent.geo} onChange={v => patch(d => { d.ent.geo = v; })} />
          </div>
        </Section>

        <Section tag="គ" title="ព័ត៌មានអាជីវកម្ម" en="Business information">
          <div className="max-w-sm"><Field editable={editable} label="ដើមទុន" en="Registered capital" value={form.biz.capital} onChange={v => patch(d => { d.biz.capital = v; })} /></div>
          <h4 className="mb-2 mt-4 text-[12.5px] font-black text-[#0B1A35]">សកម្មភាពអាជីវកម្ម</h4>
          <div className="grid gap-2 sm:grid-cols-3">
            {ACTS.map((a, i) => <Toggle editable={editable} key={a[0]} on={form.acts[i]} kh={a[0]} en={a[1]} onChange={v => patch(d => { d.acts[i] = v; })} />)}
          </div>
          <h4 className="mb-2 mt-4 text-[12.5px] font-black text-[#0B1A35]">ឧបករណ៍មាត្រាសាស្ត្រចម្បង</h4>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {INSTR.map((a, i) => (
              <Toggle editable={editable} key={a[0]} on={form.instr[i]} kh={`${kh(i + 1)}. ${a[0]}`} en={a[1]} onChange={v => patch(d => { d.instr[i] = v; })} />
            ))}
          </div>
          {form.instr[INSTR.length - 1] && (
            <div className="mt-3 max-w-lg">
              <Field editable={editable} label="សូមបញ្ជាក់ឧបករណ៍ផ្សេងទៀត" value={form.biz.other} onChange={v => patch(d => { d.biz.other = v; })} />
            </div>
          )}
          <div className="mt-4 border-t border-slate-200 pt-3">
            <h4 className="mb-2 text-[12.5px] font-black text-[#0B1A35]">
              បន្ថែមឧបករណ៍ក្រៅបញ្ជី <span className="font-bold uppercase tracking-wider text-slate-400">Not listed above</span>
            </h4>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {form.extra.map((e, i) => (
                <div key={i} className="flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <Toggle editable={editable} on={e.on} kh={`${kh(INSTR.length + i + 1)}. ${e.kh}`} en={e.en}
                      onChange={v => patch(d => { d.extra[i].on = v; })} />
                  </div>
                  <button type="button" disabled={!editable} onClick={() => patch(d => { d.extra.splice(i, 1); })}
                    className="mt-1 rounded-md bg-rose-50 p-1.5 text-rose-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <ExtraAdder disabled={!editable} onAdd={(khName, en) => patch(d => { d.extra.push({ kh: khName, en, on: true }); })} />
          </div>
        </Section>

        <Section tag="ឃ" title="ព័ត៌មានទីតាំងខ្សែច្រវ៉ាក់ផលិតកម្ម ឬរោងជាង ឬឃ្លាំង និង/ឬ មន្ទីរពិសោធន៍ផ្ទៃក្នុង" en="Sites & laboratories">
          <RowTable editable={editable} title="ទីតាំង" en="Sites" rows={form.loc} make={emptyLocRow}
            onChange={next => patch(d => { d.loc = next; })}
            cols={[{ k: 'site', kh: 'រោងចក្រ/រោងជាង/ឃ្លាំង/មន្ទីរពិសោធន៍', en: 'Factories / Warehouse / Laboratory' },
                   { k: 'addr', kh: 'អាសយដ្ឋាន', en: 'Address' },
                   { k: 'geo', kh: 'និយាមកា', en: 'Coordinates (X, Y)' }]} />
        </Section>

        <Section tag="ង" title="ព័ត៌មានបុគ្គលិកបច្ចេកទេស" en="Technical staff">
          <RowTable editable={editable} title="១. បុគ្គលិកបច្ចេកទេសគោល" en="Key technical staffs" rows={form.key} make={emptyStaffRow}
            onChange={next => patch(d => { d.key = next; })}
            cols={STAFF_COLS}
            foot={<tfoot><tr className="bg-amber-50 font-black">
              <td colSpan={3} className="border border-slate-200 p-2 text-right text-[12px]">សរុប (១)</td>
              {[kN, kA, kC].map((v, i) => <td key={i} className="border border-slate-200 p-2 text-center">{kh(v)}</td>)}
              <td className="border border-slate-200" /></tr></tfoot>} />
          <RowTable editable={editable} title="២. បុគ្គលិកបច្ចេកទេសគាំទ្រ" en="Supporting technical staffs" rows={form.sup} make={emptyStaffRow}
            onChange={next => patch(d => { d.sup = next; })}
            cols={STAFF_COLS}
            foot={<tfoot>
              <tr className="bg-amber-50 font-black">
                <td colSpan={3} className="border border-slate-200 p-2 text-right text-[12px]">សរុប (២)</td>
                {[sN, sA, sC].map((v, i) => <td key={i} className="border border-slate-200 p-2 text-center">{kh(v)}</td>)}
                <td className="border border-slate-200" /></tr>
              <tr className="bg-[#0B1A35] font-black text-white">
                <td colSpan={3} className="border border-slate-200 p-2 text-right text-[12px]">សរុបរួម (១) + (២)</td>
                {[kN + sN, kA + sA, kC + sC].map((v, i) => <td key={i} className="border border-slate-200 p-2 text-center">{kh(v)}</td>)}
                <td className="border border-slate-200" /></tr>
            </tfoot>} />
        </Section>

        <Section tag="ច" title="បញ្ជីប្រភេទឧបករណ៍មាត្រាសាស្ត្រស្នើសុំផលិត ដំឡើង ឬជួសជុល" en="Instrument types applied for">
          <RowTable editable={editable} title="ប្រភេទឧបករណ៍" en="Instrument types" rows={form.req} make={emptyReqRow}
            onChange={next => patch(d => { d.req = next; })}
            cols={[{ k: 'type', kh: 'ប្រភេទឧបករណ៍', en: 'Type' }, { k: 'model', kh: 'ម៉ូដែល', en: 'Model' },
                   { k: 'range', kh: 'វិសាលភាព', en: 'Range' }, { k: 'res', kh: 'កម្រិតអានតូចបំផុត', en: 'Resolution' },
                   { k: 'acc', kh: 'ថ្នាក់សុក្រឹតភាព', en: 'Accuracy' }, { k: 'spec', kh: 'បទដ្ឋាន/គំនូស', en: 'Spec & drawing' },
                   { k: 'type_cert', kh: 'អនុម័តគំរូ', en: 'Type approval' }, { k: 'oiml', kh: 'OIML-CS', en: 'OIML-CS' },
                   { k: 'mode', kh: 'បន្ថែម ឬដកចេញ', en: 'Add or remove', select: ['បន្ថែម (Add)', 'ដកចេញ (Remove)'] }]} />
        </Section>

        <Section tag="ឆ" title="បញ្ជីឧបករណ៍មាត្រាសាស្ត្រដែលត្រូវប្រើប្រាស់" en="Instruments in use">
          <RowTable editable={editable} title="ឧបករណ៍ប្រើប្រាស់" en="Instruments in use" rows={form.use} make={emptyUseRow}
            onChange={next => patch(d => { d.use = next; })}
            cols={[{ k: 'name', kh: 'ឈ្មោះឧបករណ៍', en: 'Name' }, { k: 'model', kh: 'ម៉ូដែល', en: 'Model' },
                   { k: 'serial', kh: 'លេខស៊េរី', en: 'Serial' }, { k: 'maker', kh: 'ផលិតករ', en: 'Manufacturer' },
                   { k: 'range', kh: 'វិសាលភាព', en: 'Range' }, { k: 'acc', kh: 'ថ្នាក់សុក្រឹតភាព', en: 'Accuracy' },
                   { k: 'cert', kh: 'លេខវិញ្ញាបនបត្រព្យាសកម្ម', en: 'Calibration cert.' },
                   { k: 'due', kh: 'កាលបរិច្ឆេទសុពលភាព', en: 'Due date' }, { k: 'place', kh: 'ទីកន្លែងព្យាសកម្ម', en: 'Location' }]} />
        </Section>

        <Section tag="ជ" title="បញ្ជីសំនុំឯកសារភ្ជាប់" en="Attached documents">
          {DOCS.map((doc, i) => (
            <div key={i} className="mb-2 rounded-xl border border-slate-200">
              <div className="flex gap-2 bg-slate-50 p-3">
                <b className="grid h-6 w-6 flex-none place-items-center rounded-md bg-[#0B1A35] text-[11px] text-[#E6C45A]">{kh(i + 1)}</b>
                <p className="min-w-0 text-[12.5px] font-semibold text-slate-700">{doc[0]}</p>
              </div>
              <div className="grid gap-2 p-3 sm:grid-cols-3">
                {doc[1].map((r, j) => (
                  <label key={j} className="flex cursor-pointer flex-col gap-1.5 rounded-lg border border-slate-200 p-2.5">
                    <span className="flex items-center gap-2 text-[12px] font-bold">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">{r[0]}</span>
                      <span className="text-[11px] font-medium text-slate-400">{r[1]}</span>
                    </span>
                    <span className="flex items-center gap-2 text-[11.5px] font-semibold">
                      <input type="checkbox" checked={form.docs[i][j].ok} disabled={!editable}
                        onChange={e => patch(d => { d.docs[i][j].ok = e.target.checked; })}
                        className="h-4 w-4 accent-emerald-600" />
                      បានផ្ទៀងផ្ទាត់
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section tag="៩" title="សេចក្ដីបញ្ចប់ កាលបរិច្ឆេទ និងហត្ថលេខា" en="Closing, date & signature">
          <div className="rounded-xl border border-[#C9A227] bg-amber-50 p-3.5">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">កាលបរិច្ឆេទបង្កើតដោយប្រព័ន្ធ · Generated by the system</div>
            <div className="mt-1.5 text-[14px] font-black">{made.lunar || '(មិនមានទិន្នន័យចន្ទគតិ)'}</div>
            <div className="text-[12.5px] text-slate-600">{made.gregorian}</div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field editable={editable} label="ធ្វើនៅ" en="Made at" value={form.close.place} onChange={v => patch(d => { d.close.place = v; })} />
            <Field editable={editable} label="ឈ្មោះអ្នកចុះហត្ថលេខា" required en="Signer" value={form.close.signer} onChange={v => patch(d => { d.close.signer = v; })} />
          </div>
        </Section>
      </div>

      {showPrint && <PrintSheet appNo={appNo} form={form} made={made} />}
    </div>
  );
}

/* ----------------------------------------------------------------------
 * Field, Toggle and RowTable live at module scope on purpose.
 *
 * Declared inside the screen they would be a new component type on every
 * render, so React would unmount and remount each input as it was typed in
 * and the caret would jump out of the box after a single character. A form
 * this long is unusable that way.
 * -------------------------------------------------------------------- */

function Field({ label, en, value, onChange, type = 'text', required, editable }: {
  label: string; en?: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; editable: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[12px] font-semibold text-slate-600">
        {label}{required && <span className="ml-0.5 font-black text-rose-500">*</span>}
        {en && <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{en}</span>}
      </span>
      <input type={type} value={value} disabled={!editable}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#C9A227] disabled:bg-slate-50 disabled:text-slate-500" />
    </label>
  );
}

function Toggle({ on, onChange, kh: khText, en, editable }: {
  // `key` is React's own and never reaches the component, but without
  // @types/react installed TypeScript checks it against these props like any
  // other attribute, so a Toggle inside a .map() fails to compile without it.
  key?: string | number;
  on: boolean; onChange: (v: boolean) => void; kh: string; en?: string; editable: boolean;
}) {
  return (
    <label className={'flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 '
      + (on ? 'border-[#C9A227] bg-amber-50' : 'border-slate-200 bg-white')
      + (editable ? '' : ' opacity-70')}>
      <input type="checkbox" checked={on} disabled={!editable}
        onChange={e => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0B1A35]" />
      <span className="min-w-0 text-[12.5px] font-semibold text-slate-700">
        {khText}{en && <span className="block text-[10.5px] font-medium text-slate-400">{en}</span>}
      </span>
    </label>
  );
}

/** One dynamic table, shared by sections ឃ, ង, ច and ឆ. */
function RowTable<T extends Record<string, string>>({ title, en, cols, rows: list, onChange, make, foot, editable }: {
  title: string; en: string;
  cols: Array<{ k: keyof T & string; kh: string; en: string; w?: string; num?: boolean; select?: string[] }>;
  rows: T[]; onChange: (next: T[]) => void; make: () => T; foot?: any; editable: boolean;
}) {
  return (
    <div className="mt-4">
      <h4 className="mb-2 text-[12.5px] font-black text-[#0B1A35]">
        {title} <span className="font-bold uppercase tracking-wider text-slate-400">{en}</span>
      </h4>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr>
              <th className="w-11 border border-slate-200 bg-slate-50 p-1.5 text-[11px]">ល.រ</th>
              {cols.map(c => (
                <th key={c.k} style={c.w ? { width: c.w } : undefined}
                  className="border border-slate-200 bg-slate-50 p-1.5 text-[11px] font-bold text-slate-600">
                  {c.kh}<span className="block text-[9.5px] font-semibold text-slate-400">{c.en}</span>
                </th>
              ))}
              <th className="w-11 border border-slate-200 bg-slate-50" />
            </tr>
          </thead>
          <tbody>
            {list.map((row, i) => (
              <tr key={i}>
                <td className="border border-slate-200 p-1.5 text-center text-[12px] font-bold text-slate-400">{kh(i + 1)}</td>
                {cols.map(c => (
                  <td key={c.k} className="border border-slate-200 p-1">
                    {c.select ? (
                      <select value={row[c.k]} disabled={!editable}
                        onChange={e => { const next = [...list]; (next[i] as any)[c.k] = e.target.value; onChange(next); }}
                        className="w-full rounded-md border border-transparent bg-transparent p-1.5 text-[12px] hover:border-slate-200 disabled:text-slate-500">
                        {c.select.map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={c.num ? 'number' : 'text'} value={row[c.k]} disabled={!editable}
                        onChange={e => { const next = [...list]; (next[i] as any)[c.k] = e.target.value; onChange(next); }}
                        className={'w-full rounded-md border border-transparent bg-transparent p-1.5 text-[12px] hover:border-slate-200 disabled:text-slate-500' + (c.num ? ' text-center' : '')} />
                    )}
                  </td>
                ))}
                <td className="border border-slate-200 p-1 text-center">
                  <button type="button" disabled={!editable}
                    onClick={() => onChange(list.filter((_, j) => j !== i))}
                    className="rounded-md bg-rose-50 p-1 text-rose-600 hover:bg-rose-100 disabled:opacity-40">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {foot}
        </table>
      </div>
      <button type="button" disabled={!editable} onClick={() => onChange([...list, make()])}
        className="mt-2 rounded-lg border border-dashed border-[#0B1A35] bg-slate-50 px-3 py-2 text-[12px] font-black text-[#0B1A35] hover:bg-slate-100 disabled:opacity-40">
        <Plus className="mr-1 inline h-3.5 w-3.5" />បន្ថែមជួរ
      </button>
    </div>
  );
}

const STAFF_COLS = [
  { k: 'staff' as const, kh: 'បុគ្គលិកបច្ចេកទេស', en: 'Technical Staffs' },
  { k: 'skill' as const, kh: 'ជំនាញពាក់ព័ន្ធ', en: 'Skill Related' },
  { k: 'n' as const, kh: 'ចំនួនបុគ្គលិក', en: 'Staffs', w: '96px', num: true },
  { k: 'add' as const, kh: 'បន្ថែម', en: 'Additional', w: '96px', num: true },
  { k: 'cut' as const, kh: 'បន្ថយ', en: 'Reduced', w: '96px', num: true },
];

function Section({ tag, title, en, children }: {
  tag: string; title: string; en: string; children: any;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <header className="flex items-start gap-2.5 border-b border-slate-100 p-3.5">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-[#0B1A35] text-[12px] font-black text-[#E6C45A]">{tag}</span>
        <h3 className="min-w-0 text-[14px] font-black text-[#0B1A35]">
          {title}<span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{en}</span>
        </h3>
      </header>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

function ExtraAdder({ disabled, onAdd }: { disabled: boolean; onAdd: (kh: string, en: string) => void }) {
  const [khName, setKh] = useState(''); const [en, setEn] = useState('');
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <input value={khName} onChange={e => setKh(e.target.value)} disabled={disabled}
        placeholder="ឈ្មោះឧបករណ៍ (ខ្មែរ)" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-2 text-[12.5px]" />
      <input value={en} onChange={e => setEn(e.target.value)} disabled={disabled}
        placeholder="Name in English" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-2 text-[12.5px]" />
      <button type="button" disabled={disabled || !khName.trim()}
        onClick={() => { onAdd(khName.trim(), en.trim()); setKh(''); setEn(''); }}
        className="rounded-lg border border-dashed border-[#0B1A35] bg-slate-50 px-3 py-2 text-[12px] font-black text-[#0B1A35] disabled:opacity-40">
        <Plus className="mr-1 inline h-3.5 w-3.5" />បន្ថែមឧបករណ៍
      </button>
    </div>
  );
}

/** The official sheet, shown only while printing. */
function PrintSheet({ appNo, form, made }: {
  appNo: string; form: Annex2Payload; made: { lunar: string; gregorian: string };
}) {
  const box = (on: boolean) => (on ? '☑' : '☐');
  const [kN, kA, kC] = staffTotals(form.key);
  const [sN, sA, sC] = staffTotals(form.sup);
  return (
    <div id="a2-print" className="hidden bg-white p-6 text-[11px] leading-relaxed text-black print:block">
      <div className="mb-3 border border-black p-2 text-[10px]"><b>លេខចូល ម.ម.ជ៖</b> {appNo}</div>
      <div className="mb-3 text-center">
        <div className="text-[14px] font-black">ព្រះរាជាណាចក្រកម្ពុជា</div>
        <div className="text-[12px] font-bold">ជាតិ សាសនា ព្រះមហាក្សត្រ</div>
        <div className="mt-3 text-[13px] font-black">ពាក្យស្នើសុំអាជ្ញាប័ណ្ណផលិត ដំឡើង និងជួសជុលឧបករណ៍មាត្រាសាស្ត្រ</div>
        <div className="mt-2 font-bold">សូមគោរពជូន<br />ឯកឧត្តមប្រធានមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</div>
      </div>
      {REQ_TYPES.map((t, i) => <div key={t}>{box(form.reqTypes[i])} {t}</div>)}
      <p className="mt-2"><b>កម្មវត្ថុ៖</b> {form.subject || '…'}</p>
      <p><b>យោង៖</b> ប្រកាសលេខ {form.ref.no || '…'} ចុះថ្ងៃទី {form.ref.day || '…'} ខែ {form.ref.month || '…'} ឆ្នាំ {form.ref.year || '…'}</p>

      <h4 className="mt-3 font-black">ក. ព័ត៌មានម្ចាស់សហគ្រាស ឬអ្នកតំណាងស្របច្បាប់</h4>
      <div>គោត្តនាម - នាម៖ {form.owner.kh} · {form.owner.lat} · ភេទ៖ {form.owner.sex} · ថ្ងៃកំណើត៖ {form.owner.dob}</div>
      <div>អត្តសញ្ញាណប័ណ្ណ៖ {form.owner.id} · អាសយដ្ឋាន៖ {form.owner.addr}</div>
      <div>តួនាទី៖ {form.owner.role} · {form.owner.pos}</div>

      <h4 className="mt-3 font-black">ខ. ព័ត៌មានសហគ្រាស</h4>
      <div>{form.ent.kh} · {form.ent.lat}</div>
      <div>ទូរសព្ទ៖ {form.ent.phone} · Email៖ {form.ent.email}</div>
      <div>អាសយដ្ឋាន៖ {form.ent.addr} · និយាមកា៖ {form.ent.geo}</div>

      <h4 className="mt-3 font-black">គ. ព័ត៌មានអាជីវកម្ម</h4>
      <div>ដើមទុន៖ {form.biz.capital}</div>
      {ACTS.map((a, i) => <div key={a[0]}>{box(form.acts[i])} {a[0]} | {a[1]}</div>)}
      <div className="mt-1 columns-2">
        {INSTR.map((a, i) => <div key={a[0]} className="break-inside-avoid">{box(form.instr[i])} {a[0]} | {a[1]}</div>)}
        {form.extra.map((e, i) => <div key={i} className="break-inside-avoid">{box(e.on)} {e.kh} {e.en && `| ${e.en}`}</div>)}
      </div>

      <h4 className="mt-3 font-black">ង. ព័ត៌មានបុគ្គលិកបច្ចេកទេស</h4>
      <div>សរុប (១)៖ {kh(kN)} / បន្ថែម {kh(kA)} / បន្ថយ {kh(kC)}</div>
      <div>សរុប (២)៖ {kh(sN)} / បន្ថែម {kh(sA)} / បន្ថយ {kh(sC)}</div>
      <div><b>សរុបរួម៖ {kh(kN + sN)} / បន្ថែម {kh(kA + sA)} / បន្ថយ {kh(kC + sC)}</b></div>

      <p className="mt-4">សេចក្ដីដូចបានគោរពជម្រាបជូនខាងលើ សូម ឯកឧត្តមប្រធាន មេត្តាពិនិត្យ និងសម្រេចតាមការស្នើសុំ ដោយក្ដីអនុគ្រោះ។</p>
      <div className="mt-4 text-right">
        {made.lunar && <div>{made.lunar}</div>}
        <div>ធ្វើនៅ {form.close.place} {made.gregorian}</div>
        <div className="mt-6 font-black">{form.close.signer}</div>
        <div className="text-[10px]">(ឈ្មោះ-ហត្ថលេខា-ត្រាសហគ្រាស)</div>
      </div>
    </div>
  );
}
