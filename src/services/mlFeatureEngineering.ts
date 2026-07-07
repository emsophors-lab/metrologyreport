import { EnterpriseLicense, LicenseReminderLog, LicenseRenewalHistory, MetrologyReport } from '../types';
import {
  MlCompanyFeatures,
  MlDataQualityIssue,
  MlDataQualitySummary,
  addMonths,
  daysBetween,
  monthKey,
  parseDate,
  reportMonthKey,
  uniqueCount
} from '../utils/mlRiskFeatures';

const HIGH_RISK_INSTRUMENT_TERMS = [
  'fuel',
  'gas',
  'weighbridge',
  'scale',
  'truck',
  'flow',
  'pressure',
  'petroleum',
  'ប្រេង',
  'ជញ្ជីង',
  'សម្ពាធ'
];

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function safeNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasGps(license: EnterpriseLicense) {
  const lat = safeNumber(license.business_latitude);
  const lng = safeNumber(license.business_longitude);
  return lat !== null && lng !== null && lat !== 0 && lng !== 0;
}

function isSubmitted(report: MetrologyReport) {
  const status = normalize(report.report_status || 'Submitted');
  return !['draft', 'rejected', 'cancelled'].includes(status);
}

function licenseKey(license: EnterpriseLicense) {
  return normalize(license.license_number || license.id);
}

function reportMatchesLicense(report: MetrologyReport, license: EnterpriseLicense) {
  const reportLicense = normalize(report.license_number);
  const reportCompany = normalize(report.company_name_kh);
  return reportLicense === normalize(license.license_number) ||
    (!!reportCompany && reportCompany === normalize(license.company_name_kh || license.company_name));
}

function reportDelayDays(report: MetrologyReport) {
  const month = reportMonthKey(report);
  if (!month) return 0;
  const [year, monthNumber] = month.split('-').map(Number);
  const dueDate = new Date(year, monthNumber, 15);
  const submittedDate = parseDate(report.created_at) || parseDate(report.updated_at) || parseDate(report.service_end_date);
  if (!submittedDate) return 0;
  return Math.max(0, daysBetween(dueDate, submittedDate));
}

function monthKeysBackFrom(anchor: Date, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = addMonths(anchor, -index - 1);
    return monthKey(date.getFullYear(), date.getMonth());
  });
}

