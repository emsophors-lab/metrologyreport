import React from 'react';
import { X, Printer, Landmark } from 'lucide-react';
import { MetrologyReport, MetrologyUser } from '../types';
import { getServiceTypeKH, getMonthNameKH, getReportQRCodeUrl } from '../exportUtils';

interface ReportPrintLayoutProps {
  reports: MetrologyReport[];
  selectedUser: MetrologyUser | null;
  currentUser?: MetrologyUser | null;
  onClose: () => void;
  title?: string;
  filterMonth?: string;
  filterYear?: string;
  filterServiceType?: string;
  searchQuery?: string;
  isPublicVerify?: boolean;
}

export default function ReportPrintLayout({ 
  reports, 
  selectedUser, 
  currentUser, 
  onClose, 
  title, 
  filterMonth, 
  filterYear,
  filterServiceType,
  searchQuery,
  isPublicVerify = false
}: ReportPrintLayoutProps) {
  const handlePrint = () => {
    window.print();
  };

  const now = new Date();
  const dateString = `ថ្ងៃទី ${now.getDate()} ខែ ${getMonthNameKH(String(now.getMonth() + 1).padStart(2, '0'))} ឆ្នាំ ${now.getFullYear()}`;

  // Get active company name from either context
  const displayCompanyName = selectedUser?.company_name_kh || (currentUser?.role === 'company' ? currentUser?.company_name_kh : '');

  // Format month & year for title text
  const formatM = (m?: string) => {
    if (!m || m === 'all') return 'all';
    return String(m).padStart(2, '0');
  };

  const activeMonth = formatM(filterMonth) !== 'all' ? formatM(filterMonth) : (reports.length > 0 ? formatM(reports[0].report_month) : 'all');
  const activeYear = filterYear && filterYear !== 'all' ? filterYear : (reports.length > 0 ? reports[0].report_year : 'all');

  const monthKH = activeMonth !== 'all' ? getMonthNameKH(activeMonth) : '';
  const yearKH = activeYear !== 'all' ? activeYear : '';

  let titleText = 'របាយការណ៍ប្រចាំខែស្តីពីការផលិត តំឡើង និងជួសជុលឧបករណ៍មាត្រាសាស្ត្រ';
  if (monthKH && yearKH) {
    titleText = `របាយការណ៍ប្រចាំខែ ${monthKH} ឆ្នាំ ${yearKH} ស្តីពីការផលិត តំឡើង និងជួសជុលឧបករណ៍មាត្រាសាស្ត្រ`;
  } else if (monthKH) {
    titleText = `របាយការណ៍ប្រចាំខែ ${monthKH} ស្តីពីការផលិត តំឡើង និងជួសជុលឧបករណ៍មាត្រាសាស្ត្រ`;
  } else if (yearKH) {
    titleText = `របាយការណ៍ប្រចាំឆ្នាំ ${yearKH} ស្តីពីការផលិត តំឡើង និងជួសជុលឧបករណ៍មាត្រាសាស្ត្រ`;
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto print:p-0 print:bg-white print:absolute">
      
      {/* Printable container box */}
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full flex flex-col max-h-[90vh] overflow-hidden print:shadow-none print:max-h-full print:rounded-none">
        
        {/* Controls header (hidden on print) */}
        <div className={`p-4 border-b flex items-center justify-between print:hidden shrink-0 ${isPublicVerify ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
          <div>
            {isPublicVerify ? (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <h3 className="font-bold text-emerald-800 text-sm">ផ្ទៀងផ្ទាត់ផ្លូវការ / Officially NMC Verified ✓</h3>
              </div>
            ) : (
              <h3 className="font-bold text-slate-800 text-sm">មើលមុនពេលបោះពុម្ពជា PDF / Print PDF Preview</h3>
            )}
            <p className="text-[10px] text-slate-400 mt-0.5">ទម្រង់លក្ខណៈឯកសារផ្លូវការរបស់មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className={`px-4 py-1.5 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer ${isPublicVerify ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              <Printer className="h-4 w-4" />
              បោះពុម្ព / Print PDF
            </button>
            <button
              onClick={onClose}
              className="p-1 px-2 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable document page section */}
        <div id="printable-area" className="p-10 md:p-12 overflow-y-auto space-y-6 print:overflow-visible print:p-0 select-all">
          
          {/* Official Royal Sovereignty Header */}
          <div className="text-center space-y-1 relative">
            <h1 className="text-sm font-bold text-slate-900 tracking-wider">ព្រះរាជាណាចក្រកម្ពុជា</h1>
            <p className="text-xs font-bold text-slate-700 tracking-wider">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
            <div className="flex justify-center py-1">
              <span className="text-xs text-slate-400">❖ ❖ ❖</span>
            </div>
            
            {/* Institution Badge & Logo layout */}
            <div className="pt-2 text-left absolute top-0 left-0 hidden md:block print:block">
              {displayCompanyName ? (
                <>
                  <p className="text-[9px] font-bold text-slate-800 uppercase tracking-tight">ក្រុមហ៊ុនសេវាកម្មមាត្រាសាស្ត្រ</p>
                  <p className="text-[11px] font-extrabold text-indigo-900 underline mt-1">{displayCompanyName}</p>
                </>
              ) : (
                <div className="font-muol">
                  <p className="text-[10px] font-bold text-slate-800 uppercase tracking-tight leading-normal">ក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ</p>
                  <p className="text-[10px] font-bold text-slate-800 uppercase -mt-0.5 leading-normal">បច្ចេកវិទ្យា និងនវានុវត្តន៍</p>
                  <p className="text-[11px] font-bold text-indigo-900 underline mt-1 leading-normal">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
                </div>
              )}
            </div>
          </div>

          <div className="text-center pt-6 pb-2">
            <p className="text-xs sm:text-sm font-extrabold text-slate-800 mb-2 leading-relaxed select-all">
              សូមគោរពជូនឯកឧត្តមប្រធានមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ
            </p>
            <h2 className="text-base font-black text-slate-900">
              {titleText}
            </h2>
            <p className="text-xs text-slate-500 font-medium italic mt-1 font-sans">
              (Monthly Performance Report on Manufacturing, Installing, and Repairing Metrological Instruments)
            </p>
          </div>

          {/* Company licensing and profile card block - Section 10.1 */}
          <div className="border border-slate-200 p-5 rounded-lg bg-slate-50/50 text-xs">
            {selectedUser ? (
              <ul className="space-y-2 font-medium leading-relaxed text-slate-900 text-left">
                <li className="flex flex-col sm:flex-row sm:items-center">
                  <span className="font-bold text-slate-600 min-w-[200px]">- អាជ្ញាប័ណ្ណលេខ</span>
                  <span className="hidden sm:inline mr-3">៖</span>
                  <span className="font-bold bg-slate-100 border border-slate-300 px-2.5 py-0.5 rounded font-mono text-slate-950 text-xs">{selectedUser.license_number}</span>
                </li>
                <li className="flex flex-col sm:flex-row sm:items-center">
                  <span className="font-bold text-slate-600 min-w-[200px]">- ឈ្មោះសហគ្រាស (ភាសាខែ្មរ)</span>
                  <span className="hidden sm:inline mr-3">៖</span>
                  <span className="font-extrabold text-slate-950 text-xs">{selectedUser.company_name_kh}</span>
                </li>
                <li className="flex flex-col sm:flex-row sm:items-center">
                  <span className="font-bold text-slate-600 min-w-[200px]">- ឈ្មោះសហគ្រាស (ភាសាអង់គ្លេស)</span>
                  <span className="hidden sm:inline mr-3">៖</span>
                  <span className="font-semibold text-slate-900 font-mono">{selectedUser.company_name_en}</span>
                </li>
                <li className="flex flex-col sm:flex-row sm:items-start">
                  <span className="font-bold text-slate-600 min-w-[200px]">- អាសយដ្ឋាន</span>
                  <span className="hidden sm:inline mr-3">៖</span>
                  <span className="text-slate-900 flex-1">{selectedUser.address}</span>
                </li>
                <li className="flex flex-col sm:flex-row sm:items-center">
                  <span className="font-bold text-slate-600 min-w-[200px]">- លេខទូរស័ព្ទ</span>
                  <span className="hidden sm:inline mr-3">៖</span>
                  <span className="text-slate-900 font-semibold font-mono">{selectedUser.phone}</span>
                </li>
                <li className="flex flex-col sm:flex-row sm:items-center">
                  <span className="font-bold text-slate-600 min-w-[200px]">- អ៊ីម៉ែល</span>
                  <span className="hidden sm:inline mr-3">៖</span>
                  <span className="text-slate-900 font-semibold font-mono">{selectedUser.email}</span>
                </li>
                <li className="flex flex-col sm:flex-row sm:items-center">
                  <span className="font-bold text-slate-600 min-w-[200px]">- ឈ្មោះអ្នកតំណាងស្របច្បាប់</span>
                  <span className="hidden sm:inline mr-3">៖</span>
                  <span className="font-bold text-slate-950">{selectedUser.legal_representative}</span>
                </li>
                <li className="flex flex-col sm:flex-row sm:items-center">
                  <span className="font-bold text-slate-600 min-w-[200px]">- តួនាទីអ្នកតំណាងស្របច្បាប់</span>
                  <span className="hidden sm:inline mr-3">៖</span>
                  <span className="text-slate-900">{selectedUser.representative_position}</span>
                </li>
              </ul>
            ) : (
              <div className="text-center text-slate-600 font-bold py-1">
                សរុបលទ្ធផលរួមបញ្ចូលគ្នានៃសហគ្រាសសេវាកម្មមាត្រាសាស្ត្រទាំងអស់ដែលទទួលបានអាជ្ញាប័ណ្ណ
              </div>
            )}
          </div>

          {/* Table displaying the metrological records */}
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold font-sans">
                  <th className="p-3 border-r border-slate-300 text-center w-10">ល.រ</th>
                  {!selectedUser && <th className="p-3 border-r border-slate-300">ក្រុមហ៊ុនសហគ្រាស</th>}
                  <th className="p-3 border-r border-slate-300">អតិថិជន និងអាសយដ្ឋាន</th>
                  <th className="p-3 border-r border-slate-300">ឧបករណ៍វាស់វែង</th>
                  <th className="p-3 border-r border-slate-300 text-center w-24">លេខស៊េរីឧបករណ៍</th>
                  <th className="p-3 border-r border-slate-300">វិសាលភាពវាស់ស្ទង់</th>
                  <th className="p-3 border-r border-slate-300">គ្រឿងបន្លាស់ និងលេខស៊េរី</th>
                  <th className="p-3 border-r border-slate-300 text-center w-24">ប្រភេទសេវាកម្ម</th>
                  <th className="p-3 text-center w-36">កាលបរិច្ឆេទសេវាកម្ម</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                {reports.map((r, i) => (
                  <tr key={r.id}>
                    <td className="p-3 border-r border-slate-200 text-center font-mono text-slate-400">{i + 1}</td>
                    {!selectedUser && (
                      <td className="p-3 border-r border-slate-200 font-bold text-slate-900 leading-snug">
                        {r.company_name_kh}
                        <div className="text-[8px] text-slate-500 font-mono font-normal">{r.license_number}</div>
                      </td>
                    )}
                    <td className="p-3 border-r border-slate-200 leading-relaxed">
                      <div className="font-bold text-slate-900">{r.customer_name}</div>
                      <div className="text-[9px] text-slate-400 font-sans mt-0.5">{r.customer_address}</div>
                    </td>
                    <td className="p-3 border-r border-slate-200">{r.measuring_instrument}</td>
                    <td className="p-3 border-r border-slate-200 text-center font-mono font-bold text-slate-700">{r.instrument_serial_number}</td>
                    <td className="p-3 border-r border-slate-200 font-sans">{r.scope_of_weight_measure}</td>
                    <td className="p-3 border-r border-slate-200 leading-snug">
                      <div>{r.spare_parts || '-'}</div>
                      {r.spare_part_serial_number && (
                        <div className="text-[8px] text-slate-400 font-mono font-normal">S/N: {r.spare_part_serial_number}</div>
                      )}
                    </td>
                    <td className="p-3 border-r border-slate-200 text-center font-bold">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] ${
                        r.service_type === 'Manufacture' ? 'bg-emerald-50 text-emerald-700' :
                        r.service_type === 'Installation' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {getServiceTypeKH(r.service_type)}
                      </span>
                    </td>
                    <td className="p-3 text-center text-[9px] font-mono leading-relaxed">
                      {r.service_start_date} <br className="hidden print:block" /> ដល់ {r.service_end_date}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Official Signatures and QR Code area */}
          <div className="pt-12 grid grid-cols-1 md:grid-cols-2 gap-8 text-xs font-semibold">
            
            {/* Left signature column: Government Approval */}
            <div className="space-y-1 text-left">
              <p className="text-slate-900 font-extrabold text-[11px] uppercase tracking-tight">បានឃើញ និងឯកភាព</p>
              {selectedUser ? (
                <div className="space-y-1">
                  <p className="text-slate-900 font-bold text-[10px] tracking-tight">អគ្គនាយក ឬ អ្នកតំណាងស្របច្បាប់</p>
                  <div className="h-28 flex items-end">
                    <div>
                      <p className="text-slate-300">........................................................................</p>
                      <p className="text-[10px] text-slate-900 font-extrabold mt-1.5">ឈ្មោះ៖ {selectedUser.legal_representative}</p>
                      <p className="text-[9px] text-slate-400 font-bold mt-0.5">(តួនាទី៖ {selectedUser.representative_position})</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-slate-950 font-extrabold text-[10px] tracking-tight">ប្រធាននាយកដ្ឋាន</p>
                  <div className="h-28 flex items-end">
                    <div>
                      <p className="text-slate-300">........................................................................</p>
                      <p className="text-[10px] text-slate-500 font-bold mt-1.5">(ហត្ថលេខា និងត្រា)</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right signature column: Enterprise representative / Department compiler + QR system */}
            <div className="text-right space-y-1 flex flex-col items-end">
              <p className="text-slate-500 italic font-mono text-[10px]">{dateString}</p>
              <p className="text-slate-900 font-bold text-[10px] uppercase">
                {selectedUser ? 'អ្នករៀបចំរបាយការណ៍តំណាងក្រុមហ៊ុន' : 'អ្នករៀបចំរបាយការណ៍របស់នាយកដ្ឋាន'}
              </p>
              
              {/* Dynamic QR block */}
              <div className="pt-2 pb-2 flex flex-col items-center">
                <img
                  referrerPolicy="no-referrer"
                  src={getReportQRCodeUrl(
                    selectedUser ? (reports[0]?.id || 'NMC-QR-ALL') : 'filtered',
                    selectedUser?.license_number || 'NMC-LICENSE',
                    {
                      month: filterMonth,
                      year: filterYear,
                      companyId: selectedUser?.id || 'all',
                      serviceType: filterServiceType,
                      searchQuery: searchQuery
                    }
                  )}
                  alt="Metrology report QR"
                  className="w-20 h-20 border border-slate-200 p-1 bg-white rounded shadow-xs"
                />
                <span className="text-[7.5px] font-mono font-semibold text-slate-400 mt-1 uppercase">Scan to Verify Record</span>
              </div>

              <div className="h-24 flex flex-col justify-end items-center min-w-[220px]">
                <p className="text-[11px] text-slate-950 font-extrabold mb-1">
                  {selectedUser ? selectedUser.legal_representative : (currentUser?.legal_representative || currentUser?.username || 'លោក លី ម៉េង')}
                </p>
                <p className="text-slate-300 leading-none">........................................................................</p>
                <p className="text-[10px] text-slate-500 font-bold mt-1 text-center">(ហត្ថលេខា និងឈ្មោះអ្នករៀបចំ)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
