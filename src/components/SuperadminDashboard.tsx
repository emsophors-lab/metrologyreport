import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Gauge,
  MapPin,
  MessageCircle,
  Send,
  ShieldAlert,
  ShieldCheck,
  X
} from 'lucide-react';
import { EnterpriseLicense, MetrologyReport, MetrologyUser } from '../types';
import DataAnalyticsReport from './DataAnalyticsReport';
import EnterpriseLicenseMapView from './EnterpriseLicenseMapView';
import TopServiceCompanies from './TopServiceCompanies';
import nmcLogo from '../NMClogo.png';

interface SuperadminDashboardProps {
  currentUser: MetrologyUser;
  reports: MetrologyReport[];
  users: MetrologyUser[];
  activeCompanyList: MetrologyUser[];
  licenseRecords?: EnterpriseLicense[];
  isLoading?: boolean;
  errorMessage?: string | null;
}

const MONTHS = [
  { value: '01', kh: 'មករា', short: 'Jan' },
  { value: '02', kh: 'កុម្ភៈ', short: 'Feb' },
  { value: '03', kh: 'មីនា', short: 'Mar' },
  { value: '04', kh: 'មេសា', short: 'Apr' },
  { value: '05', kh: 'ឧសភា', short: 'May' },
  { value: '06', kh: 'មិថុនា', short: 'Jun' },
  { value: '07', kh: 'កក្កដា', short: 'Jul' },
  { value: '08', kh: 'សីហា', short: 'Aug' },
  { value: '09', kh: 'កញ្ញា', short: 'Sep' },
  { value: '10', kh: 'តុលា', short: 'Oct' },
  { value: '11', kh: 'វិច្ឆិកា', short: 'Nov' },
  { value: '12', kh: 'ធ្នូ', short: 'Dec' }
];

const CAMBODIA_PROVINCE_COUNT = 25;
const CAMBODIA_PROVINCES = [
  { value: 'រាជធានីភ្នំពេញ', names: ['រាជធានីភ្នំពេញ', 'ភ្នំពេញ', 'Phnom Penh'] },
  { value: 'បន្ទាយមានជ័យ', names: ['បន្ទាយមានជ័យ', 'Banteay Meanchey'] },
  { value: 'បាត់ដំបង', names: ['បាត់ដំបង', 'Battambang'] },
  { value: 'កំពង់ចាម', names: ['កំពង់ចាម', 'Kampong Cham'] },
  { value: 'កំពង់ឆ្នាំង', names: ['កំពង់ឆ្នាំង', 'Kampong Chhnang'] },
  { value: 'កំពង់ស្ពឺ', names: ['កំពង់ស្ពឺ', 'Kampong Speu'] },
  { value: 'កំពង់ធំ', names: ['កំពង់ធំ', 'Kampong Thom'] },
  { value: 'កំពត', names: ['កំពត', 'Kampot'] },
  { value: 'កណ្តាល', names: ['កណ្តាល', 'Kandal'] },
  { value: 'កោះកុង', names: ['កោះកុង', 'Koh Kong'] },
  { value: 'ក្រចេះ', names: ['ក្រចេះ', 'Kratie'] },
  { value: 'មណ្ឌលគិរី', names: ['មណ្ឌលគិរី', 'Mondulkiri', 'Mondul Kiri'] },
  { value: 'ឧត្តរមានជ័យ', names: ['ឧត្តរមានជ័យ', 'Oddar Meanchey', 'Otdar Meanchey'] },
  { value: 'ប៉ៃលិន', names: ['ប៉ៃលិន', 'Pailin'] },
  { value: 'ព្រះសីហនុ', names: ['ព្រះសីហនុ', 'Preah Sihanouk', 'Sihanoukville'] },
  { value: 'ព្រះវិហារ', names: ['ព្រះវិហារ', 'Preah Vihear'] },
  { value: 'ពោធិ៍សាត់', names: ['ពោធិ៍សាត់', 'Pursat'] },
  { value: 'ព្រៃវែង', names: ['ព្រៃវែង', 'Prey Veng'] },
  { value: 'រតនគិរី', names: ['រតនគិរី', 'Ratanakiri', 'Ratanak Kiri'] },
  { value: 'សៀមរាប', names: ['សៀមរាប', 'Siem Reap'] },
  { value: 'ស្ទឹងត្រែង', names: ['ស្ទឹងត្រែង', 'Stung Treng'] },
  { value: 'ស្វាយរៀង', names: ['ស្វាយរៀង', 'Svay Rieng'] },
  { value: 'តាកែវ', names: ['តាកែវ', 'Takeo'] },
  { value: 'ត្បូងឃ្មុំ', names: ['ត្បូងឃ្មុំ', 'Tboung Khmum', 'Tbong Khmum'] },
  { value: 'កែប', names: ['កែប', 'Kep'] }
];
const STATUS_COLORS = {
  active: '#16A34A',
  expiring: '#EAB308',
  expired: '#DC2626',
  suspended: '#6B7280'
};
const RISK_COLORS = {
  Low: '#16A34A',
  Medium: '#EAB308',
  High: '#EA580C',
  Critical: '#DC2626'
} as const;

function getField(record: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return null;
}

