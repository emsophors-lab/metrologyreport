# Consolidated report inspection and database approval plan

Current status: the owner approved aggregation implementation and local testing on 18 October 2026. The read-only PostgreSQL RPC migration has been generated and tested in an isolated local engine; the equivalent MySQL SQL statement supports the actual local application. No production SQL has been applied. Shared drafts, final snapshots, history additions and official sequential numbering remain pending. See `LOCAL_AGGREGATION.md` for the implemented definitions, tests and limitations; the proposal below is retained as design context.

## Automatic fields approved on 18 October 2026

The owner confirmed that the department-head name is already printed in the official template. Keep that template byte-for-byte unchanged; `head_name` remains an intentionally unused sample-contract field, not a rendering blocker. No editable department-head field is shown.

The browser now generates a stable reference `NMC-CONS-{type}-{period-key}` and Cambodia civil/lunar signing, preparation and review dates using one generation timestamp. This reference is not an issued official correspondence sequence. A shared, unique official sequence still needs an approved database allocation design. The dates are proposed document dates, not evidence of actual signing or review; actual approval actor/time belong to future audited storage.

The owner also authorized automatic challenges and conclusion. Deterministic rules consume the complete PostgreSQL aggregate contract, retain field-level evidence, distinguish missing from late, use period-end backlog stock, and flag unavailable/inconsistent data. They do not aggregate partial browser source rows, call an LLM, assert physical-instrument counts, invent causes, or claim completed follow-up. Officer narrative edits persist during refresh within the same period and can be reset to the algorithm. Changing periods clears those overrides. Actions/proposals remain officer-authored.

## Source mapping

| Section | Required data | Existing source | Missing fields or definition | Proposed solution |
| --- | --- | --- | --- | --- |
| Cover memo | Period, licence counts, submission/activity indicators, signer | `enterprise_licenses`, Annex 8 reports/entries, automatic fields | Official correspondence sequence pending approval | Stable period reference and Cambodia dates; preserve static head in template |
| 1.1 Indicators | Current/previous counts, rates, backlog, complaints, expiry | Licence issue/expiry dates; report status/time; instruments, repairs, events | Historical validity, backlog history, structured complaint case counts | Database aggregation; null plus availability reason where not reconstructable |
| 2 Submission | Distinct active licensees, required months, on-time/late/missing, licence type | `annex8_reports`, `annex8_licence_profiles`, `enterprise_licenses` | Historical changes to licence validity/type; NIL/returned counting details | Required licence-month matrix; classify from all required months |
| 2.1 Late/missing | Licence details, each missing/late month, follow-up | Same records | Follow-up action | Derived list plus officer input; preserve overlap evidence |
| 3.1 Categories | Manufacture, installation, repair, results, YTD | `annex8_report_instruments`, `annex8_report_repairs` | Version selection must distinguish content from first receipt | Eligible report view, root/version provenance, never aggregate browser rows |
| 3.2 Provinces | Installed/repair counts, categories | Activity `province`, `category` | Blank/noncanonical province labels | Explicit unknown bucket; no invented location |
| 4 Verification | Results at period end, failed details, seals, backlog movement | Verification fields, carry-over updates, audit log, repair seal fields | Historical status before audit coverage, structured failure cause/action | Append-only verification events; unavailable historic results remain null |
| 5 Events/standards | Six event counts/details, expired/due standards, expiry/scope | `events` JSON; registered standards and Part 5 changes; licence scope | Yes/no is not a case count; no complete calibration/scope history | Explicit count unit approval; history for future reconstruction |
| 6 Actions/proposals | Officer-written rows | No consolidated storage exists in checked migrations | All officer inputs | Approved `consolidated_reports.officer_inputs` |
| 7 Conclusion | Aggregate-based narrative with officer review | Complete validated preview aggregate | No source when preview is unavailable | Deterministic evidence-based rules; manual overrides preserved |
| Annex 1 | Same licensee/activity population and metrics as sections 2/3 | Licences, report headers and entry rows | Same historical/version gaps | One SQL aggregate shared with section totals; no independent tally |
| Preparation/review | Names, positions, signing/review dates | Officer names/positions; Cambodia generation date | Actual review/signature events not yet stored | Automatic document dates; authenticated approval events stored separately in future |

