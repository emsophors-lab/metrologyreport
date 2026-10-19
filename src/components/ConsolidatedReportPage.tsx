import { useRef, useState } from 'react';
import { Download, FileCheck2, FileText, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import type { MetrologyUser } from '../types';
import { buildConsolidatedData, prepareConsolidatedData } from '../lib/consolidated/buildConsolidatedData';
import type { ConsolidatedPreview } from '../lib/consolidated/buildConsolidatedData';
import type { ConsolidatedData, OfficerInputs } from '../lib/consolidated/contract';
import { consolidatedFileName, downloadConsolidatedDocx } from '../lib/consolidated/consolidatedDocx';
import { KHMER_MONTHS, periodSize, reportingPeriod } from '../lib/consolidated/periods';
import type { PeriodType } from '../lib/consolidated/periods';
import { automaticConsolidatedInputs } from '../lib/consolidated/automaticReport';

const INPUT = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800';
const BUTTON = 'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed';
const OFFICER_FIELDS: Array<[keyof OfficerInputs, string]> = [
  ['preparer_name', 'ឈ្មោះអ្នករៀបចំ'], ['preparer_position', 'តួនាទីអ្នករៀបចំ'],
  ['reviewer_name', 'ឈ្មោះអ្នកពិនិត្យ'], ['reviewer_position', 'តួនាទីអ្នកពិនិត្យ'],
];
const ROW_FIELDS: Record<'actions' | 'proposals', Array<[string, string]>> = {
  actions: [['licensee', 'សហគ្រាស'], ['action', 'សកម្មភាព'], ['date', 'កាលបរិច្ឆេទ'], ['result', 'លទ្ធផល']],
  proposals: [['proposal', 'សំណើ'], ['legal_basis', 'មូលដ្ឋានច្បាប់']],
};

export default function ConsolidatedReportPage({ currentUser }: { currentUser: MetrologyUser }) {
  const [initialDate] = useState(() => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date()));
  const [type, setType] = useState<PeriodType>('MONTH');
  const [year, setYear] = useState(Number(initialDate.find(part => part.type === 'year')!.value));
  const [index, setIndex] = useState(Number(initialDate.find(part => part.type === 'month')!.value));
  const [officer, setOfficer] = useState<OfficerInputs>({ actions: [], proposals: [] });
  const [preview, setPreview] = useState<ConsolidatedPreview | null>(null);
  const [busy, setBusy] = useState<'load' | 'word' | 'sample' | null>(null);
  const working = useRef(false);
  const [error, setError] = useState('');
  if (!['superadmin', 'admin'].includes(currentUser.role)) return null;

  const updatePeriod = (fn: () => void) => {
    fn(); setPreview(null); setError('');
    setOfficer(previous => ({ ...previous, challenges: undefined, conclusion: undefined }));
  };
  const setField = (key: keyof OfficerInputs, value: string) => setOfficer(previous => ({ ...previous, [key]: value }));
  const run = async (action: 'load' | 'word' | 'sample') => {
    if (working.current) return;
    working.current = true;
    setBusy(action); setError('');
    try {
      const now = new Date();
      const inputs = { ...officer, challenges: undefined, conclusion: undefined };
      if (action === 'load') setPreview(await buildConsolidatedData(type, year, index, inputs, now));
      else if (action === 'sample') {
        const sample = (await import('../lib/consolidated/__fixtures__/consolidated-sample-data.json')).default;
        const period = reportingPeriod('SEMESTER', 2026, 1);
        const data = sample as ConsolidatedData;
        await downloadConsolidatedDocx(prepareConsolidatedData(data, period, automaticConsolidatedInputs(data, period, {}, now)),
          consolidatedFileName(period, now).replace('Consolidated_', 'Consolidated_SAMPLE_'));
      } else {
        // Direct generation always reads a fresh complete SQL snapshot, even
        // when the officer has not pressed Load or another user just submitted.
        const fresh = await buildConsolidatedData(type, year, index, inputs, now);
        setPreview(fresh);
        await downloadConsolidatedDocx(fresh.data, consolidatedFileName(fresh.period, now));
      }
    } catch (err: any) {
      setError(err?.message || 'Unknown report error');
      if (action !== 'sample') setPreview(null);
    } finally { working.current = false; setBusy(null); }
  };

  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
      <div><h3 className="text-lg font-extrabold text-[#0B2A66]">របាយការណ៍សរុប</h3>
        <p className="mt-1 text-xs text-slate-500">Consolidated Report</p></div>
      <button type="button" aria-label="ទាញយកឯកសារគំរូ" disabled={!!busy} onClick={() => void run('sample')}
        className={`${BUTTON} border border-slate-300 bg-white text-slate-700`}>
        {busy === 'sample' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        <span><span>Word</span><span> គំរូ (សម្រាប់ពិនិត្យទម្រង់)</span></span>
      </button>
    </div>
    <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-1 text-xs font-bold">ប្រភេទរបាយការណ៍
        <select aria-label="ប្រភេទរបាយការណ៍" className={INPUT} value={type} disabled={!!busy}
          onChange={e => updatePeriod(() => { setType(e.target.value as PeriodType); setIndex(1); })}>
          <option value="MONTH">ប្រចាំខែ</option><option value="QUARTER">ប្រចាំត្រីមាស</option>
          <option value="SEMESTER">ប្រចាំឆមាស</option><option value="YEAR">ប្រចាំឆ្នាំ</option>
        </select></label>
      <label className="space-y-1 text-xs font-bold">ឆ្នាំ
        <input aria-label="ឆ្នាំរបាយការណ៍" className={INPUT} type="number" min={1900} max={2200} value={year} disabled={!!busy}
          onChange={e => updatePeriod(() => setYear(Number(e.target.value)))} /></label>
      <label className="space-y-1 text-xs font-bold">រយៈពេល
        <select aria-label="រយៈពេល" className={INPUT} value={index} disabled={!!busy || type === 'YEAR'}
          onChange={e => updatePeriod(() => setIndex(Number(e.target.value)))}>
          {Array.from({ length: 12 / periodSize[type] }, (_, i) => <option key={i} value={i + 1}>
            {type === 'MONTH' ? KHMER_MONTHS[i] : type === 'QUARTER' ? `ត្រីមាសទី ${i + 1}` : type === 'SEMESTER' ? `ឆមាសទី ${i + 1}` : 'ពេញឆ្នាំ'}
          </option>)}
        </select></label>
      <button type="button" disabled={!!busy} onClick={() => void run('load')} className={`${BUTTON} bg-[#0B2A66] text-white`}>
        {busy === 'load' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}ផ្ទុកទិន្នន័យរបាយការណ៍
      </button>
    </div>
    {error && <div role="alert" aria-live="assertive" className="border-l-4 border-red-500 bg-red-50 p-3 text-xs text-red-800">
      មិនអាចបង្កើត ឬផ្ទុករបាយការណ៍បានទេ។
      <details className="mt-2"><summary className="cursor-pointer font-bold">ព័ត៌មានលម្អិត</summary><p className="mt-2 whitespace-pre-wrap break-words">{error}</p></details>
    </div>}
    {preview && <div className="border-y border-slate-200 py-3">
      <p role="status" className="text-xs font-bold text-emerald-800">បានផ្ទុកទិន្នន័យរបាយការណ៍រួចរាល់។</p>
      {preview.warnings?.length > 0 && <details className="mt-2 text-xs text-amber-800">
        <summary className="cursor-pointer font-bold">ចំណាំអំពីទិន្នន័យ ({preview.warnings.length})</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">{preview.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>
      </details>}
    </div>}
    <div className="space-y-4 border-t border-slate-200 pt-5">
      <h4 className="text-sm font-bold text-[#0B2A66]">ព័ត៌មានមន្ត្រី និងហត្ថលេខា</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {OFFICER_FIELDS.map(([key, label]) => <label key={key} className="space-y-1 text-xs font-bold">{label}
          <input className={INPUT} value={String(officer[key] || '')} onChange={e => setField(key, e.target.value)} /></label>)}
      </div>
      {(['actions', 'proposals'] as const).map(key => <div key={key} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-bold">{key === 'actions' ? '៦.១ សកម្មភាពបានអនុវត្ត' : '៦.២ សំណើ'}</h4>
          <button type="button" title="បន្ថែមជួរ" className={`${BUTTON} bg-slate-100`} onClick={() => setOfficer(previous => ({
            ...previous, [key]: [...(previous[key] || []), Object.fromEntries([['no', (previous[key]?.length || 0) + 1], ...ROW_FIELDS[key].map(([field]) => [field, ''])])],
          }))}><Plus size={15} />បន្ថែម</button></div>
        {(officer[key] || []).map((row, i) => <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">{ROW_FIELDS[key].map(([field, label]) => <label key={field} className="space-y-1 text-xs">{label}
            <input className={INPUT} value={String((row as any)[field] || '')} onChange={e => setOfficer(previous => ({
              ...previous, [key]: previous[key]?.map((old, n) => n === i ? { ...old, [field]: e.target.value } : old),
            }))} /></label>)}</div>
          <button type="button" title="លុបជួរ" aria-label="លុបជួរ" className="mt-6 p-2 text-red-700" onClick={() => setOfficer(previous => ({
            ...previous, [key]: previous[key]?.filter((_, n) => n !== i).map((old, n) => ({ ...old, no: n + 1 })),
          }))}><Trash2 size={16} /></button>
        </div>)}
      </div>)}
    </div>
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
      <button type="button" disabled title="ការរក្សាទុក draft មិនទាន់អាចប្រើបាន" className={`${BUTTON} border border-slate-300`}><Save size={16} />រក្សាទុកព្រាង</button>
      <button type="button" disabled={!!busy} onClick={() => void run('word')}
        className={`${BUTTON} bg-[#0B2A66] text-white`}>
        {busy === 'word' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
        <span><span>បង្កើត </span><span>Word</span><span> (របាយការណ៍សរុប)</span></span>
      </button>
      <button type="button" disabled title="ការបញ្ជាក់ FINAL មិនទាន់អាចប្រើបាន" className={`${BUTTON} border border-slate-300`}><FileCheck2 size={16} />បញ្ជាក់របាយការណ៍</button>
    </div>
    <p className="text-xs text-slate-500">ការរក្សាទុកព្រាង និងការបញ្ជាក់របាយការណ៍មិនទាន់អាចប្រើបានទេ។ ព័ត៌មានដែលបានបំពេញនៅទីនេះនឹងបាត់បង់ពេលចាកចេញពីទំព័រ។</p>
  </section>;
}
