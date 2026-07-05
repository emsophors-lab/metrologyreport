import { MetrologyReport, MetrologyUser } from './types';
import { formatKhmerOfficialDateBlock } from './utils/khmerOfficialDate';

// Converts service types to Khmer headings
export function getServiceTypeKH(type: string): string {
  switch (type) {
    case 'Manufacture': return 'ផលិត (Manufacture)';
    case 'Installation': return 'តម្លើង (Installation)';
    case 'Repair': return 'ជួសជុល (Repair)';
    default: return type;
  }
}

// Format month index to Khmer month name
export function getMonthNameKH(numStr: string): string {
  const months: Record<string, string> = {
    '01': 'មករា', '02': 'កុម្ភៈ', '03': 'មីនា', '04': 'មេសា', '05': 'ឧសភា', '06': 'មិថុនា',
    '07': 'កក្កដា', '08': 'សីហា', '09': 'កញ្ញា', '10': 'តុលា', '11': 'វិច្ឆិកា', '12': 'ធ្នូ'
  };
  return months[numStr] || `ខែទី ${numStr}`;
}

// Local offline generation helpers
export async function generateLocalQRCode(text: string): Promise<string> {
  try {
    const QRCode = await import('qrcode');
    return await QRCode.toDataURL(text, {
      width: 154,
      margin: 1,
      errorCorrectionLevel: 'M'
    });
  } catch (err) {
    console.warn('Local QR Code generation failed, falling back to simple server:', err);
    return `https://api.qrserver.com/v1/create-qr-code/?size=154x154&data=${encodeURIComponent(text)}&ecc=M`;
  }
}

export async function generateLocalBarcode(text: string): Promise<string> {
  try {
    const JsBarcode = (await import('jsbarcode')).default;
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, text, {
      format: 'CODE128',
      width: 1.5,
      height: 48,
      displayValue: true,
      fontSize: 10,
      font: 'monospace',
      margin: 4
    });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('Local Barcode generation failed:', err);
    return '';
  }
}

export function getReportVerificationUrl(
  reportId: string, 
  filters?: {
    month?: string;
    year?: string;
    companyId?: string;
    serviceType?: string;
    searchQuery?: string;
  }
): string {
  let origin = 'https://ais-dev-nmgbgbd647arjsyjuqbcse-211647852106.asia-southeast1.run.app';
  if (typeof window !== 'undefined' && window.location) {
    origin = window.location.origin;
  }
  if (reportId === 'filtered' && filters) {
    const params = new URLSearchParams();
    params.set('verifyReport', 'filtered');
    if (filters.month) params.set('month', filters.month);
    if (filters.year) params.set('year', filters.year);
    if (filters.companyId) params.set('companyId', filters.companyId);
    if (filters.serviceType) params.set('serviceType', filters.serviceType);
    if (filters.searchQuery) params.set('searchQuery', filters.searchQuery);
    return `${origin}/?${params.toString()}`;
  } else {
    return `${origin}/?verifyReport=${reportId}`;
  }
}

export function getGeneratedReportNumber(
  companyId: string | 'all',
  year: string | undefined,
  month: string | undefined,
  licenseNumber?: string
): string {
  const cleanYear = year && year !== 'all' ? year : new Date().getFullYear().toString();
  const cleanMonth = month && month !== 'all' ? String(month).padStart(2, '0') : String(new Date().getMonth() + 1).padStart(2, '0');
  const runningNum = '0001';
  
  if (companyId === 'all') {
    return `NMC-TR-${cleanYear}-${cleanMonth}-${runningNum}`;
  } else {
    const cleanLicense = licenseNumber ? licenseNumber.replace(/[^a-zA-Z0-9]/g, '') : '';
    const suffix = cleanLicense ? `-${cleanLicense}` : `-${runningNum}`;
    return `NMC-CR-${cleanYear}-${cleanMonth}${suffix}`;
  }
}

