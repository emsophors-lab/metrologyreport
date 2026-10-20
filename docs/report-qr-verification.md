# Report QR Verification

## Rollout

This feature uses two rollout flags. They default to off in new installations;
production was activated on 20 October 2026 after owner approval.

1. Back up the database. Obtain approval before production changes.
2. Supabase uses PostgreSQL: apply `supabase_report_issuances.sql` in its SQL
   editor. Do not run the MySQL script on Supabase.
3. For an existing MySQL installation, apply only
   `mysql/06_report_issuances.sql`. Do not reload or reset the database.
4. Set server `REPORT_QR_ENABLED=true` and frontend
   `VITE_REPORT_QR_ENABLED=true`, then rebuild and restart/deploy.
5. Set server `REPORT_VERIFICATION_ORIGIN` to the canonical HTTPS application
   origin. Local HTTP localhost URLs are accepted only outside production.
6. Generate a test report and scan its QR before enabling for all users.

Both flags must agree. If the frontend flag is enabled without the backend
flag or schema, exports fail clearly instead of silently releasing unregistered
files. Disabling issuance does not disable verification of existing records.

## Coverage

| Report | Output | Source |
| --- | --- | --- |
| Consolidated | Word | Staff-prepared snapshot; sample explicitly draft |
| Saved Annex 8 | Word, PDF, print view | Authorized database report; open reports explicitly draft |
| Working Annex 8 | Word, Excel | Client working state, explicitly draft |
| Overview summary | Word, Excel, PDF | Authorized database aggregation |
| Instrument search | Word, Excel, print/PDF view | Authorized database rows selected by IDs |
| Legacy monthly reports | Word, Excel, print/PDF view | Authorized database rows selected by IDs |
| Data/predictive analytics | Word, PDF, Excel, PowerPoint | Staff-prepared analytical snapshot |
| Monthly Telegram digest | PDF | Database aggregation; text fallback is not a file |

The approved master templates are unchanged. Generated Word outputs put the QR
at the upper right, using the consolidated letterhead's reserved motto column
or a right-aligned flow block for other layouts. PDFs reserve a top band on the
first page and proportionally fit the original first-page content beneath it
without adding an appendix page; later pages are unchanged. Print views put
the QR before the report body. Excel opens on a verification sheet with its QR
at the top right, leaving original data cells and formulas in place.
Presentations put the QR at the top right of their cover slide.
Import templates, backups and account/license screens are not report
exports. License certificates retain their separate license-verification flow.

Already-downloaded files are not retroactively changed. Regenerate them after
rollout. The historical legacy QR verification routes remain available for old
documents; new report QRs use the issuance endpoints below.

## Verification And Limits

Each download gets an independent random 256-bit token. Only its SHA-256 hash is
stored. The final artifact is hashed *after* embedding the QR, and is not
released until the issuance insert succeeds. Arbitrary uploaded files or HTML
cannot be registered by the export API.

`GET /api/report-issuance/check/:token` serves a mobile-friendly public page.
`GET /api/report-issuance/verify/:token` returns only ID, title, kind, format,
company, license, period, timestamp, basis and issuance state. It never returns
private source snapshots, customer details, GPS, contacts or issuer account IDs.
The SQL table has no anon/authenticated grants and uses RLS on Supabase.

A copied QR does not authenticate the surrounding content. The public page
offers an exact-file check: SHA-256 is computed locally in the browser and only
the digest is sent to the server. No report upload occurs. Re-saving a Word
document or printing to PDF changes the bytes. For browser-print paths the
registered artifact is the HTML print view, not the subsequently created PDF.
Use a server-generated PDF when exact PDF-file matching is required. Existing
Gotenberg configuration is still required for official Khmer PDF conversion.

`database` means generated from authorized records, not independently approved.
`staff-prepared` means staff-authored snapshot, not independent database
validation. `draft` must not be treated as an approved submission. Revoked
issuances fail exact-file verification even if their file hash matches.

Revocation currently requires a controlled administrator/database operation on
the specific issuance row; there is no public revoke or edit endpoint. Do not
remove issuance rows in normal operation, because old QR codes depend on them.
Source snapshots are private and require a retention/access policy and backups.

## Checks

`npm run reports:qr-check` tests hashes, tampering, unknown codes, revocation,
failed writes, ownership boundaries, QR decoding and artifact preservation.
`npx tsx scripts/report-issuance-mysql-check.ts` is loopback-only; it reads
existing reports and deletes only its own newly created test issuances.
`npx tsx scripts/report-issuance-api-check.ts` exercises the actual API on a
temporary loopback port and cleans up its own draft issuance. Add `--preview`
to leave the sample verification page open for two minutes for responsive QA.
Run build before lint. No test sends Telegram messages or changes passwords.

Dependency audit still reports existing project vulnerabilities and an ExcelJS
transitive UUID advisory. No general dependency upgrade or forced audit fix is
included in this narrowly scoped feature. Only locally generated workbooks are
loaded by the server sealing path; it does not parse uploaded XLSX files.