function getDateField(record: Record<string, any>, keys: string[]) {
  const value = getField(record, keys);
  if (!value) return null;
  const date = new Date(String(value).includes('T') ? String(value) : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getLicenseExpiryDate(record: Record<string, any>) {
  return getDateField(record, ['license_expiry_date', 'expiry_date', 'expiration_date', 'license_expiration_date']);
}

function isValidCoordinate(value: any, min: number, max: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max && numeric !== 0;
}

function hasGps(record: Record<string, any>) {
  const lat = getField(record, ['business_latitude', 'latitude', 'lat', 'gps_latitude']);
  const lng = getField(record, ['business_longitude', 'longitude', 'lng', 'gps_longitude']);
  return isValidCoordinate(lat, -90, 90) && isValidCoordinate(lng, 60, 180);
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function formatRate(value: number | null) {
  return value === null ? 'N/A' : `${value}%`;
}

function getPhnomPenhToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const year = Number(parts.find(part => part.type === 'year')?.value || new Date().getFullYear());
  const month = Number(parts.find(part => part.type === 'month')?.value || new Date().getMonth() + 1);
  const day = Number(parts.find(part => part.type === 'day')?.value || new Date().getDate());
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function daysUntil(dateValue?: string | Date | null) {
  if (!dateValue) return 9999;
  const end = dateValue instanceof Date ? dateValue : new Date(String(dateValue).includes('T') ? dateValue : `${dateValue}T00:00:00`);
  if (Number.isNaN(end.getTime())) return 9999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / 86400000);
}

function daysUntilFrom(dateValue: Date | null, today: Date) {
  if (!dateValue) return 9999;
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dateValue);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

function isOperationalLicense(record: Record<string, any>) {
  return record.is_active !== false;
}

function isActiveOnDate(record: Record<string, any>, date: Date) {
  if (!isOperationalLicense(record)) return false;
  const issueDate = getDateField(record, ['license_issue_date', 'issue_date']);
  const expiryDate = getLicenseExpiryDate(record);
  if (issueDate && issueDate > date) return false;
  return !expiryDate || expiryDate >= date;
}

function isSubmittedReport(report: MetrologyReport & Record<string, any>) {
  const status = String(getField(report, ['report_status', 'status']) || 'submitted').toLowerCase();
  return !['draft', 'rejected', 'cancelled'].includes(status);
}

function reportLicenseKey(report: MetrologyReport & Record<string, any>) {
  return String(getField(report, ['enterprise_license_id', 'license_id', 'license_number']) || '').trim();
}

function licenseKey(license: EnterpriseLicense & Record<string, any>) {
  return String(getField(license, ['license_number', 'license_id', 'id']) || '').trim();
}

function isMonthDue(year: number, month: number, today: Date, deadlineDay = 15) {
  const deadline = new Date(year, month, deadlineDay);
  deadline.setHours(23, 59, 59, 999);
  return today > deadline;
}

function reportMonthValue(report: MetrologyReport & Record<string, any>) {
  const raw = String(report.report_month || '').trim();
  const numeric = raw.match(/\d{1,2}/)?.[0];
  if (numeric) return numeric.padStart(2, '0');
  const idx = MONTHS.findIndex(m => raw.includes(m.kh) || raw.toLowerCase().includes(m.short.toLowerCase()));
  if (idx >= 0) return String(idx + 1).padStart(2, '0');
  const date = getDateField(report, ['submitted_at', 'created_at', 'service_end_date', 'updated_at']);
  if (date) return String(date.getMonth() + 1).padStart(2, '0');
  return '';
}

function reportYearValue(report: MetrologyReport & Record<string, any>) {
  const rawYear = String(report.report_year || '').match(/\d{4}/)?.[0];
  if (rawYear) return rawYear;
  const date = getDateField(report, ['submitted_at', 'created_at', 'service_end_date', 'updated_at']);
  return date ? String(date.getFullYear()) : '';
}

function reportPeriodDate(report: MetrologyReport & Record<string, any>) {
  const year = Number(reportYearValue(report));
  const month = Number(reportMonthValue(report));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  const grouped = new Map<string, number>();
  items.forEach(item => {
    const key = getKey(item) || 'Unknown';
    grouped.set(key, (grouped.get(key) || 0) + 1);
  });
  return Array.from(grouped.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function provinceOf(record: Record<string, any>) {
  const source = [
    getField(record, ['province_city', 'province']),
    getField(record, ['business_geo_address', 'company_address', 'company_address_kh', 'business_address', 'address'])
  ].filter(Boolean).join(' ').toLowerCase();
  const matched = CAMBODIA_PROVINCES.find(province =>
    province.names.some(name => source.includes(name.toLowerCase()))
  );
  return matched?.value || 'មិនទាន់កំណត់';
}

function riskForLicense(license: EnterpriseLicense & Record<string, any>, reportsForLicense: number) {
  const days = daysUntil(getLicenseExpiryDate(license));
  const score =
    (days < 0 ? 42 : 0) +
    (days >= 0 && days <= 30 ? 22 : days <= 90 ? 12 : 0) +
    (!hasGps(license) ? 16 : 0) +
    (!getField(license, ['telegram_chat_id', 'telegram_username', 'telegram_connected_at']) ? 10 : 0) +
    (reportsForLicense === 0 ? 10 : 0);
  const level = score >= 55 ? 'Critical' : score >= 34 ? 'High' : score >= 18 ? 'Medium' : 'Low';
  return { score, level: level as keyof typeof RISK_COLORS, days };
}

function DashboardBadge({ children, tone }: { children: React.ReactNode; tone: 'red' | 'gold' | 'green' | 'blue' }) {
  return <span className={`superdash-design-badge is-${tone}`}>{children}</span>;
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  tone: 'navy' | 'green' | 'gold' | 'red' | 'purple';
}) {
  return (
    <div className={`superdash-design-kpi is-${tone}`}>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{sub}</span>
      </div>
      <i>{icon}</i>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  sub,
  icon,
  tone
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  tone: 'cyan' | 'indigo' | 'orange' | 'red';
}) {
  return (
    <div className={`superdash-mini-kpi is-${tone}`}>
      <i>{icon}</i>
      <div>
        <strong>{value}</strong>
        <p>{label}</p>
        <span>{sub}</span>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
  className = ''
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`superdash-design-card ${className}`}>
      <header>
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function HoverTooltip({ children }: { children: React.ReactNode }) {
  return <span className="superdash-hover-tooltip">{children}</span>;
}

function ProgressRow({
  label,
  value,
  pct,
  color,
  tooltip
}: {
  label: string;
  value: string | number;
  pct: number;
  color: string;
  tooltip?: React.ReactNode;
}) {
  return (
    <div className="superdash-progress-row" tabIndex={0}>
      <div>
        <span>{label}</span>
        <strong style={{ color }}>{value}</strong>
      </div>
      <em><i style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} /></em>
      {tooltip && <HoverTooltip>{tooltip}</HoverTooltip>}
    </div>
  );
}

export default function SuperadminDashboard({ currentUser, reports, users, activeCompanyList, licenseRecords = [], isLoading = false, errorMessage = null }: SuperadminDashboardProps) {
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showAlert, setShowAlert] = useState(true);
  const canOpenAnalytics = currentUser.role === 'superadmin' ||
    (currentUser.role === 'admin' && (currentUser.admin_can_view_all_users || currentUser.admin_can_view_licenses));
  const companyRecords = activeCompanyList as Array<MetrologyUser & Record<string, any>>;
  const licenseStatsRecords = licenseRecords as Array<EnterpriseLicense & Record<string, any>>;
  const totalCompanies = companyRecords.length;
  const todayPhnomPenh = getPhnomPenhToday();
  const operationalLicenses = licenseStatsRecords.filter(isOperationalLicense);
  const activeLicenseRecords = operationalLicenses.filter(c => isActiveOnDate(c, todayPhnomPenh));
  const totalLicenses = operationalLicenses.length;
  const activeLicenses = activeLicenseRecords.length;
  const activeStrict = operationalLicenses.filter(c => daysUntilFrom(getLicenseExpiryDate(c), todayPhnomPenh) > 90).length;
  const expiringSoon = operationalLicenses.filter(c => {
    const days = daysUntilFrom(getLicenseExpiryDate(c), todayPhnomPenh);
    return days >= 0 && days <= 90;
  }).length;
  const expired = operationalLicenses.filter(c => daysUntilFrom(getLicenseExpiryDate(c), todayPhnomPenh) < 0).length;
  const expiring30 = operationalLicenses.filter(c => {
    const days = daysUntilFrom(getLicenseExpiryDate(c), todayPhnomPenh);
    return days >= 0 && days <= 30;
  }).length;
  const expiring31To60 = operationalLicenses.filter(c => {
    const days = daysUntilFrom(getLicenseExpiryDate(c), todayPhnomPenh);
    return days >= 31 && days <= 60;
  }).length;
  const expiring61To90 = operationalLicenses.filter(c => {
    const days = daysUntilFrom(getLicenseExpiryDate(c), todayPhnomPenh);
    return days >= 61 && days <= 90;
  }).length;
  const telegramLinked = activeLicenseRecords.filter(c => {
    const linkedFlag = getField(c, ['telegram_linked', 'is_telegram_linked']);
    return (linkedFlag === true || String(linkedFlag).toLowerCase() === 'true') &&
      !!getField(c, ['telegram_user_id', 'telegram_chat_id']);
  }).length;
  const noGps = activeLicenseRecords.filter(c => !hasGps(c)).length;
  const gpsTracked = Math.max(0, activeLicenses - noGps);
  const licensed = activeLicenseRecords.filter(c => String(c.license_number || '').trim()).length;
  const currentCalendarMonthStart = new Date(todayPhnomPenh.getFullYear(), todayPhnomPenh.getMonth(), 1);
  const latestSubmittedReportPeriod = reports
    .filter(isSubmittedReport)
    .map(reportPeriodDate)
    .filter((date): date is Date => !!date)
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
  const reportingAnchorDate = latestSubmittedReportPeriod && latestSubmittedReportPeriod > currentCalendarMonthStart
    ? latestSubmittedReportPeriod
    : currentCalendarMonthStart;
  const currentYear = String(reportingAnchorDate.getFullYear());
  const currentMonth = String(reportingAnchorDate.getMonth() + 1).padStart(2, '0');
  const currentMonthDue = isMonthDue(reportingAnchorDate.getFullYear(), reportingAnchorDate.getMonth() + 1, todayPhnomPenh);

  const reportsByLicense = useMemo(() => {
    const grouped = new Map<string, number>();
    reports.forEach(report => {
      if (!isSubmittedReport(report)) return;
      const key = reportLicenseKey(report);
      if (key) grouped.set(key, (grouped.get(key) || 0) + 1);
    });
    return grouped;
  }, [reports]);

  const activeLicenseKeys = new Set(activeLicenseRecords.map(licenseKey).filter(Boolean));
  const currentMonthUniqueReports = new Set(
    reports
      .filter(r => isSubmittedReport(r) && reportYearValue(r) === currentYear && reportMonthValue(r) === currentMonth)
      .map(reportLicenseKey)
      .filter(key => key && activeLicenseKeys.has(key))
  ).size;
  const currentMonthRate = activeLicenses > 0 ? percent(currentMonthUniqueReports, activeLicenses) : null;
  const missingReports = currentMonthDue ? Math.max(0, activeLicenses - currentMonthUniqueReports) : 0;

  const provinceSource = (activeLicenseRecords.length > 0 ? activeLicenseRecords : companyRecords) as Array<Record<string, any>>;
  const allProvinceRows = CAMBODIA_PROVINCES.map(province => ({
    label: province.value,
    count: provinceSource.filter(record => provinceOf(record) === province.value).length
  })).sort((a, b) => b.count - a.count);
  const visibleProvinceRows = allProvinceRows.slice(0, 8);
  const otherProvinceRows = allProvinceRows.slice(8);
  const otherProvinceCount = otherProvinceRows.reduce((sum, row) => sum + row.count, 0);
  const provinceRows = otherProvinceRows.length > 0
    ? [...visibleProvinceRows, { label: `Others (${otherProvinceRows.length} provinces)`, count: otherProvinceCount }]
    : visibleProvinceRows;
  const provincesCovered = allProvinceRows.filter(row => row.count > 0).length;
  const maxProvince = Math.max(1, ...provinceRows.map(row => row.count));
  const instrumentRows = countBy(
    (activeLicenseRecords.length > 0 ? activeLicenseRecords : reports.filter(isSubmittedReport)) as Array<Record<string, any>>,
    item => String(getField(item as any, ['measuring_instrument_type', 'measuring_instrument', 'service_scope']) || 'Other Instruments')
  ).slice(0, 9);
  const maxInstrument = Math.max(1, ...instrumentRows.map(row => row.count));

  const allRiskRows = activeLicenseRecords
    .map(license => {
      const reportCount = reportsByLicense.get(licenseKey(license)) || reportsByLicense.get(String(license.license_number || '').trim()) || 0;
      const risk = riskForLicense(license, reportCount);
      return {
        license,
        reportCount,
        score: risk.score,
        level: risk.level,
        days: risk.days
      };
    })
    .sort((a, b) => b.score - a.score);
  const riskRows = allRiskRows.slice(0, 8);
  const riskCounts = (['Low', 'Medium', 'High', 'Critical'] as Array<keyof typeof RISK_COLORS>).map(level => ({
    level,
    count: allRiskRows.filter(row => row.level === level).length
  }));
  const highCritical = allRiskRows.filter(row => row.level === 'High' || row.level === 'Critical').length;

  const now = reportingAnchorDate;
  const lastSixMonths = Array.from({ length: 6 }, (_, index) => {
    const date = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), -(5 - index));
    return {
      ...MONTHS[date.getMonth()],
      year: date.getFullYear(),
      monthNumber: date.getMonth() + 1,
      monthStart: date
    };
  });
  const trendRows = lastSixMonths.map(month => {
    const denominator = operationalLicenses.filter(license => isActiveOnDate(license, month.monthStart)).length;
    const thisYearCount = new Set(
      reports
        .filter(r => isSubmittedReport(r) && reportYearValue(r) === String(month.year) && reportMonthValue(r) === month.value)
        .map(reportLicenseKey)
        .filter(key => key && operationalLicenses.some(license => licenseKey(license) === key && isActiveOnDate(license, month.monthStart)))
    ).size;
    const previousYearMonthStart = new Date(month.year - 1, month.monthNumber - 1, 1);
    const previousYearDenominator = operationalLicenses.filter(license => isActiveOnDate(license, previousYearMonthStart)).length;
    const lastYearCount = new Set(
      reports
        .filter(r => isSubmittedReport(r) && reportYearValue(r) === String(month.year - 1) && reportMonthValue(r) === month.value)
        .map(reportLicenseKey)
        .filter(key => key && operationalLicenses.some(license => licenseKey(license) === key && isActiveOnDate(license, previousYearMonthStart)))
    ).size;
    return {
      month,
      rate: denominator > 0 ? percent(thisYearCount, denominator) : null,
      count: thisYearCount,
      denominator,
      lastYearCount,
      lastYearRate: previousYearDenominator > 0 ? percent(lastYearCount, previousYearDenominator) : null
    };
  });
  const hasLastYearTrend = trendRows.some(row => row.lastYearRate !== null);
  const trendMax = 100;
  const trendPoints = trendRows.map((row, index) => {
    const x = 46 + index * (548 / Math.max(1, trendRows.length - 1));
    const y = 22 + ((trendMax - (row.rate ?? 0)) / trendMax) * 142;
    return { ...row, x, y };
  });
  const lastYearTrendPoints = trendRows.map((row, index) => {
    const x = 46 + index * (548 / Math.max(1, trendRows.length - 1));
    const y = 22 + ((trendMax - (row.lastYearRate ?? 0)) / trendMax) * 142;
    return { ...row, x, y };
  });
  const trendPath = trendPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const lastYearTrendPath = lastYearTrendPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const heatmapRows = activeLicenseRecords.slice(0, 12).map(license => {
    const submittedMonths = lastSixMonths.map(month => {
      const submitted = reports.some(report =>
        isSubmittedReport(report) &&
        reportYearValue(report) === String(month.year) &&
        reportMonthValue(report) === month.value &&
        (reportLicenseKey(report) === licenseKey(license) || reportLicenseKey(report) === String(license.license_number || '').trim())
      );
      if (submitted) return 'submitted';
      return isMonthDue(month.year, month.monthNumber, todayPhnomPenh) ? 'missing' : 'not_yet_due';
    });
    const submitted = submittedMonths.filter(status => status === 'submitted').length;
    const dueMonths = submittedMonths.filter(status => status !== 'not_yet_due').length;
    return {
      name: license.company_name_kh || license.company_name || license.license_number,
      submittedMonths,
      rate: dueMonths > 0 ? percent(submitted, dueMonths) : null
    };
  });
  const chronicMissing = heatmapRows.filter(row => row.submittedMonths.filter(status => status === 'missing').length >= 3).length;
  const submittedCurrentReports = reports.filter(r => isSubmittedReport(r) && reportYearValue(r) === currentYear && reportMonthValue(r) === currentMonth);
  const onTimeSubmitted = submittedCurrentReports.filter(report => {
    const submittedAt = getDateField(report, ['submitted_at', 'created_at']);
    const deadline = new Date(reportingAnchorDate.getFullYear(), reportingAnchorDate.getMonth() + 1, 15, 23, 59, 59, 999);
    return !!submittedAt && submittedAt <= deadline;
  }).length;
  const onTimeRate = submittedCurrentReports.length > 0 ? percent(onTimeSubmitted, submittedCurrentReports.length) : null;
  const reportServiceLicenseKeys = new Set(reports.filter(isSubmittedReport).map(reportLicenseKey).filter(Boolean));
  const serviceSource = activeLicenseRecords.length > 0 ? activeLicenseRecords : reports.filter(isSubmittedReport);
  const repairCount = serviceSource.filter(item => String(getField(item as any, ['service_scope', 'service_type']) || '').toLowerCase().includes('repair')).length;
  const installationCount = serviceSource.filter(item => String(getField(item as any, ['service_scope', 'service_type']) || '').toLowerCase().includes('installation')).length;
  const manufactureCount = serviceSource.filter(item => String(getField(item as any, ['service_scope', 'service_type']) || '').toLowerCase().includes('manufactur')).length;
  const serviceDenominator = activeLicenseRecords.length > 0 ? activeLicenses : reportServiceLicenseKeys.size || reports.length;
  const otherServiceCount = Math.max(0, serviceDenominator - repairCount - installationCount - manufactureCount);

  const statusTotal = Math.max(1, totalLicenses);
  const activePct = percent(activeStrict, statusTotal);
  const expiringPct = percent(expiringSoon, statusTotal);
  const expiredPct = percent(expired, statusTotal);
  const gpsRate = activeLicenses > 0 ? percent(gpsTracked, activeLicenses) : null;
  const telegramRate = activeLicenses > 0 ? percent(telegramLinked, activeLicenses) : null;
  const reportRateLabel = formatRate(currentMonthRate);
  const gpsRateLabel = formatRate(gpsRate);
  const telegramRateLabel = formatRate(telegramRate);
  const dataCompletenessRate = activeLicenses > 0 ? Math.round(activeLicenseRecords.reduce((sum, license) => {
    const checks = [
      getField(license, ['company_name', 'company_name_kh']),
      getField(license, ['license_owner_name', 'representative_name', 'legal_representative']),
      getField(license, ['phone_number', 'phone']),
      getField(license, ['email']),
      getField(license, ['company_address', 'address']),
      provinceOf(license) !== 'មិនទាន់កំណត់',
      hasGps(license),
      getField(license, ['license_issue_date', 'issue_date']),
      getField(license, ['license_expiry_date', 'expiry_date', 'expiration_date']),
      getField(license, ['service_scope', 'business_type']),
      getField(license, ['measuring_instrument_type', 'measuring_instruments', 'measuring_instrument'])
    ];
    return sum + percent(checks.filter(Boolean).length, checks.length);
  }, 0) / activeLicenses) : null;
  const forecastMax = Math.max(1, expired, expiring30, expiring31To60, expiring61To90);
  const alertItems = [
    expired > 0 ? `${expired} licenses expired` : '',
    expiring30 > 0 ? `${expiring30} licenses expire in 30 days` : '',
    currentMonthRate !== null && currentMonthRate < 90 ? `Report rate ${currentMonthRate}% (target: >=90%)` : '',
    (riskCounts.find(r => r.level === 'Critical')?.count || 0) > 0 ? `${riskCounts.find(r => r.level === 'Critical')?.count || 0} Critical-risk enterprises require inspection` : ''
  ].filter(Boolean);
  const shouldShowAlert = totalLicenses > 5 && alertItems.length > 0;
  const donutStyle = {
    background: `conic-gradient(${STATUS_COLORS.active} 0 ${activePct}%, ${STATUS_COLORS.expiring} ${activePct}% ${activePct + expiringPct}%, ${STATUS_COLORS.expired} ${activePct + expiringPct}% ${activePct + expiringPct + expiredPct}%, #E5E7EB ${activePct + expiringPct + expiredPct}% 100%)`
  };

  const licenseMapSource = activeLicenseRecords.length > 0 ? activeLicenseRecords : companyRecords;
  const mapRecords = licenseMapSource.map(company => ({
    ...company,
    company_name: company.company_name_en || company.company_name_kh || company.company_name,
    company_name_kh: company.company_name_kh,
    license_status: daysUntilFrom(getLicenseExpiryDate(company), todayPhnomPenh) < 0
      ? 'Expired'
      : daysUntilFrom(getLicenseExpiryDate(company), todayPhnomPenh) <= 90
        ? 'Expiring Soon'
        : 'Active',
    business_latitude: getField(company, ['business_latitude', 'latitude', 'lat', 'gps_latitude']),
    business_longitude: getField(company, ['business_longitude', 'longitude', 'lng', 'gps_longitude'])
  }));

  return (
    <div className="superdash superdash-design">
      <div className="superdash-design-topbar">
        <div>
          <h2>ផ្ទាំងគ្រប់គ្រងចម្បង · Superadmin Dashboard</h2>
          <p>មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ (NMC) · Metrology License Report System</p>
        </div>
        <div className="superdash-design-topbar__actions">
          <DashboardBadge tone="red"><ShieldAlert /> {isLoading ? '...' : (riskCounts.find(r => r.level === 'Critical')?.count || 0)} Critical</DashboardBadge>
          <DashboardBadge tone="gold"><Clock3 /> {isLoading ? '...' : expiring30} Expiring</DashboardBadge>
          <DashboardBadge tone="green"><Send /> Bot Active</DashboardBadge>
          {canOpenAnalytics && (
            <button type="button" onClick={() => setShowAnalytics(true)}>
              <BarChart3 />
              Data Analytics
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="superdash-note is-blue">
          Loading Superadmin dashboard analytics from Supabase...
        </div>
      )}

      {errorMessage && (
        <div className="superdash-note is-red">
          <strong>Dashboard data error:</strong> {errorMessage}
        </div>
      )}

      {showAlert && shouldShowAlert && (
        <div className="superdash-alert-banner">
          <div>
            <AlertTriangle />
            <p>
              <strong>Action Required:</strong> {alertItems.join(' · ')}.
            </p>
          </div>
          <button type="button" onClick={() => setShowAlert(false)} aria-label="Dismiss dashboard alert">
            <X />
          </button>
        </div>
      )}

      <section className="superdash-kpi-row superdash-kpi-row--five">
        <KpiCard label="Total Licenses" value={isLoading && totalLicenses === 0 ? 'Loading' : totalLicenses} sub="All records in enterprise_licenses" icon={<FileCheck2 />} tone="navy" />
        <KpiCard label="Active Licenses" value={isLoading && totalLicenses === 0 ? 'Loading' : activeLicenses} sub={`${formatRate(totalLicenses > 0 ? percent(activeLicenses, totalLicenses) : null)} active or unexpired`} icon={<CheckCircle2 />} tone="green" />
        <KpiCard label="Expiring <=90 Days" value={isLoading && totalLicenses === 0 ? 'Loading' : expiringSoon} sub={`${expiring30} critical within 30 days`} icon={<Clock3 />} tone="gold" />
        <KpiCard label="Expired Licenses" value={isLoading && totalLicenses === 0 ? 'Loading' : expired} sub="Expiry date before today" icon={<ShieldAlert />} tone="red" />
        <KpiCard label={`Report Rate (${MONTHS[Number(currentMonth) - 1]?.short || 'Now'})`} value={isLoading && totalLicenses === 0 ? 'Loading' : reportRateLabel} sub={currentMonthDue ? `${missingReports} missing reports` : 'Current month not yet due'} icon={<BarChart3 />} tone="purple" />
      </section>

      <section className="superdash-mini-kpi-row">
        <MiniKpi label="GPS Tracked" value={gpsRateLabel} sub={`${gpsTracked} of ${activeLicenses} active enterprises`} icon={<MapPin />} tone="cyan" />
        <MiniKpi label="Telegram Linked" value={telegramRateLabel} sub={`${telegramLinked} of ${activeLicenses} active connected`} icon={<MessageCircle />} tone="indigo" />
        <MiniKpi label="Provinces Covered" value={`${provincesCovered} / ${CAMBODIA_PROVINCE_COUNT}`} sub={`${Math.max(0, CAMBODIA_PROVINCE_COUNT - provincesCovered)} provinces have no provider`} icon={<MapPin />} tone="orange" />
        <MiniKpi label="High + Critical Risk" value={highCritical} sub="Priority inspection list below" icon={<Gauge />} tone="red" />
      </section>

      <section className="superdash-design-grid superdash-design-grid--status">
        <SectionCard title="License Status" subtitle={`${totalLicenses} total enterprises`}>
          <div className="superdash-donut-wrap">
            <div className="superdash-donut" style={donutStyle}><span>{totalLicenses}</span></div>
            <div className="superdash-status-list">
              <ProgressRow label="Active" value={activeStrict} pct={activePct} color={STATUS_COLORS.active} tooltip={<>សកម្ម / Active<br />{activeStrict} licenses · {activePct}% of total</>} />
              <ProgressRow label="Expiring Soon" value={expiringSoon} pct={expiringPct} color={STATUS_COLORS.expiring} tooltip={<>ជិតផុតកំណត់ / Expiring Soon<br />{expiringSoon} licenses · {expiringPct}% of total</>} />
              <ProgressRow label="Expired" value={expired} pct={expiredPct} color={STATUS_COLORS.expired} tooltip={<>ផុតកំណត់ / Expired<br />{expired} licenses · {expiredPct}% of total</>} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Licensed Enterprises by Province" subtitle={`Active providers · ${provincesCovered} of ${CAMBODIA_PROVINCE_COUNT} provinces covered`}>
          <div className="superdash-horizontal-bars">
            {provinceRows.length === 0 ? (
              <p className="superdash-design-empty">No province data available.</p>
            ) : provinceRows.map(row => (
              <div key={row.label}>
                <ProgressRow label={row.label} value={row.count} pct={(row.count / maxProvince) * 100} color="#C9A227" tooltip={<>{row.label}<br />Enterprises: {row.count} · {percent(row.count, Math.max(1, provinceSource.length))}%</>} />
              </div>
            ))}
          </div>
          <div className="superdash-note is-gold">
            <strong>{Math.max(0, CAMBODIA_PROVINCE_COUNT - provincesCovered)} provinces</strong> currently have no recorded licensed service provider.
          </div>
        </SectionCard>

        <SectionCard title="Risk Distribution" subtitle="Priority risk levels">
          <div className="superdash-risk-bars">
            {riskCounts.map(row => (
              <div key={row.level}>
                <ProgressRow label={row.level} value={row.count} pct={percent(row.count, Math.max(1, allRiskRows.length))} color={RISK_COLORS[row.level]} tooltip={<>{row.level} risk<br />{row.count} enterprises · {percent(row.count, Math.max(1, allRiskRows.length))}% of active enterprises</>} />
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <section className="superdash-design-grid superdash-design-grid--forecast">
        <SectionCard title="License Expiry Forecast" subtitle="Renewal actions required">
          <ProgressRow label="Expired (overdue)" value={expired} pct={(expired / forecastMax) * 100} color="#6B7280" tooltip={<>ផុតកំណត់ / Expired<br />{expired} licenses</>} />
          <ProgressRow label="Expires <= 30 days" value={expiring30} pct={(expiring30 / forecastMax) * 100} color="#DC2626" tooltip={<>ត្រូវបន្តឆាប់ៗ / Within 30 days<br />{expiring30} licenses</>} />
          <ProgressRow label="Expires 31-60 days" value={expiring31To60} pct={(expiring31To60 / forecastMax) * 100} color="#EA580C" tooltip={<>31-60 days<br />{expiring31To60} licenses</>} />
          <ProgressRow label="Expires 61-90 days" value={expiring61To90} pct={(expiring61To90 / forecastMax) * 100} color="#EAB308" tooltip={<>61-90 days<br />{expiring61To90} licenses</>} />
          <div className="superdash-note is-red">
            Telegram reminders can prioritize the 30-day and expired license groups.
          </div>
        </SectionCard>

        <SectionCard
          title="Monthly Report Submission Trend"
          subtitle={`Submission rate (%) · ${lastSixMonths[0]?.short}-${lastSixMonths[lastSixMonths.length - 1]?.short} ${currentYear} · Target >= 90%`}
          action={<DashboardBadge tone={(currentMonthRate ?? 0) >= 90 ? 'green' : 'red'}>{reportRateLabel} this month</DashboardBadge>}
        >
          <div className="superdash-line-chart" role="img" aria-label="Monthly report submission trend line chart">
            {reports.length === 0 && !isLoading ? (
              <p className="superdash-design-empty">No monthly report data available from Supabase.</p>
            ) : (
            <svg viewBox="0 0 640 220" preserveAspectRatio="none">
              {[100, 90, 75, 50, 25, 0].map(value => {
                const y = 22 + ((trendMax - value) / trendMax) * 142;
                return (
                  <g key={value}>
                    <line className="grid-line" x1="46" x2="594" y1={y} y2={y} />
                    <text className="axis-label y-axis" x="35" y={y + 5}>{value}</text>
                  </g>
                );
              })}
              <line className="target-line" x1="46" x2="594" y1={22 + ((100 - 90) / 100) * 142} y2={22 + ((100 - 90) / 100) * 142} />
              <line className="axis-line" x1="46" x2="594" y1="164" y2="164" />
              <line className="axis-line" x1="46" x2="46" y1="22" y2="164" />
              {hasLastYearTrend && <path className="trend-line trend-line--previous" d={lastYearTrendPath} />}
              <path className="trend-line" d={trendPath} />
              {trendPoints.map(point => (
                <g className="trend-point" key={point.month.value} transform={`translate(${point.x} ${point.y})`}>
                  <circle r="6" />
                  <text className="trend-tooltip" x="0" y="-14">{point.month.short}: {formatRate(point.rate)}</text>
                  <title>{`${point.month.kh} (${point.month.short}) - Rate: ${formatRate(point.rate)}, Submitted: ${point.count}, Active denominator: ${point.denominator}${hasLastYearTrend ? `, Last Year Rate: ${formatRate(point.lastYearRate)}` : ''}`}</title>
                </g>
              ))}
              {hasLastYearTrend && lastYearTrendPoints.map(point => (
                <g className="trend-point trend-point--previous" key={`previous-${point.month.value}`} transform={`translate(${point.x} ${point.y})`}>
                  <circle r="5" />
                  <title>{`${point.month.kh} (${point.month.short}) - Last Year Rate: ${formatRate(point.lastYearRate)}, Submitted: ${point.lastYearCount}`}</title>
                </g>
              ))}
              {trendPoints.map(point => (
                <g key={`label-${point.month.value}`}>
                  <line className="x-tick" x1={point.x} x2={point.x} y1="164" y2="172" />
                  <text className="axis-label x-axis" x={point.x} y="190">{point.month.short}</text>
                </g>
              ))}
            </svg>
            )}
          </div>
          <div className="superdash-chart-legend">
            <span><i style={{ background: '#C9A227' }} /> This Year: {currentYear}</span>
            {hasLastYearTrend && <span><i style={{ background: '#64748B' }} /> Last Year: {Number(currentYear) - 1}</span>}
          </div>
          <div className="superdash-trend-metrics">
            <div className="superdash-trend-metric is-gold"><strong>{reportRateLabel}</strong><span>Current Rate</span></div>
            <div className="superdash-trend-metric is-red"><strong>{currentMonthDue ? missingReports : 'N/A'}</strong><span>Missing Reports</span></div>
            <div className="superdash-trend-metric is-red"><strong>{chronicMissing} firms</strong><span>{'Chronic (>=3 mo)'}</span></div>
            <div className="superdash-trend-metric is-blue"><strong>{formatRate(onTimeRate)}</strong><span>On-time Rate</span></div>
          </div>
        </SectionCard>
      </section>

      <SectionCard
        title="Monthly Report Compliance Heatmap"
        subtitle={`Showing ${heatmapRows.length} enterprises · ${lastSixMonths[0]?.short}-${lastSixMonths[lastSixMonths.length - 1]?.short} ${currentYear}`}
      >
        <div className="superdash-heatmap-wrap">
          <table className="superdash-heatmap">
            <thead>
              <tr>
                <th>Enterprise</th>
                {lastSixMonths.map(month => <th key={month.value}>{month.short}</th>)}
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {heatmapRows.length === 0 ? (
                <tr><td colSpan={lastSixMonths.length + 2}>No license data available.</td></tr>
              ) : heatmapRows.map(row => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  {row.submittedMonths.map((status, index) => (
                    <td key={index}><span className={`is-${status}`}>{status === 'submitted' ? '✓' : status === 'missing' ? '×' : '-'}</span></td>
                  ))}
                  <td><strong className={row.rate === null ? 'is-warn' : row.rate >= 80 ? 'is-good' : row.rate >= 50 ? 'is-warn' : 'is-bad'}>{formatRate(row.rate)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <section className="superdash-design-grid superdash-design-grid--instruments">
        <SectionCard title="Instrument Coverage by Licensed Service Firms" subtitle="Number of firms covering each instrument type">
          <div className="superdash-horizontal-bars">
            {instrumentRows.length === 0 ? (
              <p className="superdash-design-empty">No instrument data available.</p>
            ) : instrumentRows.map((row, index) => (
              <div key={row.label}>
                <ProgressRow label={row.label} value={row.count} pct={(row.count / maxInstrument) * 100} color={index < 4 ? '#DC2626' : index < 7 ? '#C9A227' : '#0B1A35'} tooltip={<>{row.label}<br />Instrument records: {row.count} · {percent(row.count, Math.max(1, instrumentRows.reduce((sum, item) => sum + item.count, 0)))}%</>} />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Service Scope Mix" subtitle="Companies by service type">
          {reports.length === 0 && !isLoading ? (
            <p className="superdash-design-empty">No service report data available.</p>
          ) : (
            <>
              <ProgressRow label="Repair Services" value={repairCount} pct={percent(repairCount, Math.max(1, serviceDenominator))} color="#0B1A35" tooltip={<>ជួសជុល / Repair<br />{repairCount} firms · {percent(repairCount, Math.max(1, serviceDenominator))}% of active</>} />
              <ProgressRow label="Installation" value={installationCount} pct={percent(installationCount, Math.max(1, serviceDenominator))} color="#C9A227" tooltip={<>តម្លើង / Installation<br />{installationCount} firms · {percent(installationCount, Math.max(1, serviceDenominator))}% of active</>} />
              <ProgressRow label="Manufacturing" value={manufactureCount} pct={percent(manufactureCount, Math.max(1, serviceDenominator))} color="#6366F1" tooltip={<>ផលិត / Manufacturing<br />{manufactureCount} firms · {percent(manufactureCount, Math.max(1, serviceDenominator))}% of active</>} />
              {otherServiceCount > 0 && <ProgressRow label="Other" value={otherServiceCount} pct={percent(otherServiceCount, Math.max(1, serviceDenominator))} color="#64748B" tooltip={<>Other service values<br />{otherServiceCount} firms · {percent(otherServiceCount, Math.max(1, serviceDenominator))}% of active</>} />}
            </>
          )}
          <div className="superdash-note is-blue">Service mix is calculated from submitted monthly reports.</div>
        </SectionCard>
      </section>

      <SectionCard title="Priority Risk Register" subtitle="Top enterprises requiring inspection · sorted by risk score">
        <div className="superdash-risk-table-wrap">
          <table className="superdash-risk-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Enterprise</th>
                <th>Province</th>
                <th>Risk Score</th>
                <th>Risk Level</th>
                <th>License Status</th>
                <th>Reports</th>
                <th>GPS</th>
              </tr>
            </thead>
            <tbody>
              {riskRows.length === 0 ? (
                <tr><td colSpan={8}>No risk records available.</td></tr>
              ) : riskRows.map((row, index) => {
                const color = RISK_COLORS[row.level];
                return (
                  <tr key={row.license.id || row.license.license_number} className={row.level === 'Critical' ? 'is-critical' : ''}>
                    <td>{index + 1}</td>
                    <td><strong>{row.license.company_name_kh || row.license.company_name}</strong><span>{row.license.license_number}</span></td>
                    <td>{provinceOf(row.license)}</td>
                    <td><em style={{ width: `${Math.min(70, row.score)}px`, background: color }} /><b style={{ color }}>{row.score}</b></td>
                    <td><mark style={{ background: color }}>{row.level}</mark></td>
                    <td>{row.days < 0 ? `Expired ${Math.abs(row.days)}d ago` : `Exp. in ${row.days}d`}</td>
                    <td>{row.reportCount > 0 ? `${row.reportCount} reports` : 'No reports'}</td>
                    <td>{hasGps(row.license) ? 'Recorded' : 'Missing'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <section className="superdash-design-grid superdash-design-grid--gauges">
        <MiniKpi label="GPS Coverage" value={gpsRateLabel} sub={`${gpsTracked} / ${activeLicenses} active enterprises`} icon={<MapPin />} tone="cyan" />
        <MiniKpi label="Telegram Linked" value={telegramRateLabel} sub={`${telegramLinked} / ${activeLicenses} active enterprises`} icon={<MessageCircle />} tone="indigo" />
        <MiniKpi label="Data Completeness" value={formatRate(dataCompletenessRate)} sub={`${licensed} licensed / ${activeLicenses} active companies`} icon={<ShieldCheck />} tone="red" />
      </section>

      <section className="superdash-panel superdash-map-panel">
        <div className="superdash-panel__header">
          <h3>ផែនទីអាជ្ញាប័ណ្ណ / License Map</h3>
        </div>
        <EnterpriseLicenseMapView licenses={mapRecords} nmcLogoUrl={nmcLogo} className="superdash-map" />
        <div className="superdash-map-legend">
          <span><i className="is-active" /> សកម្ម / Active</span>
          <span><i className="is-expiring" /> ជិតផុតកំណត់ / Expiring</span>
          <span><i className="is-expired" /> ផុតកំណត់ / Expired</span>
        </div>
      </section>

      <TopServiceCompanies reports={reports} users={users} />

      <footer className="superdash-design-footer">
        NMC Metrology License Report System · National Metrology Center of Cambodia · Last updated: {new Date().toLocaleDateString()}
      </footer>

      {showAnalytics && (
        <DataAnalyticsReport
          currentUser={currentUser}
          reports={reports}
          users={users}
          initialLicenses={licenseRecords}
          onClose={() => setShowAnalytics(false)}
        />
      )}
    </div>
  );
}
