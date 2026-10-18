/**
 * Annex 8 — recording work as it happens.
 *
 * A licensee opens this several times a month and adds what they did: an
 * instrument manufactured or installed, a module fitted, a repair, a standard
 * used. Each entry is saved on its own, so two sessions on two devices add up
 * instead of overwriting each other.
 *
 * Mobile first, because much of this is typed on site: the lists are cards on
 * a phone and a table on a desktop, and the form asks for one entry at a time.
 *
 * The month an entry belongs to is decided by the SERVER from the entry's own
 * activity date — a job finished on 31 August and typed on 2 September is
 * August's. If that month is already submitted, the save is refused and the
 * licensee is offered an amendment.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CalendarDays, Check, Copy, Loader2, LocateFixed,
  Pencil, Plus, Search, Trash2, X,
} from 'lucide-react';

import { CATEGORIES, PROVINCES, UNITS } from '../annex8/constants';
import { khmerMonthLabel, toKhmerDigits } from '../annex8/summary';
import Annex8MonthReview from './Annex8MonthReview';
import { apiRequest } from '../supabaseSync';
import { MetrologyUser } from '../types';

type Part = 'instrument' | 'module' | 'repair' | 'standard';

const PARTS: Array<{ key: Part; kh: string; en: string; no: string }> = [
  { key: 'instrument', kh: 'ផលិត / ដំឡើង', en: 'Manufactured / installed', no: '៣' },
  { key: 'module', kh: 'ម៉ូឌុល', en: 'Modules / spare parts', no: '៣ក' },
  { key: 'repair', kh: 'ជួសជុល', en: 'Repairs', no: '៤' },
  { key: 'standard', kh: 'ឧបករណ៍ស្ដង់ដារ', en: 'Standards', no: '៥' },
];

/* ------------------------------------------------------------------ *
 * Field definitions — what each entry form asks for
 * ------------------------------------------------------------------ */

type FieldType = 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox' | 'gps';

interface Field {
  name: string;
  kh: string;
  en: string;
  type?: FieldType;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  /** Only shown when this returns true, e.g. the seal fields on a repair. */
  when?: (values: Record<string, any>) => boolean;
  /** Full width on desktop too. */
  wide?: boolean;
  hint?: string;
}

const categoryOptions = Object.entries(CATEGORIES).map(([value, label]: [string, any]) => ({
  value, label: `${label.kh} / ${label.en}`,
}));
const provinceOptions = PROVINCES.map((p) => ({ value: p, label: p }));
const unitOptions = UNITS.map((u) => ({ value: u, label: u }));
const VERIFICATION_OPTIONS = [
  { value: 'PENDING', label: 'រង់ចាំ / Pending' },
  { value: 'PASSED', label: 'ជាប់ / Passed' },
  { value: 'FAILED', label: 'ធ្លាក់ / Failed' },
];

const VERIFICATION_FIELDS: Field[] = [
  { name: 'verification_status', kh: 'លទ្ធផលផ្ទៀងផ្ទាត់', en: 'Verification result', type: 'select', options: VERIFICATION_OPTIONS },
  { name: 'verification_cert_no', kh: 'លេខវិញ្ញាបនបត្រ', en: 'Certificate no.', when: (v) => v.verification_status === 'PASSED' || v.verification_status === 'FAILED' },
  { name: 'verification_date', kh: 'កាលបរិច្ឆេទផ្ទៀងផ្ទាត់', en: 'Verification date', type: 'date', when: (v) => v.verification_status === 'PASSED' || v.verification_status === 'FAILED' },
];

