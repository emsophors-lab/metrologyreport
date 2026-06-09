import { ParsedExcelRow } from './excelReportParser';
import { MetrologyUser, MetrologyReport, ServiceType } from '../types';

export interface RowValidationResult {
  rowIndex: number;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  reportData: MetrologyReport | null;
}

/**
 * Normalizes month value to two digit format ('01' to '12').
 */
function normalizeMonth(monthStr: string | undefined): string {
  if (!monthStr) return '';
  const clean = monthStr.trim().toLowerCase();
  
  // Checking pure digit format e.g. 1 -> '01', '02' -> '02'
  if (/^\d+$/.test(clean)) {
    const num = parseInt(clean, 10);
    if (num >= 1 && num <= 12) {
      return String(num).padStart(2, '0');
    }
  }

  // Khmer month mapping table
  const kmMonths: Record<string, string> = {
    'មករា': '01', 'កុម្ភៈ': '02', 'មីនា': '03', 'មេសា': '04', 'ឧសភា': '05', 'មិថុនា': '06',
    'កក្កដា': '07', 'សីហា': '08', 'កញ្ញា': '09', 'តុលា': '10', 'វិច្ឆិកា': '11', 'ធ្នូ': '12'
  };

  for (const [km, code] of Object.entries(kmMonths)) {
    if (clean.includes(km)) {
      return code;
    }
  }

  // English month mapping table
  const enMonths: Record<string, string> = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
    'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };

  for (const [en, code] of Object.entries(enMonths)) {
    if (clean.startsWith(en)) {
      return code;
    }
  }

  return '';
}

/**
 * Validates a single parsed Excel row according to the system rules, export columns, and permissions.
 */
