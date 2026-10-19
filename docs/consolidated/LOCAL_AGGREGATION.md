# Approved Local Consolidated Reporting

The owner explicitly approved implementation of database aggregation and local testing on 18 October 2026. This supersedes the earlier aggregation approval checkpoint. Production deployment, production migration application, shared draft/final storage, audited signing and official sequential correspondence numbering remain unapproved/out of scope.

## Root Cause and Fix

The Word button required an existing preview. No aggregation RPC existed, and local MySQL was explicitly rejected by the endpoint, so the preview could never load. Direct Word generation now requests a fresh complete database snapshot automatically. It is disabled only during an active request. Failed authentication, invalid periods, missing schema and data-integrity problems produce a visible error; no sample or stale dataset is substituted.

The owner requested automatic values be hidden. The form now contains only period selection, preparer/reviewer names and positions, actions and proposals. Reference, lunar/civil dates, challenges and conclusion are filled inside Word, not displayed as inputs or generated previews. Stale manual narrative overrides are ignored. The exact template is unchanged.

## Database Implementation

- `aggregationSql.ts`: one read-only SQL statement for PostgreSQL and MySQL. The database performs all source selection, amendment ranking, required licence/month completeness, classification, category/licensee/province totals, expiry counts and seal details. No browser aggregation or 1000-row fetch cap.
- `aggregateResult.ts`: formatting of SQL aggregates into the 235-key template contract. No operational source-entry tally in React or server code. KPI arithmetic combines already-aggregated counts only.
- `supabase_consolidated_preview.sql`: generated PostgreSQL RPC, executable by service_role only; no new company/anonymous access. Existing table RLS remains unchanged. API verifies staff role before calling it. No schema/table/data modifications by this read-only function.
- Local MySQL adapter executes the equivalent single SQL statement against existing tables; no migration or table change is required on the operational local database. Its response truthfully identifies `source: mysql`, not PostgreSQL.
- `source_manifest`, `data_as_of`, definitions version and unavailable fields accompany each preview response. These are not immutable finalized records.

The migration has been applied **only to an isolated in-memory PostgreSQL test database**, not production Supabase. It must be reviewed and applied separately to the intended Supabase environment before online deployment/testing.

## Reporting Definitions

- Active = recorded issue/expiry dates intersect at least one day in the period. Required months are intersecting calendar months, including partial first/last months. Historical renewals/suspensions without preserved records cannot be reconstructed; warning retained.
- Every required report must be SUBMITTED/ACCEPTED for the licensee to count submitted. Missing wins over late; late evidence remains in the detail table. RETURNED/OPEN/DRAFT are not activity contributors.
- Latest eligible version per licence/month wins. Amendments must identify exactly one submitted/accepted/returned original root for that same licence/month; ambiguous or missing roots block generation. First receipt including a returned original determines timeliness, not the latest amendment date. Deadline is the 7th of the following month through 23:59:59 Cambodia time.
- NIL, amendment and returned indicators are overlapping licensee flags, not exclusive submission classifications. NIL with live activity is rejected. A later zero-entry amendment is not silently inferred to be a NIL report.
- M/I/R counts are service/activity records, not necessarily distinct physical instruments. Modules are not full instruments. Soft-deleted rows do not contribute. All eligible activity is retained even if its report falls outside recorded licence validity; such licensees appear in Annex 1 marked not required in the period and do not inflate the active submission denominator.
- Previous period = immediately preceding period of the same type. Current/previous YTD windows each begin January 1 of their respective year. Province totals count installation/repair entries; unrecorded province stays unknown.
- Unknown licence types are not defaulted to manufacture/installation: type breakdowns are unavailable while overall counts remain valid.
- Current mutable verification rows cannot prove historical period-end results or backlog stock. Those metrics remain unavailable, as do unstructured event case counts and incomplete standards/scope history. No invented zero, event count or summed monthly backlog is printed. Future history/audit implementation is separate work.
- Report number remains a stable period reference, not an officially allocated sequential correspondence number. Automatic dates are document-generation dates, not evidence of review or signature.

## Verification

`npm run consolidated:test` runs rendering/date tests and an actual local PostgreSQL/WASM engine with isolated fixture tables. `npm run consolidated:mysql-test` additionally creates a randomly named loopback-only MySQL test database, runs the same fixtures and parity checks, then removes only that test database. Existing operational data is never written by these tests.

Coverage includes empty/unknown data, MONTH/QUARTER/SEMESTER/YEAR windows, year rollover, missing-before-late precedence, late amendment with on-time original receipt, NIL, returned/open exclusion, soft deletion, partial validity, out-of-validity activity, missing type, invalid amendment root, orphan licence, unsupported category, SQL-to-document reconciliation, more than 1050 licensees without truncation, RPC argument validation and denied anon/authenticated execution.

`npm run consolidated:api-check` also verified the running local application against its existing operational data without writes: anonymous 401, company 403, admin/superadmin 200, invalid period 400. April 2026 returned two active licensees and one manufacture, one installation and one repair record. `test-output/Consolidated_LOCAL_DATABASE.docx` is generated from that actual local database response, not the supplied sample JSON.

Browser verification confirmed one-click Word generation without a prior Load, no error alert, Word enabled again after completion, no automatic metadata/narrative inputs and no horizontal page overflow. `test-output/Consolidated_WORD_FIX_UI.png` shows the final form. A development-only PWA cache cleanup in `src/main.tsx` prevents cached Vite chunks from loading inconsistent React instances after restarts; production PWA registration is unchanged, and no report/localStorage data is removed.

Word output layout still requires Microsoft Word review. No commit, push, production SQL or deployment was performed.
