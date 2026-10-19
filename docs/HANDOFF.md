# MLRS — handoff

Metrology License Report System, National Metrology Center (NMC), MISTI.
Repository: `C:\github-work\metrology-report-system-github`.
Live: https://metrologyreport.vercel.app/

State as of commit `d6ee87d`, 19 October 2026, pushed to `origin/main`.

---

## 1. What this system is

Licensed enterprises file a monthly report to NMC — **Annex 8 (A8-2026.2)** —
listing the measuring instruments they manufactured, installed or repaired,
and whether each passed verification. Article 21 makes it due by the 7th of
the following month.

Two generations exist side by side:

- **Legacy** — one flat row per service event. Frozen: still readable,
  tagged `format_version = 'LEGACY-1'`, no longer written.
- **Annex 8** — the real form, Parts 1–7, nine instrument categories,
  25 provinces, validation rules V01–V11.

Stack: React 19 + TypeScript + Vite 6, Express in `server.ts` bundled by
esbuild, PostgreSQL on Supabase, deployed on Vercel.

---

## 2. Rules that are not negotiable

These came from NMC and from the project owner. Breaking any of them produces
an official document that is wrong.

1. **`templates/Annex8_template_v1.docx` is the single source of truth for
   layout, fonts and sizes. Never open, edit, re-save, restyle or regenerate
   it in code.** Copy it as-is.
2. **Do not build the report layout in code.** No docx/jsPDF/html2pdf/HTML-print
   construction of the official report. Code only prepares data for the
   template's tags.
3. If the output looks wrong, **say which tag or section is wrong so the owner
   edits the template** — do not compensate in code.
4. `docxtemplater@3.47.4` and `pizzip@3.1.7`, pinned exactly.
5. **Part 2 totals and `on_time` are always computed server-side or in the
   database, never taken from client input.**
6. Every create, update, delete, submit, return, amend writes to
   `annex8_report_audit_log`.
7. Submitted reports stay readable, marked with their old format/template
   version. Legacy data is **frozen**, not migrated.
8. A company account sees only its own information and data.
9. **Do not deploy without the owner's confirmation.**

### Traps that have already cost time

- **Khmer substring collisions.** `មិនឆ្លង` contains `ឆ្លង`; `ភ្ជាប់` contains
  `ជាប់`; `លិខិតឆ្លងដែន` (passport) contains `ឆ្លង`. Naive string matching
  on these is wrong. ព្រះសីហនុ and ព្រះវិហារ are different provinces.
- **Never use PowerShell string replacement on a file containing Khmer.** Use
  Python with explicit utf-8, or an editor tool.
- Cambodia is UTC+7 with no DST.
- `@types/react` is **not** installed, so React reserved props such as `key`
  must be declared explicitly.
- Pass/fail wording is **ជាប់ / ធ្លាក់**, matching the template. Not any synonym.

---

## 3. Where things are

```
templates/Annex8_template_v1.docx     the official template — never touched by code
public/templates/…                    the copy the browser fetches
src/lib/annex8/annex8Docx.ts           buildAnnex8Data, fillAnnex8Template, download
src/lib/annex8/mapReportToAnnex8.ts    DB row / form state -> template data
src/annex8/entries.ts                  which month an entry belongs to, what a
                                       duplicate copies, which statuses are editable
src/annex8/validation.ts               V01–V11
src/annex8/summary.ts                  computeSummary, deadlines
src/annex8/officialDocument.ts         server-side render + storage driver
src/annex8/monthlyDigest.ts            the Telegram monthly digest
src/components/Annex8Portal.tsx        the Annex 8 tab (new)
src/components/Annex8MonthWorkspace.tsx  incremental entry
src/components/Annex8MonthReview.tsx     review and submit
src/components/Annex8ReportSearch.tsx    instrument search
src/components/Annex8MyReportsTable.tsx  the licensee's register of reports
src/components/Annex8Overview.tsx        cards and charts, role-scoped
src/components/Annex8StaffReview.tsx     NMC's review desk
src/components/Annex8ReportViewer.tsx    one report, read-only, Parts 1-7
src/annex8/staffReport.ts              one aggregation + the Word and Excel
                                       summaries NMC generates
server.ts                              every API endpoint
src/supabaseSync.ts                    the browser's data facade — no SQL in it
mysql/                                 the MySQL schema, functions, seed (new)
src/db/mysqlClient.ts                  Supabase query builder over MySQL (new)
```

