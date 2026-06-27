import * as XLSX from 'xlsx';
import { MetrologyUser, MetrologyReport, LoginHistory } from '../types';
import { getActiveSupabaseClient, getActiveSupabaseConfig } from '../supabaseSync';
import { INITIAL_USERS, INITIAL_REPORTS, INITIAL_LICENSES, INITIAL_REMINDER_LOGS, INITIAL_RENEWAL_HISTORIES, INITIAL_BOT_SETTINGS } from '../demoData';

// Sensitive keys to be redacted
const SENSITIVE_KEYS = [
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'secret',
  'service_role_key',
  'gemini_api_key',
  'telegram_bot_token',
  'supabase_key',
  'bot_token_encrypted',
  'webhook_secret_encrypted',
  'telegram_registration_token_hash'
];

/**
 * Deeply sanitizes objects recursively to redact passwords and other secrets
 */
export function sanitizeBackupData<T>(data: T[]): T[] {
  if (!Array.isArray(data)) return data;

  const redactValue = (val: any): any => {
    if (val === null || val === undefined) return val;
    if (Array.isArray(val)) {
      return val.map(redactValue);
    }
    if (typeof val === 'object') {
      const cleaned: any = {};
      for (const key of Object.keys(val)) {
        const lowerKey = key.toLowerCase();
        const matchesSensitive = SENSITIVE_KEYS.some(sk => 
          lowerKey === sk || 
          lowerKey.includes(sk) || 
          sk.includes(lowerKey)
        );

        if (matchesSensitive) {
          cleaned[key] = '[REDACTED]';
        } else {
          cleaned[key] = redactValue(val[key]);
        }
      }
      return cleaned;
    }
    return val;
  };

  return data.map(item => redactValue(item));
}

export interface BackupPayload {
  metadata: {
    backup_version: string;
    app_name: string;
    generated_at: string;
    generated_by: string;
    mode: 'Supabase Cloud' | 'Demo/Local Fallback Mode';
    tables_included: string[];
    total_record_counts: Record<string, number>;
  };
  tables: Record<string, any[]>;
  errors: Record<string, string>;
}

/**
 * Fetch all available tables from either Supabase or fallback client registries
 */
