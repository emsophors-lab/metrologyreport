import type { ConsolidatedPreview } from '../lib/consolidated/buildConsolidatedData';
import { LOOP_FIELDS } from '../lib/consolidated/contract';
import type { ConsolidatedData, LoopKey } from '../lib/consolidated/contract';

function SummaryTable({ title, headers, rows }: { title: string; headers: string[]; rows: Array<Array<string | number>> }) {
  return <section className="min-w-0 space-y-2"><h5 className="font-bold">{title}</h5>
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={title}>
      <table className="w-full border-collapse text-left text-xs"><thead className="bg-slate-100"><tr>
        {headers.map(label => <th key={label} className="border border-slate-200 p-2 whitespace-nowrap">{label}</th>)}
      </tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((value, j) => <td key={j} className="min-w-20 border border-slate-200 p-2 break-words">{value}</td>)}</tr>)}</tbody></table>
    </div>
  </section>;
}

const TABLES: Array<[LoopKey, string, string[]]> = [
  ['late_list', '២.១ សហគ្រាសយឺត ឬមិនបានដាក់របាយការណ៍', ['ល.រ', 'សហគ្រាស', 'អាជ្ញាបណ្ណ', 'ប្រភេទ', 'ស្ថានភាព', 'វិធានការ']],
  ['provinces', '៣.២ ទិន្នន័យតាមរាជធានី ខេត្ត', ['ល.រ', 'ខេត្ត', 'ដំឡើង', 'ជួសជុល', 'សរុប', 'ប្រភេទឧបករណ៍']],
  ['failed', '៤.២ ឧបករណ៍មិនជាប់', ['ល.រ', 'សហគ្រាស', 'ឧបករណ៍', 'លេខសម្គាល់', 'ខេត្ត', 'មូលហេតុ និងវិធានការ']],
  ['seals', '៤.៣ ត្រា និងការផ្ទៀងផ្ទាត់', ['ល.រ', 'សហគ្រាស', 'ឧបករណ៍', 'លេខត្រា', 'លិខិតជូនដំណឹង', 'ការផ្ទៀងផ្ទាត់បន្ទាប់']],
  ['actions', '៦.១ សកម្មភាពបានអនុវត្ត', ['ល.រ', 'សហគ្រាស', 'សកម្មភាព', 'កាលបរិច្ឆេទ', 'លទ្ធផល']],
  ['proposals', '៦.២ សំណើ', ['ល.រ', 'សំណើ', 'មូលដ្ឋានច្បាប់']],
  ['licensees', 'ឧបសម្ព័ន្ធ៖ ទិន្នន័យសហគ្រាស', ['ល.រ', 'សហគ្រាស', 'អាជ្ញាបណ្ណ', 'ប្រភេទ', 'ខេត្ត', 'ផលិត', 'ដំឡើង', 'ជួសជុល', 'ជាប់', 'មិនជាប់', 'រង់ចាំ', 'ស្ថានភាព', 'លេខរបាយការណ៍', 'កំណត់សម្គាល់']],
];