const FIELDS: Record<Part, Field[]> = {
  instrument: [
    { name: 'op_code', kh: 'ប្រភេទសេវាកម្ម', en: 'Operation', type: 'select', required: true,
      options: [{ value: 'M', label: 'ផលិត / Manufacture' }, { value: 'I', label: 'ដំឡើង / Install' }] },
    { name: 'category', kh: 'ប្រភេទឧបករណ៍', en: 'Category', type: 'select', required: true, options: categoryOptions },
    { name: 'category_other', kh: 'បញ្ជាក់ប្រភេទផ្សេង', en: 'Other category', when: (v) => v.category === 'OTHER' },
    { name: 'instrument_name', kh: 'ឈ្មោះឧបករណ៍', en: 'Instrument name', required: true },
    { name: 'model', kh: 'ម៉ូដែល', en: 'Model' },
    { name: 'serial_no', kh: 'លេខស៊េរី', en: 'Serial no.', required: true },
    { name: 'manufacturer', kh: 'ក្រុមហ៊ុនផលិត', en: 'Manufacturer' },
    { name: 'country', kh: 'ប្រទេស', en: 'Country' },
    { name: 'max_capacity', kh: 'Max', en: 'Max' },
    { name: 'min_capacity', kh: 'Min', en: 'Min' },
    { name: 'e_value', kh: 'e (ចន្លោះផ្ទៀងផ្ទាត់)', en: 'e (verification scale interval)', hint: 'មិនមែន d' },
    { name: 'unit', kh: 'ឯកតា', en: 'Unit', type: 'select', options: unitOptions },
    { name: 'accuracy_class', kh: 'ថ្នាក់ភាពត្រឹមត្រូវ', en: 'Accuracy class' },
    { name: 'type_approval_no', kh: 'លេខអនុម័តគំរូ', en: 'Type approval no.' },
    { name: 'completion_date', kh: 'កាលបរិច្ឆេទបញ្ចប់', en: 'Completion date', type: 'date', required: true,
      hint: 'កំណត់ខែរបាយការណ៍ / decides the report month' },
    { name: 'customer_name', kh: 'ឈ្មោះអតិថិជន', en: 'Customer' },
    { name: 'province', kh: 'រាជធានី/ខេត្ត', en: 'Province', type: 'select', options: provinceOptions },
    { name: 'address', kh: 'អាសយដ្ឋាន', en: 'Address', wide: true },
    { name: '__gps', kh: 'ទីតាំង GPS', en: 'GPS location', type: 'gps', wide: true },
    { name: 'label_qr_no', kh: 'លេខស្លាក / QR', en: 'Label / QR no.' },
    ...VERIFICATION_FIELDS,
  ],

  module: [
    { name: 'host_serial_no', kh: 'លេខស៊េរីឧបករណ៍មេ', en: 'Host serial no.', required: true,
      hint: 'ត្រូវមានក្នុងផ្នែក៣ ឬ៤ / must exist in Part 3 or 4' },
    { name: 'host_part', kh: 'ឧបករណ៍មេនៅផ្នែក', en: 'Host part', type: 'select',
      options: [{ value: 'P3', label: 'ផ្នែក៣ ផលិត/ដំឡើង' }, { value: 'P4', label: 'ផ្នែក៤ ជួសជុល' }] },
    { name: 'module_name', kh: 'ឈ្មោះម៉ូឌុល', en: 'Module name', required: true },
    { name: 'model', kh: 'ម៉ូដែល', en: 'Model' },
    { name: 'serial_no', kh: 'លេខស៊េរី', en: 'Serial no.' },
    { name: 'range_e', kh: 'វិសាលភាព / e', en: 'Range / e' },
    { name: 'manufacturer', kh: 'ក្រុមហ៊ុនផលិត', en: 'Manufacturer' },
    { name: 'country', kh: 'ប្រទេស', en: 'Country' },
    { name: 'cert_no', kh: 'លេខវិញ្ញាបនបត្រ', en: 'Certificate no.' },
    { name: 'new_or_replacement', kh: 'ថ្មី ឬជំនួស', en: 'New or replacement', type: 'select',
      options: [{ value: 'NEW', label: 'ថ្មី / New' }, { value: 'REPLACEMENT', label: 'ជំនួស / Replacement' }] },
  ],

  repair: [
    { name: 'category', kh: 'ប្រភេទឧបករណ៍', en: 'Category', type: 'select', required: true, options: categoryOptions },
    { name: 'instrument_name', kh: 'ឈ្មោះឧបករណ៍', en: 'Instrument name', required: true },
    { name: 'model', kh: 'ម៉ូដែល', en: 'Model' },
    { name: 'serial_no', kh: 'លេខស៊េរី', en: 'Serial no.', required: true },
    { name: 'customer_name', kh: 'ឈ្មោះអតិថិជន', en: 'Customer' },
    { name: 'province', kh: 'រាជធានី/ខេត្ត', en: 'Province', type: 'select', options: provinceOptions },
    { name: 'address', kh: 'អាសយដ្ឋាន', en: 'Address', wide: true },
    { name: '__gps', kh: 'ទីតាំង GPS', en: 'GPS location', type: 'gps', wide: true },
    { name: 'repair_from', kh: 'ចាប់ផ្ដើម', en: 'Repair from', type: 'date' },
    { name: 'repair_to', kh: 'បញ្ចប់', en: 'Repair to', type: 'date', required: true,
      hint: 'កំណត់ខែរបាយការណ៍ / decides the report month' },
    { name: 'repair_description', kh: 'ការពិពណ៌នាការជួសជុល', en: 'What was repaired', type: 'textarea', wide: true },
    { name: 'technician', kh: 'ជាងបច្ចេកទេស', en: 'Technician' },
    { name: 'seal_broken', kh: 'បានបើកត្រា', en: 'Seal was broken', type: 'checkbox', wide: true },
    { name: 'seal_removed_no', kh: 'លេខត្រាដែលបានដោះ', en: 'Seal removed no.', when: (v) => !!v.seal_broken },
    { name: 'notification_no', kh: 'លេខជូនដំណឹង (ឧ.ទី១០)', en: 'Annex 10 notification no.',
      when: (v) => !!v.seal_broken, hint: 'ប្រការ២៥ តម្រូវ / required by Art. 25' },
    ...VERIFICATION_FIELDS,
  ],

  standard: [
    { name: 'equipment', kh: 'ឧបករណ៍ស្ដង់ដារ', en: 'Equipment', required: true },
    { name: 'serial_no', kh: 'លេខស៊េរី', en: 'Serial no.' },
    { name: 'class_range', kh: 'ថ្នាក់ / វិសាលភាព', en: 'Class / range' },
    { name: 'cal_cert_no', kh: 'លេខវិញ្ញាបនបត្រក្រិតតាង', en: 'Calibration certificate no.' },
    { name: 'lab', kh: 'មន្ទីរពិសោធន៍', en: 'Laboratory' },
    { name: 'cal_date', kh: 'កាលបរិច្ឆេទក្រិតតាង', en: 'Calibration date', type: 'date' },
    { name: 'due_date', kh: 'ផុតកំណត់', en: 'Due date', type: 'date' },
    { name: 'status', kh: 'ស្ថានភាព', en: 'Status', type: 'select',
      options: [
        { value: 'VALID', label: 'មានសុពលភាព / Valid' },
        { value: 'EXPIRED', label: 'ផុតកំណត់ / Expired' },
        { value: 'OUT_OF_SERVICE', label: 'ឈប់ប្រើ / Out of service' },
      ] },
  ],
};

