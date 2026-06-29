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

function hasGps(record: Record<string, any>) {
  return !!getField(record, ['business_latitude', 'latitude', 'lat', 'gps_latitude']) &&
    !!getField(record, ['business_longitude', 'longitude', 'lng', 'gps_longitude']);
}

function statusOf(record: Record<string, any>) {
  return String(getField(record, ['license_status', 'status', 'current_status']) || '').toLowerCase();
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function daysUntil(dateValue?: string | null) {
  if (!dateValue) return 9999;
  const end = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(end.getTime())) return 9999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / 86400000);
}

function reportMonthValue(report: MetrologyReport) {
  const raw = String(report.report_month || '').trim();
  const numeric = raw.match(/\d{1,2}/)?.[0];
  if (numeric) return numeric.padStart(2, '0');
  const idx = MONTHS.findIndex(m => raw.includes(m.kh) || raw.toLowerCase().includes(m.short.toLowerCase()));
  return idx >= 0 ? String(idx + 1).padStart(2, '0') : '';
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
  return String(getField(record, ['province_city', 'province', 'business_geo_address', 'company_address', 'address']) || 'Unknown');
}

function riskForLicense(license: EnterpriseLicense & Record<string, any>, reportsForLicense: number) {
  const days = daysUntil(license.license_expiry_date);
  const status = statusOf(license);
  const score =
    (status.includes('expired') || days < 0 ? 42 : 0) +
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

function ProgressRow({ label, value, pct, color }: { label: string; value: string | number; pct: number; color: string }) {
  return (
    <div className="superdash-progress-row">
      <div>
        <span>{label}</span>
        <strong style={{ color }}>{value}</strong>
      </div>
      <em><i style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} /></em>
    </div>
  );
}