**The browser never queries the database.** It was routed through `server.ts`
deliberately: the anon key had made password hashes readable and bot tokens
reachable from page memory. Nine tables were reachable; now none are. Keep it
that way — `src/supabaseSync.ts` contains no `.from(` and should not regain any.

The checks are in section 9.

---

## 4. The Annex 8 workflow, as built

A licensee records work **gradually through the month**, across several
sessions and devices, then reviews, submits and prints.

- Opening a month creates a report with status **`OPEN`**. Each entry is
  saved as its own row immediately — the earlier design kept the whole month
  as one JSONB blob and only created rows at submit, which lost work.
- **The server decides which month an entry belongs to**, from the entry's own
  activity date. A job finished 31 August and typed 2 September is August's.
- Delete is a soft delete (`deleted_at`), which is why the ten-second undo
  survives a page reload.
- Duplicate exists so eight load cells on one weighbridge are not typed eight
  times — but it must never copy a serial number, a label or a verification
  result, or one unit's certificate ends up on another.
- The month list includes **the current month**, because work is recorded
  while the month runs and submitted after it ends. Browsing the list creates
  nothing: starting a month is an explicit button.
- **Carry-over (Art. 17):** an instrument reported earlier as រង់ចាំ gets its
  result recorded in the month the result arrived. It is held against that
  month and written back to the original row only at submit, so a result typed
  and then thought better of cannot rewrite a month already with NMC.

Statuses: `OPEN` → `SUBMITTED` → `ACCEPTED`, or `SUBMITTED` → `RETURNED` →
back to editable. `DRAFT` is legacy.

Three partial unique indexes enforce one report per licence per month, one
open container, one open amendment.

**Submit** re-runs the blocking rules server-side against what is actually
stored — the disabled button is a convenience, not the gate — recomputes
Part 2 into `part2_summary`, gets lateness from `annex8_is_on_time()` in the
database, allocates the receipt number only if not already held, and renders
the official document. A render failure never fails an accepted submission.

`stateFromMonth()` in `src/annex8/entries.ts` reshapes stored rows back into
`Annex8State`, so the **existing V01–V11 validator judges the row-based
month** rather than a second set of rules drifting from the first.

---

## 5. The screens

Annex 8 has its own top-level tab, separate from the legacy monthly report.
Inside it, what you see depends on who you are — decided by the server, not by
the page.

**A licensed company** gets three cards:

| | |
|---|---|
| ទិដ្ឋភាពរួម | its own cards and charts |
| បំពេញប្រចាំខែ | the form: Part 1, 3, 3ក, 4, 5, carry-over, then review and submit |
| ប្រវត្តិរបាយការណ៍ | its register of filed reports, and instrument search |

**NMC staff** (admin, superadmin) get four:

