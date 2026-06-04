import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, PlusCircle, Check, HelpCircle, Save, Calendar, Trash2 } from 'lucide-react';
import { MetrologyReport, MetrologyUser, ServiceType, generateYearOptions } from '../types';

interface ReportFormProps {
  currentUser: MetrologyUser;
  selectedReport: MetrologyReport | null; // For editing
  onSubmitReport: (report: MetrologyReport) => void;
  onDeleteReport: (reportId: string) => void;
  onClearActiveEdit: () => void;
  toastMsg: (msg: string, type: 'success' | 'error') => void;
}

export default function ReportForm({
  currentUser,
  selectedReport,
  onSubmitReport,
  onDeleteReport,
  onClearActiveEdit,
  toastMsg,
}: ReportFormProps) {
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [measuringInstrument, setMeasuringInstrument] = useState('');
  const [instrumentSerialNumber, setInstrumentSerialNumber] = useState('');
  const [scopeOfWeightMeasure, setScopeOfWeightMeasure] = useState('');
  const [spareParts, setSpareParts] = useState('');
  const [sparePartSerialNumber, setSparePartSerialNumber] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('Installation');
  const [serviceStartDate, setServiceStartDate] = useState('');
  const [serviceEndDate, setServiceEndDate] = useState('');
  const [reportMonth, setReportMonth] = useState('05');
  const [reportYear, setReportYear] = useState('2026');

  // Load selected report values if editing
  useEffect(() => {
    if (selectedReport) {
      setCustomerName(selectedReport.customer_name);
      setCustomerAddress(selectedReport.customer_address);
      setMeasuringInstrument(selectedReport.measuring_instrument);
      setInstrumentSerialNumber(selectedReport.instrument_serial_number);
      setScopeOfWeightMeasure(selectedReport.scope_of_weight_measure);
      setSpareParts(selectedReport.spare_parts || '');
      setSparePartSerialNumber(selectedReport.spare_part_serial_number || '');
      setServiceType(selectedReport.service_type);
      setServiceStartDate(selectedReport.service_start_date);
      setServiceEndDate(selectedReport.service_end_date);
      setReportMonth(selectedReport.report_month);
      setReportYear(selectedReport.report_year);
    } else {
      clearForm();
    }
  }, [selectedReport]);

  const clearForm = () => {
    setCustomerName('');
    setCustomerAddress('');
    setMeasuringInstrument('');
    setInstrumentSerialNumber('');
    setScopeOfWeightMeasure('');
    setSpareParts('');
    setSparePartSerialNumber('');
    setServiceType('Installation');
    setServiceStartDate('');
    setServiceEndDate('');
    
    // Default to current date months
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = String(today.getFullYear());
    setReportMonth(mm);
    setReportYear(yyyy);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Permissions check
    if (selectedReport) {
      if (!currentUser.can_edit && currentUser.role === 'company') {
        toastMsg('គណនីរបស់អ្នកមិនមានសិទ្ធិកែប្រែរបាយការណ៍ឡើយ!', 'error');
        return;
      }
    } else {
      if (!currentUser.can_save && currentUser.role === 'company') {
        toastMsg('គណនីរបស់អ្នកមិនមានសិទ្ធិបញ្ចូលរបាយការណ៍ថ្មីឡើយ!', 'error');
        return;
      }
    }

    // Input validations
    if (!customerName.trim() || !measuringInstrument.trim() || !instrumentSerialNumber.trim()) {
      toastMsg('សូមបំពេញព័ត៌មានកាតព្វកិច្ច (ឈ្មោះអតិថិជន, ឧបករណ៍, លេខស៊េរី)!', 'error');
      return;
    }

    const reportData: MetrologyReport = {
      id: selectedReport ? selectedReport.id : 'rep_' + Date.now(),
      user_id: selectedReport ? selectedReport.user_id : currentUser.id,
      license_number: selectedReport ? selectedReport.license_number : currentUser.license_number,
      company_name_kh: selectedReport ? selectedReport.company_name_kh : currentUser.company_name_kh,
      customer_name: customerName.trim(),
      customer_address: customerAddress.trim() || 'N/A',
      measuring_instrument: measuringInstrument.trim(),
      instrument_serial_number: instrumentSerialNumber.trim(),
      scope_of_weight_measure: scopeOfWeightMeasure.trim() || 'N/A',
      spare_parts: spareParts.trim(),
      spare_part_serial_number: sparePartSerialNumber.trim(),
      service_type: serviceType,
      service_start_date: serviceStartDate || new Date().toISOString().split('T')[0],
      service_end_date: serviceEndDate || new Date().toISOString().split('T')[0],
      report_month: reportMonth,
      report_year: reportYear,
      created_at: selectedReport ? selectedReport.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    onSubmitReport(reportData);
    clearForm();
    onClearActiveEdit();
  };

  const handleDelete = () => {
    if (!selectedReport) return;
    if (!currentUser.can_delete && currentUser.role === 'company') {
      toastMsg('គណនីរបស់អ្នកមិនមានសិទ្ធិលុបរបាយការណ៍ឡើងឡើយ!', 'error');
      return;
    }

    const confirmDel = window.confirm('តើអ្នកពិតជាចង់លុបរបាយការណ៍នេះចេញពីប្រព័ន្ធមែនទេ?');
    if (confirmDel) {
      onDeleteReport(selectedReport.id);
      clearForm();
      onClearActiveEdit();
      toastMsg('លុបរបាយការណ៍បានសម្រេច!', 'success');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-5">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-gold" />
          <h3 className="text-base font-bold text-slate-800">
            {selectedReport ? 'កែប្រែព័ត៌មានរបាយការណ៍ / Edit Report' : 'បំពេញរបាយការណ៍ឧបករណ៍មាត្រាសាស្ត្រថ្មី'}
          </h3>
        </div>
        
        {selectedReport && (
          <button
            type="button"
            onClick={() => {
              clearForm();
              onClearActiveEdit();
            }}
            className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-1 rounded hover:bg-slate-200 transition-colors cursor-pointer"
          >
            បោះបង់ការកែប្រែ (Cancel Edit)
          </button>
        )}
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-4">
        
        {/* Core details grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Customer name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ឈ្មោះអតិថិជន / Customer’s Name *
            </label>
            <input
              type="text"
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold text-slate-800"
              placeholder="ឈ្មោះរោងចក្រ ហាង ឬសហគ្រាសជាដៃគូ"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>

          {/* Customer address */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ទីតាំង ឬអាសយដ្ឋានអតិថិជន / Customer Address
            </label>
            <input
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold text-slate-800"
              placeholder="បញ្ជាក់ ខេត្ត/ក្រុង ស្រុក/ខណ្ឌ ឬផ្លូវ"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />
          </div>

          {/* Measuring instrument description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ឧបករណ៍មាត្រាសាស្ត្រ / Measuring Instrument *
            </label>
            <input
              type="text"
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold text-slate-800"
              placeholder="ឧ. ជញ្ជីងរថយន្តអេឡិចត្រូនិចម៉ាក XK3190"
              value={measuringInstrument}
              onChange={(e) => setMeasuringInstrument(e.target.value)}
            />
          </div>

          {/* Serial Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              លេខស៊េរីឧបករណ៍ឧបករណ៍ / Instrument Serial Number *
            </label>
            <input
              type="text"
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold text-slate-800 font-mono"
              placeholder="ឧ. S/N: 2026-AB-981"
              value={instrumentSerialNumber}
              onChange={(e) => setInstrumentSerialNumber(e.target.value)}
            />
          </div>

          {/* Scope weight or measure */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              វិសាលភាពថ្លឹង ឬរង្វាស់ / Scope of Weight or Measure
            </label>
            <input
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold text-slate-800"
              placeholder="ឧ. សមត្ថភាពវាស់ស្ទង់ពី ១ គីឡូក្រាម ទៅ ១០០ តោន"
              value={scopeOfWeightMeasure}
              onChange={(e) => setScopeOfWeightMeasure(e.target.value)}
            />
          </div>

          {/* Service category selector (Manuf, Install, Repair) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ប្រភេទសេវាកម្មចម្បង / Type of Service
            </label>
            <select
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-lg p-2.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold font-bold"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceType)}
            >
              <option value="Manufacture">ផលិត / Manufacture</option>
              <option value="Installation">តម្លើង / Installation</option>
              <option value="Repair">ជួសជុល / Repair</option>
            </select>
          </div>

          {/* Spare parts */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              គ្រឿងបន្លាស់មានចរិតលក្ខណៈជាមាត្រាសាស្ត្រ / Metrology Spare Parts
            </label>
            <input
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold text-slate-800"
              placeholder="ឧ. បន្ទះសេនស័រ Loadcell ឬ ក្បាលសញ្ញាអេឡិចត្រូនិច"
              value={spareParts}
              onChange={(e) => setSpareParts(e.target.value)}
            />
          </div>

          {/* Spare parts S/N */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              លេខស៊េរីគ្រឿងបន្លាស់ / Serial Number of Spare Part
            </label>
            <input
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold text-slate-800 font-mono"
              placeholder="ឧ. SP-SN: 99182A"
              value={sparePartSerialNumber}
              onChange={(e) => setSparePartSerialNumber(e.target.value)}
            />
          </div>

          {/* Start and end dates */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              កាលបរិច្ឆេទចាប់ផ្តើមសេវាកម្ម / Start Date
            </label>
            <div className="relative">
              <input
                type="date"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold text-slate-800"
                value={serviceStartDate}
                onChange={(e) => setServiceStartDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              កាលបរិច្ឆេទបញ្ចប់សេវាកម្ម / End Date
            </label>
            <div className="relative">
              <input
                type="date"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold text-slate-800"
                value={serviceEndDate}
                onChange={(e) => setServiceEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Report Month and Year Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              របាយការណ៍សម្រាប់ខែ / Report Month
            </label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold text-slate-800"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
            >
              <option value="01">មករា (01)</option>
              <option value="02">កុម្ភៈ (02)</option>
              <option value="03">មីនា (03)</option>
              <option value="04">មេសា (04)</option>
              <option value="05">ឧសភា (05)</option>
              <option value="06">មិថុនា (06)</option>
              <option value="07">កក្កដា (07)</option>
              <option value="08">សីហា (08)</option>
              <option value="09">កញ្ញា (09)</option>
              <option value="10">តុលា (10)</option>
              <option value="11">វិច្ឆិកា (11)</option>
              <option value="12">ធ្នូ (12)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              របាយការណ៍ឆ្នាំ / Report Year
            </label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-gold text-slate-800"
              value={reportYear}
              onChange={(e) => setReportYear(e.target.value)}
            >
              {generateYearOptions(2000, 2050).map(year => (
                <option key={year} value={String(year)}>{year}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Informative text below form */}
        <div className="flex gap-2 bg-gold/5 p-3 rounded-lg border border-gold/15 text-[11px] text-slate-700 leading-relaxed">
          <HelpCircle className="h-5 w-5 text-gold shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-slate-850">សេចក្តីណែនាំសង្ខេប ៖</p>
            <p>សូមធានាថាព័ត៌មានដែលបំពេញខាងលើត្រឹមត្រូវ និងទាក់ទងនឹងការអនុវត្តការងារជាក់ស្តែងរបស់ក្រុមហ៊ុន។ ទិន្នន័យនេះនឹងត្រូវត្រួតពិនិត្យដោយមន្ត្រីមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ ក៏ដូចជាសម្រាប់ជាឯកសារយោងផ្លូវការនាពេលក្រោយ។</p>
          </div>
        </div>

        {/* Buttons matching section 7 constraints */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={clearForm}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            សម្អាត Form (Clear)
          </button>

          {selectedReport && (
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="h-3.5 w-3.5 animate-pulse" />
              លុបទិន្នន័យ (Delete)
            </button>
          )}

          <button
            type="submit"
            className="px-6 py-2 bg-navy hover:bg-navy/90 text-white text-xs font-bold rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <PlusCircle className="h-4 w-4 text-gold" />
            {selectedReport ? 'រក្សាទុកការកែសម្រួល (Update Report)' : 'បញ្ជូនរបាយការណ៍ (Add Report)'}
          </button>
        </div>
      </form>
    </div>
  );
}
