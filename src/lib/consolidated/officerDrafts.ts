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

/**
 * A reminder letter the system actually sent, from license_reminder_logs.
 *
 * 6.1 asks for "លិខិតរំលឹក ការព្រមាន ការចុះត្រួតពិនិត្យ". The Centre does send
 * reminder letters and records every one, but this draft used to look only
 * at report accept/return events, so a quarter full of letters printed an
 * empty table. Resolved to a licence by the caller, which can read the
 * licence register; these rows only carry what is needed to word them.
 */
export interface ReminderEvidence {
  id: string | number;
  licence_no: string | null;
  licensee_name: string | null;
  reminder_type: string | null;
  reminder_days: number | null;
  send_status: string | null;
  sent_at: string | null;
}

const KH_REMINDER: Record<string, string> = {
  expiry: 'អាជ្ញាប័ណ្ណជិតផុតសុពលភាព',
  expired: 'អាជ្ញាប័ណ្ណផុតសុពលភាព',
  report: 'ការដាក់របាយការណ៍ប្រចាំខែ',
};

/**
 * What each recorded staff action is called in the report.
 *
 * Only actions an officer took. `create`, `submit` and `open` are the
 * licensee filing their own return — they belong in sections 2 to 5, not in
 * a register of what the Centre did.
 */
const STAFF_ACTIONS: Record<string, string> = {
  accept: 'ពិនិត្យ និងទទួលយករបាយការណ៍',
  return: 'ពិនិត្យ និងបញ្ជូនរបាយការណ៍ត្រឡប់ឱ្យកែតម្រូវ',
  update: 'កែតម្រូវទិន្នន័យក្នុងរបាយការណ៍',
  delete: 'លុបកំណត់ត្រាដែលមិនត្រឹមត្រូវ',
  undelete: 'ស្ដារកំណត់ត្រាឡើងវិញ',
};

const STAFF_RESULTS: Record<string, string> = {
  accept: 'បានកត់ត្រាការទទួលយក',
  return: 'បានកត់ត្រាការបញ្ជូនត្រឡប់',
  update: 'បានកត់ត្រាការកែតម្រូវ',
  delete: 'បានកត់ត្រាការលុប',
  undelete: 'បានកត់ត្រាការស្ដារ',
};

/**
 * Recorded NMC actions, grouped so the table can be read.
 *
 * Every row still comes from an audit record: nothing is inferred and
 * nothing is invented. Two changes from drawing only on accept and return:
 *
 *  - All five officer actions count. Correcting a licensee's figures or
 *    removing a bad record is something the Centre did, and leaving it out
 *    made 6.1 look emptier than the quarter actually was.
 *  - One row per licensee per kind of action, with how many times and over
 *    what dates. Forty-nine separate lines saying the same thing about the
 *    same company is a register nobody reads; "accepted 3 reports, 02/10 to
 *    18/10" is the same evidence, usable.
 *
 * The audit id of every record behind a row is kept in the result, so any
 * line can still be traced back to the entries that produced it.
 */
