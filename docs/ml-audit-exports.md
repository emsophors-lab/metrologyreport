# Smart Analytics Audit Exports

## Implementation

- `src/ml/auditService.ts`: accepted evidence collection, validated filters,
  current active-model inference, scope KPIs and registered issuance.
- `src/ml/auditRender.ts`: in-memory jsPDF and ExcelJS renderers. Existing NMC
  logo and blue/gold branding; no approved master templates are changed.
- `src/components/MlAuditExportControls.tsx`: staff-only audit export scope and
  downloads in the Smart Analytics header. Existing dashboard exports remain.

## API

Staff authentication is required for both GET routes:

```text
/api/analytics/export/pdf
/api/analytics/export/excel
```

Optional query parameters: `from`, `to` (valid YYYY-MM-DD), `instrument_type`,
`organization_id`, `risk_level` (Low/Medium/High/Critical), `q`.
Dates are inclusive submission-date boundaries in GMT+7. Instrument type is a
case-insensitive substring of the stored category/instrument name. Organization
matches the licence registry ID, company ID or company-user ID. Search uses
normalized Unicode and covers textual row fields. Unknown or malformed filters
return 400. No client-supplied predictions or training metrics are accepted.

The existing dashboard dates pass into exports; the other controls explicitly
scope audit exports only, without silently changing existing charts. Filters are
recorded in each artifact. PDF is limited to 500 selected instrument/report rows;
Excel to 10,000. Larger requests return 413 rather than silently omitting evidence.

Responses have the correct MIME type, attachment filename, `Cache-Control:
no-store`, and `X-NMC-Issuance-ID`. Files are buffers, not server-disk exports.

## Provenance And Truthful Interpretation

Only ACCEPTED Annex 8 monthly reports and their instrument/repair records are
exported. Drafts and returned reports are excluded. Data comes from the same
server feature builder as the ML lifecycle. Global enterprise-context features
are calculated before export-scope filters, so changing an export date does not
silently alter model feature definitions or calibration.

The current supervised target is enterprise inspection-priority proxy risk, not
instrument pass/fail or physical failure probability. IsolationForest scores and
KMeans assignments are also enterprise-level. They are shown beside related
instrument rows with that limitation stated explicitly. KPIs deduplicate report
and enterprise identifiers; instrument rows may share the same enterprise score.
Largest standardized feature departure is descriptive, not causal attribution.

The schema does not contain measured-error/MPE time series, validated physical
drift forecasts or recalibration-interval labels. These fields remain N/A. The
line chart displays actual on-time reporting compliance, never a fabricated
measurement-tolerance curve or future compliance forecast.

Newly trained models include a fitted two-dimensional scikit-learn PCA projection
of the standardized enterprise feature matrix. Older models without this
projection show an unavailable chart until retrained. No random scatter points
or proxy laboratory measurements are invented. Missing models produce explicit
cold-start metadata and unavailable scores, not synthetic accuracy.

## Formats

PDF includes official NMC branding, a top-right registered QR, provenance,
KPIs, reporting history, PCA, anomaly distribution, paginated evidence tables,
model metrics, source fingerprint, page numbering and reviewer sign-off.
It uses English/reference IDs; unsupported Unicode text is clearly marked,
while original Unicode names remain intact in Excel.

Excel contains exactly:

1. `Executive_Summary_&_Metadata`
2. `Supervised_Predictions`
3. `Unsupervised_Anomalies` (all selected records, score-ranked)
4. `Cluster_Profiles` (standardized feature centroids)

The first sheet holds the top QR and embedded server-rendered PNG charts.
Tables have frozen headers, filters, widths, wrapped text, numeric formats,
risk highlighting and print settings. External text is stored as literal
strings, never executable formulas. No fifth verification worksheet is added.

## Activation And Verification

Requires existing report issuance setup and `REPORT_QR_ENABLED=true`.
Every download is registered before release, with an artifact SHA-256 and
private source snapshot. QR verification exposes only the existing basic
issuance metadata. Exports fail closed if issuance cannot be saved.

Trained scores require the approved ML lifecycle migration, an active model,
and `ML_LIFECYCLE_ENABLED=true`. Otherwise cold-start exports remain available.
No new export-specific SQL migration or production data change is needed.
Vercel includes the official logo and Jimp chart font assets explicitly.

```powershell
npm run ml:export-check
npm run build
npm run lint
```

The automated API test creates and removes a disposable loopback MySQL database.
It checks permissions, both file formats, four worksheet names, charts, QR scan,
exact-file verification, filters, pagination, empty/cold-start outputs, literal
formula-like strings and QR-disabled failure. It never changes the existing
`mlrs` database or sends Telegram messages. Test PDFs/workbooks under ignored
`test-output/ml-audit` contain synthetic evidence only.
