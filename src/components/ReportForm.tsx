import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, PlusCircle, HelpCircle, Trash2 } from 'lucide-react';
import { MetrologyReport, MetrologyUser, ServiceType, generateYearOptions } from '../types';

interface ReportFormProps {
  currentUser: MetrologyUser;
  selectedReport: MetrologyReport | null;
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
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = String(today.getFullYear());
    setReportMonth(mm);
    setReportYear(yyyy);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedReport) {
      if (!currentUser.can_edit && currentUser.role === 'company') {
        toastMsg('គណនីរបស់អ្នកមិនមានសិទ្ធិកែប្រែរបាយការណ៍ឡើយ!', 'error');
        return;
      }
      if (currentUser.role === 'company' && selectedReport.report_status && !['Draft', 'Submitted'].includes(selectedReport.report_status)) {
        toastMsg(`មិនអាចកែប្រែបានទេ! របាយការណ៍ស្ថិតក្នុងស្ថានភាព: ${selectedReport.report_status} / Editing blocked on ${selectedReport.report_status} reports.`, 'error');
        return;
      }
    } else {
      if (!currentUser.can_save && currentUser.role === 'company') {
        toastMsg('គណនីរបស់អ្នកមិនមានសិទ្ធិបញ្ចូលរបាយការណ៍ថ្មីឡើយ!', 'error');
        return;
      }
    }
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
    if (currentUser.role === 'company' && selectedReport.report_status && selectedReport.report_status !== 'Draft') {
      toastMsg(`មិនអាចលុបបានទេ! លុះត្រាតែស្ថិតក្នុងស្ថានភាព Draft ប៉ុណ្ណោះ / Deletion blocked on non-Draft reports.`, 'error');
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

  const inputClass = "w-full bg-slate-50/70 border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/40 text-slate-800 transition-all placeholder:text-slate-300";
  const labelClass = "block text-[11px] font-bold text-slate-600 mb-1.5";

  return (
    <form onSubmit={handleFormSubmit} className="bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-navy/10 rounded-xl flex items-center justify-center">
            <FileSpreadsheet className="h-5 w-5 text-navy" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            {selectedReport ? 'កែប្រែព័ត៌មានរបាយការណ៍ / Edit Report' : 'បំពេញរបាយការណ៍ឧបករណ៍មាត្រាសាស្ត្រថ្មី'}
          </h3>
          {selectedReport && (
            <button
              type="button"
              onClick={() => { clearForm(); onClearActiveEdit(); }}
              className="ml-auto text-[11px] bg-slate-100 text-slate-500 font-bold px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
            >
              បោះបង់ការកែប្រែ (Cancel)
            </button>
          )}
        </div>
        <div className="mt-3 h-[3px] w-16 bg-navy rounded-full" />
      </div>

      {/* Fields */}
      <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <label className={labelClass}>ឈ្មោះអតិថិជន</label>
          <input type="text" required className={inputClass} placeholder="ឈ្មោះរោងចក្រ ហាង ឬសហគ្រាសជាដៃគូ" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>ទីតាំង ឬអាសយដ្ឋានអតិថិជន</label>
          <input type="text" className={inputClass} placeholder="បញ្ជាក់ ខេត្ត/ក្រុង ស្រុក/ខណ្ឌ ឬផ្លូវ" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
        </div>

        <div>
          <label className={labelClass}>ឧបករណ៍មាត្រាសាស្ត្រ</label>
          <input type="text" required className={inputClass} placeholder="ឧ. ជញ្ជីងរថយន្តអេឡិចត្រូនិចម៉ាក XK3190" value={measuringInstrument} onChange={(e) => setMeasuringInstrument(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>លេខស៊េរីឧបករណ៍វាស់វែង</label>
          <input type="text" required className={inputClass} placeholder="ឧ. S/N: 2026-AB-981" value={instrumentSerialNumber} onChange={(e) => setInstrumentSerialNumber(e.target.value)} />
        </div>

        <div>
          <label className={labelClass}>វិសាលភាព ឬវម្មាស់</label>
          <input type="text" className={inputClass} placeholder="ឧ If សមត្ថភាពវាស់ស្ទង់ពី ១ គីឡូក្រាម ទៅ ១០០ តោន" value={scopeOfWeightMeasure} onChange={(e) => setScopeOfWeightMeasure(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>ប្រភេទសេវាកម្មចម្បង</label>
          <select className={inputClass} value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceType)}>
            <option value="Installation">តម្លើង</option>
            <option value="Repair">ជួសជុល</option>
            <option value="Manufacture">ផលិត</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>គ្រឿងបន្លាស់មាន​ទំនាក់ទំនងជាមាត្រាសាស្ត្រ</label>
          <input type="text" className={inputClass} placeholder="ឧ If បន្ទះសេនស័រ Loadcell ឬ ក្បាលសញ្ញាអេឡិចត្រូនិច" value={spareParts} onChange={(e) => setSpareParts(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>លេខស៊េរីគ្រឿងបន្លាស់</label>
          <input type="text" className={inputClass} placeholder="ឧ If SP-SN: 99182A" value={sparePartSerialNumber} onChange={(e) => setSparePartSerialNumber(e.target.value)} />
        </div>

        <div>
          <label className={labelClass}>កាលបរិច្ឆេទចាប់ផ្តើមសេវាកម្ម</label>
          <input type="date" className={inputClass} value={serviceStartDate} onChange={(e) => setServiceStartDate(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>កាលបរិច្ឆេទបញ្ចប់សេវាកម្ម</label>
          <input type="date" className={inputClass} value={serviceEndDate} onChange={(e) => setServiceEndDate(e.target.value)} />
        </div>

        <div>
          <label className={labelClass}>របាយការណ៍សម្រាប់ខែ</label>
          <select className={inputClass} value={reportMonth} onChange={(e) => setReportMonth(e.target.value)}>
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
          <label className={labelClass}>របាយការណ៍ឆ្នាំ</label>
          <select className={inputClass} value={reportYear} onChange={(e) => setReportYear(e.target.value)}>
            {generateYearOptions(2000, 2050).map(year => (
              <option key={year} value={String(year)}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Divider + Actions */}
      <div className="px-6 pb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-navy via-gold to-transparent rounded-full mb-5" />
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={clearForm} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[12px] font-semibold rounded-lg transition-colors cursor-pointer">
            សម្អាត Form (Clear)
          </button>
          {selectedReport && (
            <button type="button" onClick={handleDelete} className="px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[12px] font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5">
              <Trash2 className="h-3.5 w-3.5" />
              លុបទិន្នន័យ (Delete)
            </button>
          )}
          <button type="submit" className="px-7 py-2.5 bg-navy hover:bg-navy/90 text-white text-[12px] font-bold rounded-lg transition-all shadow-sm flex items-center gap-2 cursor-pointer active:scale-[0.97]">
            <PlusCircle className="h-4 w-4 text-gold" />
            {selectedReport ? 'រក្សាទុកការកែសម្រួល (Update Report)' : 'បញ្ជូនរបាយការណ៍ (Add Report)'}
          </button>
        </div>
      </div>
    </form>
  );
}
