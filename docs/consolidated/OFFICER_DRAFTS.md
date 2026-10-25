# Sections 6.1 and 6.2: how they fill themselves

NMC's instruction is that the machine analyses and fills these sections and a
person checks them. Neither section is an approval decision: a named human
reviewer still signs the report, and nothing here triggers a sanction, a
warning or a licence action.

The official Word template is never modified. Code only prepares values for
its tags.

---

## The rule everything else follows

**The system writes about what happened. It does not decide what happened.**

Every row in 6.1 traces to a record the Centre already holds. Every citation
in 6.2 comes from an approved list. The AI may improve the Khmer; it may not
add a fact, a figure or a legal reference. Where a check fails, the
deterministic wording is used instead and the report says which drafter
produced it.

An empty section therefore means the register is empty, not that the feature
is broken. That is the correct and useful answer: an empty 6.1 says no
recorded action took place in the period. It does not prove nothing happened
outside this system, and an officer may add verified rows by hand.

---

## Section 6.1 — វិធានការដែលបានអនុវត្ត

### Where the rows come from

Three records, merged and deduplicated **by report**, so the same outcome held
in two places counts once:

| Source | What qualifies |
| --- | --- |
| `annex8_reports` | A report whose status is `ACCEPTED` or `RETURNED`. The status is the assertion: a report that is ACCEPTED was accepted. Date from `received_at` / `returned_at`, falling back to `updated_at`. |
| `annex8_report_audit_log` | `accept`, `return`, `update`, `delete`, `undelete` by `admin` or `superadmin`, within the period in Cambodia time and no later than the data cutoff. Any entity — correcting an instrument row is the same intervention as correcting the report. |
| `license_reminder_logs` | A reminder letter the log records as **sent**. A queued or failed letter is not an action the Centre took. |

`accept` and `return` audit rows additionally have to show the status they
claim: a row saying "accept" without the report reaching `ACCEPTED` is not
evidence that it was accepted.

The licensee's own events — `create`, `submit`, `open` — are excluded. Those
belong in sections 2 to 5, not in a register of what the Centre did. A
`SUBMITTED` report is not an action taken.

Reading the reports as well as the audit log matters: the audit table can be
empty on a fresh deployment, or after a failed write, while the report rows
still say plainly that reports were accepted. Tying 6.1 to the audit log
alone left the section blank in exactly that situation.

### How the rows are shaped

One row per licensee per kind of action, with how many times and over what
dates:

```
[Licensee] (LIC-0031)   ពិនិត្យ និងទទួលយករបាយការណ៍ ២១ លើក
                        ១៨/១០/២០២៦ – ១៩/១០/២០២៦
                        បានកត់ត្រាការទទួលយក · កំណត់ត្រា ២១
```

Twenty-one separate lines saying the same thing about one company is a
register nobody reads. The result column gives the number of records behind
the row rather than their ids — a report id is a UUID, and a column of those
helps no one; the records themselves are in the app.

An action whose timestamp did not survive on any record is reported with its
period rather than dropped. It still happened.

### What the AI may do here

Reword the **action** and **result** columns of rows that already exist.
Nothing else. Enforced in code, not asked for in the prompt:

- the row count must match exactly — it cannot add, drop or reorder
- `licensee` and `date` are carried over from the evidence and compared
  afterwards, because they identify the action; a report that moves one to
  another company or another day is a false record
- no figure may appear that is not in the record it was given
- an empty register has nothing to word, and stays empty

---

## Section 6.2 — សំណើ

### Where the proposals come from

The deterministic findings in `analyzeConsolidatedData`: missing and late
reports, recorded failed verification, pending work, standards and licence
expiry, scope-review flags, declining submission rates and data-quality
discrepancies. Unknown indicators are not treated as zero and do not become
accusations. Each proposal states the observation and a suggested next step —
never an action already carried out, and never a sanction.

### The legal basis

Each finding rule maps to the references that actually govern it. The
catalogue is in `src/lib/consolidated/legalBasis.ts`.

| Rule | Cites |
| --- | --- |
| `late-reports`, `missing-reports` | ប្រការ២១ និង ឧបសម្ព័ន្ធទី៨ |
| `submission-rate-decreased` | ប្រការ២១ |
| `pending-at-period-end`, `pending-over-30-days` | ប្រការ១៧ |
| `failed-verification`, `annex-totals-mismatch`, `submission-totals-mismatch`, `scope-review`, `incomplete-data` | ឧបសម្ព័ន្ធទី៨ |
| `expired-standards`, `standards-due-soon`, `licences-expiring` | *nothing — deliberately* |

