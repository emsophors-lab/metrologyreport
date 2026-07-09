import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  Globe2,
  MapPin,
  PieChart,
  Presentation,
  RefreshCw,
  ShieldAlert,
  X
} from 'lucide-react';
import {
  EnterpriseLicense,
  LicenseReminderLog,
  LicenseRenewalHistory,
  MetrologyReport,
  MetrologyUser,
  TelegramBotSetting
} from '../types';
import {
  fetchBotSettingsFromSupabase,
  fetchLicensesFromSupabase,
  fetchReminderLogsFromSupabase,
  fetchRenewalHistoryFromSupabase
} from '../supabaseSync';
import { formatKhmerOfficialDateBlock } from '../utils/khmerOfficialDate';
import { generatePredictions } from '../services/mlPredictionService';

interface DataAnalyticsReportProps {
  currentUser: MetrologyUser;
  reports: MetrologyReport[];
  users: MetrologyUser[];
  initialLicenses?: EnterpriseLicense[];
  onClose: () => void;
}

type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

const MONTHS = [
  { value: 'all', label: 'All Months / គ្រប់ខែ' },
  { value: '01', label: 'January / មករា' },
  { value: '02', label: 'February / កុម្ភៈ' },
  { value: '03', label: 'March / មីនា' },
  { value: '04', label: 'April / មេសា' },
  { value: '05', label: 'May / ឧសភា' },
  { value: '06', label: 'June / មិថុនា' },
  { value: '07', label: 'July / កក្កដា' },
  { value: '08', label: 'August / សីហា' },
  { value: '09', label: 'September / កញ្ញា' },
  { value: '10', label: 'October / តុលា' },
  { value: '11', label: 'November / វិច្ឆិកា' },
  { value: '12', label: 'December / ធ្នូ' }
];

const STATUS_OPTIONS = ['all', 'Active', 'Expiring Soon', 'Expired', 'Suspended', 'Cancelled', 'Renewed'];
const SERVICE_OPTIONS = ['all', 'Manufacture', 'Installation', 'Repair'];
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

