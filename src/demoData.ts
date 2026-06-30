import { MetrologyUser, MetrologyReport, EnterpriseLicense, LicenseReminderLog, LicenseRenewalHistory, TelegramBotSetting } from './types';

export const INITIAL_USERS: MetrologyUser[] = [
  {
    id: 'user-sa-001',
    license_number: 'NMC-SA-2026',
    company_name_kh: 'មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ (NMC) នៃក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ បច្ចេកវិទ្យា និងនវានុវត្តន៍',
    company_name_en: 'National Metrology Center of Cambodia',
    address: 'មហាវិថីសហព័ន្ធរុស្ស៊ី ភ្នំពេញ កម្ពុជា',
    phone: '023 884 123',
    email: 'info@nmc.gov.kh',
    legal_representative: 'ឯកឧត្តម ប្រធានមជ្ឈមណ្ឌល',
    representative_position: 'អគ្គនាយក',
    username: 'superadmin',
    password: 'admin123',
    role: 'superadmin',
    can_view: true,
    can_edit: true,
    can_save: true,
    can_delete: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-ad-001',
    license_number: 'NMC-AD-2026',
    company_name_kh: 'នាយកដ្ឋានមាត្រាសាស្ត្រឧស្សាហកម្ម',
    company_name_en: 'Department of Industrial Metrology',
    address: 'មហាវិថីសហព័ន្ធរុស្ស៊ី ភ្នំពេញ កម្ពុជា',
    phone: '012 345 678',
    email: 'inspection@nmc.gov.kh',
    legal_representative: 'លោក ប្រធាននាយកដ្ឋាន',
    representative_position: 'ប្រធាននាយកដ្ឋាន',
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    can_view: true,
    can_edit: true,
    can_save: true,
    can_delete: true,
    created_at: '2026-01-02T00:00:00Z',
    admin_can_add_company_user: true,
    admin_can_add_admin_user: true,
    admin_can_edit_users: true,
    admin_can_deactivate_users: true,
    admin_can_view_all_users: true,
    is_active: true,
  },
  {
    id: 'user-co-001',
    license_number: 'LIC-2026-001',
    company_name_kh: 'ក្រុមហ៊ុន មាត្រាសាស្ត្រ បូកគោ',
    company_name_en: 'Bokor Metrology Corp',
    address: 'ផ្ទះលេខ ១២A ផ្លូវជាតិលេខ ៣ ខេត្តកំពត',
    phone: '016 999 888',
    email: 'contact@bokormetrology.com',
    legal_representative: 'លោក លី ម៉េង',
    representative_position: 'នាយកប្រតិបត្តិ',
    username: 'company01',
    password: 'LIC001',
    role: 'company',
    can_view: true,
    can_edit: true,
    can_save: true,
    can_delete: true,
    created_at: '2026-02-15T00:00:00Z',
  },
  {
    id: 'user-co-002',
    license_number: 'LIC-2026-002',
    company_name_kh: 'សហគ្រាសវាស់វែងអង្គរ',
    company_name_en: 'Angkor Measurement Enterprises',
    address: 'ផ្លូវជាតិលេខ ៦ ក្រុងសៀមរាប ខេត្តសៀមរាប',
    phone: '011 222 333',
    email: 'angkor_measure@gmail.com',
    legal_representative: 'អ្នកស្រី សុខ ចិន្តា',
    representative_position: 'អគ្គនាយិកា',
    username: 'company02',
    password: 'LIC002',
    role: 'company',
    can_view: true,
    can_edit: true,
    can_save: false,
    can_delete: false,
    created_at: '2026-03-10T00:00:00Z',
  },
];

