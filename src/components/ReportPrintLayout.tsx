import React from 'react';
import { X, Printer } from 'lucide-react';
import { MetrologyReport, MetrologyUser } from '../types';
import { 
  getServiceTypeKH, 
  getMonthNameKH, 
  getReportVerificationUrl, 
  getGeneratedReportNumber,
  generateLocalQRCode,
  generateLocalBarcode 
} from '../exportUtils';
import { formatKhmerOfficialDateBlock } from '../utils/khmerOfficialDate';

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
  const officialDate = formatKhmerOfficialDateBlock(now, { location: 'រាជធានីភ្នំពេញ' });

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

  // State variables for local offline QR & Barcode base64 strings
  const [qrCodeDataUrl, setQrCodeDataUrl] = React.useState<string>('');
  const [barcodeDataUrl, setBarcodeDataUrl] = React.useState<string>('');

  React.useEffect(() => {
    const run = async () => {
      const isTotal = !selectedUser;
      const reportNumber = getGeneratedReportNumber(
        isTotal ? 'all' : (selectedUser?.id || 'all'),
        filterYear,
        filterMonth,
        selectedUser?.license_number
      );

      const verificationUrl = getReportVerificationUrl(
        isTotal ? 'filtered' : (reports[0]?.id || 'NMC-QR-ALL'),
        {
          month: filterMonth,
          year: filterYear,
          companyId: selectedUser?.id || 'all',
          serviceType: filterServiceType,
          searchQuery: searchQuery
        }
      );

      const qr = await generateLocalQRCode(verificationUrl);
      const bar = await generateLocalBarcode(reportNumber);
      setQrCodeDataUrl(qr);
      setBarcodeDataUrl(bar);
    };
    run();
  }, [reports, selectedUser, filterMonth, filterYear, filterServiceType, searchQuery]);

  if (isPublicVerify) {
    return (
      <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto print:hidden">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden text-slate-800 animate-fadeIn">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white text-center relative">
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/10 hover:bg-black/20 rounded-full p-1 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto h-12 w-12 bg-white/10 rounded-full flex items-center justify-center border border-white/20 mb-3 text-emerald-100">
              <svg className="h-6 w-6 stroke-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="font-bold text-xs tracking-wide leading-relaxed" style={{ fontFamily: '"Khmer OS Muol Light", "Moul", serif' }}>មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</h2>
            <p className="text-[9px] font-semibold text-emerald-100 mt-1 uppercase tracking-wider">National Metrology Center (NMC)</p>
            <div className="text-[10px] font-bold bg-white/20 border border-white/10 text-emerald-50 px-3 py-1 rounded-full w-fit mx-auto mt-3">
              ផ្ទៀងផ្ទាត់ផ្លូវការ / Officially Verified ✓
            </div>
          </div>

          {/* Content info card */}
          <div className="p-6 space-y-4 text-xs text-left">
            <h3 className="text-center text-slate-800 font-bold text-xs underline leading-loose" style={{ fontFamily: '"Khmer OS Muol Light", "Moul", serif' }}>
              ព័ត៌មានផ្ទៀងផ្ទាត់របាយការណ៍ផ្លូវការ
            </h3>

            {reports.length === 0 ? (
              <p className="text-center text-slate-400 py-4 font-medium">គ្មានទិន្នន័យរបាយការណ៍ផ្ទៀងផ្ទាត់ឡើយ</p>
            ) : (
              reports.slice(0, 1).map((report, idx) => (
                <div key={report.id || idx} className="space-y-4">
                  {/* Enterprise Section */}
                  <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-2.5">
                    <div className="flex flex-col justify-between space-y-1">
                      <span className="font-semibold text-slate-400 text-[10px] uppercase">សហគ្រាសសេវាកម្ម / Fee Service provider:</span>
                      <span className="font-bold text-slate-900">{report.company_name_kh}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-500 text-[10px] pt-1.5 border-t border-slate-200/50">
                      <span>លេខអាជ្ញាប័ណ្ណ / License No:</span>
                      <span className="font-bold bg-slate-100 border border-slate-200 text-slate-800 px-2 py-0.5 rounded font-mono text-[10px]">{report.license_number}</span>
                    </div>
                  </div>

                  {/* Instrument Specifications */}
                  <div className="space-y-2.5 px-1">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-slate-500">ឧបករណ៍វាស់វែង / Instrument:</span>
                      <span className="font-bold text-slate-900 text-right max-w-[180px]">{report.measuring_instrument}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-500">លេខស៊េរីឧបករណ៍ / Serial No:</span>
                      <span className="font-mono font-bold text-slate-800">{report.instrument_serial_number}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-500">ប្រភេទសេវាកម្ម / Service Type:</span>
                      <span className="font-bold text-slate-900 bg-slate-50 border border-[#C9D2E3] text-[#2D327F] px-2 py-0.5 rounded-md text-[10px]">{getServiceTypeKH(report.service_type)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-500">កាលបរិច្ឆេទសេវាកម្ម / Service Date:</span>
                      <span className="font-mono text-slate-700">{report.service_start_date} ដល់ {report.service_end_date}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-500">ខែ/ឆ្នាំរបាយការណ៍ / Reporting Period:</span>
                      <span className="font-bold text-slate-800">ខែ {getMonthNameKH(report.report_month)} ឆ្នាំ {report.report_year}</span>
                    </div>
                  </div>

                  {/* Workflow Status badges - Section D */}
                  <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-2">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                      <span className="font-bold text-slate-600">ស្ថានភាពឯកសារ / Approval Status:</span>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${
                        (report.report_status || 'Approved') === 'Approved' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' :
                        (report.report_status || 'Approved') === 'Rejected' ? 'bg-rose-50 border border-rose-200 text-rose-800' :
                        (report.report_status || 'Approved') === 'Under Review' ? 'bg-amber-50 border border-amber-200 text-amber-800' :
                        'bg-sky-50 border border-sky-150 text-sky-800'
                      }`}>
                        {report.report_status || 'Approved'}
                      </span>
                    </div>
                    {report.approved_at && (
                      <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1">
                        <span>កាលបរិច្ឆេទអនុម័ត / Approved Date:</span>
                        <span className="font-mono">{new Date(report.approved_at).toLocaleDateString()}</span>
                      </div>
                    )}
                    <div className="text-[8px] text-slate-400 font-mono mt-1 text-center break-all select-all">
                      Verification Certificate Token: {report.id}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer branding */}
          <div className="bg-slate-50 p-4 border-t border-slate-150 flex flex-col items-center justify-center text-center text-[9px] text-slate-400 gap-0.5">
            <p className="font-semibold text-slate-500">ឆ្នាំ២០២៦ © រក្សាសិទ្ធិគ្រប់យ៉ាងដោយ៖ ​នាយកដ្ឋានមាត្រាសាស្ត្រឧស្សាហកម្ម | មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
            <p className="font-medium text-slate-400">ក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ បច្គេកវិទ្យា និងនវានុវត្តន៍</p>
          </div>
        </div>
      </div>
    );
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
              className={`px-4 py-1.5 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer bg-[#353C96] hover:bg-[#2D327F]`}
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
          
          {/* Top official banner section */}
          <div className="flex flex-col md:flex-row print:flex-row justify-between items-start border-b border-slate-100 pb-6">

            {/* Left: Ministry / Company Badge info */}
            <div className="w-full md:w-[45%] print:w-[45%] text-left space-y-1">
              {!selectedUser ? (
                <div className="space-y-0.5">
                  <p className="text-[10px] md:text-[11px] font-bold text-slate-900 leading-snug">ក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ បច្ចេកវិទ្យា និងនវានុវត្តន៍</p>
                  <p className="text-[10.5px] md:text-[11.5px] font-bold text-[#2D327F] underline font-muol leading-loose">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
                  {currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin') && currentUser.company_name_kh && (
                    <p className="text-[10px] md:text-[11px] font-bold text-slate-700 mt-1 pb-0.5 border-b border-dashed border-slate-200">{currentUser.company_name_kh}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">ក្រុមហ៊ុនសេវាកម្មមាត្រាសាស្ត្រ</p>
                  <p className="text-[11px] font-extrabold text-[#2D327F] underline">{displayCompanyName}</p>
                </div>
              )}
            </div>

            {/* Center: Official Sovereignty Text with custom spacing */}
            <div className="w-full md:w-[35%] print:w-[35%] text-center mt-4 md:mt-0 print:mt-0 space-y-1" style={{ fontFamily: '"Khmer OS Muol Light", "Moul", "Khmer OS Muol", serif' }}>
              <h1 className="text-xs sm:text-sm font-bold text-slate-900 tracking-wider">ព្រះរាជាណាចក្រកម្ពុជា</h1>
              <p className="text-[10px] sm:text-xs font-bold text-slate-700 tracking-wider">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
              <div className="flex justify-center py-0.5">
                <span className="text-[10px] text-slate-400">❖ ❖ ❖</span>
              </div>
            </div>

            {/* Right: Local Barcode & QR Code placed beautifully near "ជាតិ សាសនា ព្រះមហាក្សត្រ" */}
            <div className="w-full md:w-[20%] print:w-[20%] flex md:justify-end print:justify-end mt-4 md:mt-0 print:mt-0">
               <div className="flex flex-col items-center text-center space-y-1 border border-slate-150 p-2 rounded bg-slate-50/50">
                {qrCodeDataUrl ? (
                   <img
                    src={qrCodeDataUrl}
                    alt="Verification QR"
                    className="w-16 h-16 border border-slate-200 bg-white p-0.5"
                  />
                ) : (
                  <div className="w-16 h-16 bg-slate-100 flex items-center justify-center text-[8px] text-slate-400">QR Loading</div>
                )}
                {barcodeDataUrl && (
                  <img
                    src={barcodeDataUrl}
                    alt="Report Barcode"
                    className="h-9 w-28 object-contain mt-1"
                  />
                )}
              </div>
            </div>

          </div>

          {/* Salutation and Title details */}
          <div className="text-center pt-6 pb-2 space-y-1.5" style={{ fontFamily: '"Khmer OS Muol Light", "Moul", "Khmer OS Muol", serif' }}>
            <p className="text-xs sm:text-xs font-bold text-slate-800 leading-normal">
              សូមគោរពជូន
            </p>
            <p className="text-xs sm:text-xs font-bold text-slate-800 leading-normal">
              ឯកឧត្តមប្រធានមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ
            </p>
            
            <div className="pt-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-normal">
                {!selectedUser 
                  ? `របាយការណ៍ប្រចាំខែ ${monthKH || '........'} ឆ្នាំ ${yearKH || '.............'} ស្តីពីការផលិត តំឡើង និងជួសជុលឧបករណ៍មាត្រាសាស្ត្រ`
                  : titleText
                }
              </h2>
              <p className="text-[10px] text-slate-500 font-medium italic mt-1 font-sans">
                (Monthly Performance Report on Manufacturing, Installing, and Repairing Metrological Instruments)
              </p>
            </div>
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

          {/* Signature Sections */}
          <div className="pt-10 grid grid-cols-1 md:grid-cols-2 gap-8 text-xs font-semibold">
            
            {/* Left signature column: Government Approval */}
            <div className="space-y-1 text-left">
              <p className="text-slate-950 font-extrabold text-[11px] uppercase tracking-tight">បានឃើញ និងឯកភាព</p>
              {selectedUser ? (
                <div className="space-y-1">
                  <p className="text-slate-950 font-bold text-[10px] tracking-tight">អគ្គនាយក ឬ អ្នកតំណាងស្របច្បាប់</p>
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

            {/* Right signature column */}
            <div className="text-right space-y-1 flex flex-col items-end">
              {!selectedUser ? (
                <>
                  <div className="text-slate-600 italic text-[10px] leading-relaxed">
                    <p>{officialDate.lunarLine}</p>
                    <p>{officialDate.gregorianLine}</p>
                  </div>
                  <p className="text-slate-900 font-bold text-[10px] uppercase">អ្នករៀបចំរបាយការណ៍របស់នាយកដ្ឋាន</p>
                  <div className="h-28 flex flex-col justify-end items-center min-w-[220px]">
                    <p className="text-slate-300 leading-none">........................................................................</p>
                    <p className="text-[10px] text-slate-500 font-bold mt-1 text-center">(ហត្ថលេខា និងឈ្មោះអ្នករៀបចំ)</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-slate-600 italic text-[10px] leading-relaxed">
                    <p>{officialDate.lunarLine}</p>
                    <p>{officialDate.gregorianLine}</p>
                  </div>
                  <p className="text-slate-900 font-bold text-[10px] uppercase">អ្នករៀបចំរបាយការណ៍តំណាងក្រុមហ៊ុន</p>
                  <div className="h-28 flex flex-col justify-end items-center min-w-[220px]">
                    <p className="text-[11px] text-slate-950 font-extrabold mb-1">
                      {selectedUser.legal_representative}
                    </p>
                    <p className="text-slate-300 leading-none">........................................................................</p>
                    <p className="text-[10px] text-slate-500 font-bold mt-1 text-center">(ហត្ថលេខា និងឈ្មោះអ្នករៀបចំ)</p>
                  </div>
                </>
              )}
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
