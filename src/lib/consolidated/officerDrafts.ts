import type { ConsolidatedData } from './contract';
import { toKhmerDigits } from './periods';
import type { ReportingPeriod } from './periods';

export interface StaffReviewEvidence {
  id: string | number;
  licence_no: string | null;
  created_at: string;
  entity: string;
  action: string;
  actor_role: string | null;
  new_value: unknown;
}

/** The reporting period uses Cambodia civil dates; audit timestamps are UTC. */
export function actionWindow(period: ReportingPeriod, asOf: string) {
  const start = new Date(`${period.start}T00:00:00+07:00`).toISOString();
  const end = new Date(new Date(`${period.end}T00:00:00+07:00`).getTime() + 86400000).toISOString();
  const cutoff = new Date(asOf);
  if (!Number.isFinite(cutoff.getTime())) throw new Error('Invalid action evidence cutoff.');
  return { start, end, cutoff: cutoff.toISOString() };
}

/** Only recorded staff review outcomes qualify as completed NMC actions. */
export function draftRecordedActions(
  rows: StaffReviewEvidence[], period: ReportingPeriod, asOf: string, licensees: ConsolidatedData['licensees'],
): ConsolidatedData['actions'] {
  const window = actionWindow(period, asOf);
  const names = new Map(licensees.map(row => [String(row.licence_no), String(row.name)]));
  const seen = new Set<string>();
  const actions: ConsolidatedData['actions'] = [];
  for (const row of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at) || String(a.id).localeCompare(String(b.id)))) {
    const at = new Date(row.created_at);
    if (!Number.isFinite(at.getTime())) continue;
    const timestamp = at.toISOString();
    if (timestamp < window.start || timestamp >= window.end || timestamp > window.cutoff) continue;
    if (!['admin', 'superadmin'].includes(row.actor_role || '') || row.entity !== 'report') continue;
    if (!['accept', 'return'].includes(row.action)) continue;
    const key = String(row.id);
    if (!key || seen.has(key)) continue;
    const patch = row.new_value as { status?: unknown } | null;
    if (patch?.status !== (row.action === 'accept' ? 'ACCEPTED' : 'RETURNED')) continue;
    seen.add(key);
    const licence = String(row.licence_no || '').trim();
    actions.push({
      no: actions.length + 1,
      licensee: names.has(licence) ? `${names.get(licence)} (${licence})` : licence || 'មិនមានទិន្នន័យ',
      action: row.action === 'accept' ? 'ពិនិត្យ និងទទួលយករបាយការណ៍ប្រចាំខែ' : 'ពិនិត្យ និងបញ្ជូនរបាយការណ៍ត្រឡប់ឱ្យកែតម្រូវ',
      date: toKhmerDigits(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Phnom_Penh', day: '2-digit', month: '2-digit', year: 'numeric',
      }).format(at)),
      result: `${row.action === 'accept' ? 'បានកត់ត្រាការទទួលយក' : 'បានកត់ត្រាការបញ្ជូនត្រឡប់'} · Audit #${key}`,
    });
  }
  return actions;
}