export default function ConsolidatedReportPreview({ preview }: { preview: ConsolidatedPreview }) {
  const { data } = preview;
  const value = (key: string) => data[key as keyof ConsolidatedData] as string | number;
  const metrics = [
    ['សហគ្រាសសកម្ម', data.active_licensees_kh], ['បានដាក់របាយការណ៍', data.submitted_count_kh],
    ['ទាន់ពេល', data.on_time_count_kh], ['យឺត', data.late_count_kh],
    ['មិនបានដាក់', data.not_submitted_count_kh], ['អត្រាដាក់របាយការណ៍', data.submission_rate_kh],
    ['ផលិត', data.total_m_kh], ['ដំឡើង', data.total_i_kh], ['ជួសជុល', data.total_r_kh],
    ['ជាប់', data.total_passed_kh], ['មិនជាប់', data.total_failed_kh], ['រង់ចាំ', data.total_pending_kh],
  ];
  return <article aria-label="របាយការណ៍សរុបមើលជាមុន" className="min-w-0 space-y-5 border-y border-slate-300 bg-white py-5 text-sm text-slate-800">
    <header className="space-y-2 text-center">
      <h4 className="font-bold">របាយការណ៍សរុប — មើលជាមុន</h4>
      <p>{data.period_label_kh} · {data.period_range_kh}</p>
      <p>លេខ៖ {data.letter_no}</p>
      <p className="text-xs text-slate-500">ទិន្នន័យគិតត្រឹម៖ {data.data_as_of_kh}</p>
      <p className="text-xs text-amber-800">ព្រាងសម្រាប់ពិនិត្យ · មិនទាន់បានអនុម័ត</p>
    </header>
    <section><h5 className="mb-3 font-bold">១. ទិន្នន័យសង្ខេប</h5>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="border-b border-slate-200 py-2">
        <dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-bold">{value}</dd>
      </div>)}</dl>
    </section>
    <SummaryTable title="សូចនាករប្រៀបធៀប" headers={['សូចនាករ', 'បច្ចុប្បន្ន', 'មុន', 'ប្រែប្រួល']}
      rows={[
        ['active', 'សហគ្រាសសកម្ម'], ['sub_rate', 'អត្រាដាក់របាយការណ៍'], ['ontime_rate', 'អត្រាទាន់ពេល'],
        ['mi', 'ផលិត និងដំឡើង'], ['repairs', 'ជួសជុល'], ['pass_rate', 'អត្រាជាប់'], ['backlog', 'ការងាររង់ចាំ'],
        ['backlog30', 'រង់ចាំលើស ៣០ ថ្ងៃ'], ['seals', 'ត្រា'], ['complaints', 'បណ្ដឹង'], ['expiring90', 'អាជ្ញាបណ្ណជិតផុតកំណត់'],
      ].map(([key, label]) => [label, ...['cur', 'prev', 'chg'].map(suffix => value(`kpi_${key}_${suffix}`))])} />
    <SummaryTable title="ស្ថានភាពដាក់របាយការណ៍" headers={['ស្ថានភាព', 'ផលិត និងដំឡើង', 'ជួសជុល', 'សរុប', 'ភាគរយ']}
      rows={[
        ['active', 'សកម្ម'], ['submitted', 'បានដាក់'], ['ontime', 'ទាន់ពេល'], ['late', 'យឺត'], ['nil', 'គ្មានសកម្មភាព'],
        ['amend', 'កែតម្រូវ'], ['returned', 'បញ្ជូនត្រឡប់'], ['notsub', 'មិនបានដាក់'],
      ].map(([key, label]) => [label, ...['mi', 'r', 'total', 'pct'].map(suffix => value(`sub_${key}_${suffix}`))])} />
    <SummaryTable title="សកម្មភាពតាមប្រភេទឧបករណ៍" headers={['ប្រភេទ', 'ផលិត', 'ដំឡើង', 'ជួសជុល', 'ជាប់', 'មិនជាប់', 'រង់ចាំ', 'បង្គរប្រចាំឆ្នាំ']}
      rows={[
        ['nawi', 'ជញ្ជីងមិនស្វ័យប្រវត្តិ'], ['weighbridge', 'ជញ្ជីងរថយន្ត'], ['weights', 'ដុំទម្ងន់'], ['fuel', 'ប្រេងឥន្ធនៈ'],
        ['lpg', 'LPG'], ['elec', 'អគ្គិសនី'], ['water', 'ទឹក'], ['ev', 'EV'], ['other', 'ផ្សេងៗ'],
        ['total', 'សរុប'], ['prev', 'គ្រាមុន'], ['chg', 'ប្រែប្រួល'],
      ].map(([key, label]) => [label, ...['m', 'i', 'r', 'passed', 'failed', 'pending', 'ytd'].map(suffix => value(`${key}_${suffix}`))])} />
    <SummaryTable title="ការងាររង់ចាំ" headers={['ស្ថានភាព', 'បច្ចុប្បន្ន', 'មុន', 'កំណត់សម្គាល់']}
      rows={[['cleared', 'បានបញ្ចប់'], ['new', 'ថ្មី'], ['total', 'សរុប'], ['over30', 'លើស ៣០ ថ្ងៃ']]
        .map(([key, label]) => [label, ...['cur', 'prev', 'remark'].map(suffix => value(`backlog_${key}_${suffix}`))])} />
    <SummaryTable title="ការត្រួតពិនិត្យ និងអនុលោមភាព" headers={['ប្រភេទ', 'ចំនួន', 'សហគ្រាស / សង្ខេប']}
      rows={[
        ...[['std_expired', 'ស្តង់ដារផុតកំណត់'], ['std_due60', 'ស្តង់ដារជិតដល់កំណត់'], ['lic_expiring90', 'អាជ្ញាបណ្ណជិតផុតកំណត់'], ['out_of_scope', 'ក្រៅវិសាលភាព']]
          .map(([key, label]) => [label, value(`${key}_count`), value(`${key}_licensees`)]),
        ...Array.from({ length: 6 }, (_, i) => [`EV ${i + 1}`, value(`ev6_${i + 1}_count`), value(`ev6_${i + 1}_summary`)]),
      ]} />
    {TABLES.map(([key, title, headers]) => <section key={key} className="min-w-0 space-y-2">
      <h5 className="font-bold">{title}</h5>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={title}>
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-slate-100"><tr>{headers.map(label => <th key={label} className="border border-slate-200 p-2 whitespace-nowrap">{label}</th>)}</tr></thead>
          <tbody>{data[key].map((row, i) => <tr key={i}>{LOOP_FIELDS[key].map(field => <td key={field} className="min-w-20 max-w-64 break-words border border-slate-200 p-2 whitespace-pre-wrap">
            {String((row as Record<string, string | number>)[field] ?? '')}
          </td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>)}
    <section className="space-y-2"><h5 className="font-bold">បញ្ហាប្រឈម</h5>
      {data.challenges.map((row, i) => <p key={i} className="whitespace-pre-wrap break-words">{row.text}</p>)}
    </section>
    <section className="space-y-2"><h5 className="font-bold">៧. សេចក្តីសន្និដ្ឋាន</h5><p className="whitespace-pre-wrap break-words">{data.conclusion}</p></section>
    <footer className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
      <div><h5 className="font-bold">អ្នករៀបចំ</h5><p>{data.preparer_name}</p><p>{data.preparer_position}</p><p>{data.prepared_date_kh}</p></div>
      <div><h5 className="font-bold">អ្នកពិនិត្យ</h5><p>{data.reviewer_name}</p><p>{data.reviewer_position}</p><p>{data.reviewed_date_kh}</p></div>
      <div className="sm:col-span-2"><p>{data.lunar_date_line}</p><p>ប្រធាននាយកដ្ឋាន៖ {data.head_name}</p></div>
    </footer>
  </article>;
}
