import { detectCompanyAnomalies } from '../utils/mlAnomalyDetection';
import { MlAnomalyOutput, MlClusterOutput, MlCompanyFeatures, MlPatternInsight } from '../utils/mlRiskFeatures';

function addCluster(clusters: MlClusterOutput[], cluster: MlClusterOutput) {
  if (cluster.companyCount > 0) clusters.push(cluster);
}

function topCommonFeatures(items: MlCompanyFeatures[]) {
  const signals: Array<[string, number]> = [
    ['Missing recent reports', items.filter(item => item.missingReportsLast3Months > 0).length],
    ['Late reporting behavior', items.filter(item => item.lateReportsLast3Months > 0).length],
    ['No GPS information', items.filter(item => !item.hasGps).length],
    ['No Telegram connection', items.filter(item => !item.hasTelegram).length],
    ['License expiring soon', items.filter(item => item.expiresIn90Days).length],
    ['High-risk instrument/service', items.filter(item => item.highRiskInstrumentFlag).length],
    ['Incomplete profile', items.filter(item => item.profileCompletenessScore < 70).length]
  ];
  return signals
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => `${label} (${count})`);
}

function provinceInsights(features: MlCompanyFeatures[]): MlPatternInsight[] {
  const provinceMap = new Map<string, MlCompanyFeatures[]>();
  features.forEach(feature => {
    provinceMap.set(feature.province, [...(provinceMap.get(feature.province) || []), feature]);
  });
  return Array.from(provinceMap.entries()).map(([province, rows]) => {
    const avgCompliance = Math.round(rows.reduce((sum, item) => sum + item.provinceReportComplianceRate, 0) / Math.max(1, rows.length));
    const avgExpired = Math.round(rows.reduce((sum, item) => sum + item.provinceExpiredLicenseRate, 0) / Math.max(1, rows.length));
    const weakCoverage = Math.max(0, 100 - Math.min(100, rows.length * 8));
    const score = Math.min(100, Math.round((100 - avgCompliance) * 0.45 + avgExpired * 0.35 + weakCoverage * 0.2));
    return {
      type: 'province' as const,
      label: province,
      score,
      description: `${province}: compliance ${avgCompliance}%, expired-license rate ${avgExpired}%, coverage signal ${Math.max(0, 100 - weakCoverage)}%.`,
      recommendedAction: score >= 60 ? 'Review province reporting compliance and inspection coverage.' : 'Continue routine province monitoring.'
    };
  }).sort((a, b) => b.score - a.score).slice(0, 8);
}

function instrumentInsights(features: MlCompanyFeatures[]): MlPatternInsight[] {
  const instrumentMap = new Map<string, MlCompanyFeatures[]>();
  features.forEach(feature => {
    const key = feature.instrumentType || 'Unknown instrument';
    instrumentMap.set(key, [...(instrumentMap.get(key) || []), feature]);
  });
  return Array.from(instrumentMap.entries()).map(([instrument, rows]) => {
    const demand = rows.reduce((sum, item) => sum + item.instrumentDemandTrendScore, 0) / Math.max(1, rows.length);
    const missing = rows.reduce((sum, item) => sum + item.missingReportsLast6Months, 0);
    const score = Math.min(100, Math.round(demand * 0.55 + missing * 8 + rows.length * 4));
    return {
      type: 'instrument' as const,
      label: instrument,
      score,
      description: `${instrument}: ${rows.length} license(s), demand trend ${Math.round(demand)}, missing-report signal ${missing}.`,
      recommendedAction: score >= 60 ? 'Review instrument demand and service coverage evidence.' : 'Monitor instrument trend during monthly reporting.'
    };
  }).sort((a, b) => b.score - a.score).slice(0, 8);
}