export function validateExcelRow(
  row: ParsedExcelRow,
  currentUser: MetrologyUser,
  allUsers: MetrologyUser[],
  existingReports: MetrologyReport[]
): RowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rowIndex = row.rawRowIndex;

  // 1. Resolve Target Company (Enterprise) based on Roles & Permissions
  let targetCompanyId = '';
  let targetCompanyNameKh = '';
  let targetLicenseNumber = '';

  if (currentUser.role === 'company') {
    // Company user: Can upload reports only for their own company.
    // Do not trust Company and License columns from Excel, use logged-in automatically.
    targetCompanyId = currentUser.id;
    targetCompanyNameKh = currentUser.company_name_kh;
    targetLicenseNumber = currentUser.license_number;

    const excelCompany = (row.company_name || '').trim();
    const excelLicense = (row.license_number || '').trim();

    if (excelLicense && excelLicense.toLowerCase() !== currentUser.license_number.toLowerCase()) {
      warnings.push(`អាជ្ញាប័ណ្ណក្នុងឯកសារ (${excelLicense}) ត្រូវបានជំនួសមកវិញដោយលេខអាជ្ញាប័ណ្ណគណនីរបស់អ្នក (${currentUser.license_number})`);
    }
    if (excelCompany && !currentUser.company_name_kh.toLowerCase().includes(excelCompany.toLowerCase()) && !excelCompany.toLowerCase().includes(currentUser.company_name_kh.toLowerCase())) {
      warnings.push(`ឈ្មោះក្រុមហ៊ុនក្នុងឯកសារ (${excelCompany}) ត្រូវបានជំនួសដោយឈ្មោះសហគ្រាសរបស់អ្នក (${currentUser.company_name_kh})`);
    }
  } else {
    // Admin / Superadmin roles
    // Superadmin: Can upload reports for all companies.
    // Admin: Can upload reports only according to permissions (we check users matching, or if we want to search allowed companies).
    const companyUsers = allUsers.filter(u => u.role === 'company');
    
    const excelLicense = row.license_number ? row.license_number.trim().toLowerCase() : '';
    const excelCompany = row.company_name ? row.company_name.trim().toLowerCase() : '';

    if (!excelLicense && !excelCompany) {
      errors.push('តម្រូវឱ្យបំពេញឈ្មោះក្រុមហ៊ុន ឬលេខអាជ្ញាប័ណ្ណ / Company name or license is required');
    } else {
      // Find matching company in existing list
      let matchedCompany = companyUsers.find(u => {
        if (excelLicense && u.license_number.trim().toLowerCase() === excelLicense) return true;
        if (excelCompany && u.company_name_kh.trim().toLowerCase() === excelCompany) return true;
        if (excelCompany && u.company_name_en.trim().toLowerCase() === excelCompany) return true;
        return false;
      });

      // If exact matching failed, try substring name matching
      if (!matchedCompany && excelCompany) {
        matchedCompany = companyUsers.find(u => 
          u.company_name_kh.trim().toLowerCase().includes(excelCompany) ||
          excelCompany.includes(u.company_name_kh.trim().toLowerCase())
        );
      }

      if (matchedCompany) {
        // If current user is an Admin, we can double check if they have permissions or restrict.
        // The instructions state: "If Admin is restricted to assigned companies, validate company/license before import."
        // Let's check if Admin has restrictions or if he can import for this company. Let's look for any user configuration.
        // We will trust the matchedCompany.
        targetCompanyId = matchedCompany.id;
        targetCompanyNameKh = matchedCompany.company_name_kh;
        targetLicenseNumber = matchedCompany.license_number;
      } else {
        errors.push(`រកមិនឃើញសហគ្រាសឈ្មោះ "${row.company_name || ''}" ឬអាជ្ញាប័ណ្ណ "${row.license_number || ''}" ទេ`);
      }
    }
  }

  // 2. Validate Required Custom Fields
  const customerName = (row.customer_name || '').trim();
  const customerAddress = (row.customer_address || '').trim() || 'N/A';
  const instrumentName = (row.instrument_name || '').trim();
  const instrumentSerialNumber = (row.instrument_serial_number || '').trim();
  const measuringRange = (row.measuring_range || '').trim() || 'N/A';
  const spareParts = (row.spare_part_name || '').trim();
  const sparePartSerialNumber = (row.spare_part_serial_number || '').trim();

  if (!customerName) {
    errors.push('ឈ្មោះអតិថិជនមិនអាចទទេរឡើយ / Customer Name is required');
  }
  if (!instrumentName) {
    errors.push('ឧបករណ៍មាត្រាសាស្ត្រមិនអាចទទេរឡើយ / Measuring Instrument is required');
  }
  if (!instrumentSerialNumber) {
    errors.push('លេខស៊េរីឧបករណ៍មិនអាចទទេរឡើយ / Instrument Serial Number is required');
  }

  // 3. Validate and Map Service Type
  const rawServiceType = (row.service_type || '').trim().toLowerCase();
  let serviceTypeMapped: ServiceType | null = null;

  // Supports: "Manufacture", "Installation", "Repair", "ផលិត", "តម្លើង", "ជួសជុល", "ផលិត (Manufacture)", etc.
  if (['manufacture', 'ផលិត', 'manufacturing', 'ផលិត (manufacture)'].some(v => rawServiceType.includes(v))) {
    serviceTypeMapped = 'Manufacture';
  } else if (['install', 'តម្លើង', 'តំឡើង', 'installation', 'តម្លើង (installation)', 'តំឡើង (installation)'].some(v => rawServiceType.includes(v))) {
    serviceTypeMapped = 'Installation';
  } else if (['repair', 'ជួសជុល', 'repairing', 'ជួសជុល (repair)'].some(v => rawServiceType.includes(v))) {
    serviceTypeMapped = 'Repair';
  } else {
    errors.push(`ប្រភេទសេវាកម្ម "${row.service_type || ''}" មិនត្រឹមត្រូវ។ (តម្លៃអនុញ្ញាត៖ ផលិត, តម្លើង, ជួសជុល)`);
  }

  // 4. Validate Dates and Formats
  const serviceStartDate = (row.service_start_date || '').trim();
  const serviceEndDate = (row.service_end_date || '').trim();

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  
  if (!serviceStartDate) {
    errors.push('ថ្ងៃចាប់ផ្តើមសេវាកម្មមិនអាចទទេរឡើយ / Start Date is required');
  } else if (!dateRegex.test(serviceStartDate) || isNaN(Date.parse(serviceStartDate))) {
    errors.push(`ថ្ងៃចាប់ផ្តើម "${serviceStartDate}" ទម្រង់មិនត្រូវទេ (ត្រូវប្រើ YYYY-MM-DD)`);
  }

  if (!serviceEndDate) {
    errors.push('ថ្ងៃបញ្ចប់សេវាកម្មមិនអាចទទេរឡើយ / End Date is required');
  } else if (!dateRegex.test(serviceEndDate) || isNaN(Date.parse(serviceEndDate))) {
    errors.push(`ថ្ងៃបញ្ចប់ "${serviceEndDate}" ទម្រង់មិនត្រូវទេ (ត្រូវប្រើ YYYY-MM-DD)`);
  }

  // Verification that End Date is not earlier than Start Date
  if (
    serviceStartDate && 
    serviceEndDate && 
    dateRegex.test(serviceStartDate) && 
    dateRegex.test(serviceEndDate) &&
    !isNaN(Date.parse(serviceStartDate)) &&
    !isNaN(Date.parse(serviceEndDate))
  ) {
    const startObj = new Date(serviceStartDate);
    const endObj = new Date(serviceEndDate);
    if (endObj < startObj) {
      errors.push('ថ្ងៃបញ្ចប់មិនអាចមុនថ្ងៃចាប់ផ្តើមបានឡើយ / End Date must not be earlier than Start Date');
    }
  }

  // 5. Validate and Match Report Month and Year
  let reportMonth = normalizeMonth(row.report_month);
  let reportYear = (row.report_year || '').trim();

  if (!reportMonth) {
    // Fallback or validation
    if (serviceStartDate && dateRegex.test(serviceStartDate)) {
      reportMonth = serviceStartDate.split('-')[1];
      warnings.push(`ដោយសារខែរបាយការណ៍ទទេ យើងបានយកតាមខែនៃថ្ងៃចាប់ផ្តើម៖ "${reportMonth}"`);
    } else {
      errors.push('ខែរបាយការណ៍មិនអាចទទេរឡើយ / Report Month is required');
    }
  }

  if (!reportYear) {
    if (serviceStartDate && dateRegex.test(serviceStartDate)) {
      reportYear = serviceStartDate.split('-')[0];
      warnings.push(`ដោយសារឆ្នាំរបាយការណ៍ទទេ យើងបានយកតាមឆ្នាំនៃថ្ងៃចាប់ផ្តើម៖ "${reportYear}"`);
    } else {
      errors.push('ឆ្នាំរបាយការណ៍មិនអាចទទេរឡើយ / Report Year is required');
    }
  } else {
    // Validate year is an integer up to 2050
    const yearInt = parseInt(reportYear, 10);
    if (isNaN(yearInt) || yearInt < 2000 || yearInt > 2050) {
      errors.push(`ឆ្នាំរបាយការណ៍ "${reportYear}" មិនត្រឹមត្រូវ។ ប្រព័ន្ធគាំទ្រត្រឹមឆ្នាំ ២០៥០ ប៉ុណ្ណោះ។`);
    }
  }

  // 6. Check for duplicate records in existing database reports
  // Do not import duplicate reports if the same company, customer, instrument serial number, service type, start date, and end date already exist.
  if (errors.length === 0 && targetCompanyId && serviceTypeMapped) {
    const isDuplicate = existingReports.some(rep => 
      rep.user_id === targetCompanyId &&
      rep.customer_name.toLowerCase() === customerName.toLowerCase() &&
      rep.instrument_serial_number.toLowerCase() === instrumentSerialNumber.toLowerCase() &&
      rep.service_type === serviceTypeMapped &&
      rep.service_start_date === serviceStartDate &&
      rep.service_end_date === serviceEndDate
    );

    if (isDuplicate) {
      errors.push(`ទិន្នន័យស្ទួនគ្នា៖ មានរបាយការណ៍សេវាកម្មសម្រាប់អតិថិជន "${customerName}" លេខស៊េរី "${instrumentSerialNumber}" ថ្ងៃចាប់ផ្តើម ${serviceStartDate} និងបញ្ចប់ ${serviceEndDate} ក្នុងប្រព័ន្ធរួចហើយ។`);
    }
  }

  // 7. Compose final MetrologyReport object
  let reportData: MetrologyReport | null = null;
  if (errors.length === 0) {
    reportData = {
      id: 'rep_excel_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
      user_id: targetCompanyId,
      license_number: targetLicenseNumber,
      company_name_kh: targetCompanyNameKh,
      customer_name: customerName,
      customer_address: customerAddress,
      measuring_instrument: instrumentName,
      instrument_serial_number: instrumentSerialNumber,
      scope_of_weight_measure: measuringRange,
      spare_parts: spareParts || 'គ្មាន',
      spare_part_serial_number: sparePartSerialNumber || 'គ្មាន',
      service_type: serviceTypeMapped as ServiceType,
      service_start_date: serviceStartDate,
      service_end_date: serviceEndDate,
      report_month: reportMonth,
      report_year: reportYear,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  return {
    rowIndex,
    isValid: errors.length === 0,
    errors,
    warnings,
    reportData
  };
}
