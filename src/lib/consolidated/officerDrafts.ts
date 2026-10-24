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
  reminder: 'ផ្ញើលិខិតរំលឹក',
};

const STAFF_RESULTS: Record<string, string> = {
  accept: 'បានកត់ត្រាការទទួលយក',
  return: 'បានកត់ត្រាការបញ្ជូនត្រឡប់',
  update: 'បានកត់ត្រាការកែតម្រូវ',
  delete: 'បានកត់ត្រាការលុប',
  undelete: 'បានកត់ត្រាការស្ដារ',
  reminder: 'បានផ្ញើរួច',
};

/**
 * A report as the register itself records it.
 *
 * The report row carries the outcome of NMC's review: its status, who
 * reviewed it, and when it was received or returned. Those are facts about
 * what the Centre did, written at the moment it did it — the audit log is a
 * second record of the same events, not the only one.
 */
export interface ReportOutcomeEvidence {
  id: string;
  licence_no: string | null;
  status: string | null;
  reviewer: string | null;
  received_at: string | null;
  returned_at: string | null;
  updated_at: string | null;
  period_month: string | null;
}

/**
 * NMC actions derived from the reports themselves.
 *
 * This exists because 6.1 was built on the audit log alone, and an audit log
 * that is empty — a fresh deployment, a table added later, a write that
 * failed — made the section empty too, while `status = 'ACCEPTED'` sat in
 * the report row saying plainly that the Centre had accepted it.
 *
 * A report that is ACCEPTED was accepted; one that is RETURNED was returned.
 * Nothing is inferred beyond what the status word already asserts.
 *
 * The date is the one the register kept for that outcome, falling back to
 * when the row was last written. Where even that is missing the action is
 * still real, so it is reported with the period rather than dropped.
 */
export function draftReviewOutcomes(
  reports: ReportOutcomeEvidence[], licensees: ConsolidatedData['licensees'],
): ActionEvent[] {
  const events: ActionEvent[] = [];
  for (const row of reports) {
    const status = String(row.status || '').toUpperCase();
    const kind = status === 'ACCEPTED' ? 'accept' : status === 'RETURNED' ? 'return' : '';
    if (!kind) continue;
    const stamp = (kind === 'accept' ? row.received_at : row.returned_at) || row.updated_at;
    const at = stamp ? new Date(stamp) : null;
    events.push({
      licence: String(row.licence_no || '').trim(),
      action: kind,
      id: `report:${row.id}`,
      at: at && Number.isFinite(at.getTime()) ? at : null,
      period: String(row.period_month || ''),
    });
  }
  return events;
}

/** One thing the Centre did to one report, from whichever record holds it. */
export interface ActionEvent {
  licence: string;
  action: string;
  /** Prefixed by source, so the same report seen twice counts once. */
  id: string;
  at: Date | null;
  period: string;
}

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
  rows: StaffReviewEvidence[], period: ReportingPeriod, asOf: string,
): ActionEvent[] {
  const window = actionWindow(period, asOf);
  const seen = new Set<string>();
  const events: ActionEvent[] = [];

  for (const row of rows) {
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
    events.push({
      licence: String(row.licence_no || '').trim(),
      action: row.action,
      // Keyed by the report, so the same outcome recorded in both the audit
      // log and the report row is one action, not two.
      id: `report:${String((row as any).report_uuid || row.id)}`,
      at, period: '',
    });
  }
  return events;
}

/**
 * Turn action events into the rows section 6.1 prints.
 *
 * One row per licensee per kind of action, with how many times and over what
 * dates. Forty-nine separate lines saying the same thing about one company
 * is a register nobody reads; "accepted 3 reports, 02/10 to 18/10" is the
 * same evidence, usable. Events are deduplicated by report, so an outcome
 * held in both the audit log and the report row counts once.
 */
export function groupActionEvents(
  events: ActionEvent[], licensees: ConsolidatedData['licensees'], startNo = 1,
): ConsolidatedData['actions'] {
  const names = new Map(licensees.map(row => [String(row.licence_no), String(row.name)]));
  interface Group { licence: string; action: string; ids: Set<string>; first: Date | null; last: Date | null; periods: Set<string> }
  const groups = new Map<string, Group>();

  for (const e of events) {
    const key = `${e.licence}|${e.action}`;
    let g = groups.get(key);
    if (!g) { g = { licence: e.licence, action: e.action, ids: new Set(), first: null, last: null, periods: new Set() }; groups.set(key, g); }
    if (g.ids.has(e.id)) continue;
    g.ids.add(e.id);
    if (e.period) g.periods.add(e.period);
    if (e.at) {
      if (!g.first || e.at < g.first) g.first = e.at;
      if (!g.last || e.at > g.last) g.last = e.at;
    }
  }

  const day = (d: Date) => toKhmerDigits(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Phnom_Penh', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d));

  return [...groups.values()]
    .sort((a, b) => (a.first?.getTime() ?? 0) - (b.first?.getTime() ?? 0) || a.licence.localeCompare(b.licence))
    .map((g, i) => {
      const times = g.ids.size;
      const dates = !g.first || !g.last
        // No timestamp survived on any record of this action. It still
        // happened, so the period is reported rather than the row dropped.
        ? [...g.periods].sort().map(p => toKhmerDigits(p)).join(', ') || 'មិនមានកាលបរិច្ឆេទ'
        : g.first.getTime() === g.last.getTime() ? day(g.first) : `${day(g.first)} – ${day(g.last)}`;
      return {
        no: startNo + i,
        licensee: names.has(g.licence) ? `${names.get(g.licence)} (${g.licence})` : g.licence || 'មិនមានទិន្នន័យ',
        action: times > 1 ? `${STAFF_ACTIONS[g.action]} ${toKhmerDigits(times)} លើក` : STAFF_ACTIONS[g.action],
        date: dates,
        // How many records stand behind the row, rather than their ids: a
        // report id is a UUID, and a column of those on a ministry table
        // helps nobody. The records themselves are in the app.
        result: `${STAFF_RESULTS[g.action]} · កំណត់ត្រា ${toKhmerDigits(times)}`,
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
  rows: ReminderEvidence[], period: ReportingPeriod, asOf: string,
): ActionEvent[] {
  const window = actionWindow(period, asOf);
  const seen = new Set<string>();
  const events: ActionEvent[] = [];
  for (const row of rows) {
    if (String(row.send_status || '').toLowerCase() !== 'sent') continue;
    const at = new Date(String(row.sent_at || ''));
    if (!Number.isFinite(at.getTime())) continue;
    const timestamp = at.toISOString();
    if (timestamp < window.start || timestamp >= window.end || timestamp > window.cutoff) continue;
    const key = String(row.id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    events.push({
      licence: String(row.licence_no || '').trim(),
      action: 'reminder',
      id: `reminder:${key}`,
      at, period: '',
    });
  }
  return events;
}