export function runUnsupervisedAnalysis(features: MlCompanyFeatures[]): {
  clusters: MlClusterOutput[];
  anomalies: MlAnomalyOutput[];
  patternInsights: MlPatternInsight[];
} {
  const regular = features.filter(item => item.reportSubmissionRate >= 80 && !item.isExpired && item.hasGps && item.hasTelegram);
  const late = features.filter(item => item.lateReportsLast3Months > 0 && item.missingReportsLast3Months <= 1);
  const missing = features.filter(item => item.missingReportsLast3Months >= 2 || item.consecutiveMissingMonths >= 2);
  const disconnected = features.filter(item => !item.hasGps || !item.hasTelegram);
  const inactiveHighRisk = features.filter(item => item.lastReportAgeDays > 180 || item.isExpired || item.expiresIn30Days);
  const highActivity = features.filter(item => item.serviceTypeCount >= 2 || item.instrumentTypeCount >= 3 || item.instrumentDemandTrendScore >= 30);

  const clusters: MlClusterOutput[] = [];
  addCluster(clusters, {
    clusterId: 'regular-reporters',
    clusterNameKh: 'ក្រុមរាយការណ៍ទៀងទាត់',
    clusterNameEn: 'Regular reporters',
    companyCount: regular.length,
    descriptionKh: 'ក្រុមហ៊ុនដែលមានការរាយការណ៍ និងទិន្នន័យតភ្ជាប់ល្អ។',
    descriptionEn: 'Companies with strong reporting behavior and complete digital linkage.',
    commonFeatures: topCommonFeatures(regular),
    recommendedAction: 'Continue routine monitoring.'
  });
  addCluster(clusters, {
    clusterId: 'late-reporters',
    clusterNameKh: 'ក្រុមរាយការណ៍យឺត',
    clusterNameEn: 'Late reporters',
    companyCount: late.length,
    descriptionKh: 'ក្រុមហ៊ុនដែលមានលំនាំដាក់របាយការណ៍យឺត។',
    descriptionEn: 'Companies with repeated late monthly report behavior.',
    commonFeatures: topCommonFeatures(late),
    recommendedAction: 'Send earlier reminders and monitor submission dates.'
  });
  addCluster(clusters, {
    clusterId: 'missing-report-companies',
    clusterNameKh: 'ក្រុមខកខានរបាយការណ៍',
    clusterNameEn: 'Missing-report companies',
    companyCount: missing.length,
    descriptionKh: 'ក្រុមហ៊ុនដែលខកខានរបាយការណ៍ជាបន្តបន្ទាប់។',
    descriptionEn: 'Companies with repeated missing reports or reporting gaps.',
    commonFeatures: topCommonFeatures(missing),
    recommendedAction: 'Request missing report submission.'
  });
  addCluster(clusters, {
    clusterId: 'no-gps-no-telegram',
    clusterNameKh: 'ក្រុមខ្វះ GPS/Telegram',
    clusterNameEn: 'No GPS/no Telegram companies',
    companyCount: disconnected.length,
    descriptionKh: 'ក្រុមហ៊ុនដែលខ្វះទិន្នន័យទីតាំង ឬការតភ្ជាប់ Telegram។',
    descriptionEn: 'Companies missing GPS or Telegram linkage.',
    commonFeatures: topCommonFeatures(disconnected),
    recommendedAction: 'Verify GPS/location and Telegram connection.'
  });
  addCluster(clusters, {
    clusterId: 'high-risk-inactive',
    clusterNameKh: 'ក្រុមហានិភ័យខ្ពស់មិនសកម្ម',
    clusterNameEn: 'High-risk inactive companies',
    companyCount: inactiveHighRisk.length,
    descriptionKh: 'ក្រុមហ៊ុនដែលមានហានិភ័យអាជ្ញាបណ្ណ ឬមិនមានសកម្មភាពថ្មី។',
    descriptionEn: 'Companies with expiry risk, expired licenses, or long inactivity.',
    commonFeatures: topCommonFeatures(inactiveHighRisk),
    recommendedAction: 'Prioritize compliance review and renewal verification.'
  });
  addCluster(clusters, {
    clusterId: 'high-activity-service',
    clusterNameKh: 'ក្រុមសេវាកម្មសកម្មខ្ពស់',
    clusterNameEn: 'High activity service companies',
    companyCount: highActivity.length,
    descriptionKh: 'ក្រុមហ៊ុនដែលមានវិសាលភាពសេវា ឬឧបករណ៍ច្រើន។',
    descriptionEn: 'Companies with broad service/instrument activity compared with peers.',
    commonFeatures: topCommonFeatures(highActivity),
    recommendedAction: 'Review service scope and evidence records.'
  });

  return {
    clusters,
    anomalies: detectCompanyAnomalies(features),
    patternInsights: [...provinceInsights(features), ...instrumentInsights(features)]
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
  };
}
