# Consolidated report review checkpoint

This delivery completes independent code preparation. Real PostgreSQL aggregation, database persistence and final snapshots are pending owner approval of `IMPLEMENTATION_PLAN.md`. No migration was created or applied. Nothing was committed, pushed or deployed.

## Files

Copied unchanged from the supplied attachments:

- `public/templates/Consolidated_template_v1.docx`
- `src/lib/consolidated/__fixtures__/consolidated-sample-data.json`
- `docs/consolidated/fill-consolidated.js`
- `docs/consolidated/README_Consolidated_template.md`
- `docs/consolidated/Consolidated_sample_filled.docx`

Created:

- `src/lib/consolidated/periods.ts` — period boundaries, immediately previous period, Khmer period wording, checkboxes, comparison formatting.
- `src/lib/consolidated/contract.ts` — typed 235-key data contract, loop schemas, officer fields and validation.
- `src/lib/consolidated/buildConsolidatedData.ts` — formatting, empty-table/officer-space rules and browser adapter to the future PostgreSQL preview. It does not aggregate source lists in React.
- `src/lib/consolidated/consolidatedDocx.ts` — browser-only template fill/download, integrity check, deterministic safe filenames and delayed URL cleanup.
- `src/lib/consolidated/templateContract.ts` — validation through Docxtemplater's compiled Word tokens, including split runs and nested loops, without XML tag-stripping heuristics.
- `src/components/ConsolidatedReportPage.tsx` — staff period selectors, read-only automatic metadata, officer names/positions, editable automatic narratives with reset, sample review download and preview integration. Real Word requires a complete PostgreSQL preview; draft/finalize remain unavailable until approved persistence exists.
- `src/lib/consolidated/automaticReport.ts` — Cambodia-time dates/lunar date, stable period reference, deterministic challenges/conclusion with evidence and manual overrides.
- `scripts/consolidated-check.ts`, `scripts/consolidated-test.ts`, `scripts/consolidated-automatic-test.ts` — contract, rendering, dates and narrative tests with reproducible fixture documents.
- `docs/consolidated/IMPLEMENTATION_PLAN.md`, this review report.

Modified:

- `src/components/Annex8Portal.tsx` — adds a lazy staff-only consolidated view alongside existing Annex 8 views.
- `server.ts` — adds authenticated staff preview endpoint for the proposed RPC; explicitly refuses company/anonymous access and unavailable aggregation. Also excludes `test-output` from development file watching after a Windows EBUSY crash when a downloaded DOCX was temporarily locked.
- `package.json` — adds `consolidated:check` and `consolidated:test`. Existing exact Docxtemplater 3.47.4 and PizZip 3.1.7 dependencies were reused.

The existing uncommitted `docs/HANDOFF.md` edit and the earlier Search instruments Word/PDF/Excel work were preserved. They are separate from this feature.

## Template integrity

SHA-256 for the original attachment:

`4df153c3cc536823ff776492f7055931ecbc20bcc2291602868ffc26f8a2936a`

SHA-256 for the copied public template:

`4df153c3cc536823ff776492f7055931ecbc20bcc2291602868ffc26f8a2936a`

The built `dist/templates/Consolidated_template_v1.docx` has the same hash. The renderer fills data into a new ZIP; it never changes the template file or constructs the official document layout in code.

## Required owner corrections and approval

1. The owner confirmed on 18 October that the department-head name `បណ្ឌិត  អែម សុភ័ស` is already in the template. That static name is preserved, the redundant input is removed, and only its unused `head_name` contract value is accepted. The supplied expected example still has a dotted signer and therefore is not byte-identical to this template's output.
2. The supplied sample's Section 3 activity total is 565; its Annex 1 activity total is 439. Both the two Annex 1 rows and the category sums are internally consistent, but they cover different example totals. Reconcile the supplied sample data or confirm that the annex is intentionally an excerpt before treating it as a numerical acceptance fixture. Production will need one consistent aggregate population.
3. Review the database objects, missing history, RLS and proposed definitions in `IMPLEMENTATION_PLAN.md`. Missing takes precedence over late, as confirmed by the owner. Partial validity months, timeliness of amendments, NIL/returned flags and event count units still need confirmation before SQL implementation.

## Validation results