export function draftRecordedActions(
  rows: StaffReviewEvidence[], period: ReportingPeriod, asOf: string, licensees: ConsolidatedData['licensees'],
): ConsolidatedData['actions'] {
  const window = actionWindow(period, asOf);
  const names = new Map(licensees.map(row => [String(row.licence_no), String(row.name)]));
  const seen = new Set<string>();

  interface Group { licence: string; action: string; ids: string[]; first: Date; last: Date }
  const groups = new Map<string, Group>();

  for (const row of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at) || String(a.id).localeCompare(String(b.id)))) {
    const at = new Date(row.created_at);
    if (!Number.isFinite(at.getTime())) continue;
    const timestamp = at.toISOString();
    if (timestamp < window.start || timestamp >= window.end || timestamp > window.cutoff) continue;
    if (!['admin', 'superadmin'].includes(row.actor_role || '')) continue;
    if (!STAFF_ACTIONS[row.action]) continue;
    const key = String(row.id);
    if (!key || seen.has(key)) continue;

    // Accept and return still have to show the status they claim: an audit
    // row that says "accept" without the report reaching ACCEPTED is not
    // evidence that the report was accepted.
    if (['accept', 'return'].includes(row.action)) {
      const patch = row.new_value as { status?: unknown } | null;
      if (patch?.status !== (row.action === 'accept' ? 'ACCEPTED' : 'RETURNED')) continue;
    }

    seen.add(key);
    const licence = String(row.licence_no || '').trim();
    const groupKey = `${licence}|${row.action}`;
    const group = groups.get(groupKey);
    if (group) {
      group.ids.push(key);
      if (at < group.first) group.first = at;
      if (at > group.last) group.last = at;
    } else {
      groups.set(groupKey, { licence, action: row.action, ids: [key], first: at, last: at });
    }
  }

  const day = (d: Date) => toKhmerDigits(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Phnom_Penh', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d));

  return [...groups.values()]
    .sort((a, b) => a.first.getTime() - b.first.getTime() || a.licence.localeCompare(b.licence))
    .map((g, i) => {
      const times = g.ids.length;
      const range = g.first.getTime() === g.last.getTime() ? day(g.first) : `${day(g.first)} – ${day(g.last)}`;
      return {
        no: i + 1,
        licensee: names.has(g.licence) ? `${names.get(g.licence)} (${g.licence})` : g.licence || 'មិនមានទិន្នន័យ',
        action: times > 1 ? `${STAFF_ACTIONS[g.action]} ${toKhmerDigits(times)} លើក` : STAFF_ACTIONS[g.action],
        date: range,
        result: `${STAFF_RESULTS[g.action]} · Audit #${g.ids.slice(0, 5).join(', #')}${g.ids.length > 5 ? ` (+${toKhmerDigits(g.ids.length - 5)})` : ''}`,
      };
    });
}

/**
 * Reminder letters sent in the period, as 6.1 rows.
 *
 * Only letters the log records as actually sent. A queued or failed letter
 * is not an action the Centre took, and a row saying otherwise would be a
 * false entry in an official register.
 */
export function draftSentReminders(
  rows: ReminderEvidence[], period: ReportingPeriod, asOf: string, startNo: number,
): ConsolidatedData['actions'] {
  const window = actionWindow(period, asOf);
  const seen = new Set<string>();
  const actions: ConsolidatedData['actions'] = [];
  for (const row of [...rows].sort((a, b) =>
    String(a.sent_at || '').localeCompare(String(b.sent_at || '')) || String(a.id).localeCompare(String(b.id)))) {
    if (String(row.send_status || '').toLowerCase() !== 'sent') continue;
    const at = new Date(String(row.sent_at || ''));
    if (!Number.isFinite(at.getTime())) continue;
    const timestamp = at.toISOString();
    if (timestamp < window.start || timestamp >= window.end || timestamp > window.cutoff) continue;
    const key = String(row.id);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const licence = String(row.licence_no || '').trim();
    const subject = KH_REMINDER[String(row.reminder_type || '').toLowerCase()]
      || String(row.reminder_type || '').trim();
    const days = Number(row.reminder_days);
    actions.push({
      no: startNo + actions.length,
      licensee: row.licensee_name ? `${row.licensee_name} (${licence})` : licence || 'មិនមានទិន្នន័យ',
      action: `ផ្ញើលិខិតរំលឹក${subject ? `ស្ដីពី${subject}` : ''}`
        + (Number.isFinite(days) && days > 0 ? ` (មុន ${toKhmerDigits(days)} ថ្ងៃ)` : ''),
      date: toKhmerDigits(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Phnom_Penh', day: '2-digit', month: '2-digit', year: 'numeric',
      }).format(at)),
      result: `បានផ្ញើរួច · Reminder #${key}`,
    });
  }
  return actions;
}