export default function SuperadminDashboard({ currentUser, reports, users, activeCompanyList, licenseRecords = [] }: SuperadminDashboardProps) {
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showAlert, setShowAlert] = useState(true);
  const canOpenAnalytics = currentUser.role === 'superadmin' ||
    (currentUser.role === 'admin' && (currentUser.admin_can_view_all_users || currentUser.admin_can_view_licenses));
  const companyRecords = activeCompanyList as Array<MetrologyUser & Record<string, any>>;
  const licenseStatsRecords = licenseRecords as Array<EnterpriseLicense & Record<string, any>>;
  const totalCompanies = companyRecords.length;
  const totalLicenses = licenseStatsRecords.length;
  const activeLicenses = licenseStatsRecords.filter(c => {
    const status = statusOf(c);
    return status ? ['active', 'renewed'].includes(status) : c.is_active !== false;
  }).length;
  const expiringSoon = licenseStatsRecords.filter(c => statusOf(c).includes('expiring') || (daysUntil(c.license_expiry_date) >= 0 && daysUntil(c.license_expiry_date) <= 90)).length;
  const expired = licenseStatsRecords.filter(c => statusOf(c).includes('expired') || daysUntil(c.license_expiry_date) < 0).length;
  const expiring30 = licenseStatsRecords.filter(c => daysUntil(c.license_expiry_date) >= 0 && daysUntil(c.license_expiry_date) <= 30).length;
  const expiring60 = licenseStatsRecords.filter(c => daysUntil(c.license_expiry_date) >= 0 && daysUntil(c.license_expiry_date) <= 60).length;
  const telegramLinked = licenseStatsRecords.filter(c => !!getField(c, ['telegram_chat_id', 'telegram_username', 'telegram_connected_at'])).length;
  const noGps = licenseStatsRecords.filter(c => !hasGps(c)).length;
  const gpsTracked = Math.max(0, totalLicenses - noGps);
  const licensed = licenseStatsRecords.filter(c => String(c.license_number || '').trim()).length;
  const currentYear = String(new Date().getFullYear());
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');

  const reportsByLicense = useMemo(() => {
    const grouped = new Map<string, number>();
    reports.forEach(report => {
      const key = String(report.license_number || '').trim();
      if (key) grouped.set(key, (grouped.get(key) || 0) + 1);
    });
    return grouped;
  }, [reports]);

  const currentMonthUniqueReports = new Set(
    reports
      .filter(r => r.report_year === currentYear && reportMonthValue(r) === currentMonth)
      .map(r => r.license_number)
      .filter(Boolean)
  ).size;
  const currentMonthRate = percent(currentMonthUniqueReports, Math.max(1, totalLicenses));
  const missingReports = Math.max(0, totalLicenses - currentMonthUniqueReports);

  const provinceRows = countBy(licenseStatsRecords, provinceOf).slice(0, 9);
  const provincesCovered = provinceRows.filter(row => row.label !== 'Unknown').length;
  const maxProvince = Math.max(1, ...provinceRows.map(row => row.count));
  const instrumentRows = countBy(
    (licenseStatsRecords.length > 0 ? licenseStatsRecords : reports) as Array<Record<string, any>>,
    item => String(getField(item as any, ['measuring_instrument_type', 'measuring_instrument', 'service_scope']) || 'Other Instruments')
  ).slice(0, 9);
  const maxInstrument = Math.max(1, ...instrumentRows.map(row => row.count));

  const riskRows = licenseStatsRecords
    .map(license => {
      const reportCount = reportsByLicense.get(String(license.license_number || '').trim()) || 0;
      const risk = riskForLicense(license, reportCount);
      return {
        license,
        reportCount,
        score: risk.score,
        level: risk.level,
        days: risk.days
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const riskCounts = (['Low', 'Medium', 'High', 'Critical'] as Array<keyof typeof RISK_COLORS>).map(level => ({
    level,
    count: riskRows.filter(row => row.level === level).length
  }));
  const highCritical = riskRows.filter(row => row.level === 'High' || row.level === 'Critical').length;

  const now = new Date();
  const lastSixMonths = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return MONTHS[date.getMonth()];
  });
  const trendRows = lastSixMonths.map(month => {
    const uniqueReports = new Set(
      reports
        .filter(r => r.report_year === currentYear && reportMonthValue(r) === month.value)
        .map(r => r.license_number)
        .filter(Boolean)
    ).size;
    return { month, rate: percent(uniqueReports, Math.max(1, totalLicenses)), count: uniqueReports };
  });
  const heatmapRows = licenseStatsRecords.slice(0, 12).map(license => {
    const submittedMonths = lastSixMonths.map(month =>
      reports.some(report => report.license_number === license.license_number && report.report_year === currentYear && reportMonthValue(report) === month.value)
    );
    const submitted = submittedMonths.filter(Boolean).length;
    return {
      name: license.company_name_kh || license.company_name || license.license_number,
      submittedMonths,
      rate: percent(submitted, lastSixMonths.length)
    };
  });

  const statusTotal = Math.max(1, totalLicenses);
  const activePct = percent(activeLicenses, statusTotal);
  const expiringPct = percent(expiringSoon, statusTotal);
  const expiredPct = percent(expired, statusTotal);
  const donutStyle = {
    background: `conic-gradient(${STATUS_COLORS.active} 0 ${activePct}%, ${STATUS_COLORS.expiring} ${activePct}% ${activePct + expiringPct}%, ${STATUS_COLORS.expired} ${activePct + expiringPct}% ${activePct + expiringPct + expiredPct}%, #E5E7EB ${activePct + expiringPct + expiredPct}% 100%)`
  };

  const licenseMapSource = licenseRecords.length > 0 ? licenseRecords : companyRecords;
  const mapRecords = licenseMapSource.map(company => ({
    ...company,
    company_name: company.company_name_en || company.company_name_kh || company.company_name,
    company_name_kh: company.company_name_kh,
    license_status: getField(company, ['license_status', 'status']) || (company.is_active === false ? 'Expired' : 'Active'),
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
          <DashboardBadge tone="red"><ShieldAlert /> {riskCounts.find(r => r.level === 'Critical')?.count || 0} Critical</DashboardBadge>
          <DashboardBadge tone="gold"><Clock3 /> {expiring30} Expiring</DashboardBadge>
          <DashboardBadge tone="green"><Send /> Bot Active</DashboardBadge>
          {canOpenAnalytics && (
            <button type="button" onClick={() => setShowAnalytics(true)}>
              <BarChart3 />
              Data Analytics
            </button>
          )}
        </div>
      </div>

      {showAlert && highCritical + expiring30 + expired > 0 && (
        <div className="superdash-alert-banner">
          <div>
            <AlertTriangle />
            <p>
              <strong>Action Required:</strong> {highCritical} high or critical risk enterprises · {expiring30} licenses expire within 30 days · Monthly report rate is {currentMonthRate}%.
            </p>
          </div>
          <button type="button" onClick={() => setShowAlert(false)} aria-label="Dismiss dashboard alert">
            <X />
          </button>
        </div>
      )}

      <section className="superdash-kpi-row superdash-kpi-row--five">
        <KpiCard label="Total Licenses" value={totalLicenses} sub="All registered enterprises" icon={<FileCheck2 />} tone="navy" />
        <KpiCard label="Active Licenses" value={activeLicenses} sub={`${percent(activeLicenses, totalLicenses)}% of portfolio`} icon={<CheckCircle2 />} tone="green" />
        <KpiCard label="Expiring <=90 Days" value={expiringSoon} sub={`${expiring30} critical within 30 days`} icon={<Clock3 />} tone="gold" />
        <KpiCard label="Expired Licenses" value={expired} sub="Enforcement required" icon={<ShieldAlert />} tone="red" />
        <KpiCard label={`Report Rate (${MONTHS[Number(currentMonth) - 1]?.short || 'Now'})`} value={`${currentMonthRate}%`} sub={`${missingReports} missing reports`} icon={<BarChart3 />} tone="purple" />
      </section>

      <section className="superdash-mini-kpi-row">
        <MiniKpi label="GPS Tracked" value={`${percent(gpsTracked, totalLicenses)}%`} sub={`${gpsTracked} of ${totalLicenses} enterprises`} icon={<MapPin />} tone="cyan" />
        <MiniKpi label="Telegram Linked" value={`${percent(telegramLinked, totalLicenses)}%`} sub={`${telegramLinked} of ${totalLicenses} connected`} icon={<MessageCircle />} tone="indigo" />
        <MiniKpi label="Provinces Covered" value={`${provincesCovered} / ${CAMBODIA_PROVINCE_COUNT}`} sub={`${Math.max(0, CAMBODIA_PROVINCE_COUNT - provincesCovered)} provinces have no provider`} icon={<MapPin />} tone="orange" />
        <MiniKpi label="High + Critical Risk" value={highCritical} sub="Priority inspection list below" icon={<Gauge />} tone="red" />
      </section>

      <section className="superdash-design-grid superdash-design-grid--status">
        <SectionCard title="License Status" subtitle={`${totalLicenses} total enterprises`}>
          <div className="superdash-donut-wrap">
            <div className="superdash-donut" style={donutStyle}><span>{totalLicenses}</span></div>
            <div className="superdash-status-list">
              <ProgressRow label="Active" value={activeLicenses} pct={activePct} color={STATUS_COLORS.active} />
              <ProgressRow label="Expiring Soon" value={expiringSoon} pct={expiringPct} color={STATUS_COLORS.expiring} />
              <ProgressRow label="Expired" value={expired} pct={expiredPct} color={STATUS_COLORS.expired} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Licensed Enterprises by Province" subtitle={`Active providers · ${provincesCovered} of ${CAMBODIA_PROVINCE_COUNT} provinces covered`}>
          <div className="superdash-horizontal-bars">
            {provinceRows.length === 0 ? (
              <p className="superdash-design-empty">No province data available.</p>
            ) : provinceRows.map(row => (
              <div key={row.label}>
                <ProgressRow label={row.label} value={row.count} pct={(row.count / maxProvince) * 100} color="#C9A227" />
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
                <ProgressRow label={row.level} value={row.count} pct={percent(row.count, Math.max(1, riskRows.length))} color={RISK_COLORS[row.level]} />
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <section className="superdash-design-grid superdash-design-grid--forecast">
        <SectionCard title="License Expiry Forecast" subtitle="Renewal actions required">
          <ProgressRow label="Expired (overdue)" value={expired} pct={percent(expired, totalLicenses)} color="#6B7280" />
          <ProgressRow label="Expires <= 30 days" value={expiring30} pct={percent(expiring30, totalLicenses)} color="#DC2626" />
          <ProgressRow label="Expires <= 60 days" value={expiring60} pct={percent(expiring60, totalLicenses)} color="#EA580C" />
          <ProgressRow label="Expires <= 90 days" value={expiringSoon} pct={percent(expiringSoon, totalLicenses)} color="#EAB308" />
          <div className="superdash-note is-red">
            Telegram reminders can prioritize the 30-day and expired license groups.
          </div>
        </SectionCard>

        <SectionCard
          title="Monthly Report Submission Trend"
          subtitle={`Submission rate (%) · ${lastSixMonths[0]?.short}-${lastSixMonths[lastSixMonths.length - 1]?.short} ${currentYear} · Target >= 90%`}
          action={<DashboardBadge tone={currentMonthRate >= 90 ? 'green' : 'red'}>{currentMonthRate}% this month</DashboardBadge>}
        >
          <div className="superdash-trend-chart">
            {trendRows.map(row => (
              <div key={row.month.value}>
                <span style={{ height: `${Math.max(6, row.rate)}%` }} title={`${row.month.kh}: ${row.rate}%`} />
                <small>{row.month.short}</small>
              </div>
            ))}
          </div>
          <div className="superdash-trend-metrics">
            <DashboardBadge tone="gold">Current Rate {currentMonthRate}%</DashboardBadge>
            <DashboardBadge tone="red">Missing Reports {missingReports}</DashboardBadge>
            <DashboardBadge tone="blue">Submitted {currentMonthUniqueReports}</DashboardBadge>
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
                  {row.submittedMonths.map((submitted, index) => (
                    <td key={index}><span className={submitted ? 'is-submitted' : 'is-missing'}>{submitted ? '✓' : '×'}</span></td>
                  ))}
                  <td><strong className={row.rate >= 80 ? 'is-good' : row.rate >= 50 ? 'is-warn' : 'is-bad'}>{row.rate}%</strong></td>
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
                <ProgressRow label={row.label} value={row.count} pct={(row.count / maxInstrument) * 100} color={index < 4 ? '#DC2626' : index < 7 ? '#C9A227' : '#0B1A35'} />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Service Scope Mix" subtitle="Companies by service type">
          <ProgressRow label="Repair Services" value={reports.filter(r => r.service_type === 'Repair').length} pct={percent(reports.filter(r => r.service_type === 'Repair').length, Math.max(1, reports.length))} color="#0B1A35" />
          <ProgressRow label="Installation" value={reports.filter(r => r.service_type === 'Installation').length} pct={percent(reports.filter(r => r.service_type === 'Installation').length, Math.max(1, reports.length))} color="#C9A227" />
          <ProgressRow label="Manufacturing" value={reports.filter(r => r.service_type === 'Manufacture').length} pct={percent(reports.filter(r => r.service_type === 'Manufacture').length, Math.max(1, reports.length))} color="#6366F1" />
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
        <MiniKpi label="GPS Coverage" value={`${percent(gpsTracked, totalLicenses)}%`} sub={`${gpsTracked} / ${totalLicenses} enterprises`} icon={<MapPin />} tone="cyan" />
        <MiniKpi label="Telegram Linked" value={`${percent(telegramLinked, totalLicenses)}%`} sub={`${telegramLinked} / ${totalLicenses} enterprises`} icon={<MessageCircle />} tone="indigo" />
        <MiniKpi label="Data Completeness" value={`${percent(licensed, Math.max(1, totalCompanies))}%`} sub={`${licensed} licensed / ${totalCompanies} companies`} icon={<ShieldCheck />} tone="red" />
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