| Check | Result | Scope |
| --- | --- | --- |
| Template byte integrity | PASS | Original, public copy and built copy match |
| TypeScript | PASS | `npm run lint` |
| Production build | PASS | `npm run build`; existing chunk warnings remain |
| Existing Annex 8 checks | PASS | `npm run annex8:check`; 161-tag contract and entry rules preserved |
| Consolidated rendering/period checks | PASS | `npm run consolidated:test` |
| Supplied template/data tag contract | PASS with explicit exception | `npm run consolidated:check`; owner-confirmed static head_name is intentionally unused |
| Automatic dates/reference/narratives | PASS | `consolidated-automatic-test.ts`: GMT+7 date rollover, leap day, verified lunar date, stable reference, evidence, unknown/invalid values, reconciliation and officer overrides |
| Split-run and nested-loop tags | PASS | Independent parser fixture; required loop item fields validated |
| All four period types | PASS | Known empty aggregate fixtures; exact dates, leap year, previous-year boundaries and one selected checkbox |
| Zero/unknown and formatting | PASS | Null is unavailable, zero stays zero; Khmer digits and percentage-point changes |
| Empty tables/officer space | PASS | None rows preserve schema; officer rows/dotted space preserved |
| DOCX validity and resolved tags | PASS | ZIP parts valid; no compiled unresolved tags in rendered fixtures |
| Long table | PASS structurally | 80 licence rows rendered; layout stress fixture only, not a production aggregate |
| Category and Annex 1 internal sums | PASS | Supplied sample categories and each annex subtotal match their own rows |
| Cross-section sample reconciliation | FAIL, reported | All six sample Annex 1 metrics differ from Section 3 |
| Exact supplied expected package | DIFFERENT, reported | Seven package parts differ; styles are identical, cover signature text differs |
| Browser Word download | PASS | Real browser template fetch/hash/fill/download, through the staff Annex 8 portal; supplied fixture data only |
| Staff UI | PASS | Initial portal checked at mobile width 390; updated automatic metadata checked in desktop browser with no horizontal overflow. New physical-device testing not performed |
| Server authorization | PASS locally | Anonymous 401; seeded company 403; seeded admin/superadmin 503 while aggregation unavailable; invalid staff period 400 |
| Local server after download | PASS | HTTP 200 after generated DOCX save with test-output watcher exclusion |
| Visual Word/PDF comparison | NOT RUN | Packaged renderer attempted; failed because bundled `soffice.exe` is unavailable. No page count or visual-layout approval claimed |
| PostgreSQL aggregation and RLS | NOT RUN | No approved migration; local MySQL is not production Supabase |
| Missing/NIL/amendment source aggregation | NOT RUN | Fixture formatting does not validate SQL source selection |
| Historical backlog/standards | NOT RUN | Requires approved definitions and sufficient history |
| Persistent drafts/final snapshots/revisions | NOT IMPLEMENTED | Approval checkpoint; no fake save/finalize success |

`test-output/Consolidated_validation.json` contains the machine-readable fixture results and sample discrepancies. No physical-device testing was performed.

Latest automatic-field browser verification: all seven metadata values are present without manual typing; changing MONTH/QUARTER changes the reference; no department-head input remains; sample generation completes without a UI error; unavailable live aggregation leaves narratives and real Word disabled. `test-output/Consolidated_AUTOMATIC_UI.png` records the current desktop layout. Date tests also passed with host timezone `America/Los_Angeles`, independently of the normal Cambodia host timezone.

## Documents for review

- `test-output/Consolidated_SAMPLE_SEMESTER.docx` — original supplied sample JSON filled into the untouched template. Known static-name difference remains.
- `test-output/Consolidated_SAMPLE_AUTOMATIC.docx` — same aggregate fixture with automatic metadata and rule-based narratives; sample mismatches are explicitly flagged, not hidden.
- `test-output/Consolidated_automatic_analysis.json` — reproducible clock, automatic fields, findings and their source-field evidence.
- `test-output/Consolidated_BROWSER_REVIEW.docx` — the browser-generated version of that same sample.
- `test-output/Consolidated_FIXTURE_MONTH_EMPTY.docx`
- `test-output/Consolidated_FIXTURE_QUARTER_EMPTY.docx`
- `test-output/Consolidated_FIXTURE_SEMESTER_EMPTY.docx`
- `test-output/Consolidated_FIXTURE_YEAR_EMPTY.docx`
- `test-output/Consolidated_FIXTURE_80_LICENSEES.docx` — layout stress fixture only.

These are sample/fixture documents, not real consolidated operational reports. No PDF generator was added.

## Manual review

Run `npm run dev` and sign in as NMC staff. The validation server runs at `http://localhost:3004`. Open Annex 8, then របាយការណ៍សរុប, and use the labelled sample Word button. That button now includes automatic metadata and narratives using explicitly labelled sample data. Open it in Microsoft Word and check orientations, tables, Khmer/English text, continuation, headers/footers, static signer and blank decision boxes. Word Save as PDF remains manual.

After the database plan is approved, implement the PostgreSQL RPC, storage/RLS/finalize workflow and database tests. The current API must continue to return unavailable until those objects exist; it must never substitute samples or a partial client-side aggregate. The automatic reference is not an official sequential correspondence number. Review/preparation/signature dates are document-generation dates, not proof that approval occurred. No database change or deployment is authorized by these code-only updates.