| | |
|---|---|
| ទិដ្ឋភាពរួម | the overview across every licensee, or narrowed to one |
| របាយការណ៍សហគ្រាស | the review desk — search, read, print, accept, return, delete |
| ប្រវត្តិរបាយការណ៍ | instrument search across licensees |
| របាយការណ៍សរុប | consolidated monthly/quarterly/half-year/annual (other agent's) |

**They do not get the entry form.** Their account carries the Centre's own
licence number, so the form invited filing an Annex 8 against NMC itself —
which is exactly how empty reports under `NMC-SA-2026` appeared during
testing.

### The review desk

`Annex8StaffReview.tsx` + `GET /api/annex8/staff-reports`. Filters: month,
year, enterprise, status, free text over report numbers, serials, instruments
and customers. Only FILED reports are listed — a month still being filled in
has not been reported to anyone.

Per report: **view** (the full viewer below), **print** the official Word,
**accept**, **return** with a required comment, **delete** with a required
reason.

### The report viewer

`Annex8ReportViewer.tsx` + `GET /api/annex8/reports/:id/full`. One report laid
out in the annex's own order — Part 1, Part 2 computed with its balance, Parts
3, 3ក, 4, 5, carry-over, Part 6's six questions, Part 7's declaration and both
signatories — with the NMC block on top.

Accept and return sit at the BOTTOM, after the content, so the decision
follows the reading. Before this, the only way to read a report was to
download the Word and open it elsewhere, which is how reports get accepted
unread.

It renders the STORED ROWS. It is not a second rendering of the official
document: the Word button fetches the template-filled file. Both are driven by
the same rows, so what is read is what prints.

A licensee gets the same viewer for its own reports, with no decision buttons.

There was a third entry mode, a 7-step "Full form". It is gone. Two ways to
write the same annex meant two code paths, and they had drifted: the one-shot
path jumped straight to `SUBMITTED` and wrote no audit entries at all.

## 6. Who can see what

The rule from NMC: **admin and superadmin see every licensee; a company sees
only its own.**

Scope is resolved once, in `resolveOverviewScope()` in `server.ts`, from the
**signed-in user**. A licence in the query string can only narrow it, never
widen it. A company passing another licence is refused rather than quietly
given its own, because silently substituting would hide a broken client.

```
npm run annex8:scope
```

29 checks against a running server: a company is refused another licence on
the overview, the register, the pending list, a month and both file exports;
two companies cannot see each other; an unauthenticated caller gets 401; staff
narrowing to one licensee see exactly what that licensee sees.

The seed carries **two** licensees on purpose. With one, "every company" and
"my company" look identical on screen, and a scoping mistake would not surface
until there were real enterprises in the database.

## 7. Two different documents

Do not confuse these. They are downloaded from different places and named
differently so that nobody does.

| | Official Annex 8 | NMC summary |
|---|---|---|
| Comes from | `templates/Annex8_template_v1.docx` | built in code |
| Covers | one licensee, one month | one licensee or all |
| Route | `/api/reports/:id/annex8.docx` | `/api/annex8/export` |
| File name | `Annex8_LIC-…_2026-09_NMC-RPT-…` | `Annex8_NMC_Summary_…` |
| Layout in code | **never** | yes — it has no prescribed form |

The summary comes in Excel (7 sheets), Word (NMC letterhead, and a line saying
it is not the official annex) and PDF — the Word file through LibreOffice, the
same Gotenberg path the annex uses, rather than a second PDF engine with its
own opinions about Khmer.

Screen, Word and Excel all read one aggregation, `collectOverview()` in
`src/annex8/staffReport.ts`. Three separate counts would eventually disagree,
and a figure on screen that differs from the figure in the file sent to the
Ministry is a discrepancy nobody can explain afterwards.

## 8. Delivery stages

| | | |
|---|---|---|
| 1 | Schema and migration | done, migration run |
| 2 | Entry API | done |
| 3 | Month workspace | done |
| 4 | Review, submit, lock | done |
| 5 | Carry-over (Art. 17) | **done** |
| 5b | NMC return flow (accept / return / delete / correct) | **done** |
| 6a | NMC review screens: search, read, print, audit trail | **done** |
| 6b | **Reminders** | **not started** |
| 5c | **Amendment flow** | **not started** |

**Still to build — 6b, reminders.** Banner for the licensee from the 25th;
banner 1st–7th for the previous month; late marked after the 7th 23:59
Asia/Phnom_Penh, computed server-side. `annex8_is_on_time()` already exists in
the database and is what submit uses, so the rule is settled — this is the
surfacing of it.

**Still to build — 5c, amendments.** `report_type = 'AMENDMENT'`,
`original_report_id` and a partial unique index for one open amendment per
licence per month all exist in the schema already. What is missing is the
flow: copy a submitted report's entries into a new `OPEN` amendment linked to
the original, leave the original untouched, and submit it as a correction
rather than a replacement.

### What NMC can do to a report, and the rules behind it

- **Accept** → `ACCEPTED`. NMC's confirmation that it is correct.
- **Return** → `RETURNED`, comment required. "Rejected" with no reason is not
  something a licensee can act on, and the comment is what they are shown.
  **The receipt number is kept** — one month's return must not acquire two
  numbers.
- **Correct in place** — staff may edit entries of a `SUBMITTED` report,
  audited with their role so an NMC change is distinguishable from the
  licensee's. **`ACCEPTED` is locked for everyone, including NMC**: editing
  what you have already signed off is how a record stops meaning anything.
  Return it first.
- **Delete** — reason required; refuses an `ACCEPTED` report; writes the whole
  report plus its counts to the audit log **before** the rows go, in that
  order, so a failure leaves a harmless extra audit row rather than a report
  that vanished without trace. The audit table has no foreign key to the
  report for exactly this case.

## 9. Checks

```
npm run lint              # tsc --noEmit
npm run build
npm run annex8:check      # template hash, DB mapping, 46 entry rules
npm run mysql:check       # adapter against a real database
npm run annex8:scenario   # the full filing scenario
npm run annex8:carry-over # Article 17, end to end
npm run annex8:scope      # who can see what
npm run annex8:review     # the NMC review desk, end to end
```

The last five need a database and a running server. Locally that means
`.\scripts\mysql-local.ps1 start` and `DB_DRIVER=mysql` in `.env`.

They take `MLRS_BASE` (default `http://localhost:3000`), because there is
often more than one dev server against this database.

`npm run mysql:check` additionally requires `MYSQL_ADAPTER_TEST_URL` pointing
at a disposable loopback `mlrs_adapter_test_*` database. It deletes fixture
months, and it refuses to touch the operational one.

**`tsx server.ts` does not reload server code.** Any time an endpoint is added
or changed, a server already running keeps answering `API route not found`
until it is restarted. That has caused a bug report once already.

`annex8:scenario` is the one that matters most: three sessions in one month
adding a weighbridge with eight load cells, an electronic scale and a sealed
fuel-dispenser repair, then edit, delete, undo, submit, download Word. It
checks the printed document against the stored rows — the deleted load cell
must not appear — and that a submitted month refuses further entries.

## 10. The local MySQL database

MySQL 8.4 on `127.0.0.1:3306`, data in `C:\mlrs-mysql\data`, outside the
repository. Not a Windows service — it runs only when started.

```powershell
.\scripts\mysql-local.ps1 init    # once
.\scripts\mysql-local.ps1 start
.\scripts\mysql-local.ps1 load    # schema + functions + views
.\scripts\mysql-local.ps1 seed    # two licensees and the staff accounts
```

`.env`:

```
DB_DRIVER=mysql
MYSQL_URL=mysql://root@127.0.0.1:3306/mlrs
ANNEX8_STORAGE_DRIVER=fs
ALLOW_LEGACY_API_HEADER_AUTH=true
VITE_ALLOW_LEGACY_API_HEADER_AUTH=true
```

Development accounts, matching `INITIAL_USERS` in `src/demoData.ts` so the
local login resolves to rows that exist: `superadmin/admin123`,
`admin/admin123`, `company01/LIC001`, `company02/LIC001`.

`src/db/mysqlClient.ts` implements the Supabase query builder against MySQL,
so none of the 200-odd call sites in `server.ts` changed. **Read
`mysql/README.md` before touching it** — seven things were re-engineered
rather than translated, and each was silent when wrong:

1. Partial unique indexes became STORED generated columns that are NULL when
   the predicate is false. This is what stops a licensee opening two months at
   once.
2. `annex8_next_report_id` is a PROCEDURE, to avoid loosening the server-wide
   `log_bin_trust_function_creators`. Numbering is still atomic.
3. TINYINT(1) is converted to boolean — otherwise `is_active !== false` reads
   a deactivated account as active, because `0 !== false`.
4. DATETIME is returned as an ISO UTC string; DATE stays `YYYY-MM-DD`.
5. ISO instants written by the server are converted on the way in; MySQL
   rejects that format outright.
6. `annex8_deadline()` converts with the literal `'+07:00'`, because the named
   zone needs MySQL's time-zone tables. Cambodia has no DST, so it is exact.
7. The adapter asks the database which ids it generates itself. It used to
   mint a UUID for every insert, which `annex8_report_audit_log` rejects
   because its id is `BIGINT AUTO_INCREMENT`.

## 11. Honest status

**Working, and run end to end against a real database:** open a month, add
entries across several sessions, edit, delete with undo, carry-over, review,
submit, lock, download the official Word; the overview for both roles; the
Excel and Word summaries; and NMC's review desk — search, read the report in
full, print, accept, return, correct in place, delete with the audit trail
surviving.

One check worth keeping: the official Word NMC prints is compared
**byte-for-byte** with the licensee's download. The regulator and the
enterprise looking at different paper would be worse than either having none.

**Written but never executed:**

- **PDF conversion**, both the official annex's and the summary's. Both go
  through Gotenberg, and this machine has no Docker, so `GOTENBERG_URL` is
  unset and the route answers 503 with instructions.
- **The monthly Telegram digest**, for the same reason plus `CRON_SECRET`.
- **Supabase Auth sign-in**, since local development uses the header auth.
- **The consolidated report** (the other agent's work, `d6ee87d`). It
  typechecks and builds — that is all I verified before pushing it. Its four
  check scripts have not been run by me.

**The one real gap in the MySQL work:** the server does not yet issue its own
session tokens, so under `DB_DRIVER=mysql` sign-in works only through the
local header auth. The password check (PBKDF2 against `users`) is already
server-side, so this is small and self-contained — but it is not done, and
MySQL is not usable by anyone but a local developer until it is.

## 12. Open items

- **Template fix, for the project owner:** Part 7 uses `{preparer_position}`
  twice, so the legal representative's signature block prints the preparer's
  position. A `{legal_rep_position}` tag needs adding in Word. The column
  exists in both schemas already.
- Three `.storage.from()` calls remain in
  `src/services/enterpriseLicenseService.ts` (licence photos) needing the same
  `ANNEX8_STORAGE_DRIVER=fs` treatment.
- `ChangePasswordModal`'s local-hash fallback no longer works in cloud mode; a
  server-side verify endpoint was offered and not built.
- Before the digest can run: `supabase_annex8_monthly_digest.sql` and
  `supabase_annex8_report_storage.sql` on Supabase, `CRON_SECRET` and
  `GOTENBERG_URL` set, Gotenberg image built. Vercel Hobby may reject the
  monthly cron schedule `0 1 8 * *`.
- Migrating real data Supabase → MySQL is **not** attempted; `pg_dump` output
  is not MySQL input. Notes in `mysql/README.md`.
- **Two agents share this checkout.** A second agent has been building the
  consolidated report in the same working tree throughout. `3805b20` bundles
  three of its files under a commit message that does not mention them —
  pushed, so it stands. `d6ee87d` is the rest of its work, committed
  deliberately and labelled as not mine.

  Consequences worth knowing:
  - **Never `git add -A` here.** Stage explicit paths. That is how `3805b20`
    happened.
  - Both agents edit `server.ts`. Small targeted edits only; re-read before
    editing anything whose surroundings matter.
  - **Give the next agent its own git worktree.** This has cost real time.

## 13. If you are picking this up

Read sections 2 and 7 first — the template rules and the two-documents
distinction are the two things that are expensive to get wrong.

Then, in order:

1. Start the database and a server:
   `.\scripts\mysql-local.ps1 start`, then `npm run dev` with
   `DB_DRIVER=mysql` in `.env`.
2. Run `npm run annex8:scenario` and `npm run annex8:review`. Between them
   they exercise most of the system, and watching them pass is the fastest way
   to understand what it does.
3. Sign in as `company01/LIC001` and as `superadmin/admin123` and look at both
   sides of the Annex 8 tab.

The next pieces of work are **6b reminders** and **5c amendments**, both
described in section 8. The schema already carries what each one needs, so
neither starts with a migration.

Two standing instructions from the project owner that outlive any one task:
**never modify the template or build the official report's layout in code**,
and **do not deploy without confirmation** — note that pushing to `main`
deploys to production via Vercel.
