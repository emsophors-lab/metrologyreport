import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  RefreshCw, 
  CornerDownRight,
  Database,
  ArrowRight
} from 'lucide-react';
import { MetrologyUser, MetrologyReport } from '../types';
import { parseUploadedExcel, ParsedExcelRow } from '../utils/excelReportParser';
import { downloadOfficialExcelTemplate } from '../utils/reportExcelTemplateGenerator';
import { validateExcelRow, RowValidationResult } from '../utils/reportImportValidator';

interface ExcelReportUploadProps {
  currentUser: MetrologyUser;
  allUsers: MetrologyUser[];
  existingReports: MetrologyReport[];
  onImportSuccess: (importedReports: MetrologyReport[], summaryText: string) => Promise<void>;
  toastMsg: (msg: string, type: 'success' | 'error') => void;
}

export default function ExcelReportUpload({
  currentUser,
  allUsers,
  existingReports,
  onImportSuccess,
  toastMsg
}: ExcelReportUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedExcelRow[]>([]);
  const [validationResults, setValidationResults] = useState<RowValidationResult[]>([]);
  
  // Track detailed counts for preview and post-import summary
  const [importSummary, setImportSummary] = useState<{
    total: number;
    valid: number;
    invalid: number;
    completed: boolean;
    importedCount: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop events
  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await processFile(file);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await processFile(file);
    }
  };

  // Triggers selecting file
  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  const processFile = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'xlsx') {
      toastMsg('សូមជ្រើសរើសតែឯកសារ Excel យោងទម្រង់លំនាំដើម (.xlsx) តែប៉ុណ្ណោះ!', 'error');
      return;
    }

    setFileName(file.name);
    setIsLoading(true);
    setImportSummary(null);

    try {
      const rows = await parseUploadedExcel(file);
      if (rows.length === 0) {
        toastMsg('ឯកសារគ្មានកំណត់ត្រា ឬទិន្នន័យឡើយ!', 'error');
        setIsLoading(false);
        setFileName(null);
        return;
      }

      setParsedRows(rows);

      // Validate each row according to roles, permissions, and database constraints
      const results = rows.map(row => 
        validateExcelRow(row, currentUser, allUsers, existingReports)
      );

      setValidationResults(results);

      const validCount = results.filter(r => r.isValid).length;
      setImportSummary({
        total: rows.length,
        valid: validCount,
        invalid: rows.length - validCount,
        completed: false,
        importedCount: 0
      });

      toastMsg(`បានអានរួចរាល់៖ រកឃើញទិន្នន័យសរុប ${rows.length} ជួរ និងមាន ${validCount} ជួរត្រឹមត្រូវ!`, 'success');
    } catch (err) {
      toastMsg((err as Error).message, 'error');
      setFileName(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    try {
      downloadOfficialExcelTemplate();
      toastMsg('ទម្រង់ Excel template ត្រូវបានទាញយកដោយជោគជ័យ!', 'success');
    } catch (e) {
      toastMsg('បរាជ័យក្នុងការទាញយកគំរូទម្រង់ Excel', 'error');
    }
  };

  const handleConfirmImport = async () => {
    const validReports = validationResults
      .filter(r => r.isValid && r.reportData !== null)
      .map(r => r.reportData as MetrologyReport);

    if (validReports.length === 0) {
      toastMsg('គ្មានទិន្នន័យដែលមានលក្ខណៈសម្បត្តិគ្រប់គ្រាន់សម្រាប់ការនាំចូលទេ!', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const summaryText = `បាននាំចូលឯកសារ Excel: សរុប ${parsedRows.length} ជួរ, ជោគជ័យ ${validReports.length} ជួរ, បរាជ័យ ${parsedRows.length - validReports.length} ជួរ (តាមរយៈ Excel Template)`;
      
      // Save directly into stores & synchronize with Supabase backend
      await onImportSuccess(validReports, summaryText);

      setImportSummary(prev => {
        if (!prev) return null;
        return {
          ...prev,
          completed: true,
          importedCount: validReports.length
        };
      });

      toastMsg(`នាំចូលទិន្នន័យចំនួន ${validReports.length} ជួរ ទៅកាន់ប្រព័ន្ធជោគជ័យ!`, 'success');
    } catch (e) {
      toastMsg('បរាជ័យក្នុងការរក្សាទុកទិន្នន័យនាំចូល៖ ' + (e as Error).message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setFileName(null);
    setParsedRows([]);
    setValidationResults([]);
    setImportSummary(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 space-y-6">
      
      {/* Title Header with download button inline */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-3 gap-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600 animate-pulse" />
          <h3 className="text-sm font-bold text-slate-800">
            នាំចូលរបាយការណ៍មាត្រាសាស្ត្រតាមរយៈ Excel (Batch Excel Import)
          </h3>
        </div>
        
        <button
          id="btn-download-excel-template"
          onClick={handleDownloadTemplate}
          className="w-full sm:w-auto px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-black rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Download Excel Template</span>
        </button>
      </div>

      {/* 1. File Upload Selector Dropzone Area - ONLY when no file in staging or not loading */}
      {!fileName && !isLoading && (
        <div 
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
            dragActive 
              ? 'border-emerald-500 bg-emerald-50/50 scale-[0.99]' 
              : 'border-slate-200 bg-slate-50 hover:bg-slate-150/40'
          }`}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".xlsx" 
            className="hidden" 
          />
          <div className="max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <Upload className="h-5 w-5 animate-bounce" />
            </div>
            
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-700">សូមទម្លាក់ឯកសារ Excel នៅទីនេះ ឬចុចប៊ូតុងខាងក្រោម</p>
              <p className="text-[10px] text-slate-400 font-mono">គាំទ្រតែឯកសារប្រភេទ Excel (.xlsx) ដែលស្របតាមទម្រង់ផ្លូវការប៉ុណ្ណោះ</p>
            </div>

            <button
              id="btn-upload-excel-file"
              type="button"
              onClick={handleTriggerUpload}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-lg shadow-sm transition-all inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Completed Excel File</span>
            </button>

            <div className="border border-emerald-100 rounded-lg p-3 bg-emerald-50/20 text-[10.5px] text-slate-600 text-left space-y-1 leading-relaxed">
              <p className="font-bold text-emerald-800">📋 សេចក្តីណែនាំអំពីកាលបរិច្ឆេទ និងប្រភេទសេវាកម្ម៖</p>
              <p>• ប្រភេទសេវាកម្មអនុញ្ញាត៖ <strong className="font-sans">Manufacture</strong> (ផលិត), <strong className="font-sans">Installation</strong> (តម្លើង), <strong className="font-sans">Repair</strong> (ជួសជុល)</p>
              <p>• ទម្រង់ថ្ងៃចាប់ផ្តើម/បញ្ចប់៖ <strong className="font-mono text-emerald-800 font-bold">YYYY-MM-DD</strong> (ឧទាហរណ៍៖ ២០២៦-០៦-០៩)</p>
              <p>• ឆ្នាំរបាយការណ៍៖ គាំទ្ររហូតដល់ឆ្នាំ ២០៥០</p>
            </div>
          </div>
        </div>
      )}

      {/* 2. Loading Spinner Animation while Processing */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-3 border border-slate-150 rounded-xl bg-slate-50/50">
          <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
          <p className="text-xs font-bold text-slate-600 animate-pulse">កំពុងអាន រៀបចំផ្ទៀងផ្ទាត់ និងត្រួតពិនិត្យទិន្នន័យ... សូមរង់ចាំ!</p>
        </div>
      )}

      {/* 3. Staged Records Details Preview Table & Processing Control */}
      {fileName && !isLoading && (
        <div className="space-y-6">
          
          {/* Action Header Card containing document stats */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4.5 w-4.5 text-emerald-600" />
                <span className="text-xs font-bold text-slate-800 truncate max-w-xs">{fileName}</span>
              </div>
              <p className="text-[10.5px] text-slate-500">
                ឯកសារនាំចូល៖ <strong>{parsedRows.length} ជួរ</strong> | 
                <span className="text-emerald-600 font-bold ml-1.5">✓ ត្រឹមត្រូវ៖ {importSummary?.valid} ជួរ</span> | 
                <span className="text-rose-500 font-bold ml-1.5">✗ មិនត្រូវ៖ {importSummary?.invalid} ជួរ</span>
              </p>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <button
                onClick={handleReset}
                className="flex-1 md:flex-none px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>ប្តូរឯកសារថ្មី (Reset)</span>
              </button>

              {importSummary && !importSummary.completed ? (
                <button
                  id="btn-confirm-import"
                  onClick={handleConfirmImport}
                  disabled={importSummary.valid === 0}
                  className={`flex-1 md:flex-none px-5 py-2 text-white text-xs font-black rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    importSummary.valid === 0 
                      ? 'bg-slate-300 cursor-not-allowed opacity-60' 
                      : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'
                  }`}
                >
                  <Database className="h-3.5 w-3.5 text-amber-300" />
                  <span>Confirm Import ({importSummary.valid} ជួរ)</span>
                </button>
              ) : (
                <div className="px-4 py-2 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                  <span>នាំចូលបានជោគជ័យរួចរាល់!</span>
                </div>
              )}
            </div>
          </div>

          {/* Validation Metrics Alert & Errors warning */}
          {importSummary && importSummary.invalid > 0 && !importSummary.completed && (
            <div className="flex gap-2.5 p-3 rounded-lg bg-rose-50 border border-rose-150 text-[11px] text-rose-800 leading-relaxed">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <div>
                <p className="font-bold text-rose-900">រកឃើញកំហុសទិន្នន័យចំនួន {importSummary.invalid} ជួរ</p>
                <p>មានតែជួរដែលមានសញ្ញាពណ៌បៃតង "ត្រឹមត្រូវ" ប៉ុណ្ណោះដែលនឹងត្រូវរក្សាទុកក្នុងប្រព័ន្ធ។ សូមពិនិត្យបញ្ជីកំហុសខាងក្រោម កែកំហុសក្នុងឯកសារ Excel រួចលីមីតឡើងវិញ។</p>
              </div>
            </div>
          )}

          {/* 4. Complete Post-Import Summary Sheet Info */}
          {importSummary && importSummary.completed && (
            <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wider">
                  របាយការណ៍សង្ខេបនៃការនាំចូល (Import Summary Report)
                </h4>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-3.5 rounded-lg border border-emerald-100 text-center space-y-1">
                  <p className="text-[10px] text-slate-400 uppercase font-sans tracking-wide">សរុបជួរ Excel (Total Rows)</p>
                  <p className="text-xl font-bold text-slate-700">{importSummary.total}</p>
                </div>
                <div className="bg-white p-3.5 rounded-lg border border-emerald-100 text-center space-y-1">
                  <p className="text-[10px] text-emerald-500 uppercase font-sans tracking-wide">នាំចូលជោគជ័យ (Success Rows)</p>
                  <p className="text-xl font-bold text-emerald-600">{importSummary.importedCount}</p>
                </div>
                <div className="bg-white p-3.5 rounded-lg border border-emerald-100 text-center space-y-1">
                  <p className="text-[10px] text-rose-400 uppercase font-sans tracking-wide">ជួរដែលមានកំហុស (Failed Rows)</p>
                  <p className="text-xl font-bold text-rose-500">{importSummary.invalid}</p>
                </div>
                <div className="bg-white p-3.5 rounded-lg border border-emerald-100 text-center space-y-1">
                  <p className="text-[10px] text-slate-400 uppercase font-sans tracking-wide">ស្ថានភាព (Status)</p>
                  <p className="text-xs font-bold text-emerald-800 bg-emerald-100 py-1 rounded">COMPLETED</p>
                </div>
              </div>

              {/* Show error logs for lines that failed */}
              {importSummary.invalid > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-rose-800">ស្វែងយល់ពីកំហុសសរសេរទិន្នន័យ (Row-by-Row Error Details)៖</p>
                  <div className="bg-white rounded-lg border border-rose-100 p-3 max-h-[140px] overflow-y-auto divide-y divide-rose-50 text-[10px] text-rose-700 space-y-1 font-sans">
                    {validationResults.filter(r => !r.isValid).map((rowErr, errIndex) => (
                      <div key={errIndex} className="py-1.5 leading-relaxed flex items-start gap-1.5">
                        <span className="font-bold text-rose-600 bg-rose-50 px-1 rounded shrink-0">ជួរ Excel: #{rowErr.rowIndex}</span>
                        <div>
                          {rowErr.errors.map((eStr, i) => (
                            <span key={i} className="block">• {eStr}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. Scrollable validation detailed rows checklist */}
          <div className="border border-slate-150 rounded-xl overflow-hidden bg-white max-h-[420px] overflow-y-auto">
            <h4 className="text-[11px] font-bold text-slate-650 uppercase bg-slate-50 py-2.5 px-4 tracking-wider border-b border-slate-100 font-sans flex items-center justify-between">
              <span>លទ្ធផលផ្ទៀងផ្ទាត់ទិន្នន័យតាមជួរ Excel (Preview & Verify Table)</span>
              <span className="text-[9.5px] lowercase font-normal text-slate-400 italic">បង្ហាញទាំងអស់</span>
            </h4>

            <div className="divide-y divide-slate-100">
              {validationResults.map((res, i) => {
                const parsed = parsedRows[i];
                return (
                  <div key={i} className={`p-4 text-xs transition-all hover:bg-slate-50/50 flex flex-col md:flex-row md:items-start justify-between gap-4 ${
                    res.isValid ? 'border-l-4 border-l-emerald-500 bg-emerald-50/10' : 'border-l-4 border-l-rose-500 bg-rose-50/5'
                  }`}>
                    
                    {/* Metatadata info */}
                    <div className="space-y-1.5 w-full md:max-w-2xl">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[9.5px] font-mono font-bold">
                          ជួរ Excel: #{res.rowIndex}
                        </span>
                        
                        {(parsed.company_name || parsed.license_number) && (
                          <span className="text-[10px] text-slate-600 font-semibold bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                            ក្រុមហ៊ុន៖ {parsed.company_name || parsed.license_number}
                          </span>
                        )}
                        
                        <ArrowRight className="h-3 w-3 text-slate-400" />

                        <span className="font-bold text-slate-800 text-[10.5px]">
                          អតិថិជន៖ {parsed.customer_name || '<មិនបានបំពេញ / Empty>'}
                        </span>
                      </div>

                      {/* Struct values preview info */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-slate-500 font-sans pl-1 pt-1 border-t border-dashed border-slate-100">
                        <div>
                          <span className="text-slate-400">ឧបករណ៍៖</span> <strong className="text-slate-700 font-semibold">{parsed.instrument_name || '—'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 font-sans">លេខស៊េរី S/N៖</span> <strong className="text-slate-700 font-mono font-semibold">{parsed.instrument_serial_number || '—'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 font-sans">ខែ/ឆ្នាំ៖</span> <strong className="text-slate-700 font-semibold">{parsed.report_month || '—'}/{parsed.report_year || '—'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400">សេវា៖</span> <strong className="text-slate-700 font-semibold">{parsed.service_type || '—'}</strong>
                        </div>
                      </div>

                      {/* Display Warnings */}
                      {res.warnings.length > 0 && (
                        <div className="bg-amber-50 rounded p-2 border border-amber-100 text-[10px] text-amber-800 space-y-0.5">
                          {res.warnings.map((warn, wIdx) => (
                            <p key={wIdx}>⚠️ {warn}</p>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Result checker */}
                    <div className="shrink-0 flex items-start gap-1.5 md:self-center">
                      {res.isValid ? (
                        <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 rounded-lg px-2.5 py-1 text-[10px] border border-emerald-150 font-bold">
                          <CheckCircle2 className="h-3.5 text-emerald-600" />
                          <span>ត្រឹមត្រូវ (Ready)</span>
                        </div>
                      ) : (
                        <div className="space-y-1.5 flex flex-col items-end">
                          <div className="flex items-center gap-1.5 bg-rose-50 text-rose-800 rounded-lg px-2.5 py-1 text-[10px] border border-rose-150 font-bold">
                            <XCircle className="h-3.5 text-rose-600" />
                            <span>កំហុស (Error)</span>
                          </div>
                          
                          {/* List of row errors */}
                          <div className="text-[10px] text-rose-600 space-y-0.5 max-w-xs text-left md:text-right font-medium bg-rose-50/30 p-2 rounded-md">
                            {res.errors.map((err, eIdx) => (
                              <p key={eIdx}>• {err}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
