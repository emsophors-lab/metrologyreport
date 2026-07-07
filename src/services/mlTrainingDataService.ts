import { EnterpriseLicense, LicenseReminderLog, LicenseRenewalHistory, MetrologyReport } from '../types';
import { buildMlFeatures } from './mlFeatureEngineering';
import { MlTrainingRecord, parseDate, reportMonthKey } from '../utils/mlRiskFeatures';

function reportMatchesLicense(report: MetrologyReport, license: EnterpriseLicense) {
  return String(report.license_number || '').trim().toLowerCase() === String(license.license_number || '').trim().toLowerCase() ||
    String(report.company_name_kh || '').trim().toLowerCase() === String(license.company_name_kh || license.company_name || '').trim().toLowerCase();
}

function nextMonthKey(now: Date) {
  const next = new Date(now);
  next.setMonth(next.getMonth() + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

export function buildTrainingDataset(input: {
  licenses: EnterpriseLicense[];
  reports: MetrologyReport[];
  renewals?: LicenseRenewalHistory[];
  reminders?: LicenseReminderLog[];
  now?: Date;
}): MlTrainingRecord[] {
  const now = input.now || new Date();
  const features = buildMlFeatures(input);
  const upcomingMonth = nextMonthKey(now);

  return features.map(feature => {
    const license = input.licenses.find(item => item.id === feature.licenseId);
    const licenseReports = license ? input.reports.filter(report => reportMatchesLicense(report, license)) : [];
    const hasNextMonthReport = licenseReports.some(report => reportMonthKey(report) === upcomingMonth);
    const latestDelay = licenseReports.reduce((max, report) => {
      const period = reportMonthKey(report);
      if (!period) return max;
      const [year, month] = period.split('-').map(Number);
      const dueDate = new Date(year, month, 15);
      const submittedDate = parseDate(report.created_at) || parseDate(report.updated_at);
      if (!submittedDate) return max;
      return Math.max(max, Math.max(0, Math.ceil((submittedDate.getTime() - dueDate.getTime()) / 86400000)));
    }, 0);

    return {
      features: feature,
      labels: {
        missedNextMonthReport: feature.distinctReportMonths >= 2 ? !hasNextMonthReport : null,
        reportSubmittedLate: feature.distinctReportMonths >= 1 ? latestDelay > 0 : null,
        licenseNotRenewedBeforeExpiry: feature.daysUntilExpiry < 0 ? feature.previousRenewalCount === 0 : null,
        highInspectionPriority: feature.isExpired ||
          feature.missingReportsLast3Months >= 2 ||
          feature.profileCompletenessScore < 65 ||
          (!feature.hasGps && feature.highRiskInstrumentFlag),
        monthlyReportCountNextMonth: null
      }
    };
  });
}
