# Background ML Lifecycle

## Inspection

- `server.ts`: `POST /api/reports` saves legacy rows and spreadsheet imports;
  `POST /api/annex8/month/submit` submits monthly reports;
  `POST /api/annex8/reports/:id/review` accepts/returns them.
- Existing training was browser-session logistic calibration in
  `src/services/mlModelRegistry.ts`. Existing unsupervised groups were rules,
  not IsolationForest. There was no persistent ML background task mechanism.
- Existing Vercel cron routes handle reminders/digests, not CPU training.

## Data And Quality

The worker trains RandomForest, IsolationForest and standardized KMeans using
scikit-learn in a separate Python process. It reads only staff-accepted Annex 8
reports, never drafts, returned reports or client-writable legacy approval flags.
Accepted instrument/repair child rows supply equipment diversity and service
counts without multiplying monthly submission observations. Training and live
inference use the same server feature builder and accepted evidence.
Legacy saves/imports signal reconciliation, but do not become trusted labels.
Legacy records need staff review/migration into accepted monthly reports before
entering this dataset. No historical operational records are changed automatically.

One feature observation per enterprise avoids duplicate enterprise leakage across
three stratified CV folds. At least 20 enterprises and three examples in each
class are required. The existing inspection-priority labels are derived rules,
NOT independent inspection outcomes. F1/accuracy measure proxy-rule agreement;
they must not be described as inspection accuracy. CV on successive datasets is
not a fixed benchmark; use a curated inspection-labelled holdout before relying
on this for enforcement. Predictions remain advisory.

Promotion requires finite metrics, F1 >= 0.5, positive silhouette, no singleton
clusters and anomaly stability >= 0.8. Stability includes independent forest seeds
and, when available, mean absolute score differences from the champion on the
same current observations. F1 must be within 0.02 of the champion, unless accepted
report count grows by more than 20%; growth NEVER bypasses the safety floors.

## Enablement (Not Applied To Production)

1. Apply `supabase_ml_lifecycle.sql` to PostgreSQL OR
   `mysql_ml_lifecycle.sql` to MySQL after reviewing/approving the migration.
   The singleton stores the current/previous portable models and CAS revision.
   PostgreSQL denies anon/authenticated access; only server/worker service role
   can access it. Never expose service credentials through VITE variables.
2. Set `ML_LIFECYCLE_ENABLED=true` on API and worker. Leave it unset/false until
   schema and worker are available. Existing baseline remains available.
3. On a persistent worker host (NOT inside a Vercel request):

   ```powershell
   python -m venv .venv-ml
   .\.venv-ml\Scripts\python -m pip install -r ml/requirements.txt
   $env:ML_PYTHON = (Resolve-Path '.venv-ml/Scripts/python.exe').Path
   npm run ml:worker
   ```

   Linux: set `ML_PYTHON` to the venv Python executable. Run from repository root,
   under systemd/container supervision. Supply DB_DRIVER/MYSQL_URL or
   VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY using the host secret manager.
   Use persistent, private `ML_MODEL_DIR` storage. Vercel itself does not provide
   this persistent Python worker. No new Vercel cron is needed.
4. Set `ML_MODEL_DIR` (default `var/ml-models`),
   `ML_RETRAIN_REPORT_THRESHOLD=25`, `ML_ANOMALY_SPIKE_RATIO=0.3`,
   `ML_DRIFT_MIN_REPORTS=10`, `ML_RETRAIN_COOLDOWN_MS=21600000` as appropriate.
   `npm run ml:worker -- --once` performs one finite reconciliation.

## Safety And Operation

- Hooks await only a small durable signal write, not training. Failures never
  undo report submission. A 30-second worker scan recovers missed/direct-DB events.
- New accepted UUIDs since the active snapshot count toward the volume threshold.
  Drift scores companies with newly accepted reports and weights their anomalies
  by new-report count, with a minimum sample count and cooldown. Corrections or
  withdrawn approvals trigger cooldown-limited reconciliation even without new
  UUIDs. No automatic repeated training for an evaluated fingerprint.
- CAS revision + 120-second lease + 30-second heartbeat coordinate workers.
  Token fencing stops expired workers publishing. Training times out at ten
  minutes and is single-thread bounded. Database loss fails closed.
- Version directories contain supervised/unsupervised joblib backups and JSON
  metadata. Never load untrusted joblib files. Inference uses portable JSON trees,
  not pickle. Database active/previous snapshots are canonical across Vercel
  instances; `active_metadata.json` is atomically replaced on the worker's disk.
  A restarted worker reconciles the local pointer from the database.
  The worker rechecks the evidence fingerprint before publication; if submissions
  or approvals changed during training, it retains the champion and queues a
  fresh snapshot instead of publishing a stale challenger.
- The browser fetches the active immutable snapshot from staff-only model health
  along with current server-engineered accepted-report features, and swaps its
  reference between inference calls. Trained inference does not use date-filtered
  legacy records: dashboard date filters still apply to legacy charts/exports,
  but trained risk scores use current accepted evidence. Existing requests keep their
  current snapshot; no model is trained during the request or browser render.
- `POST /api/analytics/retrain` requires admin/superadmin and returns 202. Duplicate
  manual requests coalesce. Requests arriving during training survive completion.
- `POST /api/analytics/rollback` restores the prior champion when no worker holds
  the lease. Failed/rejected training retains the current champion automatically.
- Model Health reports worker heartbeat, accepted pending count, training metrics,
  errors, and proxy-label provenance. An offline worker is visible, not disguised
  as a successful queued training run.
- Keep worker disk private: artifacts contain operational feature distributions.
  Retain at least active/previous versions; archive older version directories
  under your organization's retention policy. No automatic destructive cleanup.

## Checks

```powershell
$env:ML_PYTHON = (Resolve-Path '.venv-ml/Scripts/python.exe').Path
npm run ml:lifecycle-check
npx tsx scripts/ml-mysql-lock-check.ts
npm run build
npm run lint
```

The automated test uses isolated PGlite PostgreSQL, simulated accepted report
batches, real scikit-learn, CAS races, rejected/growth challenger gates, stale
lease fencing, failure recovery, backups and `active_metadata.json`. It does not
change real reports, accounts, passwords or Telegram messages.
