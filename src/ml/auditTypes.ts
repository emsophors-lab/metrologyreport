export interface AuditFilters { from?: string; to?: string; instrument_type?: string; organization_id?: string; risk_level?: string; q?: string }
export interface AuditRow {
  reportId: string; instrumentId: string; timestamp: string; organizationId: string; licence: string;
  company: string; category: string; instrument: string; serial: string;
  riskProbability: number | null; riskLevel: string; anomalyScore: number | null; outlier: boolean | null;
  cluster: string; reason: string; action: string; topFeature: string; pca: number[] | null;
  currentErrorRatio: null; driftForecast: null; calibrationInterval: null;
}
export interface AuditData {
  executive_briefing?: import('./narrative').ExecutiveBriefing;
  generatedAt: string; filters: AuditFilters; sourceFingerprint: string; modelVersion: string;
  lastTrainedAt: string | null; trainedReportCount: number; status: string;
  metrics: { accuracy: number | null; f1: number | null; silhouette: number | null; labelSource: string };
  rows: AuditRow[]; reportCount: number; enterpriseCount: number; highRiskCount: number;
  anomalyCount: number; onTimeRate: number | null;
  history: { month: string; count: number; rate: number | null }[];
  clusters: { label: string; count: number; enterpriseCount: number; averageAnomaly: number | null; centroid: number[] }[];
  featureNames: string[]; limitations: string[];
}
