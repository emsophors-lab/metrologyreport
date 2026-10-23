/**
 * Forecasting with an interval you can defend.
 *
 * The existing dashboard forecast (src/utils/mlTrendForecasting.ts) reports
 * `value ± 2` — a constant, not a measurement. That is fine for a sparkline
 * and wrong for a report that goes to the Director General, where a range
 * implies the model knows something about its own error.
 *
 * This does ordinary least squares on the history, then builds the 95%
 * prediction interval from the residual standard error, widened properly for
 * how far ahead the point is and how little data there is. With fewer than
 * four observations no interval is produced at all: the honest answer is that
 * it is not known.
 */

export interface ForecastPoint {
  /** Point forecast, rounded to a whole count. */
  value: number;
  /** Inclusive 95% prediction interval, or null when it cannot be computed. */
  interval: [number, number] | null;
  /** Mean absolute percentage error on the held-out tail, or null. */
  mape: number | null;
  /** How many observations the fit used. */
  n: number;
}

/** Student's t two-sided 97.5% quantile. Beyond 30 the normal value is close enough. */
const T_975: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306,
  9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
  16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086, 21: 2.080, 22: 2.074,
  23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
};
const tQuantile = (df: number) => (df <= 0 ? NaN : df > 30 ? 1.96 : T_975[df]);

interface Fit { slope: number; intercept: number; meanX: number; sxx: number; sigma: number; n: number }

function ordinaryLeastSquares(values: number[]): Fit | null {
  const n = values.length;
  if (n < 2) return null;
  const xs = values.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
  if (sxx === 0) return null;
  const sxy = xs.reduce((s, x, i) => s + (x - meanX) * (values[i] - meanY), 0);
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const df = n - 2;
  // With two points the line is exact and the residual variance is undefined;
  // sigma is 0 and the interval below collapses, which is correct — there is
  // no evidence about spread.
  const rss = values.reduce((s, y, i) => s + (y - (intercept + slope * i)) ** 2, 0);
  const sigma = df > 0 ? Math.sqrt(rss / df) : 0;
  return { slope, intercept, meanX, sxx, sigma, n };
}

/**
 * Mean absolute percentage error, measured by fitting on everything except
 * the last `holdout` observations and predicting them.
 *
 * Reported as a percentage. Periods where the actual is zero are skipped —
 * a percentage error against zero is undefined, not infinite.
 */
export function holdoutMape(values: number[], holdout = 3): number | null {
  if (values.length < holdout + 3) return null;
  const train = values.slice(0, values.length - holdout);
  const test = values.slice(values.length - holdout);
  const fit = ordinaryLeastSquares(train);
  if (!fit) return null;
  const errors: number[] = [];
  test.forEach((actual, k) => {
    if (actual === 0) return;
    const predicted = fit.intercept + fit.slope * (train.length + k);
    errors.push(Math.abs((actual - predicted) / actual));
  });
  if (!errors.length) return null;
  return (errors.reduce((a, b) => a + b, 0) / errors.length) * 100;
}

/**
 * Forecast the next period from a history of equal-length periods, oldest
 * first.
 *
 * `stepsAhead` is 1 for the period immediately after the history.
 */
export function forecastNext(values: number[], stepsAhead = 1): ForecastPoint {
  const clean = values.filter(v => Number.isFinite(v));
  const fit = ordinaryLeastSquares(clean);
  if (!fit) {
    // Not enough history to fit a line. Carry the last value forward and say
    // plainly that the interval is unknown.
    const last = clean.length ? clean[clean.length - 1] : 0;
    return { value: Math.max(0, Math.round(last)), interval: null, mape: null, n: clean.length };
  }

  const x = fit.n - 1 + stepsAhead;
  const point = fit.intercept + fit.slope * x;
  const value = Math.max(0, Math.round(point));

  const df = fit.n - 2;
  const t = tQuantile(df);
  if (!Number.isFinite(t) || clean.length < 4) {
    // Fewer than four observations cannot support a 95% claim.
    return { value, interval: null, mape: holdoutMape(clean), n: clean.length };
  }

  // A sigma of zero is NOT missing information: it means the observations
  // showed no variation at all, and the interval collapsing onto the point is
  // the correct output of the method. Reporting "unknown" for a perfectly
  // stable category would read as a data gap rather than as stability.

  // Prediction (not confidence) interval: includes the new observation's own
  // scatter, which is why the 1 is there.
  const se = fit.sigma * Math.sqrt(1 + 1 / fit.n + (x - fit.meanX) ** 2 / fit.sxx);
  const half = t * se;
  return {
    value,
    interval: [Math.max(0, Math.round(point - half)), Math.max(0, Math.round(point + half))],
    mape: holdoutMape(clean),
    n: clean.length,
  };
}

/** "360 – 430", or the caller's fallback when the interval is unknown. */
export function intervalText(point: ForecastPoint, unknown: string): string {
  if (!point.interval) return unknown;
  return `${point.interval[0]} – ${point.interval[1]}`;
}
