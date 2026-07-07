import { EnterpriseLicense, LicenseReminderLog, LicenseRenewalHistory, MetrologyReport } from '../types';

export type MlRiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type MlConfidence = 'Low' | 'Medium' | 'High';

export interface MlCompanyFeatures {
  companyId: string;
  licenseId: string;
  licenseNumber: string;
  companyName: string;
  province: string;
  serviceScope: string;
  instrumentType: string;
  licenseAgeDays: number;
  daysUntilExpiry: number;
  isExpired: boolean;
  expiresIn30Days: boolean;
  expiresIn60Days: boolean;
  expiresIn90Days: boolean;
  hasGps: boolean;
  hasTelegram: boolean;
  profileCompletenessScore: number;
  serviceTypeCount: number;
  instrumentTypeCount: number;
  highRiskInstrumentFlag: boolean;
  reportsSubmittedLast3Months: number;
  reportsSubmittedLast6Months: number;
  missingReportsLast3Months: number;
  missingReportsLast6Months: number;
  lateReportsLast3Months: number;
  averageSubmissionDelayDays: number;
  lastReportAgeDays: number;
  consecutiveMissingMonths: number;
  reportSubmissionRate: number;
  renewedBeforeExpiry: boolean | null;
  daysLateForRenewal: number;
  previousRenewalCount: number;
  renewalRemindersSent: number;
  companiesInSameProvince: number;
  serviceCoverageScore: number;
  provinceReportComplianceRate: number;
  provinceExpiredLicenseRate: number;
  instrumentDemandTrendScore: number;
  distinctReportMonths: number;
}

export interface MlTrainingLabel {
  missedNextMonthReport: boolean | null;
  reportSubmittedLate: boolean | null;
  licenseNotRenewedBeforeExpiry: boolean | null;
  highInspectionPriority: boolean;
  monthlyReportCountNextMonth: number | null;
}

export interface MlTrainingRecord {
  features: MlCompanyFeatures;
  labels: MlTrainingLabel;
}

export interface MlPredictionResult {
  companyId: string;
  licenseId: string;
  licenseNumber: string;
  companyName: string;
  province: string;
  predictionMonth: string;
  missReportProbability: number;
  lateReportProbability: number;
  licenseExpiryRiskProbability: number;
  inspectionPriorityScore: number;
  riskLevel: MlRiskLevel;
  confidence: MlConfidence;
  topFactors: string[];
  topFactorsKm: string[];
  recommendedAction: string;
  recommendedActionKm: string;
  advisoryNote: string;
}

export interface MlForecastPoint {
  label: string;
  value: number;
  lowerBound?: number;
  upperBound?: number;
  tooltip: string;
}

export interface MlDataQualityIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  count: number;
  recommendation: string;
}

export interface MlDataQualitySummary {
  score: number;
  totalIssues: number;
  issues: MlDataQualityIssue[];
}

export interface MlEvaluationMetrics {
  recordCount: number;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  mae: number | null;
  mape: number | null;
  note: string;
}

export interface MlModelMetadata {
  modelName: string;
  modelVersion: string;
  trainedAt: string;
  trainingDataStart: string | null;
  trainingDataEnd: string | null;
  recordCount: number;
  features: string[];
  learnedWeights?: Record<string, number>;
  metrics: MlEvaluationMetrics;
  status: 'rules_only' | 'baseline_trained' | 'insufficient_data';
}

export interface MlPredictionBundle {
  predictions: MlPredictionResult[];
  dataQuality: MlDataQualitySummary;
  modelMetadata: MlModelMetadata;
  reportVolumeForecast: MlForecastPoint[];
  expiryWorkloadForecast: MlForecastPoint[];
  provinceRiskForecast: Array<{ province: string; riskScore: number; riskLevel: MlRiskLevel; tooltip: string }>;
  serviceDemandForecast: Array<{ label: string; value: number; tooltip: string }>;
  instrumentDemandForecast: Array<{ label: string; value: number; tooltip: string }>;
  riskDistribution: Record<MlRiskLevel, number>;
  topRiskFactors: Array<{ label: string; count: number; tooltip: string }>;
}

export interface MlPredictionInput {
  licenses: EnterpriseLicense[];
  reports: MetrologyReport[];
  renewals?: LicenseRenewalHistory[];
  reminders?: LicenseReminderLog[];
  now?: Date;
}

export function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function percentProbability(value: number) {
  return Math.round(clamp01(value) * 100) / 100;
}

export function riskLevelFromScore(score: number): MlRiskLevel {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}

export function confidenceFromMonths(months: number): MlConfidence {
  if (months >= 12) return 'High';
  if (months >= 6) return 'Medium';
  return 'Low';
}

export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysBetween(start: Date, end: Date) {
  const a = new Date(start);
  const b = new Date(end);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}

export function monthKey(year: number, monthIndexZeroBased: number) {
  return `${year}-${String(monthIndexZeroBased + 1).padStart(2, '0')}`;
}

export function reportMonthKey(report: MetrologyReport): string | null {
  const year = String(report.report_year || '').match(/\d{4}/)?.[0];
  const monthRaw = String(report.report_month || '').trim();
  const numeric = monthRaw.match(/\d{1,2}/)?.[0];
  if (year && numeric) return `${year}-${numeric.padStart(2, '0')}`;
  const date = parseDate(report.service_end_date) || parseDate(report.created_at);
  return date ? monthKey(date.getFullYear(), date.getMonth()) : null;
}

export function addMonths(date: Date, amount: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

export function uniqueCount(values: Array<string | null | undefined>) {
  return new Set(values.map(v => String(v || '').trim()).filter(Boolean)).size;
}
