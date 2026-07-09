import { MlCompanyFeatures, MlRiskLevel, riskLevelFromScore } from './mlRiskFeatures';

export function calculateRuleBasedRiskScore(feature: MlCompanyFeatures) {
  const factors: string[] = [];
  let score = 0;
  const add = (condition: boolean, points: number, reason: string) => {
    if (!condition) return;
    score += points;
    factors.push(`${reason} (+${points})`);
  };

  add(feature.isExpired, 40, 'Expired license');
  add(feature.expiresIn30Days, 25, 'License expiring within 30 days');
  add(!feature.expiresIn30Days && feature.expiresIn60Days, 15, 'License expiring within 60 days');
  add(!feature.expiresIn60Days && feature.expiresIn90Days, 10, 'License expiring within 90 days');
  add(feature.missingReportsLast3Months > 0, 20, 'Missing monthly report');
  add(feature.missingReportsLast6Months >= 3, 15, 'Repeated missing reports');
  add(feature.lateReportsLast3Months > 0, 10, 'Late report submission');
  add(!feature.hasGps, 10, 'No GPS coordinate');
  add(!feature.hasTelegram, 5, 'No Telegram/digital contact linked');
  add(feature.profileCompletenessScore < 70, 10, 'Incomplete company profile');
  add(feature.highRiskInstrumentFlag, 10, 'High-risk instrument category');
  add(feature.lastReportAgeDays > 180, 15, 'No recent activity for more than 6 months');

  const riskScore = Math.min(100, score);
  const riskLevel: MlRiskLevel = riskLevelFromScore(riskScore);
  return { riskScore, riskLevel, factors };
}
