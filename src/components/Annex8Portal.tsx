/**
 * ឧបសម្ព័ន្ធទី៨ — the Annex 8 portal.
 *
 * Annex 8 stands on its own page, away from the legacy monthly report. The two
 * are different documents with different rules, and mixing their switches on
 * one screen made licensees pick the wrong one: the old flat report has its own
 * tab and is left exactly as it was.
 *
 * Everything a licensee needs for Annex 8 is here and nowhere else:
 *
 *   ទិដ្ឋភាពរួម      cards and charts, scoped by role
 *   បំពេញប្រចាំខែ   record work as it happens, review, submit
 *   ប្រវត្តិរបាយការណ៍  the register of what was filed, and instrument search
 *
 * NMC staff get the overview across every licensee and may not fill anything
 * in: they receive these reports, they do not file them. A company gets the
 * same three, its own data only. Which data that is, is decided by the
 * server from the signed-in user, never by this file.
 *
 * There was a third, a 7-step form that filled a whole month in one sitting.
 * It is gone. Two ways to write the same annex meant two code paths, and they
 * had drifted: the one-shot path jumped straight to SUBMITTED and wrote no
 * audit entries at all, so a report filed through it left no record of who
 * entered what. The monthly workspace does a single sitting perfectly well —
 * add every entry in one visit and submit — and it is the path that is
 * validated, audited and reviewable.
 */
import { Suspense, lazy, useState } from 'react';
import { BarChart3, CalendarRange, FileText, History, Loader2, ShieldCheck } from 'lucide-react';

import { EnterpriseLicense, MetrologyUser } from '../types';

const Annex8MonthWorkspace = lazy(() => import('./Annex8MonthWorkspace'));
const Annex8ReportSearch = lazy(() => import('./Annex8ReportSearch'));
const Annex8MyReportsTable = lazy(() => import('./Annex8MyReportsTable'));
const Annex8Overview = lazy(() => import('./Annex8Overview'));
const ConsolidatedReportPage = lazy(() => import('./ConsolidatedReportPage'));
const Annex8StaffReview = lazy(() => import('./Annex8StaffReview'));

type View = 'overview' | 'review' | 'month' | 'history' | 'consolidated';

/**
 * History has two levels, because they answer different questions. The
 * register is "how many reports have we filed and what was in each"; the
 * search is "which weighbridge failed in September".
 */
type HistoryTab = 'register' | 'search';

interface Annex8PortalProps {
  currentUser: MetrologyUser;
  licence?: EnterpriseLicense | null;
  toastMsg: (msg: string, type: 'success' | 'error') => void;
  language?: 'km' | 'en';
}

const VIEWS: Array<{
  key: View;
  kh: string;
  en: string;
  hint: string;
  icon: typeof CalendarRange;
  needsSave: boolean;
  staffOnly?: boolean;
}> = [
  {
    key: 'overview',
    kh: 'ទិដ្ឋភាពរួម',
    en: 'Overview',
    hint: 'កាត និងក្រាហ្វិកសង្ខេបនៃរបាយការណ៍ប្រចាំខែ',
    icon: BarChart3,
    needsSave: false,
  },
  {
    // NMC's review desk. Staff receive these reports, so this sits directly
    // after the overview — it is the screen they spend their time on.
    key: 'review',
    kh: 'របាយការណ៍សហគ្រាស',
    en: 'Company reports',
    hint: 'ស្វែងរកតាមខែ ព្រីនឧបសម្ព័ន្ធទី៨ ទទួលយក ឬត្រឡប់',
    icon: ShieldCheck,
    needsSave: false,
    staffOnly: true,
  },
  {
    key: 'month',
    kh: 'បំពេញប្រចាំខែ',
    en: 'Monthly entry',
    hint: 'បញ្ចូលការងារបន្តិចម្តងៗពេញមួយខែ ឬម្តងទាំងអស់ រួចពិនិត្យ និងដាក់ជូន',
    icon: CalendarRange,
    needsSave: true,
  },
  {
    key: 'history',
    kh: 'ប្រវត្តិរបាយការណ៍',
    en: 'Report history',
    hint: 'ស្វែងរកតាមខែ ឆ្នាំ ប្រភេទសេវាកម្ម និងលទ្ធផលផ្ទៀងផ្ទាត់',
    icon: History,
    needsSave: false,
  },
  {
    key: 'consolidated', kh: 'របាយការណ៍សរុប', en: 'Consolidated report',
    hint: 'ប្រចាំខែ ត្រីមាស ឆមាស និងឆ្នាំ', icon: FileText, needsSave: false, staffOnly: true,
  },
];

const Spinner = () => (
  <div className="flex items-center justify-center py-16 text-slate-400">
    <Loader2 className="h-5 w-5 animate-spin" />
  </div>
);