The last three are unmapped because the catalogue has nothing that governs
them. An empty citation is better than a loosely related article. An officer
may add the right one by hand.

The instrument is named once per citation, then its articles:

```
ប្រកាសលេខ ២៤៧ សហវ.ប្រក ចុះថ្ងៃទី១៨ ខែមីនា ឆ្នាំ២០២២ ប្រការ២១ និង ឧបសម្ព័ន្ធទី៨
```

International recommendations (OIML R 76, R 111, R 117, R 46, R 49) follow
after a semicolon and never under the Prakas — they belong to a different
authority and must not read as part of a Cambodian instrument.

### What the AI may do here

Reword a proposal and **choose** its references from the catalogue. It may
not write a citation. Anything outside the approved list is refused and the
deterministic draft used instead. It also may not add, drop or reorder a
proposal, or state a figure absent from the data it was given.

A fabricated article number in a report that may support an inspection is the
worst thing this feature could produce. That is why the column sat blank
until a catalogue existed, and why the AI selects rather than writes.

---

## Extending the catalogue

Add an entry to `LEGAL_REFERENCES`, then map the rule in `RULE_REFERENCES`.
Both are in `legalBasis.ts`.

**Only add a reference that has been confirmed.** Never add one to fill a
column. A wrong article attached to a real Prakas is worse than a blank cell,
and the guard will not catch it — the guard only stops the AI inventing
references, not a wrong one being entered here by hand.

`INSTRUMENT_TITLE` is the single place the Prakas is named. Changing it
updates every citation. Leaving it empty prints bare articles, which is what
the rest of the system does.

---

## Who signs

| Field | Filled by |
| --- | --- |
| `preparer_name` | the system — `រៀបចំដោយប្រព័ន្ធឆ្លាតវៃរបស់ ម.ម.ជ` |
| `preparer_position` | the system — `ប្រព័ន្ធវិភាគស្វ័យប្រវត្តិ (Smart Algorithm & AI)` |
| `prepared_date_kh` | the system |
| `reviewer_name`, `reviewer_position`, `reviewed_date_kh` | **an officer — still required** |

The preparer block has left the officer inputs, so a request cannot put a
person's name on an analysis they did not write. The analysis is automatic;
the approval is not.

---

## Using it

The **បង្កើតព្រាង ៦.១ និង ៦.២** button regenerates both sections and asks the
AI to word them. Loading the report does not, and neither does exporting it:
a model call takes tens of seconds and an export must not wait on one.

A line under the button says which drafter worded each section, and the
provider's own reason when the AI was not used. A substitution between the
two is visible, not silent.

Officer edits always win and survive later previews, including deliberate
removal of all rows. Changing the reporting period clears period-specific
rows. Word export uses the reviewed snapshot.

### The AI provider

Configured on the Smart Analytics report screen — Gemini, Claude or ChatGPT,
with a key and a model list — by a superadmin. One place to set it, one place
to turn it off. The key is stored server-side and never returned to a
browser.

Without a provider, both sections are worded by the deterministic drafter and
the report says so. Nothing depends on an external service being up.

What the provider receives: aggregate counts, rates, provinces, period labels
and the approved citation list. **No licensee name, licence number or
serial.** The named tables are filled by us, from the database.

---

## Verification

| Command | Covers |
| --- | --- |
| `npm run consolidated:officer-check` | staff/action allowlist, Cambodia boundaries, cutoff, deduplication, 1205 events in one row, the report-derived source, manual overrides |
| `npm run consolidated:ai:check` | the catalogue, the rule mapping, the citation guard, and the AI's refusals for both sections |
| `npm run consolidated:check` | template contract |
| `npm run consolidated:test` | analysis and Word template integrity |
| `npm run consolidated:api-check` | loopback-only database reads and export |

All run without network or operational writes.

---

## If a section is empty

Check the warning under 6.1 first — it reports what was searched and how many
records were found. Zero audit rows and zero reminder letters means the
period genuinely has no recorded action.

If a count is non-zero while the table is still empty, the filters are wrong
and that is a bug worth chasing. The two have been confused before: 6.1 was
read as broken for a day when production simply had no reports in it.