export const INITIAL_REPORTS: MetrologyReport[] = [
  {
    id: 'rep-001',
    user_id: 'user-co-001',
    license_number: 'LIC-2026-001',
    company_name_kh: 'ក្រុមហ៊ុន មាត្រាសាស្ត្រ បូកគោ',
    customer_name: 'រោងចក្រស៊ីម៉ងត៍កម្ពុជាចក្រីទីង',
    customer_address: 'ផ្លូវជាតិលេខ ៣ ស្រុកទឹកឈូ ខេត្តកំពត',
    measuring_instrument: 'ជញ្ជីងរថយន្តអេឡិចត្រូនិច ១០០ តោន (Truck Scale 100T)',
    instrument_serial_number: 'TS2026-99182',
    scope_of_weight_measure: 'សហការវាស់ស្ទង់ពី ០ ទៅ ១០០,០០០ គីឡូក្រាម',
    spare_parts: 'ឧបករណ៍សញ្ញាអេឡិចត្រូនិច (Weight Indicator Model XK3190)',
    spare_part_serial_number: 'IND-9812A',
    service_type: 'Installation',
    service_start_date: '2026-05-02',
    service_end_date: '2026-05-05',
    report_month: '05',
    report_year: '2026',
    created_at: '2026-05-05T08:30:00Z',
    updated_at: '2026-05-05T08:30:00Z',
  },
  {
    id: 'rep-002',
    user_id: 'user-co-001',
    license_number: 'LIC-2026-001',
    company_name_kh: 'ក្រុមហ៊ុន មាត្រាសាស្ត្រ បូកគោ',
    customer_name: 'ស្ថានីយប្រេងឥន្ធនៈតេលាស្ទឹងមានជ័យ',
    customer_address: 'ផ្លូវ ២៧១ សង្កាត់ស្ទឹងមានជ័យ ភ្នំពេញ',
    measuring_instrument: 'ទូរចាក់ប្រេងសាំង ៤ ក្បាលចាក់ (TELA Fuel Dispenser)',
    instrument_serial_number: 'DISP-AB-7741',
    scope_of_weight_measure: 'លំហូររង្វាស់ពី ៥ ទៅ ៨០ លីត្រ/នាទី',
    spare_parts: 'ស្នប់វាស់សម្ពាធលំហូរ (Flow Meter Module V2)',
    spare_part_serial_number: 'FM-77119-Z',
    service_type: 'Repair',
    service_start_date: '2026-05-10',
    service_end_date: '2026-05-11',
    report_month: '05',
    report_year: '2026',
    created_at: '2026-05-11T14:20:00Z',
    updated_at: '2026-05-11T14:20:00Z',
  },
  {
    id: 'rep-003',
    user_id: 'user-co-001',
    license_number: 'LIC-2026-001',
    company_name_kh: 'ក្រុមហ៊ុន មាត្រាសាស្ត្រ បូកគោ',
    customer_name: 'ក្រុមហ៊ុន ភ្នំពេញការ៉ាត់ ហ្គោល',
    customer_address: 'ផ្សារធំថ្មី ខណ្ឌដូនពេញ ភ្នំពេញ',
    measuring_instrument: 'ជញ្ជីងវិភាគគ្រឿងអលង្ការបច្ចេកវិទ្យាខ្ពស់ (Jewelry Analytical Balance)',
    instrument_serial_number: 'BAL-KH-2026-03',
    scope_of_weight_measure: 'លទ្ធភាពថ្លឹងពី ០.០០១ ក្រាម ទៅ ៣២០ ក្រាម',
    spare_parts: 'បន្ទះឈីបសេនស័រវាស់បន្ទុក (Loadcell Sensor Board Block)',
    spare_part_serial_number: 'LC-AM-990',
    service_type: 'Manufacture',
    service_start_date: '2026-04-12',
    service_end_date: '2026-04-20',
    report_month: '04',
    report_year: '2026',
    created_at: '2026-04-20T09:15:00Z',
    updated_at: '2026-04-20T09:15:00Z',
  },
  {
    id: 'rep-004',
    user_id: 'user-co-002',
    license_number: 'LIC-2026-002',
    company_name_kh: 'សហគ្រាសវាស់វែងអង្គរ',
    customer_name: 'កសិដ្ឋានស្រូវអង្ករសុវណ្ណភូមិ',
    customer_address: 'ស្រុកក្រឡាញ់ ខេត្តសៀមរាប',
    measuring_instrument: 'ជញ្ជីងថ្លឹងស្រូវបាវទម្ងន់ ១តោន (Platform Scale 1T)',
    instrument_serial_number: 'ANG-P1000-88',
    scope_of_weight_measure: 'លទ្ធភាពថ្លឹងរហូតដល់ ១,០០០ គីឡូក្រាម',
    spare_parts: 'ប៊ូតុងបញ្ជាបន្ទុក និងអេក្រង់ LED',
    spare_part_serial_number: 'DISP-L88',
    service_type: 'Installation',
    service_start_date: '2026-05-15',
    service_end_date: '2026-05-16',
    report_month: '05',
    report_year: '2026',
    created_at: '2026-05-16T11:00:00Z',
    updated_at: '2026-05-16T11:00:00Z',
  },
  {
    id: 'rep-005',
    user_id: 'user-co-002',
    license_number: 'LIC-2026-002',
    company_name_kh: 'សហគ្រាសវាស់វែងអង្គរ',
    customer_name: 'មន្ទីរពេទ្យបង្អែកសៀមរាប',
    customer_address: 'ផ្លូវមន្ទីរពេទ្យ ក្រុងសៀមរាប ខេត្តសៀមរាប',
    measuring_instrument: 'ជញ្ជីងវេជ្ជសាស្ត្រវាស់កម្ពស់និងទម្ងន់ទារក (Pediatric Scale/Infant Measure)',
    instrument_serial_number: 'MED-INF-120',
    scope_of_weight_measure: 'ថ្លឹងទម្ងន់ពី ០ ទៅ ២០ គីឡូក្រាម, កម្រិតលំអៀង ១០ ក្រាម',
    spare_parts: 'បន្ទះត្រួតពិនិត្យភាពគ្លាតឌីជីថល (Digital Mainboard Seka)',
    spare_part_serial_number: 'SEKA-MB-003',
    service_type: 'Repair',
    service_start_date: '2026-05-20',
    service_end_date: '2026-05-21',
    report_month: '05',
    report_year: '2026',
    created_at: '2026-05-22T04:10:00Z',
    updated_at: '2026-05-22T04:10:00Z',
  },
];