export default function Annex8Portal({ currentUser, licence, toastMsg, language }: Annex8PortalProps) {
  // NMC staff receive these reports; they do not file them. Their account's
  // licence number is the Centre's own, so showing them the entry form would
  // invite filing an Annex 8 against NMC itself — which is how empty reports
  // under NMC-SA-2026 appeared in the first place.
  const isStaff = currentUser.role === 'superadmin' || currentUser.role === 'admin';

  // A licensee who may not save still gets the history and the overview —
  // reading back what the enterprise already submitted is not an edit.
  const canSave = !!currentUser.can_save && !isStaff;

  const views = VIEWS.filter((v) => (canSave || !v.needsSave) && (!v.staffOnly || isStaff));
  const [view, setView] = useState<View>(isStaff ? 'overview' : canSave ? 'month' : 'overview');

  // Staff have no licence of their own to register, so their history is the
  // cross-licensee instrument search; the per-licensee picture is on the
  // overview instead.
  const [historyTab, setHistoryTab] = useState<HistoryTab>(isStaff ? 'search' : 'register');
  const active = views.find((v) => v.key === view) || views[0];

  return (
    <div className="space-y-5 animate-fade-in duration-300">
      {/* Page identity: this is the official annex, not the legacy report. */}
      <div className="rounded-xl bg-[#0B2A66] text-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="font-extrabold text-lg">របាយការណ៍ប្រចាំខែ ឧបសម្ព័ន្ធទី៨</h3>
          <span className="px-2 py-0.5 rounded-full bg-[#C9A227] text-[#0B2A66] text-[10px] font-extrabold tracking-wide">
            A8-2026.2
          </span>
        </div>
        <p className="text-[11px] text-white/70 mt-1">
          Monthly Report on Manufacture, Installation and Repair of Measuring Instruments
        </p>
        <p className="text-[11px] text-white/80 mt-2 leading-relaxed">
          សហគ្រាសដែលទទួលបានអាជ្ញាបណ្ណ ត្រូវដាក់បញ្ជូនរបាយការណ៍នេះមកមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ
          យ៉ាងយូរបំផុតត្រឹមថ្ងៃទី៧ នៃខែបន្ទាប់ (មាត្រា២១)។
        </p>
      </div>

      {/* Which way to fill it in. Three cards rather than a pill row, because
          the choice is made once a month and deserves its explanation. */}
      <div className={`grid gap-2 ${views.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {views.map((v) => {
          const Icon = v.icon;
          const on = v.key === view;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={`text-left px-4 py-3 rounded-xl border transition-all cursor-pointer ${
                on
                  ? 'bg-white border-[#0B2A66] ring-2 ring-[#0B2A66]/15 shadow-sm'
                  : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 shrink-0 ${on ? 'text-[#C9A227]' : 'text-slate-400'}`} />
                <span className={`text-xs font-extrabold ${on ? 'text-[#0B2A66]' : 'text-slate-600'}`}>
                  {v.kh}
                </span>
                <span className="text-[10px] font-bold text-slate-400">{v.en}</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{v.hint}</p>
            </button>
          );
        })}
      </div>

      {isStaff ? (
        <div className="bg-[#0B2A66]/5 border border-[#0B2A66]/20 p-3 rounded-xl text-[11px] text-[#0B2A66] font-bold">
          គណនីមន្ត្រី ម.ម.ជ — អ្នកកំពុងមើលទិន្នន័យរបស់សហគ្រាសទាំងអស់។
          <span className="block font-semibold text-slate-500 mt-0.5">
            NMC staff view: every licensee. Reports are filed by the enterprises themselves.
          </span>
        </div>
      ) : !canSave && (
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs text-slate-500 font-medium">
          ⚠️ គណនីរបស់អ្នកអាចមើលប្រវត្តិរបាយការណ៍បាន ប៉ុន្តែមិនអាចបំពេញ ឬដាក់បញ្ជូនបានឡើយ។
          ប្រសិនបើត្រូវការសិទ្ធិបន្ថែម សូមទាក់ទងមកមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ។
        </div>
      )}

      <Suspense fallback={<Spinner />}>
        {active?.key === 'overview' && <Annex8Overview currentUser={currentUser} />}

        {active?.key === 'review' && isStaff && (
          <Annex8StaffReview currentUser={currentUser} toastMsg={toastMsg} />
        )}
        {active?.key === 'consolidated' && isStaff && <ConsolidatedReportPage currentUser={currentUser} />}

        {active?.key === 'month' && (
          <Annex8MonthWorkspace currentUser={currentUser} toastMsg={toastMsg} />
        )}
        {active?.key === 'history' && (
          <div className="space-y-3">
            <div className="flex bg-slate-100 p-1 rounded-lg max-w-md">
              {(isStaff
                ? [['search', 'ស្វែងរកឧបករណ៍', 'Search instruments']]
                : [
                    ['register', 'តារាងរបាយការណ៍', 'My reports'],
                    ['search', 'ស្វែងរកឧបករណ៍', 'Search instruments'],
                  ]
              ).map(([key, kh, en]: any) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setHistoryTab(key)}
                  className={`flex-1 text-center py-2 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                    historyTab === key
                      ? 'bg-white text-[#0B2A66] shadow-xs border border-slate-200/50'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {kh} <span className="text-[9px] text-slate-400">{en}</span>
                </button>
              ))}
            </div>
            {historyTab === 'register'
              ? <Annex8MyReportsTable currentUser={currentUser} toastMsg={toastMsg} />
              : <Annex8ReportSearch currentUser={currentUser} />}
          </div>
        )}
      </Suspense>
    </div>
  );
}
