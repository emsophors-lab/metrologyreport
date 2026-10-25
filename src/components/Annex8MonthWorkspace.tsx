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
  AlertTriangle, CalendarDays, Check, CheckCircle2, Clock, Copy, FileText,
  Layers, Loader2, LocateFixed, MapPin, Pencil, Plus, RotateCcw, Search, ShieldCheck,
  Sliders, Trash2, Wrench, X, XCircle,
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


interface FormSection {
  id: string;
  kh: string;
  en: string;
  icon: 'identity' | 'specs' | 'location' | 'verification' | 'repair' | 'standards' | 'host';
  fieldNames: string[];
}

const PART_SECTIONS: Record<Part, FormSection[]> = {
  instrument: [
    {
      id: 'identity',
      kh: '១. អត្តសញ្ញាណឧបករណ៍ និងប្រតិបត្តិការ',
      en: 'Instrument & Operation Identity',
      icon: 'identity',
      fieldNames: [
        'op_code', 'category', 'category_other', 'instrument_name',
        'model', 'serial_no', 'type_approval_no', 'manufacturer',
        'country', 'completion_date'
      ],
    },
    {
      id: 'specs',
      kh: '២. លក្ខណៈបច្ចេកទេស និងកម្រិតរង្វាស់',
      en: 'Technical Specifications & Scale',
      icon: 'specs',
      fieldNames: ['max_capacity', 'min_capacity', 'e_value', 'unit', 'accuracy_class'],
    },
    {
      id: 'location',
      kh: '៣. អតិថិជន និងទីតាំងដំឡើង',
      en: 'Customer & Installation Site',
      icon: 'location',
      fieldNames: ['customer_name', 'province', 'address', '__gps'],
    },
    {
      id: 'verification',
      kh: '៤. លទ្ធផលផ្ទៀងផ្ទាត់ និងការបិទស្លាក',
      en: 'Verification Result & Labeling',
      icon: 'verification',
      fieldNames: ['label_qr_no', 'verification_status', 'verification_cert_no', 'verification_date'],
    },
  ],
  module: [
    {
      id: 'host',
      kh: '១. ឧបករណ៍មេ (Host Instrument)',
      en: 'Host Instrument Association',
      icon: 'host',
      fieldNames: ['host_serial_no', 'host_part'],
    },
    {
      id: 'specs',
      kh: '២. ព័ត៌មានម៉ូឌុល / គ្រឿងបន្លាស់',
      en: 'Module & Component Specifications',
      icon: 'specs',
      fieldNames: ['module_name', 'model', 'serial_no', 'range_e', 'manufacturer', 'country', 'cert_no', 'new_or_replacement'],
    },
  ],
  repair: [
    {
      id: 'identity',
      kh: '១. ព័ត៌មានឧបករណ៍ដែលត្រូវជួសជុល',
      en: 'Instrument Under Repair',
      icon: 'identity',
      fieldNames: ['category', 'instrument_name', 'model', 'serial_no'],
    },
    {
      id: 'location',
      kh: '២. អតិថិជន និងទីតាំងជួសជុល',
      en: 'Customer & Service Location',
      icon: 'location',
      fieldNames: ['customer_name', 'province', 'address', '__gps'],
    },
    {
      id: 'repair',
      kh: '៣. ព័ត៌មានលម្អិតអំពីការជួសជុល',
      en: 'Repair Execution & Protocol',
      icon: 'repair',
      fieldNames: ['repair_from', 'repair_to', 'technician', 'repair_description', 'seal_broken', 'seal_removed_no', 'notification_no'],
    },
    {
      id: 'verification',
      kh: '៤. លទ្ធផលផ្ទៀងផ្ទាត់ក្រោយជួសជុល',
      en: 'Post-Repair Verification',
      icon: 'verification',
      fieldNames: ['verification_status', 'verification_cert_no', 'verification_date'],
    },
  ],
  standard: [
    {
      id: 'identity',
      kh: '១. ព័ត៌មានឧបករណ៍ស្ដង់ដារ',
      en: 'Standard Equipment Profile',
      icon: 'standards',
      fieldNames: ['equipment', 'serial_no', 'class_range', 'lab'],
    },
    {
      id: 'validity',
      kh: '២. ការក្រិតតាង និងសុពលភាព',
      en: 'Calibration & Status',
      icon: 'specs',
      fieldNames: ['cal_cert_no', 'cal_date', 'due_date', 'status'],
    },
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
/**
 * The months a licensee may work in: this one, and the twelve before it.
 *
 * This used to start at the PREVIOUS month, which left no way to record work
 * done today — an instrument installed on the 18th could not be entered until
 * November. That defeats the whole point of recording as you go, and it is
 * what the licensee noticed first. A month is submitted after it ends; it is
 * filled in while it is running.
 */
function recentPeriods(count = 13): string[] {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);   // Phnom Penh
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
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
  const [view, setView] = useState<'licensee' | 'entries' | 'carry' | 'review'>('entries');

  const [report, setReport] = useState<any>(null);
  const [entries, setEntries] = useState<Record<string, any[]>>({
    instruments: [], modules: [], repairs: [], standards: [],
  });
  const [totals, setTotals] = useState<any>(null);
  const [editable, setEditable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ kh: string; detail: string } | null>(null);
  const [closedMonth, setClosedMonth] = useState<{ period: string; report_id: string | null } | null>(null);

  /* Article 17 — instruments reported in an earlier month as រង់ចាំ, whose
     verification result has now arrived. `pending` is what is still owed
     across all earlier months; `carryOver` is what this month has recorded. */
  const [pending, setPending] = useState<any[]>([]);
  const [carryOver, setCarryOver] = useState<any[]>([]);
  const [carryForm, setCarryForm] = useState<Record<string, { status: string; cert_no: string; date: string }>>({});
  const [carrySaving, setCarrySaving] = useState<string | null>(null);

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
      setCarryOver(data.carry_over || []);
      setEditable(!!data.editable);

      // What is still awaiting a result from months before this one.
      try {
        const p = await apiRequest<any>(
          `/api/annex8/pending?licence_no=${encodeURIComponent(licenceNo)}&before=${target}`);
        setPending(p?.items || []);
      } catch {
        setPending([]);       // never block the month on this
      }
    } catch (err: any) {
      setError({ kh: 'មិនអាចបើកខែនេះបានទេ', detail: err?.message || String(err) });
    } finally {
      setLoading(false);
    }
  }, [licenceNo]);

  // Browsing the month list must not CREATE anything. It used to, so simply
  // looking at six months left six empty OPEN reports behind — and a month
  // the licensee only glanced at then counted as started. Creation is now an
  // explicit act: the "បង្កើតរបាយការណ៍ថ្មី" button below, or saving an entry.
  useEffect(() => { void loadMonth(period, false); }, [period, loadMonth]);
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

  /* ---------------------- carry-over (Article 17) ---------------------- */

  const saveCarryOver = async (item: any) => {
    const draft = carryForm[item.source_row_id] || { status: '', cert_no: '', date: '' };
    if (draft.status !== 'PASSED' && draft.status !== 'FAILED') {
      toastMsg('សូមជ្រើស ជាប់ ឬ ធ្លាក់', 'error');
      return;
    }
    setCarrySaving(item.source_row_id);
    try {
      await apiRequest('/api/annex8/carry-over', {
        method: 'POST',
        body: {
          licence_no: licenceNo,
          period,
          source_part: item.ref,
          source_row_id: item.source_row_id,
          new_status: draft.status,
          cert_no: draft.cert_no,
          verification_date: draft.date,
        },
      });
      toastMsg('បានកត់ត្រាលទ្ធផល', 'success');
      await loadMonth(period, true);
    } catch (err: any) {
      toastMsg(err?.message || 'មិនអាចកត់ត្រាបានទេ', 'error');
    } finally {
      setCarrySaving(null);
    }
  };

  const removeCarryOver = async (id: string) => {
    try {
      await apiRequest(`/api/annex8/carry-over/${id}`, { method: 'DELETE' });
      toastMsg('បានដកចេញ', 'success');
      await loadMonth(period, false);
    } catch (err: any) {
      toastMsg(err?.message || 'មិនអាចដកចេញបានទេ', 'error');
    }
  };

  /** A pending item this month has already settled. */
  const settledBy = (rowId: string) => carryOver.find((c) => c.source_row_id === rowId) || null;

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

  const input = 'w-full rounded-xl border border-slate-200/90 bg-slate-50/50 px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#C9A227] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#C9A227]/20 shadow-xs transition-all';

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

        {/* Starting a month is an explicit act, and the place to do it has to
            be obvious: a licensee opening a new month should not have to
            discover that adding an entry is what creates the report. */}
        {!report && !loading && (
          <div className="mt-3 rounded-xl border border-dashed border-[#C9A227]/60 bg-[#C9A227]/5 p-4 text-center">
            <p className="text-[13px] font-black text-[#0B1A35]">
              មិនទាន់មានរបាយការណ៍សម្រាប់ {khmerMonthLabel(period)}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
              No report started for this month yet.
            </p>
            <button
              type="button"
              onClick={() => void loadMonth(period, true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#0B1A35] px-4 py-2.5 text-[12px] font-black text-white hover:bg-[#15284d]"
            >
              <Plus className="h-4 w-4 text-[#E6C45A]" />
              បង្កើតរបាយការណ៍ថ្មី · Start this month
            </button>
            <p className="mt-2 text-[10px] font-semibold text-slate-400">
              អ្នកអាចបន្ថែមការងារបានច្រើនដងពេញមួយខែ រួចដាក់ជូននៅពេលខែបញ្ចប់។
            </p>
          </div>
        )}

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
          {/* The parts of the annex, in the order they appear on the printed
              form, so the screen and the paper are walked the same way. */}
          <div className="flex flex-wrap gap-1">
            <button type="button"
              onClick={() => setView('licensee')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black transition-colors ${
                view === 'licensee' ? 'bg-[#0B1A35] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                view === 'licensee' ? 'bg-[#E6C45A] text-[#0B1A35]' : 'bg-white text-slate-500'
              }`}>១</span>
              ព័ត៌មានសហគ្រាស
            </button>

            {PARTS.map((p) => {
              const count = (entries[listKey[p.key]] || []).length;
              const active = view === 'entries' && part === p.key;
              return (
                <button key={p.key} type="button"
                  onClick={() => { setView('entries'); setPart(p.key); setQuery(''); }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black transition-colors ${
                    active ? 'bg-[#0B1A35] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                    active ? 'bg-[#E6C45A] text-[#0B1A35]' : 'bg-white text-slate-500'
                  }`}>{p.no}</span>
                  {p.kh}
                  <span className={active ? 'text-[#E6C45A]' : 'text-slate-400'}>{kh(count)}</span>
                </button>
              );
            })}

            {/* Not a numbered part of the annex — Article 17, results that
                arrived this month for instruments reported earlier. Hidden
                when there is nothing outstanding, so it never becomes noise. */}
            {(pending.length > 0 || carryOver.length > 0) && (
              <button type="button" onClick={() => setView('carry')}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black transition-colors ${
                  view === 'carry' ? 'bg-[#0B1A35] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                <RotateCcw className={`h-3.5 w-3.5 ${view === 'carry' ? 'text-[#E6C45A]' : 'text-slate-400'}`} />
                រង់ចាំពីខែមុន
                <span className={view === 'carry' ? 'text-[#E6C45A]' : 'text-slate-400'}>
                  {kh(pending.length)}
                </span>
              </button>
            )}

            {report && (
              <button type="button" onClick={() => setView('review')}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black transition-colors ${
                  view === 'review' ? 'bg-[#C9A227] text-[#0B1A35]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                  view === 'review' ? 'bg-[#0B1A35] text-[#E6C45A]' : 'bg-white text-slate-500'
                }`}>២</span>
                ពិនិត្យ និងដាក់ជូន
                <span className="text-[9px] font-bold opacity-70">៦·៧</span>
              </button>
            )}
          </div>

          <div className={`relative w-full sm:max-w-xs ${view === 'entries' ? '' : 'hidden'}`}>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-[11px] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0B1A35]"
              placeholder="ស្វែងរក លេខស៊េរី / QR / អតិថិជន"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        {view === 'carry' ? (
          <div className="p-4">
            <div className="mb-3 border-l-4 border-[#C9A227] pl-3">
              <h4 className="text-[13px] font-black text-[#0B1A35]">ឧបករណ៍រង់ចាំផ្ទៀងផ្ទាត់ពីខែមុន</h4>
              <p className="text-[10px] font-bold text-slate-400">
                Article 17 · results that arrived this month for earlier reports
              </p>
            </div>

            <p className="mb-3 text-[11px] font-semibold text-slate-500">
              ឧបករណ៍ទាំងនេះត្រូវបានរាយការណ៍ក្នុងខែមុនជា «រង់ចាំ»។
              នៅពេលលទ្ធផលផ្ទៀងផ្ទាត់មកដល់ សូមកត់ត្រានៅទីនេះ។
              លទ្ធផលនឹងត្រូវបញ្ចូលទៅខែដើមវិញ នៅពេលដាក់ជូនរបាយការណ៍ខែនេះ។
            </p>

            {!pending.length ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-center text-[12px] font-bold text-slate-500">
                គ្មានឧបករណ៍រង់ចាំពីខែមុនទេ
                <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">
                  Nothing is awaiting verification from an earlier month.
                </span>
              </p>
            ) : (
              <div className="space-y-2">
                {pending.map((item) => {
                  const settled = settledBy(item.source_row_id);
                  const draft = carryForm[item.source_row_id] || { status: '', cert_no: '', date: '' };
                  const setDraft = (patch: Partial<typeof draft>) =>
                    setCarryForm((f) => ({ ...f, [item.source_row_id]: { ...draft, ...patch } }));

                  return (
                    <div key={item.source_row_id}
                      className={`rounded-xl border p-3 ${settled ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[12px] font-black text-[#0B1A35]">
                            {item.instrument_name || '—'}
                            <span className="ml-2 font-mono text-[11px] font-bold text-slate-500">
                              {item.serial_no || '—'}
                            </span>
                          </div>
                          <div className="text-[10px] font-bold text-slate-400">
                            {item.ref === 'P4' ? 'ផ្នែកទី៤ ជួសជុល' : 'ផ្នែកទី៣ ផលិត / ដំឡើង'}
                            {' · '}ពីខែ {khmerMonthLabel(item.since)}
                            {item.source_report_id ? ` · ${item.source_report_id}` : ''}
                          </div>
                        </div>

                        {settled && (
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                              settled.new_status === 'PASSED'
                                ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {settled.new_status === 'PASSED' ? 'ជាប់' : 'ធ្លាក់'}
                              {settled.cert_no ? ` · ${settled.cert_no}` : ''}
                            </span>
                            {editable && (
                              <button type="button" onClick={() => void removeCarryOver(settled.id)}
                                className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-50">
                                ដកចេញ
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {!settled && editable && (
                        <div className="mt-2.5 grid gap-2 sm:grid-cols-4">
                          <select className={input} value={draft.status}
                            onChange={(e) => setDraft({ status: e.target.value })}>
                            <option value="">លទ្ធផល…</option>
                            <option value="PASSED">ជាប់</option>
                            <option value="FAILED">ធ្លាក់</option>
                          </select>
                          <input className={input} placeholder="លេខវិញ្ញាបនបត្រ"
                            value={draft.cert_no} onChange={(e) => setDraft({ cert_no: e.target.value })} />
                          <input className={input} type="date"
                            value={draft.date} onChange={(e) => setDraft({ date: e.target.value })} />
                          <button type="button"
                            disabled={carrySaving === item.source_row_id}
                            onClick={() => void saveCarryOver(item)}
                            className="rounded-lg bg-[#0B1A35] px-3 py-2 text-[11px] font-black text-white hover:bg-[#15284d] disabled:opacity-50">
                            {carrySaving === item.source_row_id ? 'កំពុងរក្សាទុក…' : 'កត់ត្រា'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : view === 'licensee' ? (
          /* Part 1 is not typed. It is the licence record, copied onto the
             report when the month opens so the annex stays readable even if
             the licence changes later. Shown read-only so the licensee can
             check it before submitting, and told where to get it corrected. */
          <div className="p-4">
            <div className="mb-3 border-l-4 border-[#C9A227] pl-3">
              <h4 className="text-[13px] font-black text-[#0B1A35]">ព័ត៌មានសហគ្រាស និងរយៈពេល</h4>
              <p className="text-[10px] font-bold text-slate-400">Part 1 · Licensee &amp; period</p>
            </div>

            {!report ? (
              <p className="text-[12px] font-semibold text-slate-500">
                សូមបង្កើតរបាយការណ៍សម្រាប់ខែនេះជាមុនសិន។
              </p>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ['ឈ្មោះសហគ្រាស (ខ្មែរ)', report.enterprise_name_kh || currentUser.company_name_kh],
                    ['ឈ្មោះសហគ្រាស (ឡាតាំង)', report.enterprise_name_en || currentUser.company_name_en],
                    ['លេខអាជ្ញាបណ្ណ', report.licence_no],
                    ['ប្រភេទអាជ្ញាបណ្ណ', report.licence_type === 'REPAIR' ? 'ជួសជុល' : 'ផលិត និងដំឡើង'],
                    ['លេខវិញ្ញាបនបត្រចុះបញ្ជី', report.registration_no],
                    ['អាជ្ញាបណ្ណមានសុពលភាពដល់', report.licence_valid_to],
                    ['អាសយដ្ឋានប្រតិបត្តិការ', report.operating_address],
                    ['ខែរបាយការណ៍', khmerMonthLabel(report.period_month)],
                    ['អ្នកទំនាក់ទំនង', report.contact_name],
                    ['តួនាទី', report.contact_position],
                    ['ទូរស័ព្ទ', report.contact_phone],
                    ['អ៊ីមែល', report.contact_email],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                      <div className="text-[10px] font-bold text-slate-500">{label}</div>
                      <div className="mt-0.5 text-[12px] font-black text-[#0B1A35] break-words">
                        {String(value ?? '').trim() || '—'}
                      </div>
                    </div>
                  ))}
                </div>

                <p className="mt-3 text-[10px] font-semibold text-slate-400">
                  ព័ត៌មាននេះយកពីបញ្ជីអាជ្ញាបណ្ណ។ បើមានកំហុស សូមទាក់ទងមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ
                  ដើម្បីកែក្នុងបញ្ជីអាជ្ញាបណ្ណ មិនមែនក្នុងរបាយការណ៍ទេ។
                </p>

                {editable && (
                  <button type="button"
                    onClick={() => { setView('entries'); setPart('instrument'); }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#0B1A35] px-4 py-2.5 text-[12px] font-black text-white hover:bg-[#15284d]">
                    បន្តទៅផ្នែកទី៣ · ផលិត / ដំឡើង
                  </button>
                )}
              </>
            )}
          </div>
        ) : view === 'review' && report ? (
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

                if (target) {
                  setView('entries');
                  setPart(target);
                  const index = Number(String(issue.path).split('.')[1]);
                  const row = (entries[listKey[target]] || [])[index];
                  if (row) openForm(target, row, row.id);
                  return;
                }

                // Not an entry. Sending these to the entries view left the
                // licensee on whichever part tab happened to be open — a
                // report about the contact details landing them on standard
                // equipment, with nothing highlighted and nothing to fix.
                if (list === 'carry_over') { setView('carry'); return; }
                if (list === 'meta') { setView('licensee'); return; }
                // events.* and declaration are both on the review page, which
                // is where they already are.
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="flex flex-col w-full max-w-4xl max-h-[92vh] rounded-3xl bg-slate-50 shadow-2xl overflow-hidden border border-slate-200/90">
            {/* Top Header */}
            {(() => {
              const partInfo = PARTS.find((p) => p.key === form.part);
              return (
                <div className="shrink-0 flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-[#0B1A35] via-[#0F224A] to-[#15284d] px-6 py-4 text-white">
                  <div className="flex items-center gap-3.5">
                    <div className="h-10 w-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-[#E6C45A] shadow-inner">
                      {form.part === 'instrument' ? <Sliders className="h-5 w-5" /> :
                       form.part === 'repair' ? <Wrench className="h-5 w-5" /> :
                       form.part === 'module' ? <Layers className="h-5 w-5" /> :
                       <ShieldCheck className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-white tracking-wide">
                          {form.id ? 'កែប្រែ' : 'បន្ថែម'}{partInfo?.kh}
                        </h3>
                        <span className="rounded-full bg-[#C9A227]/25 border border-[#C9A227]/50 px-2.5 py-0.5 text-[10px] font-black text-[#E6C45A]">
                          ផ្នែក {partInfo?.no}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 font-medium">
                        {form.id ? 'Edit entry for' : 'Add new entry to'} {partInfo?.en}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(null)}
                    className="rounded-xl p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                    title="បិទ / Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              );
            })()}

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              {(() => {
                const sections = PART_SECTIONS[form.part] || [];
                const allFields = FIELDS[form.part];
                const fieldMap: Record<string, Field> = {};
                allFields.forEach((f) => { fieldMap[f.name] = f; });

                const getSectionIcon = (icon: string) => {
                  switch (icon) {
                    case 'identity': return <Sliders className="h-4 w-4 text-[#C9A227]" />;
                    case 'specs': return <Wrench className="h-4 w-4 text-[#C9A227]" />;
                    case 'location': return <MapPin className="h-4 w-4 text-[#C9A227]" />;
                    case 'verification': return <ShieldCheck className="h-4 w-4 text-[#C9A227]" />;
                    case 'repair': return <FileText className="h-4 w-4 text-[#C9A227]" />;
                    case 'host': return <Sliders className="h-4 w-4 text-[#C9A227]" />;
                    default: return <Sliders className="h-4 w-4 text-[#C9A227]" />;
                  }
                };

                return sections.map((sec) => {
                  const visibleFields = sec.fieldNames
                    .map((name) => fieldMap[name])
                    .filter((f): f is Field => !!f && (!f.when || f.when(form.values)));

                  if (!visibleFields.length) return null;

                  return (
                    <div key={sec.id} className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
                      <div className="flex items-center gap-2.5 pb-3.5 mb-4 border-b border-slate-100">
                        <div className="h-7 w-7 rounded-lg bg-[#0B1A35]/5 border border-[#0B1A35]/10 flex items-center justify-center text-[#0B1A35]">
                          {getSectionIcon(sec.icon)}
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-slate-800">{sec.kh}</h4>
                          <span className="text-[10px] font-semibold text-slate-400 block -mt-0.5">{sec.en}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {visibleFields.map((f) => {
                          const isWide = f.wide || f.type === 'textarea' || f.name === 'verification_status' || f.name === 'seal_broken';
                          const colSpanClass = isWide ? 'sm:col-span-2' : '';

                          if (f.name === 'verification_status') {
                            const options = [
                              { value: 'PASSED', kh: 'ជាប់', en: 'Passed', icon: CheckCircle2, cls: 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20' },
                              { value: 'FAILED', kh: 'ធ្លាក់', en: 'Failed', icon: XCircle, cls: 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-500/20' },
                              { value: 'PENDING', kh: 'រង់ចាំ', en: 'Pending', icon: Clock, cls: 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20' },
                            ];
                            const cur = form.values.verification_status || 'PENDING';
                            return (
                              <div key={f.name} className={colSpanClass}>
                                <div className="mb-2 flex items-baseline justify-between">
                                  <span className="text-xs font-black text-slate-700">
                                    {f.kh} {f.required && <span className="text-rose-500 font-black">*</span>}
                                  </span>
                                  <span className="text-[10px] font-semibold text-slate-400">{f.en}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2.5">
                                  {options.map((opt) => {
                                    const active = cur === opt.value;
                                    const OptIcon = opt.icon;
                                    return (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setForm({ ...form, values: { ...form.values, verification_status: opt.value } })}
                                        className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 transition-all ${
                                          active ? opt.cls : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
                                        }`}
                                      >
                                        <OptIcon className={`h-5 w-5 ${active ? '' : 'text-slate-400'}`} />
                                        <span className="text-xs font-black">{opt.kh}</span>
                                        <span className="text-[10px] font-semibold opacity-80">{opt.en}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          }

                          if (f.name === 'seal_broken') {
                            return (
                              <div key={f.name} className="sm:col-span-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                                <label className="flex items-start gap-3 cursor-pointer">
                                  <input
                                    id={`a8-${f.name}`}
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 rounded border-amber-300 text-[#C9A227] focus:ring-[#C9A227]"
                                    checked={!!form.values[f.name]}
                                    onChange={(e) => setForm({ ...form, values: { ...form.values, [f.name]: e.target.checked } })}
                                  />
                                  <div>
                                    <span className="text-xs font-black text-amber-900 block">
                                      {f.kh} ({f.en})
                                    </span>
                                    <span className="text-[10px] text-amber-800/80 font-medium block mt-0.5">
                                      តម្រូវឱ្យបំពេញលេខត្រាដែលបានដោះ និងលេខលិខិតជូនដំណឹងឧបសម្ព័ន្ធទី១០ (យោងប្រការ ២៥)
                                    </span>
                                  </div>
                                </label>
                              </div>
                            );
                          }

                          return (
                            <div key={f.name} className={colSpanClass}>
                              <div className="mb-1.5 flex items-baseline justify-between">
                                <label className="text-xs font-bold text-slate-700 tracking-tight" htmlFor={`a8-${f.name}`}>
                                  {f.kh} {f.required && <span className="text-rose-500 font-black">*</span>}
                                </label>
                                <span className="text-[10px] font-medium text-slate-400">{f.en}</span>
                              </div>

                              {f.type === 'gps' ? (
                                <div className="flex items-center gap-2">
                                  <div className="relative flex-1">
                                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                      id={`a8-${f.name}`}
                                      className={`${input} pl-9 font-mono`}
                                      readOnly
                                      placeholder="Latitude, Longitude (ស្វ័យប្រវត្តិតាម GPS)"
                                      value={[form.values.latitude, form.values.longitude].filter(Boolean).join(', ')}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={captureGps}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-[#0B1A35] hover:bg-slate-50 shadow-xs transition-colors"
                                  >
                                    <LocateFixed className="h-4 w-4 text-[#C9A227]" /> ចាប់យក GPS
                                  </button>
                                </div>
                              ) : f.type === 'checkbox' ? (
                                <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 py-1">
                                  <input
                                    id={`a8-${f.name}`}
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-300 text-[#0B1A35] focus:ring-[#C9A227]"
                                    checked={!!form.values[f.name]}
                                    onChange={(e) => setForm({ ...form, values: { ...form.values, [f.name]: e.target.checked } })}
                                  />
                                  {f.en}
                                </label>
                              ) : f.type === 'select' ? (
                                <select
                                  id={`a8-${f.name}`}
                                  className={input}
                                  value={form.values[f.name] ?? ''}
                                  onChange={(e) => setForm({ ...form, values: { ...form.values, [f.name]: e.target.value } })}
                                >
                                  <option value="">— សូមជ្រើសរើស / Select —</option>
                                  {f.options?.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              ) : f.type === 'textarea' ? (
                                <textarea
                                  id={`a8-${f.name}`}
                                  className={`${input} min-h-[80px] resize-y`}
                                  placeholder="បំពេញព័ត៌មានលម្អិត..."
                                  value={form.values[f.name] ?? ''}
                                  onChange={(e) => setForm({ ...form, values: { ...form.values, [f.name]: e.target.value } })}
                                />
                              ) : (
                                <input
                                  id={`a8-${f.name}`}
                                  type={f.type === 'date' ? 'date' : 'text'}
                                  className={input}
                                  value={form.values[f.name] ?? ''}
                                  onChange={(e) => setForm({ ...form, values: { ...form.values, [f.name]: e.target.value } })}
                                />
                              )}

                              {f.hint && (
                                <p className="mt-1 text-[10px] font-medium text-slate-400">
                                  {f.hint}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Sticky Bottom Actions */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 backdrop-blur-md px-6 py-4 shadow-lg">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                បោះបង់ / Cancel
              </button>
              <div className="flex items-center gap-2.5">
                {!form.id && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveEntry(true)}
                    className="rounded-xl border border-[#0B1A35] bg-white px-4 py-2.5 text-xs font-bold text-[#0B1A35] hover:bg-[#0B1A35]/5 disabled:opacity-50 transition-colors"
                  >
                    រក្សាទុក និងបន្ថែមទៀត / Save & Next
                  </button>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveEntry(false)}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#C9A227] to-[#E6C45A] px-5 py-2.5 text-xs font-black text-[#0B1A35] hover:brightness-105 disabled:opacity-50 shadow-sm shadow-[#C9A227]/30 transition-all"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  រក្សាទុក / Save Entry
                </button>
              </div>
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
