# Evidence-Based Executive Briefing

The pure TypeScript engine in `src/ml/narrative.ts` produces a versioned
`executive_briefing` object from `AuditData`, with an overall headline, summary,
supervised findings, unsupervised findings, 3-5 prioritized actions and exact
report/instrument targets. Identical evidence yields identical output.

## Domain Boundaries

Current models predict enterprise reporting/inspection-priority proxy risk, not
physical instrument failure. Reports do not supply measured-error/MPE time series,
drift velocities, manufacturer causal effects, or environmental feature
importances. The engine explicitly withholds these conclusions. It never invents
recalibration reductions, failure prevention percentages or thermal diagnoses.

Risk counts deduplicate enterprises; anomaly counts deduplicate report IDs.
Enterprise scores repeated beside several instrument rows are not counted as
separate enterprise predictions. Four-eyes review is Critical only when an actual
outlier score exceeds 85/100 and submission time is within the prior 30 days,
not future-dated. Other outliers/high-priority risk produce evidence-review
recommendations. Numeric cluster names never become invented diagnostic labels.

Historical on-time reporting changes use percentage-point differences between
the latest two populated reporting months, explicitly not future forecasts.
Top standardized departures are not treated as causal feature importances.
Cold-start, missing metrics and empty scopes are stated plainly, not represented
as zero measured error or a stable calibration profile.

## Offline And Privacy

The repository has an optional Gemini dependency/environment example, but local
inspection found no configured Gemini/OpenAI/Anthropic API key. This engine makes
no LLM or external network calls, even if a key is added later. There is no
unvalidated prose-polishing path that could alter numbers or disclose reports.
Optional bilingual/LLM extensions are not enabled by this change.

## Shared Integration

- Staff-only `GET /api/analytics/ml-insights` accepts the same date, organization,
  instrument, risk and search filters as audit exports and returns briefing,
  model version, scope, generation time and evidence fingerprint. QR activation
  is not required to preview a briefing. Existing database/model permissions apply.
- Smart Analytics shares the audit-export scope with its top briefing section.
  Requests are debounced, canceled on scope/user changes and keyed against stale
  responses. Copy Briefing has a selectable-text fallback. View evidence expands
  exact report IDs, instrument IDs, serials and licences with ten rows per page;
  it does not pretend to open a nonexistent instrument route.
- PDF page one contains the summary and prioritized recommendations directly
  after KPIs. Supporting findings follow with existing pagination/QR safeguards.
- Workbook tab one includes the same summary/findings/recommendations. Four-sheet
  layout, numeric formatting, chart images, QR and original Unicode remain intact.
- Registered export snapshots store the briefing alongside the source evidence;
  API and export share one generator, not separately written summaries. Existing
  review and export controls remain available; the earlier hardcoded summary is
  replaced to avoid contradictory claims.

## Verification

```powershell
npm run ml:narrative-check
npm run ml:export-check
npm run build
npm run lint
```

Unit cases cover duplicate counts, severe/recent versus stale/future anomalies,
zero anomalies, high proxy risk, unsupported physical drift inputs, missing
metrics, cold start and empty data. Disposable loopback MySQL API tests verify
staff permissions, shared filters, API/export narrative consistency and workbook
content. PDF render/extraction checks confirm recommendations remain on page one.
No production SQL, operational report changes, Telegram messages or LLM calls
are required for this implementation.
