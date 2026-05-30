import * as XLSX from 'xlsx';
import { MetrologyReport, MetrologyUser } from './types';

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

// Generates the official Cambodian QR Code URL
export function getReportQRCodeUrl(reportId: string, companyLicense: string): string {
  let origin = 'https://ais-dev-nmgbgbd647arjsyjuqbcse-211647852106.asia-southeast1.run.app';
  if (typeof window !== 'undefined' && window.location) {
    origin = window.location.origin;
  }
  const verificationUrl = `${origin}/?verifyReport=${reportId}`;
  const data = encodeURIComponent(verificationUrl);
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${data}&ecc=M`;
}

// Export data directly to Excel (using SheetJS)
export function exportReportsToExcel(reports: MetrologyReport[], title: string = 'របាយការណ៍មាត្រាសាស្ត្រ') {
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
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Monthly Report');

  // Trigger download
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `${title}_${dateStr}.xlsx`);
}

// Export to Microsoft Word utilizing the HTML-to-MIME Doc layout
export function exportToWordDoc(
  reports: MetrologyReport[], 
  selectedUser?: MetrologyUser | null, 
  currentUser?: MetrologyUser | null,
  filterMonth?: string,
  filterYear?: string
) {
  const now = new Date();
  const dateString = `ថ្ងៃទី ${now.getDate()} ខែ ${getMonthNameKH(String(now.getMonth() + 1).padStart(2, '0'))} ឆ្នាំ ${now.getFullYear()}`;

  // Get active company name from either context
  const displayCompanyName = selectedUser?.company_name_kh || (currentUser?.role === 'company' ? currentUser?.company_name_kh : '');

  // Format month & year for title text just like Print PDF layout
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
        ${!selectedUser ? `<td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${r.company_name_kh}<br><span style="font-size: 8px; color: #64748b; font-family: Arial;">${r.license_number}</span></td>` : ''}
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
      
      <!-- Crown sovereignty header table -->
      <table style="border: none; width: 100%; margin-bottom: 15px; border-collapse: collapse;">
        <tr style="border: none;">
          <td style="border: none; width: 50%; text-align: left; vertical-align: top; padding: 0; font-family: 'Khmer OS Battambang', Arial, sans-serif;">
            ${displayCompanyName ? `
              <p style="font-size: 10px; font-weight: bold; margin: 0; color: #475569; text-transform: uppercase;">ក្រុមហ៊ុនសេវាកម្មមាត្រាសាស្ត្រ</p>
              <p style="font-size: 12px; font-weight: 800; color: #1e3a8a; text-decoration: underline; margin: 4px 0 0 0;">${displayCompanyName}</p>
            ` : `
              <p style="font-size: 10px; font-weight: bold; margin: 0; color: #334155; text-transform: uppercase;">ក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ</p>
              <p style="font-size: 10px; font-weight: bold; margin: 0; color: #334155;">បច្ចេកវិទ្យា និងនវានុវត្តន៍</p>
              <p style="font-size: 11px; font-weight: bold; color: #1e3a8a; text-decoration: underline; margin: 4px 0 0 0;">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
            `}
          </td>
          <td style="border: none; width: 50%; text-align: center; vertical-align: top; padding: 0; font-family: 'Khmer OS Battambang', Arial, sans-serif;">
            <p style="font-size: 13px; font-weight: bold; margin: 0; letter-spacing: 1px;">ព្រះរាជាណាចក្រកម្ពុជា</p>
            <p style="font-size: 11px; font-weight: bold; margin: 3px 0 0 0; letter-spacing: 1px;">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
            <p style="margin: 5px 0 0 0; font-size: 10px; color: #94a3b8;">❖ ❖ ❖</p>
          </td>
        </tr>
      </table>

      <!-- Document Title & Header Area -->
      <div style="text-align: center; margin-top: 15px; margin-bottom: 25px; font-family: 'Khmer OS Battambang', Arial, sans-serif;">
        <p style="font-size: 12px; font-weight: bold; margin: 0 0 8px 0; color: #1e293b;">សូមគោរពជូនឯកឧត្តមប្រធានមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
        <h2 style="font-size: 15px; font-weight: 950; margin: 0; color: #0f172a; line-height: 1.4;">${titleText}</h2>
        <p style="font-size: 10.5px; color: #64748b; font-style: italic; margin: 4px 0 0 0; font-family: Arial, sans-serif;">
          (Monthly Performance Report on Manufacturing, Installing, and Repairing Metrological Instruments)
        </p>
      </div>

      <!-- Company profile cards info table -->
      ${companyInfoTable}

      <!-- Main Records table -->
      <table style="border: 1px solid #cbd5e1; border-collapse: collapse; width: 100%;">
        <thead>
          <tr style="background-color: #f1f5f9; font-weight: bold; font-family: 'Khmer OS Battambang', Arial, sans-serif; font-size: 10.5px; color: #334155;">
            <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 40px;">ល.រ</th>
            ${!selectedUser ? `<th style="border: 1px solid #cbd5e1; padding: 8px; width: 160px;">ក្រុមហ៊ុនសហគ្រាស</th>` : ''}
            <th style="border: 1px solid #cbd5e1; padding: 8px; width: 180px;">អតិថិជន និងអាសយដ្ឋាន</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px; width: 140px;">ឧបករណ៍វាស់វែង</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 100px;">លេខស៊េរីឧបករណ៍</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px; width: 130px;">វិសាលភាពវាស់ស្ទង់</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px; width: 140px;">គ្រឿងបន្លាស់ និងលេខស៊េរី</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 100px;">ប្រភេទសេវាកម្ម</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 150px;">កាលបរិច្ឆេទសេវាកម្ម</th>
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
            
            <!-- Left Gov approval column -->
            <td style="border: none; width: 50%; vertical-align: top; text-align: left; padding: 0; font-family: 'Khmer OS Battambang', Arial, sans-serif; font-size: 11px;">
              <p style="font-size: 11.5px; font-weight: bold; text-transform: uppercase; margin: 0; color: #020617;">បានឃើញ និងឯកភាព</p>
              ${selectedUser ? `
                <p style="font-size: 10.5px; font-weight: bold; margin: 5px 0 0 0; color: #334155;">អគ្គនាយក ឬ អ្នកតំណាងស្របច្បាប់</p>
                <div style="margin-top: 85px;">
                  <p style="margin: 0; color: #94a3b8;">...............................................................</p>
                  <p style="font-size: 11px; font-weight: bold; margin: 6px 0 0 0; color: #0f172a;">ឈ្មោះ៖ ${selectedUser.legal_representative}</p>
                  <p style="font-size: 10px; color: #64748b; margin: 2px 0 0 0;">(តួនាទី៖ ${selectedUser.representative_position})</p>
                </div>
              ` : `
                <p style="font-size: 10.5px; font-weight: bold; margin: 5px 0 0 0; color: #334155;">ប្រធាននាយកដ្ឋាន</p>
                <div style="margin-top: 85px;">
                  <p style="margin: 0; color: #94a3b8;">...............................................................</p>
                  <p style="font-size: 10.5px; color: #64748b; margin: 6px 0 0 0;">(ហត្ថលេខា និងត្រា)</p>
                </div>
              `}
            </td>

            <!-- Right preparing compiler column -->
            <td style="border: none; width: 50%; vertical-align: top; text-align: right; padding: 0; font-family: 'Khmer OS Battambang', Arial, sans-serif; font-size: 11px;">
              <p style="font-size: 10px; font-style: italic; color: #64748b; margin: 0;">${dateString}</p>
              <p style="font-size: 10.5px; font-weight: bold; margin: 5px 0 0 0; color: #020617;">
                ${selectedUser ? 'អ្នករៀបចំរបាយការណ៍តំណាងក្រុមហ៊ុន' : 'អ្នករៀបចំរបាយការណ៍របស់នាយកដ្ឋាន'}
              </p>
              
              <!-- QR Verification block -->
              <div style="margin-top: 15px; text-align: right;">
                <img src="${getReportQRCodeUrl(reports[0]?.id || 'NMC-QR-ALL', selectedUser?.license_number || 'NMC-LICENSE')}" style="width: 80px; height: 80px; display: inline-block;" />
                <p style="font-size: 7.5px; color: #94a3b8; font-family: Arial, sans-serif; margin: 3px 0 0 0; text-transform: uppercase;">Scan to Verify Record</p>
              </div>

              <!-- Signature names above dotted lines -->
              <div style="margin-top: 25px; text-align: right;">
                <p style="font-size: 11px; font-weight: bold; color: #020617; margin: 0 0 2px 0;">
                  ${currentUser?.legal_representative || currentUser?.username || 'លោក លី ម៉េង'}
                </p>
                <p style="margin: 0; color: #94a3b8;">...............................................................</p>
                <p style="font-size: 10px; color: #64748b; margin: 4px 0 0 0;">(ហត្ថលេខា និងឈ្មោះអ្នករៀបចំ)</p>
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
  a.download = `របាយការណ៍មាត្រាសាស្ត្រ_${selectedUser?.company_name_kh || 'សរុប'}_${now.toISOString().split('T')[0]}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export the filtered Metrology enterprise/user accounts list directly to Microsoft Word (.doc) format
export function exportUsersToWordDoc(users: MetrologyUser[]) {
  const now = new Date();
  const dateString = `ថ្ងៃទី ${now.getDate()} ខែ ${getMonthNameKH(String(now.getMonth() + 1).padStart(2, '0'))} ឆ្នាំ ${now.getFullYear()}`;

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
          <td style="border: none; width: 50%; text-align: center; vertical-align: top; padding: 0; font-family: 'Khmer OS Battambang', Arial, sans-serif;">
            <p style="font-size: 13px; font-weight: bold; margin: 0; letter-spacing: 1px;">ព្រះរាជាណាចក្រកម្ពុជា</p>
            <p style="font-size: 11px; font-weight: bold; margin: 3px 0 0 0; letter-spacing: 1px;">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
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
              <p style="font-size: 10px; font-style: italic; color: #64748b; margin: 0;">${dateString}</p>
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

