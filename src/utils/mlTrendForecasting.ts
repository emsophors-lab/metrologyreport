import { MetrologyReport } from '../types';
import { MlForecastPoint, addMonths, monthKey, reportMonthKey } from './mlRiskFeatures';

export function movingAverage(values: number[], fallback = 0) {
  if (values.length === 0) return fallback;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function forecastMonthlyReportVolume(reports: MetrologyReport[], now = new Date()): MlForecastPoint[] {
  const reportCounts = new Map<string, number>();
  reports.forEach(report => {
    const key = reportMonthKey(report);
    if (key) reportCounts.set(key, (reportCounts.get(key) || 0) + 1);
  });
  const lastSix = Array.from({ length: 6 }, (_, index) => {
    const date = addMonths(now, -index - 1);
    return reportCounts.get(monthKey(date.getFullYear(), date.getMonth())) || 0;
  }).reverse();
  const base = movingAverage(lastSix, reports.length);
  const trend = lastSix.length >= 2 ? Math.round((lastSix[lastSix.length - 1] - lastSix[0]) / Math.max(1, lastSix.length - 1)) : 0;
  return Array.from({ length: 6 }, (_, index) => {
    const date = addMonths(now, index + 1);
    const value = Math.max(0, base + trend * (index + 1));
    return {
      label: monthKey(date.getFullYear(), date.getMonth()),
      value,
      lowerBound: Math.max(0, value - 2),
      upperBound: value + 2,
      tooltip: `Expected monthly report volume: ${value}`
    };
  });
}