// Generates the official Cambodian QR Code URL with optional verification filters
export function getReportQRCodeUrl(
  reportId: string, 
  companyLicense: string, 
  filters?: {
    month?: string;
    year?: string;
    companyId?: string;
    serviceType?: string;
    searchQuery?: string;
  }
): string {
  const url = getReportVerificationUrl(reportId, filters);
  const data = encodeURIComponent(url);
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${data}&ecc=M`;
}

// Export data directly to Excel (using SheetJS)
export async function exportReportsToExcel(reports: MetrologyReport[], title: string = 'របាយការណ៍មាត្រាសាស្ត្រ') {
  const XLSX = await import('xlsx');
  const officialDate = formatKhmerOfficialDateBlock(new Date(), { location: 'រាជធានីភ្នំពេញ' });
  const formattedData = reports.map((r, i) => ({
    'ល.រ (No.)': i + 1,
    'ឈ្មោះក្រុមហ៊ុន (Company)': r.company_name_kh,
    'លេខអាជ្ញាប័ណ្ណ (License)': r.license_number,
    'ឈ្មោះអតិថិជន (Customer)': r.customer_name,
    'ទីតាំងអតិថិជន (Address)': r.customer_address,
    'ឧបករណ៍មាត្រាសាស្ត្រ (Instrument)': r.measuring_instrument,
    'លេខស៊េរីឧបករណ៍ (Instrument S/N)': r.instrument_serial_number,
    'វិសាលភាពថ្លឹង/រង្វាស់ (Scope)': r.scope_of_weight_measure,
    'គ្រឿងបន្លាស់ (Spare Parts)': r.spare_parts || 'គ្មាន',
    'លេខស៊េរីគ្រឿងបន្លាស់ (Spare S/N)': r.spare_part_serial_number || 'គ្មាន',
    'ប្រភេទសេវាកម្ម (Service)': getServiceTypeKH(r.service_type),
    'កាលបរិច្ឆេទចាប់ផ្តើម (Start Date)': r.service_start_date,
    'កាលបរិច្ឆេទបញ្ចប់ (End Date)': r.service_end_date,
    'ខែរបាយការណ៍ (Month)': getMonthNameKH(r.report_month),
    'ឆ្នាំរបាយការណ៍ (Year)': r.report_year,
  }));

  const worksheet = XLSX.utils.json_to_sheet(formattedData);

  // Set column widths
  const maxProps = [{ wch: 6 }, { wch: 30 }, { wch: 18 }, { wch: 30 }, { wch: 35 }, { wch: 35 }, { wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }];
  worksheet['!cols'] = maxProps;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Report Title', title],
    ['Official Khmer lunar date', officialDate.lunarLine],
    ['Official Khmer Gregorian date', officialDate.gregorianLine],
    ['Prepared by', 'National Metrology Center of Cambodia']
  ]), 'Report Metadata');
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Monthly Report');

  // Trigger download
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `${title}_${dateStr}.xlsx`);
}

// Export to Microsoft Word utilizing the HTML-to-MIME Doc layout
export async function exportToWordDoc(
  reports: MetrologyReport[], 
  selectedUser?: MetrologyUser | null, 
  currentUser?: MetrologyUser | null,
  filterMonth?: string,
  filterYear?: string,
  filterServiceType?: string,
  searchQuery?: string
) {
  const now = new Date();
  
  // Detached report indicators
  const isTotalReport = !selectedUser;
  
  // Format month and year
  const formatM = (m?: string) => {
    if (!m || m === 'all') return 'all';
    return String(m).padStart(2, '0');
  };
  
  const activeMonth = formatM(filterMonth) !== 'all' ? formatM(filterMonth) : (reports.length > 0 ? formatM(reports[0].report_month) : 'all');
  const activeYear = filterYear && filterYear !== 'all' ? filterYear : (reports.length > 0 ? reports[0].report_year : 'all');
  
  const monthKH = activeMonth !== 'all' ? getMonthNameKH(activeMonth) : '';
  const yearKH = activeYear !== 'all' ? activeYear : '';
  
  const officialDate = formatKhmerOfficialDateBlock(now, { location: 'រាជធានីភ្នំពេញ' });
  const officialDateHtml = `
    <p style="font-size: 10px; font-style: italic; color: #334155; margin: 0; line-height: 1.55; font-family: 'Khmer OS Battambang', Arial, sans-serif;">${officialDate.lunarLine}</p>
    <p style="font-size: 10px; font-style: italic; color: #334155; margin: 2px 0 0 0; line-height: 1.55; font-family: 'Khmer OS Battambang', Arial, sans-serif;">${officialDate.gregorianLine}</p>
  `;

  // Generate Report Number & QR content offline
  const reportNumber = getGeneratedReportNumber(
    isTotalReport ? 'all' : selectedUser.id,
    filterYear,
    filterMonth,
    selectedUser?.license_number
  );

  const verificationUrl = getReportVerificationUrl(
    isTotalReport ? 'filtered' : (reports[0]?.id || 'NMC-QR-ALL'),
    {
      month: filterMonth,
      year: filterYear,
      companyId: selectedUser?.id || 'all',
      serviceType: filterServiceType,
      searchQuery: searchQuery
    }
  );

  // Generate local images (offline-friendly)
  const qrCodeBase64 = await generateLocalQRCode(verificationUrl);
  const barcodeBase64 = await generateLocalBarcode(reportNumber);

  // Get active company name
  const displayCompanyName = selectedUser?.company_name_kh || (currentUser?.role === 'company' ? currentUser?.company_name_kh : '');
  const activeUserCompanyKH = (currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin')) ? currentUser.company_name_kh : '';

  let titleText = 'របាយការណ៍ប្រចាំខែស្តីពីការផលិត តំឡើង និងជួសជុលឧបករណ៍មាត្រាសាស្ត្រ';
  if (monthKH && yearKH) {
    titleText = `របាយការណ៍ប្រចាំខែ ${monthKH} ឆ្នាំ ${yearKH} ស្តីពីការផលិត តំឡើង និងជួសជុលឧបករណ៍មាត្រាសាស្ត្រ`;
  } else if (monthKH) {
    titleText = `របាយការណ៍ប្រចាំខែ ${monthKH} ស្តីពីការផលិត តំឡើង និងជួសជុលឧបករណ៍មាត្រាសាស្ត្រ`;
  } else if (yearKH) {
    titleText = `របាយការណ៍ប្រចាំឆ្នាំ ${yearKH} ស្តីពីការផលិត តំឡើង និងជួសជុលឧបករណ៍មាត្រាសាស្ត្រ`;
  }

  // Company profile metadata table card matching ReportPrintLayout style
  const companyInfoTable = selectedUser ? `
    <table style="border: 1px solid #cbd5e1; border-collapse: collapse; width: 100%; margin-bottom: 25px; font-family: 'Khmer OS Battambang', 'Noto Sans Khmer', Arial, sans-serif; font-size: 11px;">
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 7px; background-color: #f8fafc; font-weight: bold; width: 220px;">- អាជ្ញាប័ណ្ណលេខ</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px; font-weight: bold; color: #0f172a; font-family: Arial, sans-serif;">${selectedUser.license_number}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 7px; background-color: #f8fafc; font-weight: bold;">- ឈ្មោះសហគ្រាស (ភាសាខែ្មរ)</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px; font-weight: bold; color: #020617;">${selectedUser.company_name_kh}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 7px; background-color: #f8fafc; font-weight: bold;">- ឈ្មោះសហគ្រាស (ភាសាអង់គ្លេស)</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px; font-weight: bold; color: #1e293b; font-family: Arial, sans-serif;">${selectedUser.company_name_en}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 7px; background-color: #f8fafc; font-weight: bold;">- អាសយដ្ឋាន</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px; color: #334155;">${selectedUser.address}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 7px; background-color: #f8fafc; font-weight: bold;">- លេខទូរស័ព្ទ</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px; font-weight: bold; color: #334155; font-family: Arial, sans-serif;">${selectedUser.phone}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 7px; background-color: #f8fafc; font-weight: bold;">- អ៊ីម៉ែល</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px; color: #334155; font-family: Arial, sans-serif;">${selectedUser.email}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 7px; background-color: #f8fafc; font-weight: bold;">- ឈ្មោះអ្នកតំណាងស្របច្បាប់</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px; font-weight: bold; color: #020617;">${selectedUser.legal_representative}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 7px; background-color: #f8fafc; font-weight: bold;">- តួនាទីអ្នកតំណាងស្របច្បាប់</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px; color: #334155;">${selectedUser.representative_position}</td>
      </tr>
    </table>
  ` : `
    <div style="border: 1px solid #cbd5e1; padding: 12px; background-color: #f8fafc; border-radius: 6px; font-family: 'Khmer OS Battambang', 'Noto Sans Khmer', Arial, sans-serif; font-size: 11px; font-weight: bold; text-align: center; color: #475569; margin-bottom: 25px;">
      សរុបលទ្ធផលរួមបញ្ចូលគ្នានៃសហគ្រាសសេវាកម្មមាត្រាសាស្ត្រទាំងអស់ដែលទទួលបានអាជ្ញាប័ណ្ណ
    </div>
  `;

  let tableRows = '';
  reports.forEach((r, index) => {
    tableRows += `
      <tr style="font-family: 'Khmer OS Battambang', Arial, sans-serif; font-size: 10px;">
        <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; color: #64748b;">${index + 1}</td>
        ${isTotalReport ? `<td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${r.company_name_kh}<br><span style="font-size: 8px; color: #64748b; font-family: Arial;">${r.license_number}</span></td>` : ''}
        <td style="border: 1px solid #cbd5e1; padding: 6px; line-height: 1.4;">
          <b style="color: #0f172a;">${r.customer_name}</b><br>
          <span style="font-size: 8.5px; color: #64748b;">${r.customer_address}</span>
        </td>
        <td style="border: 1px solid #cbd5e1; padding: 6px;">${r.measuring_instrument}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; font-family: Arial;">${r.instrument_serial_number}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px;">${r.scope_of_weight_measure}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px; line-height: 1.3;">
          ${r.spare_parts || '-'}
          ${r.spare_part_serial_number ? `<br><span style="font-size: 8px; color: #64748b; font-family: Arial;">S/N: ${r.spare_part_serial_number}</span>` : ''}
        </td>
        <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold;">${getServiceTypeKH(r.service_type)}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-size: 9px; font-family: Arial;">${r.service_start_date} ដល់ ${r.service_end_date}</td>
      </tr>
    `;
  });

  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>Official Metrology Report</title>
      <style>
        @page {
          size: A4 landscape;
          margin: 1.2cm;
        }
        body {
          font-family: 'Khmer OS Battambang', 'Noto Sans Khmer', Arial, sans-serif;
          line-height: 1.5;
          color: #000;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 15px;
        }
        th, td {
          border: 1px solid #cbd5e1;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #f1f5f9;
        }
      </style>
    </head>
    <body style="padding:20px;">
      
      <!-- Crown sovereignty header table with Local QR and Barcode top-right -->
      <table style="border: none; width: 100%; margin-bottom: 20px; border-collapse: collapse;">
        <tr style="border: none;">
          <td style="border: none; width: 45%; text-align: left; vertical-align: top; padding: 0; font-family: 'Khmer OS Battambang', Arial, sans-serif;">
            ${isTotalReport ? `
              <p style="font-size: 11px; font-weight: bold; margin: 0; color: #1e3a8a; font-family: 'Khmer OS Muol Light', 'Moul', 'Khmer OS Muol', serif; line-height: 1.4;">ក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ បច្ចេកវិទ្យា និងនវានុវត្តន៍</p>
              <p style="font-size: 11px; font-weight: bold; margin: 4px 0 0 0; color: #1e3a8a; text-decoration: underline; font-family: 'Khmer OS Muol Light', 'Moul', 'Khmer OS Muol', serif;">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
              ${activeUserCompanyKH ? `<p style="font-size: 10px; font-weight: bold; margin: 6px 0 0 0; color: #334155; font-family: 'Khmer OS Battambang', Arial, sans-serif;">${activeUserCompanyKH}</p>` : ''}
            ` : `
              <p style="font-size: 10px; font-weight: bold; margin: 0; color: #475569; text-transform: uppercase;">ក្រុមហ៊ុនសេវាកម្មមាត្រាសាស្ត្រ</p>
              <p style="font-size: 12px; font-weight: 800; color: #1e3a8a; text-decoration: underline; margin: 4px 0 0 0;">${displayCompanyName}</p>
            `}
          </td>
          <td style="border: none; width: 35%; text-align: center; vertical-align: top; padding: 0;">
            <p style="font-size: 13px; font-weight: bold; margin: 0; letter-spacing: 1px; font-family: 'Khmer OS Muol Light', 'Moul', 'Khmer OS Muol', serif;">ព្រះរាជាណាចក្រកម្ពុជា</p>
            <p style="font-size: 11px; font-weight: bold; margin: 3px 0 0 0; letter-spacing: 1px; font-family: 'Khmer OS Muol Light', 'Moul', 'Khmer OS Muol', serif;">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
            <p style="margin: 5px 0 0 0; font-size: 10px; color: #94a3b8;">❖ ❖ ❖</p>
          </td>
          <td style="border: none; width: 20%; text-align: right; vertical-align: top; padding: 0;">
            <div style="display: inline-block; text-align: center;">
              ${qrCodeBase64 ? `<img src="${qrCodeBase64}" style="width: 79px; height: 79px; display: block; margin: 0 auto;" />` : ''}
              ${barcodeBase64 ? `
                <div style="margin-top: 5px; text-align: center;">
                  <img src="${barcodeBase64}" style="width: 120px; height: auto;" />
                </div>
              ` : ''}
            </div>
          </td>
        </tr>
      </table>

      <!-- Document Title & Header Area with Custom Salutation formatting -->
      <div style="text-align: center; margin-top: 15px; margin-bottom: 25px;">
        <p style="font-size: 12px; font-weight: bold; margin: 0 0 2px 0; color: #000; font-family: 'Khmer OS Muol Light', 'Moul', 'Khmer OS Muol', serif;">សូមគោរពជូន</p>
        <p style="font-size: 11.5px; font-weight: bold; margin: 0 0 12px 0; color: #000; font-family: 'Khmer OS Muol Light', 'Moul', 'Khmer OS Muol', serif;">ឯកឧត្តមប្រធានមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
        
        <h2 style="font-size: 14px; font-weight: bold; margin: 0; color: #000; line-height: 1.4; font-family: 'Khmer OS Muol Light', 'Moul', 'Khmer OS Muol', serif;">
          ${isTotalReport 
            ? `របាយការណ៍ប្រចាំខែ ${monthKH || '........'} ឆ្នាំ ${yearKH || '.............'} ស្តីពីការផលិត តំឡើង និងជួសជុលឧបករណ៍មាត្រាសាស្ត្រ`
            : titleText
          }
        </h2>
        
        <p style="font-size: 9.5px; color: #64748b; font-style: italic; margin: 4px 0 0 0; font-family: Arial, sans-serif;">
          (Monthly Performance Report on Manufacturing, Installing, and Repairing Metrological Instruments)
        </p>
      </div>

      <!-- Company profile metadata / Total description block -->
      ${companyInfoTable}

      <!-- Main Records table with appropriate columns -->
      <table style="border: 1px solid #cbd5e1; border-collapse: collapse; width: 100%;">
        <thead>
          <tr style="background-color: #f1f5f9; font-weight: bold; font-family: 'Khmer OS Battambang', Arial, sans-serif; font-size: 10px; color: #334155;">
            <th style="border: 1px solid #cbd5e1; padding: 7px; text-align: center; width: 40px;">ល.រ</th>
            ${isTotalReport ? `<th style="border: 1px solid #cbd5e1; padding: 7px; width: 160px;">ក្រុមហ៊ុនសហគ្រាស</th>` : ''}
            <th style="border: 1px solid #cbd5e1; padding: 7px; width: 180px;">អតិថិជន និងអាសយដ្ឋាន</th>
            <th style="border: 1px solid #cbd5e1; padding: 7px; width: 140px;">ឧបករណ៍វាស់វែង</th>
            <th style="border: 1px solid #cbd5e1; padding: 7px; text-align: center; width: 100px;">លេខស៊េរីឧបករណ៍</th>
            <th style="border: 1px solid #cbd5e1; padding: 7px; width: 130px;">វិសាលភាពវាស់ស្ទង់</th>
            <th style="border: 1px solid #cbd5e1; padding: 7px; width: 140px;">គ្រឿងបន្លាស់ និងលេខស៊េរី</th>
            <th style="border: 1px solid #cbd5e1; padding: 7px; text-align: center; width: 100px;">ប្រភេទសេវាកម្ម</th>
            <th style="border: 1px solid #cbd5e1; padding: 7px; text-align: center; width: 150px;">កាលបរិច្ឆេទសេវាកម្ម</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <!-- Dignified Dotted Signature Block with zero dynamic name disclosure for Total Reports -->
      <div style="margin-top: 50px; width: 100%;">
        <table style="border: none; width: 100%; border-collapse: collapse;">
          <tr style="border: none;">
            
            <!-- Left Gov/Sovereignty approval column -->
            <td style="border: none; width: 50%; vertical-align: top; text-align: left; padding: 0; font-family: 'Khmer OS Battambang', Arial, sans-serif; font-size: 11px;">
              <p style="font-size: 11px; font-weight: bold; text-transform: uppercase; margin: 0; color: #020617;">បានឃើញ និងឯកភាព</p>
              ${!isTotalReport ? `
                <p style="font-size: 10.5px; font-weight: bold; margin: 5px 0 0 0; color: #334155;">អគ្គនាយក ឬ អ្នកតំណាងស្របច្បាប់</p>
                <div style="margin-top: 85px;">
                  <p style="margin: 0; color: #94a3b8;">...............................................................</p>
                  <p style="font-size: 11px; font-weight: bold; margin: 6px 0 0 0; color: #0f172a;">ឈ្មោះ៖ ${selectedUser.legal_representative}</p>
                  <p style="font-size: 10px; color: #64748b; margin: 2px 0 0 0;">(តួនាទី៖ ${selectedUser.representative_position})</p>
                </div>
              ` : `
                <p style="font-size: 10.5px; font-weight: bold; margin: 5px 0 0 0; color: #334155;">ប្រធាននាយកដ្ឋាន</p>
                <div style="margin-top: 85px;">
                  <p style="margin: 0; color: #94a3b8;">..................................................</p>
                  <p style="font-size: 10.5px; color: #64748b; margin: 6px 0 0 0;">(ហត្ថលេខា និងត្រា)</p>
                </div>
              `}
            </td>

            <!-- Right preparing compiler column -->
            <td style="border: none; width: 50%; vertical-align: top; text-align: right; padding: 0; font-family: 'Khmer OS Battambang', Arial, sans-serif; font-size: 11px;">
              ${!isTotalReport ? `
                ${officialDateHtml}
                <p style="font-size: 10.5px; font-weight: bold; margin: 5px 0 0 0; color: #020617;">អ្នករៀបចំរបាយការណ៍តំណាងក្រុមហ៊ុន</p>
                
                <div style="margin-top: 85px; text-align: right;">
                  <p style="font-size: 11px; font-weight: bold; color: #020617; margin: 0 0 2px 0;">
                    ${selectedUser.legal_representative}
                  </p>
                  <p style="margin: 0; color: #94a3b8;">...............................................................</p>
                  <p style="font-size: 10px; color: #64748b; margin: 4px 0 0 0;">(ហត្ថលេខា និងឈ្មោះអ្នករៀបចំ)</p>
                </div>
              ` : `
                ${officialDateHtml}
                <p style="font-size: 10.5px; font-weight: bold; margin: 5px 0 0 0; color: #020617; font-family: 'Khmer OS Muol Light', 'Moul', 'Khmer OS Muol', serif;">អ្នករៀបចំរបាយការណ៍របស់នាយកដ្ឋាន</p>
                
                <div style="margin-top: 85px; text-align: right;">
                  <p style="margin: 0; color: #94a3b8;">...............................................................</p>
                  <p style="font-size: 10px; color: #64748b; margin: 4px 0 0 0;">(ហត្ថលេខា និងឈ្មោះអ្នករៀបចំ)</p>
                </div>
              `}
            </td>

          </tr>
        </table>
      </div>

    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `របាយការណ៍មាត្រាសាស្ត្រ_${selectedUser?.company_name_kh || 'សរុប'}_${now.toISOString().split('T')[0]}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export the filtered Metrology enterprise/user accounts list directly to Microsoft Word (.doc) format
export function exportUsersToWordDoc(users: MetrologyUser[]) {
  const now = new Date();
  const officialDate = formatKhmerOfficialDateBlock(now, { location: 'រាជធានីភ្នំពេញ' });
  const officialDateHtml = `
    <p style="font-size: 10px; font-style: italic; color: #334155; margin: 0; line-height: 1.55; font-family: 'Khmer OS Battambang', Arial, sans-serif;">${officialDate.lunarLine}</p>
    <p style="font-size: 10px; font-style: italic; color: #334155; margin: 2px 0 0 0; line-height: 1.55; font-family: 'Khmer OS Battambang', Arial, sans-serif;">${officialDate.gregorianLine}</p>
  `;

  let tableRows = '';
  users.forEach((u, index) => {
    const formattedDate = u.created_at ? new Date(u.created_at).toLocaleDateString('km-KH') : 'N/A';
    tableRows += `
      <tr style="font-family: 'Khmer OS Battambang', Arial, sans-serif; font-size: 10px;">
        <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; color: #64748b;">${index + 1}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #0f172a;">
          ${u.company_name_kh}<br>
          <span style="font-size: 8.5px; color: #64748b; font-family: Arial;">${u.company_name_en}</span>
        </td>
        <td style="border: 1px solid #cbd5e1; padding: 6px; font-family: Arial, sans-serif; text-align: center; font-weight: bold;">
          ${u.license_number}
        </td>
        <td style="border: 1px solid #cbd5e1; padding: 6px; line-height: 1.4;">
          <b>${u.legal_representative}</b><br>
          <span style="font-size: 8.5px; color: #64748b;">${u.representative_position}</span>
        </td>
        <td style="border: 1px solid #cbd5e1; padding: 6px; font-family: Arial, sans-serif;">
          ${u.phone}<br>
          <span style="font-size: 8.5px; color: #64748b;">${u.email}</span>
        </td>
        <td style="border: 1px solid #cbd5e1; padding: 6px; font-size: 9px; max-width: 150px;">
          ${u.address}
        </td>
        <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; text-transform: uppercase; font-size: 8.5px;">
          ${u.role}
        </td>
        <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-size: 9px; font-family: Arial;">
          ${formattedDate}
        </td>
      </tr>
    `;
  });

  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>Official NMC Enterprise Directory</title>
      <style>
        @page {
          size: A4 landscape;
          margin: 1.2cm;
        }
        body {
          font-family: 'Khmer OS Battambang', 'Noto Sans Khmer', Arial, sans-serif;
          line-height: 1.5;
          color: #000;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 15px;
        }
        th, td {
          border: 1px solid #cbd5e1;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #f1f5f9;
        }
      </style>
    </head>
    <body style="padding:20px;">
      
      <!-- Crown sovereignty header table -->
      <table style="border: none; width: 100%; margin-bottom: 15px; border-collapse: collapse;">
        <tr style="border: none;">
          <td style="border: none; width: 50%; text-align: left; vertical-align: top; padding: 0; font-family: 'Khmer OS Battambang', Arial, sans-serif;">
            <p style="font-size: 10px; font-weight: bold; margin: 0; color: #334155; text-transform: uppercase;">ក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ</p>
            <p style="font-size: 10px; font-weight: bold; margin: 0; color: #334155;">បច្ចេកវិទ្យា និងនវានុវត្តន៍</p>
            <p style="font-size: 11px; font-weight: bold; color: #1e3a8a; text-decoration: underline; margin: 4px 0 0 0;">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
          </td>
          <td style="border: none; width: 50%; text-align: center; vertical-align: top; padding: 0;">
            <p style="font-size: 13px; font-weight: bold; margin: 0; letter-spacing: 1px; font-family: 'Khmer OS Muol Light', 'Moul', 'Khmer OS Muol', serif;">ព្រះរាជាណាចក្រកម្ពុជា</p>
            <p style="font-size: 11px; font-weight: bold; margin: 3px 0 0 0; letter-spacing: 1px; font-family: 'Khmer OS Muol Light', 'Moul', 'Khmer OS Muol', serif;">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
            <p style="margin: 5px 0 0 0; font-size: 10px; color: #94a3b8;">❖ ❖ ❖</p>
          </td>
        </tr>
      </table>

      <!-- Document Title & Header Area -->
      <div style="text-align: center; margin-top: 15px; margin-bottom: 25px; font-family: 'Khmer OS Battambang', Arial, sans-serif;">
        <h2 style="font-size: 15px; font-weight: 950; margin: 0; color: #0f172a; line-height: 1.4;">បញ្ជីព័ត៌មានគណនីសហគ្រាស និងមន្ត្រីទាំងអស់</h2>
        <p style="font-size: 10.5px; color: #64748b; font-style: italic; margin: 4px 0 0 0; font-family: Arial, sans-serif;">
          (NMC Licensee Enterprise and Officers Metadata Directory)
        </p>
      </div>

      <!-- Main Records table -->
      <table style="border: 1px solid #cbd5e1; border-collapse: collapse; width: 100%;">
        <thead>
          <tr style="background-color: #f1f5f9; font-weight: bold; font-family: 'Khmer OS Battambang', Arial, sans-serif; font-size: 10.5px; color: #334155;">
            <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 40px;">ល.រ</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px;">ឈ្មោះសហគ្រាស / សេចក្តីលម្អិត</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 110px;">លេខអាជ្ញាប័ណ្ណ</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px; width: 130px;">អ្នកតំណាងស្របច្បាប់</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px; width: 130px;">ទូរស័ព្ទ / អ៊ីម៉ែល</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px;">អាសយដ្ឋាន</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 80px;">សិទ្ធិវណ្ណៈ</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 90px;">កាលបរិច្ឆេទបង្កើត</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <!-- Dignified Dotted Signature Block -->
      <div style="margin-top: 50px; width: 100%;">
        <table style="border: none; width: 100%; border-collapse: collapse;">
          <tr style="border: none;">
            <td style="border: none; width: 50%; vertical-align: top; text-align: left; padding: 0; font-family: 'Khmer OS Battambang', Arial, sans-serif; font-size: 11px;">
              <p style="font-size: 11.5px; font-weight: bold; text-transform: uppercase; margin: 0; color: #020617;">បានឃើញ និងផ្ទៀងផ្ទាត់</p>
              <p style="font-size: 10.5px; font-weight: bold; margin: 5px 0 0 0; color: #334155;">ប្រធានមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
              <div style="margin-top: 80px;">
                <p style="margin: 0; color: #94a3b8;">...............................................................</p>
                <p style="font-size: 10.5px; color: #64748b; margin: 6px 0 0 0;">(ហត្ថលេខា និងត្រាបង្គោល)</p>
              </div>
            </td>

            <td style="border: none; width: 50%; vertical-align: top; text-align: right; padding: 0; font-family: 'Khmer OS Battambang', Arial, sans-serif; font-size: 11px;">
              ${officialDateHtml}
              <p style="font-size: 10.5px; font-weight: bold; margin: 5px 0 0 0; color: #020617;">អ្នកគ្រប់គ្រងទិន្នន័យប្រព័ន្ធ</p>
              <div style="margin-top: 80px;">
                <p style="margin: 0; color: #94a3b8;">...............................................................</p>
                <p style="font-size: 10px; color: #64748b; margin: 4px 0 0 0;">(ហត្ថលេខា និងឈ្មោះមន្ត្រីរៀបចំ)</p>
              </div>
            </td>
          </tr>
        </table>
      </div>

    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `បញ្ជីគណនីសហគ្រាស_NMC_Directory_${now.toISOString().split('T')[0]}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
