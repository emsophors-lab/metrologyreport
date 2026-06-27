import React, { useState } from 'react';
import { Trophy, Medal, Building2, Factory, Wrench, Hammer, Award, Calendar, SlidersHorizontal, Info } from 'lucide-react';
import { MetrologyReport, MetrologyUser, generateYearOptions } from '../types';

interface TopServiceCompaniesProps {
  reports: MetrologyReport[];
  users: MetrologyUser[];
}

interface CompanyRanking {
  companyId: string;
  companyNameKh: string;
  licenseNumber: string;
  totalServices: number;
  manufacture: number;
  installation: number;
  repair: number;
}

const MONTH_OPTIONS = [
  { value: '01', label: 'មករា' },
  { value: '02', label: 'កុម្ភៈ' },
  { value: '03', label: 'មីនា' },
  { value: '04', label: 'មេសា' },
  { value: '05', label: 'ឧសភា' },
  { value: '06', label: 'មិថុនា' },
  { value: '07', label: 'កក្កដា' },
  { value: '08', label: 'សីហា' },
  { value: '09', label: 'កញ្ញា' },
  { value: '10', label: 'តុលា' },
  { value: '11', label: 'វិច្ឆិកា' },
  { value: '12', label: 'ធ្នូ' }
];

export default function TopServiceCompanies({ reports, users }: TopServiceCompaniesProps) {
  // 1. Filter States
  const [viewMode, setViewMode] = useState<'month' | 'year' | 'all'>('all');
  
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const m = String(new Date().getMonth() + 1).padStart(2, '0');
    return m; // e.g., '06'
  });
  
  const [selectedYear, setSelectedYear] = useState<string>(() => {
    return String(new Date().getFullYear()); // e.g., '2026'
  });

  // 2. Generate selectable years up to 2050 using standard helper
  const yearOptions = generateYearOptions(2000, 2050).map(String).sort((a, b) => b.localeCompare(a)); // Sort years descending (2050 to 2000)

  // 3. Filter reports by selected criteria
  const filteredReports = reports.filter(report => {
    if (viewMode === 'all') return true;
    if (viewMode === 'year') {
      return report.report_year === selectedYear;
    }
    if (viewMode === 'month') {
      return report.report_year === selectedYear && report.report_month === selectedMonth;
    }
    return true;
  });

  // 4. Compute Top 3 Companies of the filtered period
  const companyStatsMap = new Map<string, {
    total: number;
    manufacture: number;
    installation: number;
    repair: number;
    nameKh: string;
    license: string;
  }>();

  filteredReports.forEach(report => {
    const cid = report.user_id;
    if (!cid) return;

    if (!companyStatsMap.has(cid)) {
      // Find company name in standard users registry
      const u = users.find(user => user.id === cid);
      companyStatsMap.set(cid, {
        total: 0,
        manufacture: 0,
        installation: 0,
        repair: 0,
        nameKh: u ? u.company_name_kh : (report.company_name_kh || 'សហគ្រាសមិនស្គាល់'),
        license: u ? u.license_number : (report.license_number || '')
      });
    }

    const stats = companyStatsMap.get(cid)!;
    stats.total += 1;
    if (report.service_type === 'Manufacture') {
      stats.manufacture += 1;
    } else if (report.service_type === 'Installation') {
      stats.installation += 1;
    } else if (report.service_type === 'Repair') {
      stats.repair += 1;
    }
  });

  // Convert map to array, sort by total descending, and narrow down to top 3
  const rankings: CompanyRanking[] = Array.from(companyStatsMap.entries())
    .map(([companyId, val]) => ({
      companyId,
      companyNameKh: val.nameKh,
      licenseNumber: val.license,
      totalServices: val.total,
      manufacture: val.manufacture,
      installation: val.installation,
      repair: val.repair,
    }))
    .sort((a, b) => b.totalServices - a.totalServices)
    .slice(0, 3);

  // Medal styling helpers
  const getMedalStyles = (rankIndex: number) => {
    switch (rankIndex) {
      case 0: // 1st Place - Gold
        return {
          bg: 'bg-amber-50/70 hover:border-amber-400 border-amber-200/60 transition-all',
          badge: 'bg-amber-100 text-amber-700 ring-amber-300/40',
          pills: 'bg-amber-500/10 text-amber-800 border-amber-500/20',
          textAccent: 'text-amber-600',
          label: 'ចលករមាស (Gold Award)',
          glow: 'shadow-amber-500/5 hover:shadow-amber-500/15',
          fillBar: 'bg-gradient-to-r from-amber-400 to-amber-500',
          rankLabel: 'លេខ ១'
        };
      case 1: // 2nd Place - Silver
        return {
          bg: 'bg-slate-50 border-slate-200/60 hover:border-slate-400 transition-all',
          badge: 'bg-slate-100 text-slate-700 ring-slate-300/40',
          pills: 'bg-slate-500/10 text-slate-800 border-slate-500/25',
          textAccent: 'text-slate-500',
          label: 'ចលករប្រាក់ (Silver Award)',
          glow: 'shadow-slate-400/5 hover:shadow-slate-400/15',
          fillBar: 'bg-gradient-to-r from-slate-400 to-slate-500',
          rankLabel: 'លេខ ២'
        };
      case 2: // 3rd Place - Bronze
        return {
          bg: 'bg-amber-950/5 border-amber-700/20 hover:border-amber-700/50 transition-all',
          badge: 'bg-amber-900/10 text-amber-900 ring-amber-900/10',
          pills: 'bg-amber-800/10 text-amber-900 border-amber-800/20',
          textAccent: 'text-amber-800',
          label: 'ចលករសំរឹទ្ធ (Bronze Award)',
          glow: 'shadow-amber-800/5 hover:shadow-amber-800/15',
          fillBar: 'bg-gradient-to-r from-amber-700 to-amber-900',
          rankLabel: 'លេខ ៣'
        };
      default:
        return {
          bg: 'bg-slate-50 border-slate-200',
          badge: 'bg-slate-100 text-slate-600 ring-slate-200',
          pills: 'bg-slate-100 text-slate-700 border-slate-200',
          textAccent: 'text-slate-500',
          label: 'អ្នកចូលរួម',
          glow: '',
          fillBar: 'bg-slate-400',
          rankLabel: '-'
        };
    }
  };

  const getActiveFilterLabel = () => {
    if (viewMode === 'all') {
      return 'បង្ហាញទិន្នន័យសរុបគ្រប់ពេលវេលា (All Time Total)';
    }
    const currentMonthLabel = MONTH_OPTIONS.find(m => m.value === selectedMonth)?.label || '';
    if (viewMode === 'year') {
      return `បង្ហាញទិន្នន័យសរុបប្រចាំឆ្នាំ ${selectedYear} (Year ${selectedYear} Total)`;
    }
    return `បង្ហាញទិន្នន័យប្រចាំខែ ${currentMonthLabel} ឆ្នាំ ${selectedYear} (Month ${currentMonthLabel} Year ${selectedYear})`;
  };

  const maxTotal = rankings.length > 0 ? rankings[0].totalServices : 1;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-5" id="top-companies-ranking-section">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-navy text-gold rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-navy/10 border border-gold/20">
            <Trophy className="h-5.5 w-5.5 text-gold animate-bounce" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800 font-muol leading-loose">
              ក្រុមហ៊ុនផ្តល់សេវាច្រើនជាងគេ
            </h4>
            <p className="text-[10px] text-slate-400 font-medium">
              សហគ្រាសសេវាកម្មទាំង៣ ដែលបានរាយការណ៍អំពីសកម្មភាពច្រើនជាងគេបំផុត (Top Service Companies)
            </p>
          </div>
        </div>
        <div className="px-3 py-1 bg-slate-50 border border-[#C9D2E3] rounded-full text-[10px] font-bold text-[#2D327F] flex items-center gap-1">
          <Award className="h-3.5 w-3.5" />
          <span>ទិន្នន័យរួមទូទាំងប្រទេស</span>
        </div>
      </div>

      {/* Styled Interactive Filters Section */}
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4.5 space-y-4">
        {/* Title line */}
        <div className="flex items-center gap-2 text-xs text-slate-700 font-bold">
          <SlidersHorizontal className="h-4 w-4 text-[#353C96]" />
          <span>ជម្រើសចម្រោះលទ្ធផល / Filter Controls</span>
        </div>

        {/* Filters grid layout (1 row on desktop, stacked on mobile) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* View mode type dropdown */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="top-view-mode" className="text-[11px] font-bold text-slate-500 font-muol">
              របៀបបង្ហាញ / View Mode
            </label>
            <select
              id="top-view-mode"
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold transition-colors"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as 'month' | 'year' | 'all')}
            >
              <option value="month">បង្ហាញតាមខែ (Filter by Month)</option>
              <option value="year">បង្ហាញតាមឆ្នាំ (Filter by Year)</option>
              <option value="all">បង្ហាញទាំងអស់ (Show All Time)</option>
            </select>
          </div>

          {/* Month selector dropdown */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="top-month-select" className="text-[11px] font-bold text-slate-500 font-muol">
              ជ្រើសរើសខែ / Select Month
            </label>
            <select
              id="top-month-select"
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold transition-colors disabled:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              disabled={viewMode === 'all' || viewMode === 'year'}
            >
              {MONTH_OPTIONS.map(m => (
                <option key={m.value} value={m.value}>
                  {m.label} ({m.value})
                </option>
              ))}
            </select>
          </div>

          {/* Year selector dropdown */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="top-year-select" className="text-[11px] font-bold text-slate-500 font-muol">
              ជ្រើសរើសឆ្នាំ / Select Year
            </label>
            <select
              id="top-year-select"
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold transition-colors disabled:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              disabled={viewMode === 'all'}
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>
                  ឆ្នាំ {y}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* Current status display label bar */}
        <div className="flex items-center gap-2 bg-white rounded-lg px-3.5 py-2.5 border border-slate-100 text-[10.5px] font-semibold text-slate-600">
          <Info className="h-4 w-4 text-[#353C96] shrink-0" />
          <span className="leading-tight">
            ចំណាត់ថ្នាក់សកម្ម៖ <span className="text-[#2D327F] font-bold underline decoration-indigo-300 underline-offset-2">{getActiveFilterLabel()}</span>
          </span>
        </div>
      </div>

      {/* Main Ranking Display Areas */}
      {rankings.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2 border border-dashed border-slate-200 rounded-xl">
          <Building2 className="h-10 w-10 text-slate-300" />
          <p className="font-bold text-slate-600 text-xs">មិនទាន់មានទិន្នន័យសម្រាប់រយៈពេលនេះ</p>
          <p className="text-[10px] text-slate-400">No company service data for this period.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {rankings.map((company, index) => {
            const style = getMedalStyles(index);
            const servicePct = Math.round((company.totalServices / maxTotal) * 100);

            return (
              <div
                key={company.companyId}
                className={`rounded-xl border p-4.5 relative flex flex-col justify-between group cursor-default shadow-xs ${style.bg} ${style.glow}`}
              >
                {/* Ribbon badge for Rank */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5 select-none">
                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md ${style.badge} uppercase tracking-wider font-sans`}>
                    {style.label}
                  </span>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 border shadow-inner ${style.badge}`}>
                    {index === 0 ? (
                      <Trophy className="h-4.5 w-4.5" />
                    ) : (
                      <Medal className="h-4.5 w-4.5" />
                    )}
                  </div>
                </div>

                <div className="space-y-4 flex-1">
                  {/* Rank & Subtitle */}
                  <div className="space-y-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${style.textAccent} font-muol`}>
                      ចំណាត់ថ្នាក់ {style.rankLabel}
                    </span>
                    <h5 className="font-bold text-slate-800 text-xs leading-relaxed max-w-[80%] uppercase group-hover:text-[#2D327F] transition-colors">
                      {company.companyNameKh}
                    </h5>
                    <p className="text-[10px] text-slate-400 font-medium font-mono">
                      អាជ្ញាប័ណ្ណ (License): <span className="font-semibold text-slate-600">{company.licenseNumber}</span>
                    </p>
                  </div>

                  {/* Large Stat Metric Counters */}
                  <div className="bg-white/85 p-3 rounded-lg border border-slate-150/70 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">សេវាកម្មសរុប (Total)</p>
                      <p className={`text-xl font-black font-mono leading-none ${style.textAccent}`}>
                        {company.totalServices}
                      </p>
                    </div>
                    
                    {/* Tiny visual progress representation inside statistical cell */}
                    <div className="w-16 bg-slate-100 h-1 rounded-full overflow-hidden shrink-0">
                      <div className={`${style.fillBar} h-full`} style={{ width: `${servicePct}%` }}></div>
                    </div>
                  </div>

                  {/* Breakdown by service types pills */}
                  <div className="space-y-2">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">ការបែងចែកសេវាកម្ម (Breakdown)</p>
                    <div className="grid grid-cols-3 gap-1.5 text-[9px] font-bold">
                      {/* Manufacture pill */}
                      <div className="flex flex-col items-center p-1.5 bg-emerald-50/50 border border-emerald-500/10 rounded-md text-slate-700">
                        <Factory className="h-3.5 w-3.5 text-emerald-600 mb-1" />
                        <span className="text-[8px] text-slate-400">ផលិត</span>
                        <span className="font-mono text-emerald-800 text-xs font-black mt-0.5">{company.manufacture}</span>
                      </div>

                      {/* Installation pill */}
                      <div className="flex flex-col items-center p-1.5 bg-blue-50/50 border border-blue-500/10 rounded-md text-slate-700">
                        <Wrench className="h-3.5 w-3.5 text-blue-600 mb-1" />
                        <span className="text-[8px] text-slate-400">តម្លើង</span>
                        <span className="font-mono text-blue-800 text-xs font-black mt-0.5">{company.installation}</span>
                      </div>

                      {/* Repair pill */}
                      <div className="flex flex-col items-center p-1.5 bg-amber-50/50 border border-amber-500/10 rounded-md text-slate-700">
                        <Hammer className="h-3.5 w-3.5 text-amber-600 mb-1" />
                        <span className="text-[8px] text-slate-400">ជួសជុល</span>
                        <span className="font-mono text-amber-800 text-xs font-black mt-0.5">{company.repair}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
