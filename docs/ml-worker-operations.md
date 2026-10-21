# ML Worker Operations

## Activation Checkpoint: 2026-10-21

- Production Supabase project `krbpahxhhpzinpmyslfh`: additive lifecycle migration
  applied through the authenticated SQL Editor. Verified RLS enabled,
  anon/authenticated SELECT denied and service_role UPDATE allowed.
- Local MySQL: additive migration applied without changing operational records.
- Local `.env`: lifecycle enabled, existing private Python environment selected.
- Windows task `MLRS-Local-ML-Worker`: installed for the current user, starts at
  login, ignores duplicate starts and retries process failures after one minute.
- Verified live worker heartbeat, no errors and `not_due` outcome. The local
  dataset had three accepted reports from one enterprise; no model was promoted.
- Production worker on the owner's computer: separate private Supabase profile,
  with Windows DPAPI-encrypted credential for this Windows user. The independently
  revocable Supabase secret key is named `mlrs_desktop_retraining`. No key is stored
  in Git, a VITE variable, command-line arguments or application local `.env`.
- Production supervisor starts at user login and restarts worker failures after
  60 seconds. It is separate from the local MySQL worker. It runs only while the
  computer is awake, online and signed in. This avoids a new hosting subscription,
  but consumes normal existing Supabase API quotas and local computer resources.
- Production source had zero ACCEPTED reports when connected. No report was
  approved automatically and no training model was manufactured to change this.
- Production Vercel `ML_LIFECYCLE_ENABLED=true` was configured after verifying
  the production connection and worker heartbeat. Deployment verification is
  Ready for deployment `CJCoog2Dc2m5gWPo1hqtWTvX8Wy5` (existing source `7c52d94`).
- Controlled production worker termination verified the supervisor starts a new
  child after 60 seconds, followed by a fresh database heartbeat and no training
  error. A second supervisor invocation exits without starting a duplicate.
- Lifecycle regression checks and TypeScript validation passed. Staff dashboard
  visual verification requires the owner to sign in; no session was fabricated.

## Local Controls

Run from the repository root in PowerShell 7:

```powershell
npm run ml:local-status
.\scripts\ml-worker-windows.ps1 status
.\scripts\ml-worker-windows.ps1 stop
.\scripts\ml-worker-windows.ps1 install
```

`install` registers/starts the task without administrator credentials. To remove
automatic startup use `uninstall`; model files and database records are retained.
Logs: `var/ml-worker.log`. Artifacts: `var/ml-models`. Both are Git-ignored.
The local app must be restarted after changing `.env`. MySQL must be running.
The task cannot train while the laptop is asleep, powered off or signed out.
It is development supervision, not an always-on production service.

## No-New-Hosting-Cost Production Controls

The production profile does not use local MySQL. Run these commands in the repo:

```powershell
.\scripts\ml-worker-windows.ps1 check -Profile production
.\scripts\ml-worker-windows.ps1 status -Profile production
.\scripts\ml-worker-windows.ps1 stop -Profile production
.\scripts\ml-worker-windows.ps1 install -Profile production
.\scripts\ml-worker-windows.ps1 uninstall -Profile production
```

Private configuration, encrypted credential, logs and model backups are under
`%LOCALAPPDATA%/MLRS/production-ml`, with inherited access removed and access
limited to the owner and SYSTEM. The DPAPI credential is tied to this Windows
user and machine; copying the encrypted file to another host is not provisioning.
The login shortcut is `MLRS Production Retraining.lnk` in this user's Startup
folder. Task Scheduler was not retained for production because unattended launches
failed on this machine; the verified direct Node supervisor is used instead.
`supervisor.lock` avoids duplicate supervisors and the database lease fences
duplicate trainers. Logs rotate to bounded `.previous` files.

`uninstall` removes startup and stops the supervised processes but intentionally
preserves private artifacts. To revoke database access, delete only the dedicated
`mlrs_desktop_retraining` key in Supabase API Keys. Do not revoke the application's
existing default or Vercel keys. Never move the worker credential into the browser.

Reports continue submitting while the computer is offline. New eligible reports
are picked up when it reconnects; volume, drift, quality and diversity gates still
apply. The dashboard reports an offline worker after its heartbeat expires. A
fully always-on service would require a separate host later; this setup does not
claim 24/7 availability or guarantee that existing free quotas cannot be exceeded.

## Production Host

Use an authorized persistent Linux host with Node 20+, Python 3.11+ and enough
RAM for scikit-learn. Vercel request functions are not this worker host.
No new hosting subscription is purchased by these scripts.

1. Deploy the trusted repository revision to `/opt/mlrs`, install its Node
   dependencies including `tsx`, and create `/opt/mlrs/.venv-ml`. Install
   `ml/requirements.txt` into that environment.
2. Create a dedicated `mlrs` service account and `/var/lib/mlrs-models`, owned by
   that account with mode 0700. Do not give the service account login privileges.
3. Copy `deploy/ml-worker.env.example` to `/etc/mlrs/ml-worker.env`, root-owned
   with mode 0600. Supply the existing Supabase project URL and server service
   key through the host secret manager. Never expose it as a VITE variable,
   GitHub file, browser session value or log message. Do not copy the local
   MySQL URL into this production environment.
4. Install `deploy/mlrs-ml-worker.service` under `/etc/systemd/system/`. Adjust
   the Node path if it is not `/usr/bin/node`. Run `systemctl daemon-reload`
   and `systemctl enable --now mlrs-ml-worker` with host administrator access.
5. Confirm `systemctl status mlrs-ml-worker` and its journal show successful
   cycles. Check `payload.workerSeenAt` in the private lifecycle row is recent
   and no `lastError` is present. Do not lower training thresholds merely to
   obtain an Active badge on a small dataset.
6. Only after heartbeat verification, set production Vercel
   `ML_LIFECYCLE_ENABLED=true` and redeploy. Use identical threshold settings on
   API and worker. Check Smart Analytics Model Health as an authorized staff
   user: enabled, worker online, truthful pending report counts.

## Safety And Recovery

The 25-report volume threshold does not bypass the minimum 20-enterprise and
class-diversity requirements, quality gates or concurrency lease. No approvals
are manufactured to bootstrap a model. Insufficient evidence stays at baseline.
The API retains the active champion if a training attempt fails or is rejected.
Back up private model artifacts and database state under organizational policy.

To pause production training, stop the worker service; do not delete its state.
To disable the API controls as well, set `ML_LIFECYCLE_ENABLED=false` and redeploy.
Use the staff rollback endpoint to restore an existing previous champion when
the worker has released its lease. Never edit model JSON by hand.