export async function fetchAllBackupData(
  currentUser: MetrologyUser
): Promise<BackupPayload> {
  // Guard access at function-level
  if (currentUser.role !== 'superadmin') {
    throw new Error('You do not have permission to use the backup function. / លោកអ្នកមិនមានសិទ្ធិប្រើមុខងារបម្រុងទុកទិន្នន័យនេះទេ។');
  }

  const payload: BackupPayload = {
    metadata: {
      backup_version: '1.0.0',
      app_name: 'National Metrology Center of Cambodia (NMC) - Monthly Reporter System',
      generated_at: new Date().toISOString(),
      generated_by: `${currentUser.username} (${currentUser.email || 'No email'})`,
      mode: 'Demo/Local Fallback Mode',
      tables_included: [],
      total_record_counts: {}
    },
    tables: {},
    errors: {}
  };

  const dbConfig = getActiveSupabaseConfig();
  const client = getActiveSupabaseClient();

  const isCloudConnected = client && dbConfig.isConnected && !dbConfig.useFallback;

  if (isCloudConnected && client) {
    payload.metadata.mode = 'Supabase Cloud';
    const targetTables = [
      'users', 
      'profiles', 
      'companies', 
      'reports', 
      'login_history', 
      'audit_logs',
      'enterprise_licenses',
      'license_reminder_logs',
      'license_renewal_history',
      'telegram_bot_settings'
    ];

    for (const table of targetTables) {
      try {
        const { data, error } = await client
          .from(table)
          .select('*')
          .limit(10000); // safety cap but large enough

        if (error) {
          payload.errors[table] = error.message;
          console.warn(`Could not backup table ${table} due to active RLS or missing schema:`, error);
        } else if (data) {
          const sanitized = sanitizeBackupData(data);
          payload.tables[table] = sanitized;
          payload.metadata.tables_included.push(table);
          payload.metadata.total_record_counts[table] = sanitized.length;
        }
      } catch (err: any) {
        payload.errors[table] = err?.message || String(err);
        console.warn(`Exception reading table ${table}:`, err);
      }
    }
  } else {
    // Demo/Local fallback mode - load from localStorage caches or initial values
    payload.metadata.mode = 'Demo/Local Fallback Mode';

    // 1. Users
    let usersList: MetrologyUser[] = [];
    const cachedUsers = localStorage.getItem('nmc_users');
    if (cachedUsers) {
      try {
        usersList = JSON.parse(cachedUsers);
      } catch {
        usersList = INITIAL_USERS;
      }
    } else {
      usersList = INITIAL_USERS;
    }
    const sanitizedUsers = sanitizeBackupData(usersList);
    payload.tables['users'] = sanitizedUsers;
    payload.metadata.tables_included.push('users');
    payload.metadata.total_record_counts['users'] = sanitizedUsers.length;

    // 2. Reports
    let reportsList: MetrologyReport[] = [];
    const cachedReports = localStorage.getItem('nmc_reports');
    if (cachedReports) {
      try {
        reportsList = JSON.parse(cachedReports);
      } catch {
        reportsList = INITIAL_REPORTS;
      }
    } else {
      reportsList = INITIAL_REPORTS;
    }
    const sanitizedReports = sanitizeBackupData(reportsList);
    payload.tables['reports'] = sanitizedReports;
    payload.metadata.tables_included.push('reports');
    payload.metadata.total_record_counts['reports'] = sanitizedReports.length;

    // 3. Login history / Audit logs
    let historyList: LoginHistory[] = [];
    const cachedHistory = localStorage.getItem('nmc_login_history');
    if (cachedHistory) {
      try {
        historyList = JSON.parse(cachedHistory);
      } catch {
        historyList = [];
      }
    }
    const sanitizedHistory = sanitizeBackupData(historyList);
    payload.tables['login_history'] = sanitizedHistory;
    payload.metadata.tables_included.push('login_history');
    payload.metadata.total_record_counts['login_history'] = sanitizedHistory.length;

    // 4. Enterprise Licenses
    let licensesList: any[] = [];
    const cachedLicenses = localStorage.getItem('nmc_licenses');
    if (cachedLicenses) {
      try {
        licensesList = JSON.parse(cachedLicenses);
      } catch {
        licensesList = INITIAL_LICENSES;
      }
    } else {
      licensesList = INITIAL_LICENSES;
    }
    const sanitizedLicenses = sanitizeBackupData(licensesList);
    payload.tables['enterprise_licenses'] = sanitizedLicenses;
    payload.metadata.tables_included.push('enterprise_licenses');
    payload.metadata.total_record_counts['enterprise_licenses'] = sanitizedLicenses.length;

    // 5. License Reminder Logs
    let reminderLogsList: any[] = [];
    const cachedReminderLogs = localStorage.getItem('nmc_reminder_logs');
    if (cachedReminderLogs) {
      try {
        reminderLogsList = JSON.parse(cachedReminderLogs);
      } catch {
        reminderLogsList = INITIAL_REMINDER_LOGS;
      }
    } else {
      reminderLogsList = INITIAL_REMINDER_LOGS;
    }
    const sanitizedReminderLogs = sanitizeBackupData(reminderLogsList);
    payload.tables['license_reminder_logs'] = sanitizedReminderLogs;
    payload.metadata.tables_included.push('license_reminder_logs');
    payload.metadata.total_record_counts['license_reminder_logs'] = sanitizedReminderLogs.length;

    // 6. License Renewal History
    let renewalHistoryList: any[] = [];
    const cachedRenewalHistory = localStorage.getItem('nmc_renewal_history');
    if (cachedRenewalHistory) {
      try {
        renewalHistoryList = JSON.parse(cachedRenewalHistory);
      } catch {
        renewalHistoryList = INITIAL_RENEWAL_HISTORIES;
      }
    } else {
      renewalHistoryList = INITIAL_RENEWAL_HISTORIES;
    }
    const sanitizedRenewalHistory = sanitizeBackupData(renewalHistoryList);
    payload.tables['license_renewal_history'] = sanitizedRenewalHistory;
    payload.metadata.tables_included.push('license_renewal_history');
    payload.metadata.total_record_counts['license_renewal_history'] = sanitizedRenewalHistory.length;

    // 7. Telegram Bot Settings
    let botSettingsList: any[] = [];
    const cachedBotSettings = localStorage.getItem('nmc_bot_settings');
    if (cachedBotSettings) {
      try {
        botSettingsList = JSON.parse(cachedBotSettings);
      } catch {
        botSettingsList = INITIAL_BOT_SETTINGS;
      }
    } else {
      botSettingsList = INITIAL_BOT_SETTINGS;
    }
    const sanitizedBotSettings = sanitizeBackupData(botSettingsList);
    payload.tables['telegram_bot_settings'] = sanitizedBotSettings;
    payload.metadata.tables_included.push('telegram_bot_settings');
    payload.metadata.total_record_counts['telegram_bot_settings'] = sanitizedBotSettings.length;
  }

  return payload;
}

