/**
 * Part 2 — monthly summary, computed from Parts 3 and 4.
 *
 * The identity that the Word layout prints under the table is
 *   manufactured + installed + repaired = passed + failed + pending   (per row)
 * which holds by construction here: each row contributes exactly one activity
 * count and exactly one verification count.
 *
 * The server recomputes this on submit; a client-sent summary is never trusted.
 */

import {
  CATEGORY_CODES,
  DEADLINE_DAY,
  InstrumentCategory,
  KHMER_DIGITS,
  KHMER_MONTHS,
} from './constants';
import {
  Annex8State,
  Annex8Summary,
  Annex8SummaryRow,
} from './types';

const emptyRow = (): Annex8SummaryRow => ({
  manufactured: 0,
  installed: 0,
  repaired: 0,
  passed: 0,
  failed: 0,
  pending: 0,
});

const VERIFICATION_FIELD = {
  PASSED: 'passed',
  FAILED: 'failed',
  PENDING: 'pending',
} as const;

export function computeSummary(state: Annex8State): Annex8Summary {
  const rows = Object.fromEntries(
    CATEGORY_CODES.map((code) => [code, emptyRow()]),
  ) as Record<InstrumentCategory, Annex8SummaryRow>;

  const isNil = state.meta.report_type === 'NIL';
  const provinces = new Set<string>();

  if (!isNil) {
    state.instruments.forEach((item) => {
      const row = rows[item.category as InstrumentCategory];
      if (!row) return;
      if (item.op_code === 'M') row.manufactured += 1;
      else row.installed += 1;
      row[VERIFICATION_FIELD[item.verification_status]] += 1;
      if (item.province) provinces.add(item.province);
    });

    state.repairs.forEach((item) => {
      const row = rows[item.category as InstrumentCategory];
      if (!row) return;
      row.repaired += 1;
      row[VERIFICATION_FIELD[item.verification_status]] += 1;
      if (item.province) provinces.add(item.province);
    });
  }

  const total = emptyRow();
  (Object.keys(rows) as InstrumentCategory[]).forEach((code) => {
    (Object.keys(total) as Array<keyof Annex8SummaryRow>).forEach((field) => {
      total[field] += rows[code][field];
    });
  });

  const carryOver = { count: state.carry_over.length, passed: 0, failed: 0, pending: 0 };
  state.carry_over.forEach((item) => {
    carryOver[VERIFICATION_FIELD[item.status]] += 1;
  });

  const activity = total.manufactured + total.installed + total.repaired;
  const results = total.passed + total.failed + total.pending;

  return {
    rows,
    total,
    carryOver,
    activity,
    results,
    balanced: activity === results,
    provinces: Array.from(provinces).sort(),
  };
}

export function hasAnyFailed(state: Annex8State): boolean {
  return (
    state.instruments.some((x) => x.verification_status === 'FAILED') ||
    state.repairs.some((x) => x.verification_status === 'FAILED') ||
    state.carry_over.some((x) => x.status === 'FAILED')
  );
}

/* ------------------------------------------------------------------ *
 * Period / deadline helpers
 * ------------------------------------------------------------------ */

/** Previous calendar month as YYYY-MM — the default reporting period. */
export function previousMonth(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function periodBounds(periodMonth: string): [Date, Date] {
  const [year, month] = periodMonth.split('-').map(Number);
  return [new Date(year, month - 1, 1), new Date(year, month, 0)];
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Art. 21 — the 7th of the following month at 23:59:59. */
export function deadlineFor(periodMonth: string): Date {
  const [year, month] = periodMonth.split('-').map(Number);
  return new Date(year, month, DEADLINE_DAY, 23, 59, 59);
}

export function isWithinPeriod(dateStr: string, periodMonth: string): boolean {
  if (!dateStr) return false;
  const [start, end] = periodBounds(periodMonth);
  return dateStr >= toIsoDate(start) && dateStr <= toIsoDate(end);
}

export function isOnTime(periodMonth: string, submittedAt: Date = new Date()): boolean {
  return submittedAt <= deadlineFor(periodMonth);
}

/* ------------------------------------------------------------------ *
 * Khmer formatting (print layout)
 * ------------------------------------------------------------------ */

export function toKhmerDigits(value: string | number): string {
  return String(value ?? '').replace(/\d/g, (d) => KHMER_DIGITS[Number(d)]);
}

export function khmerMonthLabel(periodMonth: string): string {
  if (!periodMonth) return '....';
  const [year, month] = periodMonth.split('-');
  return `${KHMER_MONTHS[Number(month) - 1]} ឆ្នាំ${toKhmerDigits(year)}`;
}
