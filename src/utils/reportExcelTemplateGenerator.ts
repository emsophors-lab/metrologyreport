import * as XLSX from 'xlsx';

/**
 * Downloads the official Excel template that matches the export format of the National Metrology Center Report System.
 */
export function downloadOfficialExcelTemplate(): void {
  const headers = [
    'ល.រ (No.)',
    'ឈ្មោះក្រុមហ៊ុន (Company)',
    'លេខអាជ្ញាប័ណ្ណ (License)',
    'ឈ្មោះអតិថិជន (Customer)',
    'ទីតាំងអតិថិជន (Address)',
    'ឧបករណ៍មាត្រាសាស្ត្រ (Instrument)',
    'លេខស៊េរីឧបករណ៍ (Instrument S/N)',
    'វិសាលភាពថ្លឹង/រង្វាស់ (Scope)',
    'គ្រឿងបន្លាស់ (Spare Parts)',
    'លេខស៊េរីគ្រឿងបន្លាស់ (Spare S/N)',
    'ប្រភេទសេវាកម្ម (Service)',
    'កាលបរិច្ឆេទចាប់ផ្តើម (Start Date)',
    'កាលបរិច្ឆេទបញ្ចប់ (End Date)',
    'ខែរបាយការណ៍ (Month)',
    'ឆ្នាំរបាយការណ៍ (Year)',
  ];

  const sampleData = [
    {
      'ល.រ (No.)': 1,
      'ឈ្មោះក្រុមហ៊ុន (Company)': 'ក្រុមហ៊ុនគំរូ ភីអិលស៊ី (Sample Company Co., Ltd)',
      'លេខអាជ្ញាប័ណ្ណ (License)': 'NMC-L-2026-001',
      'ឈ្មោះអតិថិជន (Customer)': 'ភោជនីយដ្ឋាន ទន្លេបាសាក់ (Bassac River Restaurant)',
      'ទីតាំងអតិថិជន (Address)': 'ផ្លូវព្រះសីហនុ, សង្កាត់ទន្លេបាសាក់, ភ្នំពេញ',
      'ឧបករណ៍មាត្រាសាស្ត្រ (Instrument)': 'ជញ្ជីងអេឡិចត្រូនិចគិតលុយ (Digital Retail Scale)',
      'លេខស៊េរីឧបករណ៍ (Instrument S/N)': 'SN-RETAIL-9812A',
      'វិសាលភាពថ្លឹង/រង្វាស់ (Scope)': '30kg (Max) / 5g (e)',
      'គ្រឿងបន្លាស់ (Spare Parts)': 'បន្ទះសេនស័រ (Load Cell)',
      'លេខស៊េរីគ្រឿងបន្លាស់ (Spare S/N)': 'LC-SN-9912',
      'ប្រភេទសេវាកម្ម (Service)': 'តម្លើង (Installation)',
      'កាលបរិច្ឆេទចាប់ផ្តើម (Start Date)': '2026-06-01',
      'កាលបរិច្ឆេទបញ្ចប់ (End Date)': '2026-06-02',
      'ខែរបាយការណ៍ (Month)': 'មិថុនា',
      'ឆ្នាំរបាយការណ៍ (Year)': '2026',
    },
    {
      'ល.រ (No.)': 2,
      'ឈ្មោះក្រុមហ៊ុន (Company)': 'ក្រុមហ៊ុនលីមីតធីត (Another Licensed Co.)',
      'លេខអាជ្ញាប័ណ្ណ (License)': 'NMC-L-2026-002',
      'ឈ្មោះអតិថិជន (Customer)': 'រោងចក្រ ជីភីអេស កាត់ដេរ (GPS Garment Factory)',
      'ទីតាំងអតិថិជន (Address)': 'ផ្លូវវេងស្រេង, ខណ្ឌពោធិ៍សែនជ័យ, ភ្នំពេញ',
      'ឧបករណ៍មាត្រាសាស្ត្រ (Instrument)': 'ជញ្ជីងរថយន្តអេឡិចត្រូនិច (Electronic Truck Scale)',
      'លេខស៊េរីឧបករណ៍ (Instrument S/N)': 'TRUCK-SN-100T',
      'វិសាលភាពថ្លឹង/រង្វាស់ (Scope)': '100 Tons (Max) / 20kg (e)',
      'គ្រឿងបន្លាស់ (Spare Parts)': 'គ្មាន',
      'លេខស៊េរីគ្រឿងបន្លាស់ (Spare S/N)': 'គ្មាន',
      'ប្រភេទសេវាកម្ម (Service)': 'ជួសជុល (Repair)',
      'កាលបរិច្ឆេទចាប់ផ្តើម (Start Date)': '2026-06-05',
      'កាលបរិច្ឆេទបញ្ចប់ (End Date)': '2026-06-05',
      'ខែរបាយការណ៍ (Month)': 'មិថុនា',
      'ឆ្នាំរបាយការណ៍ (Year)': '2026',
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });

  // Columns styling mapping
  worksheet['!cols'] = [
    { wch: 10 }, // No.
    { wch: 35 }, // Company
    { wch: 20 }, // License
    { wch: 35 }, // Customer
    { wch: 45 }, // Address
    { wch: 35 }, // Instrument
    { wch: 25 }, // Instrument S/N
    { wch: 22 }, // Scope
    { wch: 25 }, // Spare parts
    { wch: 25 }, // Spare S/N
    { wch: 22 }, // Service
    { wch: 20 }, // Start Date
    { wch: 20 }, // End Date
    { wch: 15 }, // Month
    { wch: 12 }, // Year
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Monthly Report');

  // Trigger file download
  XLSX.writeFile(workbook, 'nmc_report_import_template_monthly_report.xlsx');
}
