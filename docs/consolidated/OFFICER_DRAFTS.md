# Automatic Officer Drafts

Sections 6.1 and 6.2 are editable drafts, not approval decisions. No external AI
service receives operational data. The official Word template is unchanged.

## Section 6.1: Recorded Activities

The staff-only consolidated preview endpoint reads existing Annex 8 audit records.
Only report accept/return events performed by admin/superadmin, with a matching
recorded outcome, qualify. Each generated row carries its audit reference.
The action must have occurred within the selected reporting period in Cambodia
time, and no later than the aggregate data cutoff. This is the action date, not
the month for which the enterprise filed its report.

Company submissions, failed requests, drafts, deletions and inferred reminders
are not described as completed NMC activities. If the audit source cannot be
read, no activities are fabricated and a warning is returned. An empty source
does not prove that no work happened outside this system. Officers may add
verified activities manually. No new database table or migration is needed.

## Section 6.2: Suggested Follow-Up

Deterministic rules reuse the existing analysis findings: missing/late reports,
recorded failed verification, pending work, standards/licence expiry, scope
review flags, declining submission rates and data-quality discrepancies.
Unknown indicators are not treated as zero and do not create accusations.
Each proposal states the observation and a suggested next step, not an action
already carried out or a sanction/approval decision.

There is no approved legal-reference catalogue in the application. Legal-basis
fields remain blank for officers to supply verified references; the algorithm
does not invent articles or claim automatic legal verification.

## Review And Export

Preview/Word generation populates the editable rows on the first load. Later
previews preserve manual edits, including deliberate removal of all rows.
The regenerate-draft button reloads current data and replaces both sections
only after confirmation when rows already exist. Changing the reporting period
clears period-specific rows. Officer edits invalidate the previous preview.
Word export uses the currently reviewed snapshot; preview refresh reads again.

This does not add shared draft persistence, reviewer-account sign-off, or an
approval audit trail. Existing disabled save/finalize controls remain disabled.

## Verification

- `npm run consolidated:officer-check`: pure fixtures; staff/action allowlist,
  Cambodia boundaries, cutoff, duplicates, over 1000 events, manual overrides
  and blank legal references. No network or operational writes.
- `npx tsx scripts/consolidated-automatic-test.ts`: existing analysis and Word
  template integrity regression checks.
- `npm run consolidated:api-check`: loopback-only existing database reads and
  export checks. Do not run destructive database scenario tests.
