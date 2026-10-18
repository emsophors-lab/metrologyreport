# Annex 8 — incremental monthly entry: Stage 1 survey and proposal

Companies should record activities as the work happens, several times a month,
then review, submit and print at month end. This is the Stage 1 deliverable:
what exists today, what needs to change, and the screens. **No migration has
been run and no schema has been changed.**

---

## 1. What exists today

### 1.1 Tables (`supabase_annex8_schema.sql`)

| Table | Purpose | Columns |
|---|---|---|
| `annex8_reports` | the report header | 30 |
| `annex8_report_instruments` | Part 3 | 29 |
| `annex8_report_modules` | Part 3A | 14 |
| `annex8_report_repairs` | Part 4 | 24 |
| `annex8_report_standards` | Part 5 | 12 |
| `annex8_carry_over_updates` | PENDING items resolved in a later month | 9 |
| `annex8_report_drafts` | **a work-in-progress month, as one JSONB blob** | 5 |
| `annex8_report_counters` + `annex8_next_report_id()` | report numbering | — |
| `annex8_licence_profiles` / `_scope` / `_technicians` / `_standards` | licence reference data | — |
| `annex8_activity_union` (view) | Annex 8 + legacy rows, used by the search | — |

**More of the target model already exists than the brief assumes.**
`annex8_reports` already carries `status` (`DRAFT | SUBMITTED | RETURNED |
ACCEPTED`), `report_type` (`REGULAR | NIL | AMENDMENT`), `original_report_id`,
`report_id` in exactly the `NMC-RPT-YYYYMM-#####` format, `submitted_at`,
`submitted_by`, `on_time`, `declaration_accepted`, `part2_summary` (the brief's
`part2_snapshot`), the NMC block (`received_at`, `reviewer`, `nmc_remarks`,
`is_complete`), and `template_version` (added in
`supabase_annex8_official_documents.sql`).

The uniqueness rule the brief asks for is already enforced:

```sql
CREATE UNIQUE INDEX uniq_a8_report_period
  ON annex8_reports (licence_no, period_month)
  WHERE report_type <> 'AMENDMENT' AND status <> 'DRAFT';
```

### 1.2 The one structural problem

**Entries do not become rows until the moment of submission.**

An in-progress month lives as a single JSONB payload in
`annex8_report_drafts`, keyed by `(licence_no, period_month)`. The whole wizard
state is written wholesale on each save. Child rows are inserted only inside
`POST /api/annex8/reports`, which creates the header with `status: 'SUBMITTED'`
directly — **nothing in the codebase ever creates a report row with status
`DRAFT`**.

That single fact is what blocks everything in the brief:

- **Two sessions overwrite each other.** Saving from the phone after saving
  from the office replaces the whole month, it does not merge.
- **There is no entry to view, edit, duplicate or delete** — only a blob.
- **No per-entry history**, so no audit log and no undo.
- **Validation is all-or-nothing** at submit, instead of per entry.

### 1.3 Missing against the brief

| Needed | Today |
|---|---|
| `OPEN` status for a month being filled | `DRAFT`, and never actually used |
| soft delete (`deleted_at`) on entries | none |
| `report_audit_log` | none |
| `created_by` / `updated_by` on entries | only `created_at`, and `updated_at` on two of the four |
| Part 6 as `report_events` rows | JSONB `events` column on the report |
| per-licence Row Level Security | `FOR SELECT USING (true)` on every table |
| link to the licence by id | `licence_no TEXT`, no foreign key |

### 1.4 Screens today

| Screen | File | State |
|---|---|---|
| Annex 8 wizard (7 steps, whole month at once) | `Annex8ReportForm.tsx` | to be replaced by incremental entry |
| Live Part 2 summary, cards, charts | `Annex8ReportOverview.tsx` | **reusable as-is** for the review page |
| Report search | `Annex8ReportSearch.tsx` | **reusable as-is** |
| NMC review / accept / return | — | **does not exist** |

Endpoints today: `GET /api/annex8/licence`, `/pending`, `/my-reports`,
`/draft`, `PUT /draft`, `POST /api/annex8/reports`, `/search`,
`/search-facets`, `GET /api/reports/:id/annex8.docx|.pdf`, `/render-status`.

---

## 2. Proposed schema change

### 2.1 Extend, do not rename

The brief names new tables (`monthly_reports`, `report_instruments`, …).
I propose **keeping the existing `annex8_*` tables and adding to them**,
because renaming would break every submitted report, the activity view, the
search, the official document rendering and all the endpoints — for no gain
beyond the names. Every field the brief lists is either already present or is
an `ALTER TABLE ... ADD COLUMN`.

If you want the new names regardless, say so and I will plan a view-based
rename so old reports keep working.

### 2.2 The changes

**A. A month being filled becomes a real report row.**

- Add `OPEN` to the `status` check constraint and use it for a month in
  progress. `DRAFT` stays allowed so nothing existing breaks.
- Entries are written to `annex8_report_instruments` / `_modules` / `_repairs` /
  `_standards` as they are entered, against that `OPEN` report.
- `annex8_report_drafts` keeps one job only: the autosave of the **entry form
  currently open** (brief §3c), not the month.
- The unique index changes from `status <> 'DRAFT'` to
  `status NOT IN ('DRAFT','OPEN')`, so an open month does not block the real
  submission.

**B. Soft delete and attribution on all four entry tables.**

```
deleted_at  TIMESTAMPTZ      -- NULL = live; set = deleted, undo-able
created_by  TEXT
updated_by  TEXT
updated_at  TIMESTAMPTZ      -- add to _modules and _standards
```

