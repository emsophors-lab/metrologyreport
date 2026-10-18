# MLRS — handoff

Metrology License Report System, National Metrology Center (NMC), MISTI.
Repository: `C:\github-work\metrology-report-system-github`.
Live: https://metrologyreport.vercel.app/

State as of commit `d15cd18`, 18 October 2026.

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
src/components/Annex8ReportSearch.tsx    report history
src/components/Annex8ReportForm.tsx      the 7-step one-sitting form
server.ts                              every API endpoint
src/supabaseSync.ts                    the browser's data facade — no SQL in it
mysql/                                 the MySQL schema, functions, seed (new)
src/db/mysqlClient.ts                  Supabase query builder over MySQL (new)
```

**The browser never queries the database.** It was routed through `server.ts`
deliberately: the anon key had made password hashes readable and bot tokens
reachable from page memory. Nine tables were reachable; now none are. Keep it
that way — `src/supabaseSync.ts` contains no `.from(` and should not regain any.

Checks that must keep passing:

```
npm run lint          # tsc --noEmit
npm run build
npm run annex8:check  # template hash, DB mapping, 46 entry rules
npm run mysql:check   # 31 adapter checks, needs a local MySQL
```

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

## 5. Delivery stages

| | | |
|---|---|---|
| 1 | Schema and migration | done, migration run by the owner |
| 2 | Entry API | done |
| 3 | Month workspace (record entries) | done, pushed |
| 4 | Review, submit, lock | done, committed |
| 5 | **Amendment + NMC return flow** | **not started** |
| 6 | **NMC staff screens + reminders** | **not started** |

**Stage 5** — amendment copies entries into a new `OPEN` report linked to the
original, leaving the original untouched; NMC Accept, or Return with a comment
→ `RETURNED`, keeping the same `report_no`.

**Stage 6** — NMC screens (reports by month with filters; licences that have
*not* submitted; read-only detail with Word and audit log; Accept/Return), and
reminders (banner from the 25th; banner 1st–7th for the previous month; late
marked after the 7th 23:59 Asia/Phnom_Penh, computed server-side).

After each stage: run the app and test with the sample scenario — three
sessions in one month adding a weighbridge with 8 load cells, an electronic
scale, and a fuel-dispenser repair with a broken seal; then edit one, delete
one, submit, download Word.

---

## 6. Honest status

**Stages 3 and 4 have never been run end to end.** They are typechecked,
built, and every route was probed, but until this session there was no
database on this machine, so no report has actually been opened, filled,
submitted and locked through those endpoints. Two stages of untested work are
stacked, and Stage 5 builds on them again.

**This is now fixable.** A local MySQL database exists (section 7) with a
seeded licensee. The first thing worth doing is running the sample scenario
against it before writing Stage 5.

Also untested: Gotenberg PDF conversion (needs Docker, not installed here).

---

## 7. The local MySQL database (new this session)

MySQL 8.4 running on `127.0.0.1:3306`, data in `C:\mlrs-mysql\data`, outside
the repository. Not a Windows service — it runs only when started.

```powershell
.\scripts\mysql-local.ps1 init    # once
.\scripts\mysql-local.ps1 start
.\scripts\mysql-local.ps1 load    # schema + functions + views
.\scripts\mysql-local.ps1 seed    # demo licensee and accounts
```

`.env`:

```
DB_DRIVER=mysql
MYSQL_URL=mysql://root@127.0.0.1:3306/mlrs
ANNEX8_STORAGE_DRIVER=fs
ALLOW_LEGACY_API_HEADER_AUTH=true
VITE_ALLOW_LEGACY_API_HEADER_AUTH=true
```

Seeded accounts (development only, see `mysql/03_seed.sql`):
`nmcadmin / NmcAdmin#2026` (superadmin), `bokor / Bokor#2026` (company,
licence `LIC-2026-001`).

`src/db/mysqlClient.ts` implements the Supabase query builder against MySQL,
so none of the 202 call sites in `server.ts` changed. `DB_DRIVER` is the only
switch. **Read `mysql/README.md` before changing any of it** — six things were
re-engineered rather than translated:

1. Partial unique indexes became STORED generated columns that are NULL when
   the predicate is false (MySQL unique indexes ignore NULLs). This is what
   stops a licensee opening two months at once.
2. `annex8_next_report_id` is a PROCEDURE, to avoid turning on the server-wide
   `log_bin_trust_function_creators`. Numbering is still atomic.
3. TINYINT(1) is converted to boolean — otherwise `is_active !== false` reads
   a deactivated account as active, because `0 !== false`.
4. DATETIME is returned as an ISO UTC string; DATE stays `YYYY-MM-DD`.
5. `annex8_deadline()` converts with literal `'+07:00'`, because the named
   zone needs MySQL's time-zone tables. Cambodia has no DST, so it is exact.
6. mysql2 reads JSON columns as BINARY, which turned every Khmer character in
   Part 6 into mojibake. `field.string('utf8')` is required.

`npm run mysql:check` runs 31 checks against the real database. It is what
found the Khmer bug. All pass.

**The gap:** the server does not yet issue its own session tokens, so under
`DB_DRIVER=mysql` sign-in works only through the local header auth. The
password check (PBKDF2 against the `users` table) is already server-side, so
this is small and self-contained — but it is not done, and MySQL is not usable
by anyone but a local developer until it is.

---

## 8. Open items

- **Template fix for the owner:** Part 7 uses `{preparer_position}` twice, so
  the legal representative's block prints the preparer's position. A
  `{legal_rep_position}` tag needs adding in Word. The column already exists
  in the schema, both PostgreSQL and MySQL.
- Three `.storage.from()` calls remain in
  `src/services/enterpriseLicenseService.ts` (licence photos) that need the
  same `ANNEX8_STORAGE_DRIVER=fs` treatment.
- `ChangePasswordModal`'s local-hash fallback no longer works in cloud mode;
  a server-side verify endpoint was offered and not yet built.
- Before deploying the digest: run `supabase_annex8_monthly_digest.sql` and
  `supabase_annex8_report_storage.sql`, set `CRON_SECRET` and `GOTENBERG_URL`,
  build the Gotenberg image. Vercel Hobby may reject the monthly cron
  schedule `0 1 8 * *`.
- Migrating real data from Supabase to MySQL is **not** attempted —
  `pg_dump` output is not MySQL input. Notes in `mysql/README.md`.

---

## 9. What changed in this session

- Annex 8 moved to its own top-level tab (`src/components/Annex8Portal.tsx`)
  holding monthly entry, the full form and report history. The legacy monthly
  report page went back to the flat form, the Excel upload and the old tables.
- A local MySQL database: `mysql/01_schema.sql`, `02_functions_views.sql`,
  `03_seed.sql`, `scripts/mysql-local.ps1`.
- `src/db/mysqlClient.ts`, wired into `server.ts` behind `DB_DRIVER`.
- `scripts/mysql-adapter-check.ts`, 31 checks, all passing.
- `mysql2@3.11.5` pinned exactly.
