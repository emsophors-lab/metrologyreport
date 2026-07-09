import { MlAnomalyOutput, MlCompanyFeatures, MlRiskLevel, riskLevelFromScore } from './mlRiskFeatures';

function severityFromAnomaly(score: number): MlRiskLevel {
  return riskLevelFromScore(score);
}

function pushAnomaly(
  anomalies: MlAnomalyOutput[],
  condition: boolean,
  anomaly: Omit<MlAnomalyOutput, 'severity'>
) {
  if (!condition) return;
  anomalies.push({
    ...anomaly,
    anomalyScore: Math.max(0, Math.min(100, Math.round(anomaly.anomalyScore))),
    severity: severityFromAnomaly(anomaly.anomalyScore)
  });
}

export function detectCompanyAnomalies(features: MlCompanyFeatures[]): MlAnomalyOutput[] {
  const anomalies: MlAnomalyOutput[] = [];
  const averageReportRate = features.reduce((sum, item) => sum + item.reportSubmissionRate, 0) / Math.max(1, features.length);
  const averageInstrumentCount = features.reduce((sum, item) => sum + item.instrumentTypeCount, 0) / Math.max(1, features.length);

  features.forEach(feature => {
    pushAnomaly(anomalies, feature.lastReportAgeDays > 180, {
      entityType: 'company',
      entityId: feature.licenseId,
      entityName: feature.companyName,
      anomalyScore: Math.min(100, 55 + feature.consecutiveMissingMonths * 8),
      reason: `No recent monthly report activity for ${feature.lastReportAgeDays} days.`,
      recommendedAction: 'Request missing report submission and verify company activity.'
    });

    pushAnomaly(anomalies, feature.isExpired && feature.reportSubmissionRate > Math.max(50, averageReportRate), {
      entityType: 'company',
      entityId: feature.licenseId,
      entityName: feature.companyName,
      anomalyScore: 78,
      reason: 'Company appears active in reports while the license is expired.',
      recommendedAction: 'Review license compliance and renewal status.'
    });

    pushAnomaly(anomalies, !feature.hasGps && !feature.hasTelegram && feature.missingReportsLast6Months >= 3, {
      entityType: 'company',
      entityId: feature.licenseId,
      entityName: feature.companyName,
      anomalyScore: 72 + feature.missingReportsLast6Months * 3,
      reason: 'Missing GPS, missing Telegram linkage, and repeated missing reports.',
      recommendedAction: 'Verify contact channel, location, and reporting obligation.'
    });

    pushAnomaly(anomalies, feature.instrumentTypeCount >= Math.max(3, averageInstrumentCount * 2), {
      entityType: 'instrument',
      entityId: feature.licenseId,
      entityName: feature.instrumentType || feature.companyName,
      anomalyScore: Math.min(90, 50 + feature.instrumentTypeCount * 8),
      reason: 'Instrument/service activity is unusually broad compared with peers.',
      recommendedAction: 'Review service scope and instrument evidence records.'
    });

    pushAnomaly(anomalies, feature.provinceReportComplianceRate < 35 && feature.companiesInSameProvince >= 2, {
      entityType: 'province',
      entityId: feature.province,
      entityName: feature.province,
      anomalyScore: 65 + Math.max(0, 35 - feature.provinceReportComplianceRate),
      reason: `Province reporting compliance is low at ${feature.provinceReportComplianceRate}%.`,
      recommendedAction: 'Prioritize province-level reporting follow-up.'
    });
  });

  const unique = new Map<string, MlAnomalyOutput>();
  anomalies
    .sort((a, b) => b.anomalyScore - a.anomalyScore)
    .forEach(anomaly => {
      const key = `${anomaly.entityType}:${anomaly.entityId}:${anomaly.reason}`;
      if (!unique.has(key)) unique.set(key, anomaly);
    });
  return Array.from(unique.values()).slice(0, 30);
}