/**
 * Download a file in the browser as target content
 */
export function downloadBackupFile(content: string | Blob, filename: string, mimeType: string) {
  const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Performs full JSON Backup compilation and downloads
 */
export async function executeJsonBackup(currentUser: MetrologyUser): Promise<BackupPayload> {
  const data = await fetchAllBackupData(currentUser);
  const jsonString = JSON.stringify(data, null, 2);
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `nmc-metrology-backup-${dateStr}.json`;
  
  downloadBackupFile(jsonString, filename, 'application/json;charset=utf-8');
  return data;
}

/**
 * Performs full multi-sheet Excel Backup compilation and downloads
 */
export async function executeExcelBackup(currentUser: MetrologyUser): Promise<BackupPayload> {
  const data = await fetchAllBackupData(currentUser);
  const wb = XLSX.utils.book_new();

  // 1. Compile Backup Info Sheet
  const infoRows = [
    { 'ព័ត៌មានប្រព័ន្ធ / Backup Information': 'ឈ្មោះកម្មវិធី (Application Name)', 'តម្លៃ / Value': data.metadata.app_name },
    { 'ព័ត៌មានប្រព័ន្ធ / Backup Information': 'កាលបរិច្ឆេទបង្កើត (Generated At)', 'តម្លៃ / Value': data.metadata.generated_at },
    { 'ព័ត៌មានប្រព័ន្ធ / Backup Information': 'បង្កើតដោយ (Generated By)', 'តម្លៃ / Value': data.metadata.generated_by },
    { 'ព័ត៌មានប្រព័ន្ធ / Backup Information': 'របៀបដំណើរការទិន្នន័យ (System Mode)', 'តម្លៃ / Value': data.metadata.mode },
    { 'ព័ត៌មានប្រព័ន្ធ / Backup Information': 'កំណែទម្រង់សំណុំឯកសារ (Version)', 'តម្លៃ / Value': data.metadata.backup_version },
  ];

  // Add counts
  for (const [tbl, count] of Object.entries(data.metadata.total_record_counts)) {
    infoRows.push({
      'ព័ត៌មានប្រព័ន្ធ / Backup Information': `ចំនួនទិន្នន័យតារាង ${tbl} (Table ${tbl} Record Count)`,
      'តម្លៃ / Value': String(count)
    });
  }

  // Add fetch errors if any
  for (const [tbl, errMsg] of Object.entries(data.errors)) {
    infoRows.push({
      'ព័ត៌មានប្រព័ន្ធ / Backup Information': `កំហុសក្នុងការទាញយកតារាង ${tbl} (Error Fetching ${tbl})`,
      'តម្លៃ / Value': errMsg
    });
  }

  const infoWs = XLSX.utils.json_to_sheet(infoRows);
  infoWs['!cols'] = [{ wch: 45 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, infoWs, 'Backup Info');

  // 2. Append each table as separate sheets
  for (const table of data.metadata.tables_included) {
    const tableData = data.tables[table];
    if (tableData && tableData.length > 0) {
      const ws = XLSX.utils.json_to_sheet(tableData);
      
      // Auto-column width helper
      const keys = Object.keys(tableData[0] || {});
      const colWidths = keys.map(key => {
        let maxLen = key.length;
        for (let i = 0; i < Math.min(tableData.length, 50); i++) {
          const val = String(tableData[i]?.[key] || '');
          if (val.length > maxLen) maxLen = val.length;
        }
        return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
      });
      ws['!cols'] = colWidths;

      // Limit sheet name to max 31 characters as required by excel spec
      const cleanSheetName = table.substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, cleanSheetName);
    }
  }

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
  const filename = `nmc-metrology-backup-${dateStr}-${timeStr}.xlsx`;

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  
  downloadBackupFile(blob, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return data;
}