function valueOf(record: Record<string, any>, keys: string[], fallback = 'Data not available') {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') return String(value).trim();
  }
  return fallback;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function daysUntil(value?: string | null) {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function normalizeMonth(value?: string | null) {
  const raw = String(value || '').trim();
  const numeric = raw.match(/\d{1,2}/)?.[0];
  return numeric ? numeric.padStart(2, '0') : raw;
}

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function groupCount<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = getKey(item) || 'Data not available';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function asRows(map: Record<string, number>) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function getLicenseStatus(license: EnterpriseLicense) {
  return valueOf(license as any, ['license_status', 'status', 'current_status']);
}

function getProvinceName(license: EnterpriseLicense) {
  const source = [
    valueOf(license as any, ['province_city', 'province'], ''),
    valueOf(license as any, ['company_address', 'business_address', 'business_geo_address', 'address'], '')
  ].join(' ').toLowerCase();
  const matched = CAMBODIA_PROVINCES.find(province =>
    province.names.some(name => source.includes(name.toLowerCase()))
  );
  return matched?.value || 'Data not available';
}

function hasGps(license: EnterpriseLicense) {
  return !!valueOf(license as any, ['business_latitude', 'latitude', 'lat', 'gps_latitude'], '') &&
    !!valueOf(license as any, ['business_longitude', 'longitude', 'lng', 'gps_longitude'], '');
}

function hasTelegram(license: EnterpriseLicense) {
  return !!valueOf(license as any, ['telegram_chat_id', 'telegram_username', 'telegram_connected_at'], '');
}

function getRiskLevel(score: number): RiskLevel {
  if (score >= 80) return 'Critical';
  if (score >= 55) return 'High';
  if (score >= 30) return 'Medium';
  return 'Low';
}

function MiniBarChart({ rows, tone = 'blue' }: { rows: Array<[string, number]>; tone?: 'blue' | 'gold' | 'red' | 'green' }) {
  const max = Math.max(1, ...rows.map(([, count]) => count));
  return (
    <div className="analytics-mini-chart">
      {rows.length === 0 ? (
        <div className="analytics-empty">Data not available</div>
      ) : rows.slice(0, 8).map(([label, count]) => (
        <div className={`analytics-bar-row is-${tone}`} key={label}>
          <span>{label}</span>
          <div><i style={{ width: `${Math.max(4, (count / max) * 100)}%` }} /></div>
          <strong>{count}</strong>
        </div>
      ))}
    </div>
  );
}

function Donut({ rows }: { rows: Array<[string, number]> }) {
  const total = rows.reduce((sum, [, count]) => sum + count, 0);
  return (
    <div className="analytics-donut-card">
      <div className="analytics-donut">
        <strong>{total}</strong>
        <span>Total</span>
      </div>
      <div className="analytics-donut-legend">
        {rows.map(([label, count]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{count} ({pct(count, total)}%)</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DataAnalyticsReport({ currentUser, reports, users, initialLicenses = [], onClose }: DataAnalyticsReportProps) {
  const [licenses, setLicenses] = useState<EnterpriseLicense[]>(initialLicenses);
  const [renewals, setRenewals] = useState<LicenseRenewalHistory[]>([]);
  const [reminders, setReminders] = useState<LicenseReminderLog[]>([]);
  const [bots, setBots] = useState<TelegramBotSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadNote, setLoadNote] = useState('');
  const [lastGeneratedAt, setLastGeneratedAt] = useState('');
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    month: 'all',
    year: 'all',
    province: 'all',
    status: 'all',
    serviceType: 'all',
    instrumentType: 'all'
  });

  const canAccess = currentUser.role === 'superadmin' ||
    (currentUser.role === 'admin' && (currentUser.admin_can_view_all_users || currentUser.admin_can_view_licenses));

  useEffect(() => {
    if (initialLicenses.length > 0) {
      setLicenses(initialLicenses);
    }
  }, [initialLicenses]);

  const loadAnalyticsData = useCallback(async (showSuccessNote = false) => {
    if (!canAccess) return;
    setLoading(true);
    setLoadNote('');
    const notes: string[] = [];
    try {
      const [licenseData, renewalData, reminderData, botData] = await Promise.all([
        fetchLicensesFromSupabase(currentUser).catch(err => {
          notes.push(`enterprise_licenses: ${err?.message || 'Data not available'}`);
          return [] as EnterpriseLicense[];
        }),
        fetchRenewalHistoryFromSupabase(undefined, currentUser).catch(err => {
          notes.push(`license_renewal_history: ${err?.message || 'Data not available'}`);
          return [] as LicenseRenewalHistory[];
        }),
        fetchReminderLogsFromSupabase(undefined, currentUser).catch(err => {
          notes.push(`license_reminder_logs: ${err?.message || 'Data not available'}`);
          return [] as LicenseReminderLog[];
        }),
        fetchBotSettingsFromSupabase().catch(err => {
          notes.push(`telegram_bot_settings: ${err?.message || 'Data not available'}`);
          return [] as TelegramBotSetting[];
        })
      ]);
      setLicenses(licenseData.length > 0 ? licenseData : initialLicenses);
      setRenewals(renewalData);
      setReminders(reminderData);
      setBots(botData);
      const refreshedAt = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Phnom_Penh' });
      setLastGeneratedAt(refreshedAt);
      setLoadNote(notes.length > 0 ? notes.join(' | ') : (showSuccessNote ? `Analytics generated successfully at ${refreshedAt} (GMT+7).` : ''));
    } finally {
      setLoading(false);
    }
  }, [canAccess, currentUser, initialLicenses]);

  useEffect(() => {
    let active = true;
    if (active) {
      loadAnalyticsData();
    }
    return () => {
      active = false;
    };
  }, [loadAnalyticsData]);

  const handleGenerateAnalytics = () => {
    void loadAnalyticsData(true);
  };

  const analytics = useMemo(() => {
    const start = parseDate(filters.startDate);
    const end = parseDate(filters.endDate);
    if (end) end.setHours(23, 59, 59, 999);

    const filteredReports = reports.filter(report => {
      const reportDate = parseDate(report.service_end_date || report.updated_at || report.created_at);
      if (start && reportDate && reportDate < start) return false;
      if (end && reportDate && reportDate > end) return false;
      if (filters.month !== 'all' && normalizeMonth(report.report_month) !== filters.month) return false;
      if (filters.year !== 'all' && report.report_year !== filters.year) return false;
      if (filters.serviceType !== 'all' && report.service_type !== filters.serviceType) return false;
      if (filters.instrumentType !== 'all' && report.measuring_instrument !== filters.instrumentType) return false;
      return true;
    });

    const filteredLicenses = licenses.filter(license => {
      const issueOrCreated = parseDate(license.license_issue_date || license.created_at);
      if (start && issueOrCreated && issueOrCreated < start) return false;
      if (end && issueOrCreated && issueOrCreated > end) return false;
      if (filters.province !== 'all' && getProvinceName(license) !== filters.province) return false;
      if (filters.status !== 'all' && getLicenseStatus(license) !== filters.status) return false;
      if (filters.instrumentType !== 'all' && valueOf(license as any, ['measuring_instrument_type', 'instrument_type'], '') !== filters.instrumentType) return false;
      return true;
    });

    const total = filteredLicenses.length;
    const active = filteredLicenses.filter(l => getLicenseStatus(l) === 'Active' || getLicenseStatus(l) === 'Renewed').length;
    const expiring = filteredLicenses.filter(l => getLicenseStatus(l) === 'Expiring Soon').length;
    const expired = filteredLicenses.filter(l => getLicenseStatus(l) === 'Expired').length;
    const gps = filteredLicenses.filter(hasGps).length;
    const telegram = filteredLicenses.filter(hasTelegram).length;
    const statusRows = asRows(groupCount(filteredLicenses, getLicenseStatus));
    const provinceRows = asRows(groupCount(filteredLicenses, getProvinceName));
    const instrumentRows = asRows(groupCount([...filteredReports, ...filteredLicenses] as any[], item =>
      valueOf(item, ['measuring_instrument', 'measuring_instrument_type', 'instrument_type'])
    ));
    const serviceRows = asRows(groupCount(filteredReports, r => r.service_type));
    const monthlyRows = asRows(groupCount(filteredReports, r => `${normalizeMonth(r.report_month)} ${r.report_year}`));
    const licenseNumbersWithReports = new Set(filteredReports.map(r => r.license_number).filter(Boolean));
    const noReportCompanies = filteredLicenses.filter(l => l.license_number && !licenseNumbersWithReports.has(l.license_number));
    const exp30 = filteredLicenses.filter(l => {
      const days = daysUntil(l.license_expiry_date);
      return days !== null && days >= 0 && days <= 30;
    });
    const exp60 = filteredLicenses.filter(l => {
      const days = daysUntil(l.license_expiry_date);
      return days !== null && days > 30 && days <= 60;
    });
    const exp90 = filteredLicenses.filter(l => {
      const days = daysUntil(l.license_expiry_date);
      return days !== null && days > 60 && days <= 90;
    });
    const highRiskInstruments = ['Fuel Dispenser', 'Weighbridge', 'Medical', 'Scale', 'Pressure', 'Gas', 'Fuel'];
    const risks: Array<{ id: string; company: string; license: string; score: number; level: RiskLevel }> = filteredLicenses.map(license => {
      let score = 0;
      const status = getLicenseStatus(license);
      const days = daysUntil(license.license_expiry_date);
      const instrument = valueOf(license as any, ['measuring_instrument_type', 'instrument_type'], '');
      if (status === 'Expired') score += 50;
      if (days !== null && days >= 0 && days <= 30) score += 35;
      if (license.license_number && !licenseNumbersWithReports.has(license.license_number)) score += 25;
      if (!hasGps(license)) score += 20;
      if (!hasTelegram(license)) score += 12;
      if (highRiskInstruments.some(key => instrument.toLowerCase().includes(key.toLowerCase()))) score += 12;
      return {
        id: license.id,
        company: license.company_name_kh || license.company_name || 'Data not available',
        license: license.license_number || 'Data not available',
        score,
        level: getRiskLevel(score)
      };
    }).sort((a, b) => b.score - a.score);
    const riskRows = asRows(groupCount(risks, r => r.level));

    return {
      filteredReports,
      filteredLicenses,
      total,
      active,
      expiring,
      expired,
      activePct: pct(active, total),
      gps,
      noGps: total - gps,
      telegram,
      noTelegram: total - telegram,
      statusRows,
      provinceRows,
      instrumentRows,
      serviceRows,
      monthlyRows,
      noReportCompanies,
      exp30,
      exp60,
      exp90,
      risks,
      riskRows
    };
  }, [filters, licenses, reports]);

  const provinceOptions = CAMBODIA_PROVINCES.map(province => province.value);
  const yearOptions = useMemo(() => {
    return Array.from(new Set(reports.map(r => r.report_year).filter(Boolean))).sort().reverse();
  }, [reports]);
  const instrumentOptions = useMemo(() => {
    return Array.from(new Set([
      ...reports.map(r => r.measuring_instrument),
      ...licenses.map(l => valueOf(l as any, ['measuring_instrument_type', 'instrument_type'], ''))
    ].filter(Boolean))).sort();
  }, [licenses, reports]);

  const generatedDate = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh' });

  const exportPayload = () => {
    const mlBundle = generatePredictions({
      licenses: analytics.filteredLicenses,
      reports: analytics.filteredReports,
      renewals,
      reminders
    });

    return {
      generatedDate,
      reportDate: new Date(),
      total: analytics.total,
      active: analytics.active,
      activePct: analytics.activePct,
      expiring: analytics.expiring,
      expired: analytics.expired,
      gps: analytics.gps,
      noGps: analytics.noGps,
      telegram: analytics.telegram,
      noTelegram: analytics.noTelegram,
      reportCount: analytics.filteredReports.length,
      noReportCount: analytics.noReportCompanies.length,
      criticalRiskCount: analytics.risks.filter(r => r.level === 'Critical').length,
      highRiskCount: analytics.risks.filter(r => r.level === 'High').length,
      statusRows: analytics.statusRows,
      provinceRows: analytics.provinceRows,
      serviceRows: analytics.serviceRows,
      instrumentRows: analytics.instrumentRows,
      monthlyRows: analytics.monthlyRows,
      riskRows: analytics.riskRows,
      topRisks: analytics.risks.slice(0, 8).map(r => ({
        company: r.company,
        license: r.license,
        level: r.level,
        score: r.score
      })),
      exp30: analytics.exp30.length,
      exp60: analytics.exp60.length,
      exp90: analytics.exp90.length,
      mlSummary: {
        modelStatus: mlBundle.modelMetadata.status,
        dataQualityScore: mlBundle.dataQuality.score,
        highRiskCompanies: mlBundle.predictions.filter(item => item.riskLevel === 'High' || item.riskLevel === 'Critical').length,
        criticalRiskCompanies: mlBundle.predictions.filter(item => item.riskLevel === 'Critical').length,
        topFactors: mlBundle.topRiskFactors.map(item => ({ label: item.label, count: item.count })),
        clusters: mlBundle.clusters.map(item => ({
          name: item.clusterNameEn,
          count: item.companyCount,
          action: item.recommendedAction
        })),
        anomalies: mlBundle.anomalies.slice(0, 10).map(item => ({
          entity: item.entityName,
          severity: item.severity,
          score: item.anomalyScore,
          reason: item.reason
        })),
        patternInsights: mlBundle.patternInsights.slice(0, 10).map(item => ({
          label: item.label,
          score: item.score,
          description: item.description
        })),
        provinceForecast: mlBundle.provinceRiskForecast.map(item => ({
          province: item.province,
          riskScore: item.riskScore,
          riskLevel: item.riskLevel
        })),
        reportForecast: mlBundle.reportVolumeForecast.map(item => ({ label: item.label, value: item.value })),
        expiryForecast: mlBundle.expiryWorkloadForecast.map(item => ({ label: item.label, value: item.value })),
        disclaimer: 'Machine learning predictions are advisory decision-support indicators based on available license and monthly report records. They do not replace official inspection judgment.'
      }
    };
  };

  const exportPdf = async () => {
    const { generateAnalyticsPdfReport } = await import('../utils/analyticsReportExports');
    generateAnalyticsPdfReport(exportPayload());
  };

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const payload = exportPayload();
    const officialDate = formatKhmerOfficialDateBlock(new Date(), { location: 'រាជធានីភ្នំពេញ' });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Report', 'Metrology License Data Analytics Report'],
      ['Generated date', generatedDate],
      ['Official Khmer lunar date', officialDate.lunarLine],
      ['Official Khmer Gregorian date', officialDate.gregorianLine],
      ['Prepared by', 'National Metrology Center of Cambodia']
    ]), 'Report Metadata');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { Metric: 'Total licenses', Value: analytics.total },
      { Metric: 'Active licenses', Value: analytics.active },
      { Metric: 'Active percentage', Value: `${analytics.activePct}%` },
      { Metric: 'Expiring soon', Value: analytics.expiring },
      { Metric: 'Expired', Value: analytics.expired },
      { Metric: 'GPS linked', Value: analytics.gps },
      { Metric: 'No GPS', Value: analytics.noGps },
      { Metric: 'Telegram linked', Value: analytics.telegram },
      { Metric: 'No Telegram', Value: analytics.noTelegram }
    ]), 'Executive Summary');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(analytics.risks), 'Risk Scores');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { Indicator: 'Model status', Value: payload.mlSummary.modelStatus },
      { Indicator: 'Data quality score', Value: `${payload.mlSummary.dataQualityScore}%` },
      { Indicator: 'High-risk predictions', Value: payload.mlSummary.highRiskCompanies },
      { Indicator: 'Critical-risk predictions', Value: payload.mlSummary.criticalRiskCompanies },
      { Indicator: 'Advisory note', Value: payload.mlSummary.disclaimer }
    ]), 'ML Summary');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payload.mlSummary.topFactors), 'ML Risk Factors');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payload.mlSummary.clusters), 'ML Clusters');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payload.mlSummary.anomalies), 'ML Anomalies');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payload.mlSummary.patternInsights), 'ML Pattern Insights');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payload.mlSummary.provinceForecast), 'ML Province Forecast');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payload.mlSummary.reportForecast), 'ML Report Forecast');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payload.mlSummary.expiryForecast), 'ML Expiry Forecast');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(analytics.filteredReports), 'Reports');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(analytics.filteredLicenses), 'Licenses');
    XLSX.writeFile(workbook, `nmc-data-analytics-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportWord = async () => {
    const { generateAnalyticsDocxReport } = await import('../utils/analyticsReportExports');
    await generateAnalyticsDocxReport(exportPayload());
  };

  const exportPowerPoint = async () => {
    const { generateAnalyticsPptxBriefing } = await import('../utils/analyticsReportExports');
    await generateAnalyticsPptxBriefing(exportPayload());
  };

  if (!canAccess) {
    return (
      <div className="analytics-overlay">
        <div className="analytics-modal analytics-denied">
          <button type="button" className="analytics-close" onClick={onClose}><X /></button>
          <ShieldAlert />
          <h2>Access denied / មិនមានសិទ្ធិចូលប្រើ</h2>
          <p>Only Superadmin and authorized Admin users can access Data Analytics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-overlay">
      <div className="analytics-modal">
        <div className="analytics-header">
          <div>
            <p>National Metrology Center of Cambodia</p>
            <h2>វិភាគទិន្នន័យ / Data Analytics</h2>
            <span>Formal ministerial analytics report for MISTI and NMC decision-making</span>
          </div>
          <button type="button" className="analytics-close" onClick={onClose}><X /></button>
        </div>

        <div className="analytics-toolbar">
          <label>Start date<input type="date" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} /></label>
          <label>End date<input type="date" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} /></label>
          <label>Report month<select value={filters.month} onChange={e => setFilters({ ...filters, month: e.target.value })}>{MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
          <label>Report year<select value={filters.year} onChange={e => setFilters({ ...filters, year: e.target.value })}><option value="all">All Years</option>{yearOptions.map(y => <option key={y} value={y}>{y}</option>)}</select></label>
          <label>Province<select value={filters.province} onChange={e => setFilters({ ...filters, province: e.target.value })}><option value="all">All Provinces</option>{provinceOptions.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
          <label>License status<select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>{STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s}</option>)}</select></label>
          <label>Service type<select value={filters.serviceType} onChange={e => setFilters({ ...filters, serviceType: e.target.value })}>{SERVICE_OPTIONS.map(s => <option key={s} value={s}>{s === 'all' ? 'All Services' : s}</option>)}</select></label>
          <label>Instrument type<select value={filters.instrumentType} onChange={e => setFilters({ ...filters, instrumentType: e.target.value })}><option value="all">All Instruments</option>{instrumentOptions.map(i => <option key={i} value={i}>{i}</option>)}</select></label>
        </div>

        <div className="analytics-actions">
          <button type="button" onClick={handleGenerateAnalytics} disabled={loading}><RefreshCw />{loading ? 'Generating...' : 'Generate Analytics'}</button>
          <button type="button" onClick={exportPdf}><Download />Export PDF</button>
          <button type="button" onClick={exportWord}><FileText />Export Word</button>
          <button type="button" onClick={exportExcel}><FileSpreadsheet />Export Excel</button>
          <button type="button" onClick={exportPowerPoint}><Presentation />Export PowerPoint Summary</button>
        </div>

        {loading && <div className="analytics-note">Loading analytics data...</div>}
        {loadNote && <div className="analytics-note"><AlertTriangle /> {loadNote}</div>}
        {lastGeneratedAt && !loadNote && !loading && <div className="analytics-note">Analytics generated at {lastGeneratedAt} (GMT+7).</div>}

        <section className="analytics-summary-grid">
          <div><strong>{analytics.total}</strong><span>Total licenses</span></div>
          <div><strong>{analytics.active}</strong><span>Active licenses</span></div>
          <div><strong>{analytics.activePct}%</strong><span>Active percentage</span></div>
          <div><strong>{analytics.expiring}</strong><span>Expiring soon</span></div>
          <div><strong>{analytics.expired}</strong><span>Expired</span></div>
          <div><strong>{analytics.risks.filter(r => r.level === 'Critical').length}</strong><span>Critical risk</span></div>
        </section>

        <section className="analytics-report-section">
          <h3>1. Executive Summary</h3>
          <p>
            This report summarizes {analytics.total} enterprise licenses, {analytics.filteredReports.length} monthly reports,
            and digital connectivity indicators. Active licenses represent {analytics.activePct}% of filtered records.
          </p>
        </section>

        <div className="analytics-grid-2">
          <section className="analytics-card"><h3><PieChart />2. License Status Analysis</h3><Donut rows={analytics.statusRows} /></section>
          <section className="analytics-card"><h3><MapPin />3. Enterprise Geographic Distribution</h3><MiniBarChart rows={analytics.provinceRows} tone="gold" /></section>
          <section className="analytics-card"><h3><BarChart3 />4. Service Scope Analysis</h3><MiniBarChart rows={analytics.serviceRows} tone="blue" /></section>
          <section className="analytics-card"><h3><BarChart3 />5. Measuring Instrument Type Analysis</h3><MiniBarChart rows={analytics.instrumentRows} tone="green" /></section>
          <section className="analytics-card"><h3><BarChart3 />6. Monthly Report Compliance Analysis</h3><MiniBarChart rows={analytics.monthlyRows} tone="blue" /><p>{analytics.noReportCompanies.length} licensed enterprises have no matching monthly report in the filtered period.</p></section>
          <section className="analytics-card"><h3><AlertTriangle />7. Renewal and Expiry Forecast</h3><div className="analytics-forecast"><div>30 days<strong>{analytics.exp30.length}</strong></div><div>60 days<strong>{analytics.exp60.length}</strong></div><div>90 days<strong>{analytics.exp90.length}</strong></div></div></section>
          <section className="analytics-card"><h3><Globe2 />8. Telegram and GPS Digital Connectivity</h3><div className="analytics-connectivity"><div>GPS linked<strong>{analytics.gps}</strong></div><div>No GPS<strong>{analytics.noGps}</strong></div><div>Telegram linked<strong>{analytics.telegram}</strong></div><div>No Telegram<strong>{analytics.noTelegram}</strong></div><div>Bot settings<strong>{bots.length || 'Data not available'}</strong></div><div>Reminder logs<strong>{reminders.length || 'Data not available'}</strong></div></div></section>
          <section className="analytics-card"><h3><ShieldAlert />9. Compliance Risk Scoring</h3><MiniBarChart rows={analytics.riskRows} tone="red" /><div className="analytics-risk-list">{analytics.risks.slice(0, 6).map(r => <div key={r.id}><span>{r.company}</span><strong>{r.level} ({r.score})</strong></div>)}</div></section>
        </div>

        <section className="analytics-report-section">
          <h3>10. International Metrology Trend Benchmark</h3>
          <p>
            ISO/IEC 17025 emphasizes technical competence and valid measurement results. ILAC P10 supports metrological
            traceability as a foundation for confidence in measurements. OIML legal metrology infrastructure strengthens
            market supervision and consumer protection. BIPM digital metrology trends highlight FAIR data principles and
            Digital Calibration Certificates for future-ready measurement services.
          </p>
        </section>

        <section className="analytics-report-section">
          <h3>11. Recommendations for MISTI and NMC</h3>
          <ul>
            <li>Prioritize inspections and renewal follow-up for Critical and High risk enterprises.</li>
            <li>Improve Telegram and GPS coverage to strengthen digital supervision and reminder delivery.</li>
            <li>Use monthly report gaps as a compliance trigger for enterprise outreach.</li>
            <li>Prepare structured instrument and calibration data for future digital metrology workflows.</li>
          </ul>
          <footer>ឆ្នាំ២០២៦ © រក្សាសិទ្ធិគ្រប់យ៉ាងដោយ៖ ​នាយកដ្ឋានមាត្រាសាស្ត្រឧស្សាហកម្ម | មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</footer>
        </section>
      </div>
    </div>
  );
}