/** The columns each list shows, and how to read them off a row. */
const LIST_COLUMNS: Record<Part, Array<{ kh: string; get: (r: any) => string }>> = {
  instrument: [
    { kh: 'ឈ្មោះឧបករណ៍', get: (r) => r.instrument_name },
    { kh: 'លេខស៊េរី', get: (r) => r.serial_no },
    { kh: 'អតិថិជន', get: (r) => r.customer_name },
    { kh: 'កាលបរិច្ឆេទ', get: (r) => r.completion_date },
  ],
  module: [
    { kh: 'ម៉ូឌុល', get: (r) => r.module_name },
    { kh: 'លេខស៊េរី', get: (r) => r.serial_no },
    { kh: 'ឧបករណ៍មេ', get: (r) => r.host_serial_no },
    { kh: 'ថ្មី/ជំនួស', get: (r) => (r.new_or_replacement === 'REPLACEMENT' ? 'ជំនួស' : 'ថ្មី') },
  ],
  repair: [
    { kh: 'ឈ្មោះឧបករណ៍', get: (r) => r.instrument_name },
    { kh: 'លេខស៊េរី', get: (r) => r.serial_no },
    { kh: 'អតិថិជន', get: (r) => r.customer_name },
    { kh: 'បញ្ចប់', get: (r) => r.repair_to },
  ],
  standard: [
    { kh: 'ឧបករណ៍', get: (r) => r.equipment },
    { kh: 'លេខស៊េរី', get: (r) => r.serial_no },
    { kh: 'មន្ទីរពិសោធន៍', get: (r) => r.lab },
    { kh: 'ផុតកំណត់', get: (r) => r.due_date },
  ],
};