## Confirmed and proposed reporting definitions

- **Confirmed by owner:** missing takes precedence over late in Section 2. A licence with missing and late months is counted as missing, while the late months remain in the detail list. For fully submitted licensees, at least one late month means late; otherwise on time.
- Activity eligibility follows the supplied README: only `SUBMITTED` and `ACCEPTED`; `OPEN`, `DRAFT`, and `RETURNED` do not contribute activity. The existing overview currently includes `RETURNED`; this new feature must not reuse that aggregation unmodified.
- Proposed required months: each calendar month intersecting at least one valid day of the licence, within the selected period. Confirm whether partial first/last months must be reported. Missing issue/expiry dates make eligibility unknown, rather than excluding the enterprise silently.
- Proposed content selection: latest eligible report per licence/month, ordered by submission time with an ID tie-breaker; validate original/amendment links and refuse ambiguous roots. Never add original and amendment entries together. Preserve the original first receipt separately for timeliness; an on-time original should not become late only because a later amendment was filed. Confirm this policy.
- Proposed NIL metric: number of distinct licensees with at least one eligible NIL month; it overlaps submitted. Amendment metric: licensees with an eligible replacement; returned metric: licensees with a returned monthly version. These are flags, not mutually exclusive submission classes. Confirm these definitions before SQL implementation.
- A report missing by the selected period end may still be within its following-month deadline. Historical activity and submission completeness require a documented `data_as_of` cutoff; proposed activity attribution uses report period, with receipts through the recorded data cutoff, while verification/backlog uses the selected end date. Unelapsed deadlines must be marked not-yet-due in details, not described as late.
- Backlog is a stock at period end, not the sum of monthly pending snapshots. Cleared/new/over-30 require dated verification transitions and stable source-entry identity. Current carry-over submission mutates original rows in `server.ts`; these mutable rows alone cannot reconstruct a historical stock. Audit logs help only where the full chain exists.
- Registered standards have current state; Part 5 contains monthly changes, not a guaranteed complete inventory. Count distinct standard IDs, not repeated monthly rows, and flag periods without reliable inventory history.
- The six Part 6 fields record yes/no and free-text details. A YES can establish a reporting enterprise-month, not the number of complaints/incidents. Case counts remain unavailable until a structured case count/identifier exists or the owner approves a different unit.
- Licence classification comes from `annex8_licence_profiles.licence_type` (`MANUF_INSTALL` / `REPAIR`). No default classification for missing profiles. Modules are not additional complete instruments. Repairs are service entries; the same serial can have multiple repair events. Do not assert equality of physical instrument counts and service-event counts.
- Verification rates require a chosen population: proposed results on eligible activity rows; pending/backlog tracks source rows historically. The sample category identity is internally balanced, but that does not prove a physical-instrument balance across periods.
- Relative changes use the previous period of the same type, rate differences use percentage points, and a zero previous value prints `ថ្មី`. Unknown values remain unknown; genuine zero remains 0.

## Proposed database objects requiring approval

These are design proposals, not executable migrations.