export function isDemoDataEnabled(): boolean {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'metrologyreport.vercel.app') {
      return false;
    }
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.')) {
      return true;
    }
  }
  const meta = import.meta as any;
  if (meta.env?.DEV === true) {
    return true;
  }
  if (meta.env?.VITE_ENABLE_DEMO_DATA === 'true') {
    return true;
  }
  return false;
}

export function isDemoLoginAllowed(): boolean {
  const meta = import.meta as any;
  if (meta.env?.VITE_ENABLE_DEMO_LOGIN === 'true') {
    return true;
  }
  if (meta.env?.VITE_ENABLE_DEMO_LOGIN === 'false') {
    return false;
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'metrologyreport.vercel.app') {
      return false;
    }
    if (host === 'localhost' || host === '127.0.0.1' || host.includes('ais-dev-') || host.includes('ais-pre-') || host.endsWith('.run.app')) {
      return true;
    }
  }
  if (meta.env?.DEV === true) {
    return true;
  }
  return false;
}

// Helpers for relative date generation to make license testing dynamic and accurate
export function getRelativeDateString(daysOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
}

export const INITIAL_LICENSES: EnterpriseLicense[] = [
  {
    id: 'lic-001',
    company_user_id: 'user-co-001',
    company_id: 'user-co-001',
    company_name: 'ក្រុមហ៊ុន មាត្រាសាស្ត្រ បូកគោ',
    license_number: 'LIC-2026-001',
    license_owner_name: 'លោក លី ម៉េង',
    license_owner_position: 'នាយកប្រតិបត្តិ',
    phone_number: '016 999 888',
    email: 'contact@bokormetrology.com',
    telegram_chat_id: '123456789',
    telegram_username: 'bokor_representative',
    telegram_first_name: 'Meng',
    telegram_last_name: 'Ly',
    telegram_connected_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    telegram_connection_status: 'Connected',
    company_address: 'ផ្ទះលេខ ១២A ផ្លូវជាតិលេខ ៣ ខេត្តកំពត',
    business_type: 'ក្រុមហ៊ុនឯកជនទទួលខុសត្រូវមានកម្រិត',
    service_scope: 'វិស័យជញ្ជីងអេឡិចត្រូនិច និងឧបករណ៍វាស់វែងទម្ងន់',
    measuring_instrument_type: 'Truck Scale, Platform Scale',
    license_issue_date: getRelativeDateString(-365), // Issued 1 year ago
    license_expiry_date: getRelativeDateString(365 * 2), // Expires in 2 years
    license_validity_years: 3,
    license_status: 'Active',
    notes: 'ដៃគូរការងារគំរូ និងការបញ្ជូនរបាយការណ៍ទៀងទាត់',
    created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'lic-002',
    company_user_id: 'user-co-002',
    company_id: 'user-co-002',
    company_name: 'សហគ្រាសវាស់វែងអង្គរ',
    license_number: 'LIC-2026-002',
    license_owner_name: 'អ្នកស្រី សុខ ចិន្តា',
    license_owner_position: 'អគ្គនាយិកា',
    phone_number: '011 222 333',
    email: 'angkor_measure@gmail.com',
    telegram_chat_id: null,
    telegram_username: null,
    telegram_connected_at: null,
    telegram_connection_status: 'Not Connected',
    company_address: 'ផ្លូវជាតិលេខ ៦ ក្រុងសៀមរាប ខេត្តសៀមរាប',
    business_type: 'សហគ្រាសឯកបុគ្គល',
    service_scope: 'ការតំឡើង និងជួសជុលឧបករណ៍វាស់រាវ ចាក់ប្រេង',
    measuring_instrument_type: 'Fuel Dispensers, Flowmeters',
    license_issue_date: getRelativeDateString(-1065), // Issued almost 3 years ago
    license_expiry_date: getRelativeDateString(30), // Expires in exactly 30 days!
    license_validity_years: 3,
    license_status: 'Expiring Soon',
    notes: 'ត្រូវការទាក់ទងដើម្បីភ្ជាប់តេឡេក្រាម និងបន្តអាជ្ញាប័ណ្ណ',
    created_at: new Date(Date.now() - 1065 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'lic-003',
    company_user_id: null,
    company_id: null,
    company_name: 'មន្ទីរពិសោធន៍វាស់ស្ទង់ភ្នំពេញ',
    license_number: 'LIC-2023-099',
    license_owner_name: 'លោក ឈុន លីហួរ',
    license_owner_position: 'ប្រធានបច្ចេកទេស',
    phone_number: '092 555 111',
    email: 'pp_measurement_lab@gmail.com',
    telegram_chat_id: '987654321',
    telegram_username: 'chhun_lyhour',
    telegram_first_name: 'Lyhour',
    telegram_last_name: 'Chhun',
    telegram_connected_at: new Date(Date.now() - 1100 * 24 * 60 * 60 * 1000).toISOString(),
    telegram_connection_status: 'Connected',
    company_address: 'អាគារ ៤៥ ផ្លូវ ២៧១ សង្កាត់ទឹកល្អក់៣ ភ្នំពេញ',
    business_type: 'សហគ្រាសឯកទេសវិភាគ',
    service_scope: 'ការវាស់វែងកម្តៅ និងសម្ពាធឧស្សាហកម្ម',
    measuring_instrument_type: 'Temperature & Pressure Gauges',
    license_issue_date: getRelativeDateString(-1110), // Issued over 3 years ago
    license_expiry_date: getRelativeDateString(-15), // Expired 15 days ago!
    license_validity_years: 3,
    license_status: 'Expired',
    notes: 'មិនទាន់ឃើញដាក់ពាក្យស្នើសុំបន្តនៅឡើយទេ',
    created_at: new Date(Date.now() - 1110 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  }
];

export const INITIAL_REMINDER_LOGS: LicenseReminderLog[] = [
  {
    id: 'rem-log-001',
    license_id: 'lic-002',
    reminder_type: 'TEST',
    reminder_days: 90,
    telegram_chat_id: '99221199',
    telegram_username: 'angkor_reps',
    message_text: '⚠️ សេចក្តីជូនដំណឹង៖ អាជ្ញាប័ណ្ណសហគ្រាសរបស់លោកអ្នក (លេខ៖ LIC-2026-002) នឹងត្រូវផុតកំណត់ក្នុងរយៈពេល 90 ថ្ងៃទៀត (នៅថ្ងៃទី ' + getRelativeDateString(30) + ')។ សូមចូលប្រព័ន្ធរៀបចំលិខិតបន្ត។',
    send_status: 'Sent',
    sent_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  }
];

export const INITIAL_RENEWAL_HISTORIES: LicenseRenewalHistory[] = [];

export const INITIAL_BOT_SETTINGS: TelegramBotSetting[] = [
  {
    id: 'bot-001',
    bot_name: 'License report',
    bot_username: 'Licensingreport_bot',
    bot_token_encrypted: '123456789:ABCdefGhIJKlmNoPQRstUVwxyZ', // Dummy token
    bot_purpose: 'license_reminder',
    default_chat_id: '-100123456789',
    is_active: true,
    description: 'ប្រព័ន្ធស្វ័យប្រវត្តិនៃការរំលឹកអាជ្ញាប័ណ្ណរបស់មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ',
    last_test_status: 'Success',
    last_test_message: 'Connection verified successfully.',
    last_tested_at: new Date().toISOString(),
    connection_status: 'connected',
    last_error: null,
    webhook_status: 'not_configured',
    bot_display_name: 'License report',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];