const VERIFICATION_BADGE: Record<string, { kh: string; cls: string }> = {
  PASSED: { kh: 'ជាប់', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  FAILED: { kh: 'ធ្លាក់', cls: 'bg-red-50 text-red-700 border-red-200' },
  PENDING: { kh: 'រង់ចាំ', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const kh = (n: number | string) => toKhmerDigits(String(n));
const dash = (v: unknown) => (String(v ?? '').trim() === '' ? '—' : String(v));

/** The last 13 months that can be reported on, newest first. */
function recentPeriods(count = 13): string[] {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);   // Phnom Penh
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** Whole days left until the 7th of the month after `period`, Phnom Penh. */
function daysToDeadline(period: string): number {
  const [y, m] = period.split('-').map(Number);
  const deadline = Date.UTC(y, m, 7, 23, 59, 59) - 7 * 60 * 60 * 1000;
  return Math.ceil((deadline - Date.now()) / 86400000);
}

interface Props {
  currentUser: MetrologyUser;
  toastMsg: (message: string, type: 'success' | 'error') => void;
}

export default function Annex8MonthWorkspace({ currentUser, toastMsg }: Props) {
  const licenceNo = String(currentUser.license_number || '').trim();
  const periods = useMemo(() => recentPeriods(), []);
  const [period, setPeriod] = useState(periods[0]);
  const [part, setPart] = useState<Part>('instrument');
  /** The four entry parts, or the month-end check. */
  const [view, setView] = useState<'entries' | 'review'>('entries');

  const [report, setReport] = useState<any>(null);
  const [entries, setEntries] = useState<Record<string, any[]>>({
    instruments: [], modules: [], repairs: [], standards: [],
  });
  const [totals, setTotals] = useState<any>(null);
  const [editable, setEditable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ kh: string; detail: string } | null>(null);
  const [closedMonth, setClosedMonth] = useState<{ period: string; report_id: string | null } | null>(null);

  const [form, setForm] = useState<{ part: Part; values: Record<string, any>; id: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [undo, setUndo] = useState<{ part: Part; id: string } | null>(null);
  const undoTimer = useRef<number | null>(null);

  const listKey: Record<Part, string> = {
    instrument: 'instruments', module: 'modules', repair: 'repairs', standard: 'standards',
  };

  /* ------------------------------ loading ------------------------------ */

  const loadMonth = useCallback(async (target: string, create = true) => {
    if (!licenceNo) {
      setError({ kh: 'គណនីនេះមិនមានលេខអាជ្ញាប័ណ្ណទេ', detail: 'No license_number on this account.' });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setClosedMonth(null);
    try {
      const data = await apiRequest<any>(
        `/api/annex8/month?licence_no=${encodeURIComponent(licenceNo)}&period=${target}&create=${create ? 1 : 0}`,
      );
      setReport(data.report);
      setEntries(data.entries || { instruments: [], modules: [], repairs: [], standards: [] });
      setTotals(data.totals);
      setEditable(!!data.editable);
    } catch (err: any) {
      setError({ kh: 'មិនអាចបើកខែនេះបានទេ', detail: err?.message || String(err) });
    } finally {
      setLoading(false);
    }
  }, [licenceNo]);

  useEffect(() => { void loadMonth(period); }, [period, loadMonth]);
  useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); }, []);

  const rows: any[] = entries[listKey[part]] || [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).some((v) =>
      String(v ?? '').toLowerCase().includes(q)));
  }, [rows, query]);

  /* ------------------------------ actions ------------------------------ */

  const openForm = (target: Part, values: Record<string, any> = {}, id: string | null = null) => {
    const defaults: Record<string, any> = { ...values };
    if (FIELDS[target].some((f) => f.name === 'verification_status') && !defaults.verification_status) {
      defaults.verification_status = 'PENDING';
    }
    if (target === 'module' && !defaults.host_part) defaults.host_part = 'P3';
    if (target === 'module' && !defaults.new_or_replacement) defaults.new_or_replacement = 'NEW';
    if (target === 'standard' && !defaults.status) defaults.status = 'VALID';
    setForm({ part: target, values: defaults, id });
  };

  const applyResult = (data: any) => {
    if (data.totals) setTotals(data.totals);
    void loadMonth(period);
  };

  const saveEntry = async (addAnother: boolean) => {
    if (!form) return;
    setSaving(true);
    try {
      const { __gps, ...values } = form.values;
      if (form.id) {
        await apiRequest(`/api/annex8/entries/${form.part}/${encodeURIComponent(form.id)}`, {
          method: 'PUT', body: { entry: values },
        });
        toastMsg('បានរក្សាទុកការកែប្រែ', 'success');
      } else {
        const data = await apiRequest<any>('/api/annex8/entries', {
          method: 'POST', body: { licence_no: licenceNo, part: form.part, entry: values, period },
        });
        if (data.period_month && data.period_month !== period) {
          toastMsg(`បានរក្សាទុកក្នុងខែ ${khmerMonthLabel(data.period_month)}`, 'success');
        } else {
          toastMsg('បានរក្សាទុក', 'success');
        }
      }
      if (addAnother && !form.id) {
        // Keep the shared details, clear what identifies one unit.
        const next = { ...form.values };
        ['serial_no', 'label_qr_no', 'verification_cert_no', 'verification_date', 'cert_no'].forEach((f) => {
          if (f in next) next[f] = '';
        });
        setForm({ part: form.part, values: next, id: null });
      } else {
        setForm(null);
      }
      applyResult({});
    } catch (err: any) {
      const message = String(err?.message || err);
      if (message.includes('MONTH_CLOSED') || message.includes('already been submitted')) {
        setClosedMonth({ period, report_id: null });
      }
      toastMsg(`មិនអាចរក្សាទុកបានទេ / ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const duplicateEntry = async (row: any) => {
    try {
      const data = await apiRequest<any>(`/api/annex8/entries/${part}/${encodeURIComponent(row.id)}/duplicate`);
      openForm(part, data.values || {}, null);
      toastMsg('បានចម្លង — សូមបំពេញលេខស៊េរីថ្មី', 'success');
    } catch (err: any) {
      toastMsg(`មិនអាចចម្លងបានទេ / ${err?.message || err}`, 'error');
    }
  };

  const deleteEntry = async (row: any) => {
    const label = LIST_COLUMNS[part][0].get(row) || row.serial_no || '';
    if (!window.confirm(`លុបធាតុនេះ?\n${label}\n\nអ្នកអាចត្រឡប់វិញបានក្នុងរយៈពេល ១០ វិនាទី។`)) return;
    try {
      await apiRequest(`/api/annex8/entries/${part}/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
      setUndo({ part, id: row.id });
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setUndo(null), 10_000);
      void loadMonth(period);
    } catch (err: any) {
      toastMsg(`មិនអាចលុបបានទេ / ${err?.message || err}`, 'error');
    }
  };

  const undoDelete = async () => {
    if (!undo) return;
    try {
      await apiRequest(`/api/annex8/entries/${undo.part}/${encodeURIComponent(undo.id)}/undelete`, { method: 'POST' });
      toastMsg('បានត្រឡប់វិញ', 'success');
      setUndo(null);
      void loadMonth(period);
    } catch (err: any) {
      toastMsg(`មិនអាចត្រឡប់វិញបានទេ / ${err?.message || err}`, 'error');
    }
  };

  const captureGps = () => {
    if (!navigator.geolocation) return toastMsg('ឧបករណ៍នេះមិនស្គាល់ទីតាំង GPS ទេ', 'error');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setForm((f) => f && ({
        ...f,
        values: { ...f.values, latitude: coords.latitude.toFixed(6), longitude: coords.longitude.toFixed(6) },
      })),
      () => toastMsg('មិនអាចចាប់យកទីតាំងបានទេ', 'error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  /* ------------------------------- render ------------------------------ */

  const total = totals?.total || {};
  const daysLeft = daysToDeadline(period);
  const statusTone = !report ? 'bg-slate-100 text-slate-600'
    : report.status === 'OPEN' || report.status === 'DRAFT' ? 'bg-[#C9A227]/20 text-[#8a6f14]'
      : report.status === 'RETURNED' ? 'bg-red-50 text-red-700'
        : 'bg-emerald-50 text-emerald-700';
  const statusLabel = !report ? 'មិនទាន់ចាប់ផ្ដើម'
    : report.status === 'OPEN' || report.status === 'DRAFT' ? 'កំពុងបំពេញ'
      : report.status === 'RETURNED' ? 'ត្រឡប់មកវិញ'
        : report.status === 'ACCEPTED' ? 'ទទួលយក' : 'បានដាក់ជូន';

  const input = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[12px] text-slate-700 focus:border-[#C9A227] focus:outline-none focus:ring-1 focus:ring-[#C9A227]';

  return (
    <div className="space-y-4">

      {/* Month, status, deadline */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-[#C9A227]" />
            <select
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[13px] font-black text-[#0B1A35] focus:outline-none focus:ring-1 focus:ring-[#C9A227]"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              {periods.map((p) => <option key={p} value={p}>{khmerMonthLabel(p)}</option>)}
            </select>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${statusTone}`}>{statusLabel}</span>
          </div>

          <div className="text-[11px] font-bold text-slate-500">
            {report && (report.status === 'OPEN' || report.status === 'DRAFT' || report.status === 'RETURNED') ? (
              daysLeft >= 0
                ? <>នៅសល់ <strong className={daysLeft <= 3 ? 'text-red-600' : 'text-[#0B1A35]'}>{kh(daysLeft)}</strong> ថ្ងៃ មុនថ្ងៃទី៧</>
                : <span className="text-red-600">ហួសកំណត់ {kh(Math.abs(daysLeft))} ថ្ងៃ (ប្រការ២១)</span>
            ) : report?.report_id ? <>លេខរបាយការណ៍ <strong>{report.report_id}</strong></> : null}
          </div>
        </div>

        {/* Counts */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { v: total.manufactured ?? 0, l: 'ផលិត', c: 'text-sky-700' },
            { v: total.installed ?? 0, l: 'ដំឡើង', c: 'text-indigo-700' },
            { v: total.repaired ?? 0, l: 'ជួសជុល', c: 'text-amber-700' },
            { v: total.pending ?? 0, l: 'រង់ចាំផ្ទៀងផ្ទាត់', c: 'text-slate-600' },
          ].map((card) => (
            <div key={card.l} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-center">
              <div className={`text-[18px] font-black ${card.c}`}>{kh(card.v)}</div>
              <div className="text-[10px] font-bold text-slate-500">{card.l}</div>
            </div>
          ))}
        </div>

        {/* Add buttons */}
        {editable && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {PARTS.map((p) => (
              <button key={p.key} type="button"
                onClick={() => { setPart(p.key); openForm(p.key); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1A35] px-3 py-2 text-[11px] font-black text-white hover:bg-[#15284d]">
                <Plus className="h-3.5 w-3.5" /> បន្ថែម{p.kh}
              </button>
            ))}
          </div>
        )}
      </div>

      {closedMonth && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] font-bold text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            របាយការណ៍ខែ {khmerMonthLabel(closedMonth.period)} ត្រូវបានដាក់ជូនរួចហើយ។
            <span className="block font-semibold text-amber-700">
              To change it, request an amendment from the submitted report.
            </span>
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] font-bold text-red-800">
          {error.kh}
          <span className="mt-1 block break-all font-mono text-[10px] font-semibold text-red-600">{error.detail}</span>
        </div>
      )}

      {/* Part tabs + list */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1">
            {PARTS.map((p) => {
              const count = (entries[listKey[p.key]] || []).length;
              const active = view === 'entries' && part === p.key;
              return (
                <button key={p.key} type="button"
                  onClick={() => { setView('entries'); setPart(p.key); setQuery(''); }}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-black transition-colors ${
                    active ? 'bg-[#0B1A35] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>
                  ផ្នែក{p.no} {p.kh}
                  <span className={`ml-1 ${active ? 'text-[#E6C45A]' : 'text-slate-400'}`}>{kh(count)}</span>
                </button>
              );
            })}
            {report && (
              <button type="button" onClick={() => setView('review')}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-black transition-colors ${
                  view === 'review' ? 'bg-[#C9A227] text-[#0B1A35]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                ពិនិត្យ និងដាក់ជូន
              </button>
            )}
          </div>

          <div className={`relative w-full sm:max-w-xs ${view === 'review' ? 'hidden' : ''}`}>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-[11px] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0B1A35]"
              placeholder="ស្វែងរក លេខស៊េរី / QR / អតិថិជន"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        {view === 'review' && report ? (
          <div className="p-3">
            <Annex8MonthReview
              reportUuid={report.id}
              toastMsg={toastMsg}
              onSubmitted={() => void loadMonth(period)}
              onFixIssue={(issue) => {
                // Issue paths look like "instruments.2.serial_no"; the first
                // segment names the list the offending entry lives in.
                const list = String(issue.path || '').split('.')[0];
                const target: Part | null =
                  list === 'instruments' ? 'instrument'
                    : list === 'modules' ? 'module'
                      : list === 'repairs' ? 'repair'
                        : list === 'standards' ? 'standard' : null;
                setView('entries');
                if (target) {
                  setPart(target);
                  const index = Number(String(issue.path).split('.')[1]);
                  const row = (entries[listKey[target]] || [])[index];
                  if (row) openForm(target, row, row.id);
                }
              }}
            />
          </div>
        ) : loading ? (
          <div className="p-10 text-center text-slate-400"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : !filtered.length ? (
          <div className="p-10 text-center text-slate-400">
            <span className="block text-xs font-bold">មិនទាន់មានធាតុទេ</span>
            <span className="text-[10px]">Nothing recorded for this part yet.</span>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-left text-xs sm:table">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                  <th className="p-3 text-center w-12">ល.រ</th>
                  {LIST_COLUMNS[part].map((c) => <th key={c.kh} className="p-3">{c.kh}</th>)}
                  {part !== 'module' && part !== 'standard' && <th className="p-3 text-center">លទ្ធផល</th>}
                  <th className="p-3 text-center w-32">សកម្មភាព</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="p-3 text-center font-mono text-slate-400">{kh(r.row_no)}</td>
                    {LIST_COLUMNS[part].map((c, idx) => (
                      <td key={c.kh} className={`p-3 ${idx === 0 ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
                        {dash(c.get(r))}
                      </td>
                    ))}
                    {part !== 'module' && part !== 'standard' && (
                      <td className="p-3 text-center">
                        {(() => {
                          const b = VERIFICATION_BADGE[r.verification_status] || VERIFICATION_BADGE.PENDING;
                          return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${b.cls}`}>{b.kh}</span>;
                        })()}
                      </td>
                    )}
                    <td className="p-3">
                      <RowActions editable={editable}
                        onEdit={() => openForm(part, r, r.id)}
                        onDuplicate={() => void duplicateEntry(r)}
                        onDelete={() => void deleteEntry(r)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="divide-y divide-slate-100 sm:hidden">
              {filtered.map((r) => (
                <div key={r.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-black text-slate-800">
                        {kh(r.row_no)}. {dash(LIST_COLUMNS[part][0].get(r))}
                      </div>
                      {LIST_COLUMNS[part].slice(1).map((c) => (
                        <div key={c.kh} className="truncate text-[10px] text-slate-500">
                          {c.kh}: <span className="text-slate-700">{dash(c.get(r))}</span>
                        </div>
                      ))}
                    </div>
                    {part !== 'module' && part !== 'standard' && (() => {
                      const b = VERIFICATION_BADGE[r.verification_status] || VERIFICATION_BADGE.PENDING;
                      return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${b.cls}`}>{b.kh}</span>;
                    })()}
                  </div>
                  <div className="mt-2">
                    <RowActions editable={editable}
                      onEdit={() => openForm(part, r, r.id)}
                      onDuplicate={() => void duplicateEntry(r)}
                      onDelete={() => void deleteEntry(r)} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Undo */}
      {undo && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-[#0B1A35] px-4 py-2.5 text-[12px] font-bold text-white shadow-lg">
          បានលុបធាតុ
          <button type="button" onClick={() => void undoDelete()}
            className="rounded-lg bg-[#C9A227] px-3 py-1 text-[11px] font-black text-[#0B1A35] hover:bg-[#E6C45A]">
            ត្រឡប់វិញ / Undo
          </button>
          <button type="button" onClick={() => setUndo(null)} className="text-white/60 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Entry form */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white sm:max-w-3xl sm:rounded-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-[#0B1A35] px-4 py-3 text-white">
              <div>
                <h4 className="text-[13px] font-black">
                  {form.id ? 'កែប្រែ' : 'បន្ថែម'}{PARTS.find((p) => p.key === form.part)?.kh}
                </h4>
                <p className="text-[10px] text-slate-300">{PARTS.find((p) => p.key === form.part)?.en}</p>
              </div>
              <button type="button" onClick={() => setForm(null)} className="text-white/70 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              {FIELDS[form.part].filter((f) => !f.when || f.when(form.values)).map((f) => (
                <div key={f.name} className={f.wide || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                  <label className="mb-1 block text-[11px] font-black text-slate-600" htmlFor={`a8-${f.name}`}>
                    {f.kh} {f.required && <span className="text-red-500">*</span>}
                    <span className="ml-1 font-bold text-slate-400">{f.en}</span>
                  </label>

                  {f.type === 'gps' ? (
                    <div className="flex items-center gap-2">
                      <input className={input} readOnly placeholder="latitude, longitude"
                        value={[form.values.latitude, form.values.longitude].filter(Boolean).join(', ')} />
                      <button type="button" onClick={captureGps}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-2 text-[11px] font-black text-slate-600 hover:bg-slate-50">
                        <LocateFixed className="h-4 w-4" /> GPS
                      </button>
                    </div>
                  ) : f.type === 'checkbox' ? (
                    <label className="flex items-center gap-2 text-[12px] font-bold text-slate-700">
                      <input id={`a8-${f.name}`} type="checkbox" className="h-4 w-4"
                        checked={!!form.values[f.name]}
                        onChange={(e) => setForm({ ...form, values: { ...form.values, [f.name]: e.target.checked } })} />
                      {f.en}
                    </label>
                  ) : f.type === 'select' ? (
                    <select id={`a8-${f.name}`} className={input} value={form.values[f.name] ?? ''}
                      onChange={(e) => setForm({ ...form, values: { ...form.values, [f.name]: e.target.value } })}>
                      <option value="">— ជ្រើសរើស —</option>
                      {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea id={`a8-${f.name}`} className={`${input} min-h-[72px]`} value={form.values[f.name] ?? ''}
                      onChange={(e) => setForm({ ...form, values: { ...form.values, [f.name]: e.target.value } })} />
                  ) : (
                    <input id={`a8-${f.name}`} type={f.type === 'date' ? 'date' : 'text'} className={input}
                      value={form.values[f.name] ?? ''}
                      onChange={(e) => setForm({ ...form, values: { ...form.values, [f.name]: e.target.value } })} />
                  )}

                  {f.hint && <p className="mt-0.5 text-[10px] text-slate-400">{f.hint}</p>}
                </div>
              ))}
            </div>

            <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
              <button type="button" onClick={() => setForm(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-[11px] font-black text-slate-600 hover:bg-slate-50">
                បោះបង់
              </button>
              {!form.id && (
                <button type="button" disabled={saving} onClick={() => void saveEntry(true)}
                  className="rounded-lg border border-[#0B1A35] px-3 py-2 text-[11px] font-black text-[#0B1A35] hover:bg-slate-50 disabled:opacity-50">
                  រក្សាទុក និងបន្ថែមទៀត
                </button>
              )}
              <button type="button" disabled={saving} onClick={() => void saveEntry(false)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9A227] px-4 py-2 text-[11px] font-black text-[#0B1A35] hover:bg-[#E6C45A] disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} រក្សាទុក
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RowActions({ editable, onEdit, onDuplicate, onDelete }: {
  editable: boolean; onEdit: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const base = 'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-black transition-colors';
  if (!editable) return <span className="text-[10px] text-slate-400">អានតែប៉ុណ្ណោះ</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" onClick={onEdit}
        className={`${base} border-slate-300 text-slate-600 hover:bg-slate-50`}>
        <Pencil className="h-3 w-3" /> កែ
      </button>
      <button type="button" onClick={onDuplicate}
        className={`${base} border-slate-300 text-slate-600 hover:bg-slate-50`}>
        <Copy className="h-3 w-3" /> ចម្លង
      </button>
      <button type="button" onClick={onDelete}
        className={`${base} border-red-200 text-red-600 hover:bg-red-50`}>
        <Trash2 className="h-3 w-3" /> លុប
      </button>
    </div>
  );
}