1. `mlrs_consolidated_preview(p_period_type text, p_year integer, p_index integer) returns jsonb` — PostgreSQL RPC. Validates arguments; establishes a database-clock cutoff; reads complete datasets in one transaction; computes current, immediately previous and YTD metrics; returns all template data plus warnings, source IDs/versions, availability and definitions version. Never returns source row lists for React to aggregate. No implicit row limits.
2. Internal views/CTEs `consolidated_eligible_reports`, `consolidated_licence_months`, `consolidated_activity` — deterministic amendment selection, validity overlap, licence classification, required-month completeness and soft-delete exclusion. Views are internal to the RPC or security-invoker views without public grants. Reuse the existing source tables and date/deadline functions.
3. `consolidated_reports` — `id uuid`, `period_type`, `period_key`, `officer_inputs jsonb`, `data_snapshot jsonb`, `source_manifest jsonb`, `definitions_version`, `template_sha256`, `snapshot_sha256`, `data_as_of timestamptz`, `generated_at/by`, `status DRAFT|FINAL`, `created_at/by`, `updated_at/by`, `finalized_at/by`, `revision_of uuid`, and an optimistic-lock revision number. Validate period keys. Final records require the full snapshot and provenance. Later authorized revisions create new rows linked to the previous final, never overwrite it.
4. Append-only `consolidated_report_audit_log` — report ID, action, actor, time, revision and snapshot hashes. Finalize RPC locks the draft, recomputes/revalidates data in one transaction, records officer inputs and provenance, then freezes the snapshot. A database trigger rejects update/delete of FINAL rows and updates of their snapshots. Draft refresh changes calculated data only and preserves officer inputs. Reprints read the stored snapshot, never refresh source totals.
5. Historical coverage, if complete backlog and historic licence/standard indicators are required: append-only `annex8_verification_history` with source entry/report IDs, effective date, recorded time, old/new status and certificate; version history for licence validity/type/scope and registered standards. Link future writes atomically to history. Existing audit/renewal data may be reused only after a completeness audit. Initial baselines must be labelled as baselines, not fabricated past events.
6. Structured event cases or counts if the required unit is actual cases. A yes/no report must never be silently converted into one case.

## Access control proposal

- Enable RLS on every new consolidated table; no `anon` access and no company policies. Match the project's authenticated user mapping to `users.role IN ('admin','superadmin')` using server-verified identity. Do not use role values from request bodies or editable JWT user metadata.
- Staff SELECT on permitted drafts/finals; staff writes through controlled RPCs only. Proposed finalization permission: superadmin, with admin preparing drafts; owner to confirm. No client UPDATE/DELETE policy on finals or audit rows.
- Use security-invoker RPCs and RLS where feasible. Any SECURITY DEFINER helper must have a fixed search path, explicit staff checks, restricted EXECUTE grants and verified actor identity. Do not trust a caller-supplied actor ID.
- The current code-only API enforces staff authorization before returning its unavailable response or attempting the future preview RPC. It grants no new table access. No RLS policy has been applied.
- Do not route MySQL through a partial browser aggregate. A MySQL version of this feature requires a separately approved database plan.

## Cannot reconstruct reliably from the current rows alone

Past pending/over-30 stocks before reliable event/audit coverage; deleted or overwritten source versions; historical renewals/suspensions/scope/type when not retained; expired standard inventory before complete calibration history; complaint/incident case counts from free text; failure causes/actions never recorded. These must print unavailable with a warning until evidence exists.

## Template and supplied sample conflicts

- The compiled template has 234 top-level keys; the supplied JSON contract has 235. `{head_name}` is absent. The owner confirmed the static name on 18 October; `consolidated:check` allows only this specific unused value and continues to reject other mismatches. No template edit is required or made.
- At the cover signature, the supplied template literally prints `បណ្ឌិត  អែម សុភ័ស`; the supplied filled example instead prints a dotted name line. The exact template remains authoritative. The browser sample now includes automatic dates/reference/analysis; the original baseline fixture is also retained for comparison. Real Word generation is available only after a valid complete PostgreSQL preview is returned.
- Sample section 3 totals: 412 manufacture + 96 installation + 57 repair = 565. Supplied Annex 1 contains 380 + 14 + 45 = 439. The Annex 1 totals match its two example rows but not section 3; this is reported as a sample-data discrepancy, never corrected by altering the official template.
- Sample cover `signed_month_kh` is July and period is semester 1, while one seal example says September. It is only sample text, not evidence for real data or a valid historic cutoff.
- The copied CommonJS reference file retains its original bytes. This repository is ESM; run it with a CommonJS loader or a `.cjs` copy outside the source file. The browser uses its separate TypeScript renderer and never imports this reference script.

## Approval checkpoint

Approve the schema/RPC/RLS plan and the proposed definitions above before any migration file is created. Review the automatic sample Word; the static department head is accepted and the template remains untouched. Code-only rendering, period tests and preview UI can be reviewed independently. Live aggregation, persistent drafts, finalization and reprinting frozen snapshots are not implemented or claimed as tested at this checkpoint.