function profileCompleteness(license: EnterpriseLicense) {
  const checks = [
    license.company_name || license.company_name_kh,
    license.license_number,
    license.license_owner_name,
    license.phone_number || license.license_owner_phone,
    license.email || license.license_owner_email,
    license.company_address,
    license.province_city,
    license.license_issue_date,
    license.license_expiry_date,
    license.service_scope,
    license.measuring_instrument_type,
    hasGps(license),
    license.telegram_chat_id || license.telegram_username || license.telegram_connected_at
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function provinceOf(license: EnterpriseLicense) {
  return license.province_city || 'មិនទាន់កំណត់';
}

function isHighRiskInstrument(license: EnterpriseLicense) {
  const text = normalize(`${license.measuring_instrument_type || ''} ${license.service_scope || ''} ${license.business_type || ''}`);
  return HIGH_RISK_INSTRUMENT_TERMS.some(term => text.includes(term));
}

export function buildMlFeatures(input: {
  licenses: EnterpriseLicense[];
  reports: MetrologyReport[];
  renewals?: LicenseRenewalHistory[];
  reminders?: LicenseReminderLog[];
  now?: Date;
}): MlCompanyFeatures[] {
  const now = input.now || new Date();
  const submittedReports = input.reports.filter(isSubmitted);
  const months3 = monthKeysBackFrom(now, 3);
  const months6 = monthKeysBackFrom(now, 6);

  const provinceStats = new Map<string, { companies: number; reports: number; expired: number }>();
  input.licenses.forEach(license => {
    const province = provinceOf(license);
    const stat = provinceStats.get(province) || { companies: 0, reports: 0, expired: 0 };
    stat.companies += 1;
    const expiryDate = parseDate(license.license_expiry_date);
    if (expiryDate && expiryDate < now) stat.expired += 1;
    provinceStats.set(province, stat);
  });
  submittedReports.forEach(report => {
    const license = input.licenses.find(item => reportMatchesLicense(report, item));
    const province = license ? provinceOf(license) : 'មិនទាន់កំណត់';
    const stat = provinceStats.get(province) || { companies: 0, reports: 0, expired: 0 };
    stat.reports += 1;
    provinceStats.set(province, stat);
  });

  return input.licenses.map(license => {
    const licenseReports = submittedReports.filter(report => reportMatchesLicense(report, license));
    const licenseReportMonths = new Set(licenseReports.map(reportMonthKey).filter(Boolean) as string[]);
    const lastReportDate = licenseReports
      .map(report => parseDate(report.created_at) || parseDate(report.updated_at) || parseDate(report.service_end_date))
      .filter((date): date is Date => !!date)
      .sort((a, b) => b.getTime() - a.getTime())[0] || null;
    const issueDate = parseDate(license.license_issue_date);
    const expiryDate = parseDate(license.license_expiry_date);
    const daysUntilExpiry = expiryDate ? daysBetween(now, expiryDate) : 9999;
    const province = provinceOf(license);
    const provinceStat = provinceStats.get(province) || { companies: 0, reports: 0, expired: 0 };
    const renewals = (input.renewals || []).filter(item => item.license_id === license.id);
    const renewalReminderCount = (input.reminders || []).filter(item => item.license_id === license.id && item.send_status === 'Sent').length;
    const reportDelays = licenseReports.map(reportDelayDays);

    const submitted3 = months3.filter(key => licenseReportMonths.has(key)).length;
    const submitted6 = months6.filter(key => licenseReportMonths.has(key)).length;
    const missing3 = Math.max(0, months3.length - submitted3);
    const missing6 = Math.max(0, months6.length - submitted6);
    const consecutiveMissing = months6.reduce((count, key) => {
      if (licenseReportMonths.has(key)) return count;
      return count + 1;
    }, 0);

    return {
      companyId: license.company_user_id || license.company_id || license.id,
      licenseId: license.id,
      licenseNumber: license.license_number,
      companyName: license.company_name_kh || license.company_name || license.license_number,
      province,
      serviceScope: license.service_scope || '',
      instrumentType: license.measuring_instrument_type || '',
      licenseAgeDays: issueDate ? Math.max(0, daysBetween(issueDate, now)) : 0,
      daysUntilExpiry,
      isExpired: daysUntilExpiry < 0,
      expiresIn30Days: daysUntilExpiry >= 0 && daysUntilExpiry <= 30,
      expiresIn60Days: daysUntilExpiry >= 0 && daysUntilExpiry <= 60,
      expiresIn90Days: daysUntilExpiry >= 0 && daysUntilExpiry <= 90,
      hasGps: hasGps(license),
      hasTelegram: !!(license.telegram_chat_id || license.telegram_username || license.telegram_connected_at),
      profileCompletenessScore: profileCompleteness(license),
      serviceTypeCount: uniqueCount(licenseReports.map(report => report.service_type)),
      instrumentTypeCount: uniqueCount([license.measuring_instrument_type, ...licenseReports.map(report => report.measuring_instrument)]),
      highRiskInstrumentFlag: isHighRiskInstrument(license),
      reportsSubmittedLast3Months: submitted3,
      reportsSubmittedLast6Months: submitted6,
      missingReportsLast3Months: missing3,
      missingReportsLast6Months: missing6,
      lateReportsLast3Months: licenseReports.filter(report => months3.includes(reportMonthKey(report) || '') && reportDelayDays(report) > 0).length,
      averageSubmissionDelayDays: reportDelays.length ? Math.round(reportDelays.reduce((sum, value) => sum + value, 0) / reportDelays.length) : 0,
      lastReportAgeDays: lastReportDate ? Math.max(0, daysBetween(lastReportDate, now)) : 9999,
      consecutiveMissingMonths: consecutiveMissing,
      reportSubmissionRate: Math.round((submitted6 / Math.max(1, months6.length)) * 100),
      renewedBeforeExpiry: renewals.length > 0 ? renewals.some(item => {
        const renewed = parseDate(item.renewed_at);
        const oldExpiry = parseDate(item.old_expiry_date);
        return !!renewed && !!oldExpiry && renewed <= oldExpiry;
      }) : null,
      daysLateForRenewal: renewals.reduce((max, item) => {
        const renewed = parseDate(item.renewed_at);
        const oldExpiry = parseDate(item.old_expiry_date);
        return renewed && oldExpiry ? Math.max(max, Math.max(0, daysBetween(oldExpiry, renewed))) : max;
      }, 0),
      previousRenewalCount: renewals.length,
      renewalRemindersSent: renewalReminderCount,
      companiesInSameProvince: provinceStat.companies,
      serviceCoverageScore: Math.min(100, provinceStat.companies * 8),
      provinceReportComplianceRate: Math.round((provinceStat.reports / Math.max(1, provinceStat.companies * 6)) * 100),
      provinceExpiredLicenseRate: Math.round((provinceStat.expired / Math.max(1, provinceStat.companies)) * 100),
      instrumentDemandTrendScore: Math.min(100, uniqueCount(licenseReports.map(report => report.measuring_instrument)) * 10),
      distinctReportMonths: licenseReportMonths.size
    };
  });
}

export function assessMlDataQuality(input: {
  licenses: EnterpriseLicense[];
  reports: MetrologyReport[];
}): MlDataQualitySummary {
  const issues: MlDataQualityIssue[] = [];
  const addIssue = (type: string, severity: MlDataQualityIssue['severity'], count: number, recommendation: string) => {
    if (count > 0) issues.push({ type, severity, count, recommendation });
  };

  addIssue('Missing expiry date', 'high', input.licenses.filter(item => !item.license_expiry_date).length, 'Complete license expiry dates before relying on renewal risk predictions.');
  addIssue('Missing province', 'medium', input.licenses.filter(item => !item.province_city).length, 'Add province/city data to improve province risk forecasts.');
  addIssue('Missing GPS', 'medium', input.licenses.filter(item => !hasGps(item)).length, 'Record verified GPS locations for service coverage predictions.');
  addIssue('Missing Telegram link', 'low', input.licenses.filter(item => !(item.telegram_chat_id || item.telegram_username)).length, 'Connect Telegram for reminder-response prediction.');
  addIssue('Missing report month/year', 'high', input.reports.filter(item => !reportMonthKey(item)).length, 'Fix monthly report period fields before training.');

  const reportKeys = new Map<string, number>();
  input.reports.forEach(report => {
    const key = `${normalize(report.license_number)}:${reportMonthKey(report) || 'unknown'}`;
    reportKeys.set(key, (reportKeys.get(key) || 0) + 1);
  });
  addIssue('Duplicate company/month reports', 'medium', Array.from(reportKeys.values()).filter(count => count > 1).length, 'Review duplicate monthly report records.');

  const licenseKeys = new Map<string, number>();
  input.licenses.forEach(license => {
    const key = normalize(license.license_number);
    if (key) licenseKeys.set(key, (licenseKeys.get(key) || 0) + 1);
  });
  addIssue('Duplicate license numbers', 'high', Array.from(licenseKeys.values()).filter(count => count > 1).length, 'Resolve duplicate license numbers for reliable company-level predictions.');

  const weightedPenalty = issues.reduce((sum, issue) => {
    const weight = issue.severity === 'high' ? 5 : issue.severity === 'medium' ? 3 : 1;
    return sum + issue.count * weight;
  }, 0);
  const denominator = Math.max(1, input.licenses.length + input.reports.length);
  const score = Math.max(0, Math.min(100, Math.round(100 - (weightedPenalty / denominator) * 10)));

  return {
    score,
    totalIssues: issues.reduce((sum, issue) => sum + issue.count, 0),
    issues
  };
}
