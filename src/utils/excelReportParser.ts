import * as XLSX from 'xlsx';

export interface ParsedExcelRow {
  company_name?: string;
  license_number?: string;
  customer_name?: string;
  customer_address?: string;
  instrument_name?: string;
  instrument_serial_number?: string;
  measuring_range?: string;
  spare_part_name?: string;
  spare_part_serial_number?: string;
  service_type?: string;
  service_start_date?: string;
  service_end_date?: string;
  report_month?: string;
  report_year?: string;
  rawRowIndex: number;
}

/**
 * Utility to parse Excel Date serial number or formatted string into YYYY-MM-DD string.
 */
function parseExcelDate(dateVal: any): string {
  if (!dateVal) return '';
  
  if (typeof dateVal === 'number') {
    // Excel date serial format converting to millisecond ticks
    const date = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const str = String(dateVal).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const parts = str.split(/[-/.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) { // YYYY-MM-DD
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else if (parts[2].length === 4) { // DD-MM-YYYY or MM-DD-YYYY or DD.MM.YYYY
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2];
      return `${y}-${m}-${d}`;
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return str;
}

/**
 * Parses the uploaded Excel file using the export-aligned "Monthly Report" template schema.
 */
export function parseUploadedExcel(file: File): Promise<ParsedExcelRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('គ្មានទិន្នន័យឯកសារឡើយ / Empty file data'));
          return;
        }

        const workbook = XLSX.read(data, { type: 'binary', cellDates: false });
        
        // Target specifically 'Monthly Report' sheet first as instructed, otherwise first sheet
        let worksheet = workbook.Sheets['Monthly Report'];
        if (!worksheet) {
          const firstSheetName = workbook.SheetNames[0];
          worksheet = workbook.Sheets[firstSheetName];
        }

        if (!worksheet) {
          reject(new Error('មិនអាចរកឃើញសន្លឹកកិច្ចការឡើយ / Worksheet not found'));
          return;
        }

        const rawJsonArray = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];

        const parsedRows: ParsedExcelRow[] = rawJsonArray.map((row, index) => {
          // Robust matching mapping helper to handle Khmer texts and English headers
          const getValue = (keys: string[]): string => {
            // Priority 1: Exact index key matching
            for (const key of keys) {
              if (row[key] !== undefined) {
                return String(row[key]).trim();
              }
            }

            // Priority 2: Fuzzy matching ignoring spaces, parenthesises, and casing
            for (const key of keys) {
              const cleanedTarget = key.toLowerCase().replace(/[\s_()\-.]/g, '');
              const foundKey = Object.keys(row).find(k => {
                const cleanedK = k.toLowerCase().replace(/[\s_()\-.]/g, '');
                return cleanedK === cleanedTarget || cleanedK.includes(cleanedTarget) || cleanedTarget.includes(cleanedK);
              });

              if (foundKey) {
                return String(row[foundKey]).trim();
              }
            }
            return '';
          };

          const rawStartDate = row['កាលបរិច្ឆេទចាប់ផ្តើម (Start Date)'] !== undefined 
            ? row['កាលបរិច្ឆេទចាប់ផ្តើម (Start Date)'] 
            : (row['Start Date'] || row['StartDate'] || row['service_start_date'] || '');

          const rawEndDate = row['កាលបរិច្ឆេទបញ្ចប់ (End Date)'] !== undefined 
            ? row['កាលបរិច្ឆេទបញ្ចប់ (End Date)'] 
            : (row['End Date'] || row['EndDate'] || row['service_end_date'] || '');

          return {
            company_name: getValue(['ឈ្មោះក្រុមហ៊ុន (Company)', 'company_name', 'companyName', 'ឈ្មោះក្រុមហ៊ុន', 'company']),
            license_number: getValue(['លេខអាជ្ញាប័ណ្ណ (License)', 'license_number', 'licenseNumber', 'លេខអាជ្ញាប័ណ្ណ', 'license']),
            customer_name: getValue(['ឈ្មោះអតិថិជន (Customer)', 'customer_name', 'customerName', 'ឈ្មោះអតិថិជន', 'customer']),
            customer_address: getValue(['ទីតាំងអតិថិជន (Address)', 'customer_address', 'customerAddress', 'ទីតាំងអតិថិជន', 'address']),
            instrument_name: getValue(['ឧបករណ៍មាត្រាសាស្ត្រ (Instrument)', 'instrument_name', 'instrumentName', 'ឧបករណ៍មាត្រាសាស្ត្រ', 'instrument']),
            instrument_serial_number: getValue(['លេខស៊េរីឧបករណ៍ (Instrument S/N)', 'instrument_serial_number', 'instrumentSerialNumber', 'លេខស៊េរីឧបករណ៍', 'serial_number', 'sn']),
            measuring_range: getValue(['វិសាលភាពថ្លឹង/រង្វាស់ (Scope)', 'measuring_range', 'measuringRange', 'វិសាលភាពថ្លឹង/រង្វាស់', 'scope', 'range']),
            spare_part_name: getValue(['គ្រឿងបន្លាស់ (Spare Parts)', 'spare_part_name', 'spareParts', 'គ្រឿងបន្លាស់', 'spare_parts', 'spare_part']),
            spare_part_serial_number: getValue(['លេខស៊េរីគ្រឿងបន្លាស់ (Spare S/N)', 'spare_part_serial_number', 'sparePartSerialNumber', 'លេខស៊េរីគ្រឿងបន្លាស់', 'spare_sn', 'spare_serial']),
            service_type: getValue(['ប្រភេទសេវាកម្ម (Service)', 'service_type', 'serviceType', 'ប្រភេទសេវាកម្ម', 'service']),
            service_start_date: parseExcelDate(rawStartDate),
            service_end_date: parseExcelDate(rawEndDate),
            report_month: getValue(['ខែរបាយការណ៍ (Month)', 'report_month', 'reportMonth', 'ខែរបាយការណ៍', 'month']),
            report_year: getValue(['ឆ្នាំរបាយការណ៍ (Year)', 'report_year', 'reportYear', 'ឆ្នាំរបាយការណ៍', 'year']),
            rawRowIndex: index + 2
          };
        });

        resolve(parsedRows);
      } catch (err) {
        reject(new Error('ការអានឯកសារ Excel បានបរាជ័យ៖ ' + (err as Error).message));
      }
    };

    reader.onerror = () => {
      reject(new Error('មិនអាចអានឯកសារបានឡើយ / FileReader failure'));
    };

    reader.readAsBinaryString(file);
  });
}