Every read filters `deleted_at IS NULL`. The 10-second undo is a client timer
over the same column, so an undo after a page reload still works.

**C. `annex8_report_audit_log`** — one row per create / update / delete /
submit / return / accept / amend, with `report_uuid`, `entity` (report /
instrument / module / repair / standard), `entity_id`, `action`, `actor`,
`actor_role`, `old_value JSONB`, `new_value JSONB`, `created_at`.

**D. Month-end fields on `annex8_reports`** — `opened_at`, `opened_by`,
`returned_at`, `returned_by`, `nmc_comment` (the brief's return comment;
`nmc_remarks` already exists and I would reuse it rather than add a second).

**E. Part 6** — I propose **keeping the `events` JSONB column** rather than a
`report_events` table. It is six fixed yes/no answers with a details string,
always read and written together, never queried across reports. A table buys
nothing and costs a join on every read. Tell me if you want the table anyway.

**F. Report numbering** — no change. `annex8_next_report_id()` already issues
`NMC-RPT-YYYYMM-#####` atomically, and the brief's "assigned at submit" is
already how it works.

### 2.3 Row Level Security — a conflict to resolve

The brief asks for RLS so "company users see only their own licence's reports".
That conflicts with two decisions already made and shipped:

1. **The browser no longer talks to the database.** Every read and write goes
   through `server.ts` with the service-role key, which bypasses RLS entirely.
   Scoping is enforced in the API today and is already live for licences,
   attachments, reminder logs, renewal history, users and search.
2. **Supabase-style RLS is what we are trying to shed.** Per-user policies need
   `auth.uid()`, which is Supabase's GoTrue and does not exist on a plain
   PostgreSQL server — see `docs/database-portability.md`. Adding `auth.uid()`
   policies now would re-create the exact coupling the MISTI migration is
   removing.

Three options:

- **(a) API-only scoping (recommended).** Keep RLS enabled with no permissive
  policy, so a stray anon key reads nothing, and let the API enforce per-licence
  access as it already does. Portable to any PostgreSQL.
- **(b) Both.** Add `auth.uid()` policies as defence in depth, accepting that
  they must be rewritten for the internal server.
- **(c) Database-level only.** Would require putting the browser back on
  PostgREST, undoing this week's work.

I recommend **(a)** and need your decision before writing the migration.

### 2.4 One behavioural consequence worth confirming

Brief §2 says an entry goes into the month of its **activity date**
(`completion_date` / `repair_to`), not the month it was typed. So an instrument
completed 31 August but entered on 2 September lands in **August**. If August
is already submitted, the save is blocked and the user is offered "create an
amendment for August" — which is what §2 asks for, and I want to be sure that
is intended, because it will happen often in the first days of each month.

---

## 3. Screens

### 3.1 Company

| # | Screen | Notes |
|---|---|---|
| C1 | **Monthly dashboard** | month selector, counts, days to the 7th (Asia/Phnom_Penh), status badge, four "add" buttons |
| C2 | **Part 3 list** — manufactured / installed | table on desktop, cards on mobile; search by serial / QR / customer; View, Edit, Duplicate, Delete |
| C3 | **Part 3A list** — modules | same, each linked to a host serial |
| C4 | **Part 4 list** — repairs | same |
| C5 | **Part 5 list** — standards | same |
| C6 | **Entry form** | one entry; required marked; V-rules inline; GPS; Save / Save & add another; autosave |
| C7 | **Pending from previous months** | update status / certificate / date; writes through to the original row |
| C8 | **Month-end review** | live Part 2 with the balance check, blocking-issue checklist with Fix links, Part 6, declaration, NIL option, draft Word, submit |
| C9 | **After submit** | locked read-only, report number, Word download, request amendment |

C8 reuses `Annex8ReportOverview.tsx` and the existing `validateAnnex8()`
(V01–V11) unchanged.

### 3.2 NMC staff

| # | Screen | Notes |
|---|---|---|
| N1 | **Reports by month** | filters: status, on time / late, licence, province |
| N2 | **Not submitted** | licences with no report for a month — the digest already computes this |
| N3 | **Report detail** | read-only, Word download, audit log |
| N4 | **Accept / Return** | return with comment → `RETURNED`, same report number kept |

### 3.3 Reminders

In-app banners only for now: from the 25th for the current month, and from the
1st to the 7th for the previous month if unsubmitted. **Late is decided by the
server**, never the browser — the existing `isOnTime()` already does this at
submit, and `GET /api/annex8/my-reports` already returns the per-month status
the banner needs.

---

## 4. Delivery order

Matching the brief, each stage ending with a tested run and a report back:

1. **This document.** Awaiting your OK.
2. Migration + access rules (needs the §2.3 decision).
3. Entry lists and forms — add / edit / duplicate / delete / undo.
4. Month-end review, submit, lock, Word download.
5. Amendment and NMC return.
6. NMC screens and reminders.

Nothing will be deployed until you confirm.

---

## 5. Decisions needed before Stage 2

1. **Table names** — extend `annex8_*` (recommended), or rename to the brief's
   names behind compatibility views?
2. **Row Level Security** — option (a), (b) or (c) from §2.3?
3. **Part 6** — keep the `events` JSONB column (recommended), or a
   `report_events` table?
4. **`OPEN` vs `DRAFT`** — add `OPEN` as proposed, or reuse `DRAFT` for a month
   in progress and avoid touching the constraint?
5. **Activity-date filing** — confirm §2.4, that a late-entered August job goes
   to August and prompts an amendment if August is closed.
