# Annex 8 Submission Notifications

Notifications run on the server after a report successfully transitions from
OPEN, DRAFT or RETURNED to SUBMITTED. Saving individual draft entries does not
send a message. A conditional status update prevents concurrent submit requests
from both sending a notification. Returning and resubmitting a report is a new
submission event and sends a new notice.

## Configuration

Use the existing active Telegram bot with purpose Report Group or Both and its
default group chat ID. Environment fallback uses TELEGRAM_REPORT_BOT_TOKEN (or
TELEGRAM_BOT_TOKEN) and TELEGRAM_REPORT_CHAT_ID. The bot must be a member of the
configured group with permission to send messages. The browser cannot supply a
bot token, destination chat, company identity or summary.

No new SQL migration is required: the submission location is stored in the
existing annex8_report_audit_log.new_value JSON for action submit. A subsequent
report/update audit entry records submission_notification as sent,
not_configured or failed, without bot credentials or provider error messages.
Audit visibility remains subject to existing account/licence authorization.

## Location And Consent

The review screen and final submission confirmation explicitly disclose
recording and sharing the device location with the NMC Telegram group.
There is no separate location checkbox: confirming submission automatically
requests one fresh geolocation fix with an eight-second timeout. Browser/OS
location permission is still required and is never bypassed. There is no background
tracking and no IP-location fallback. Permission denial, timeout or unavailable
GPS never prevents submission. Non-captured records never contain coordinates.

Production permits same-origin geolocation through Permissions-Policy;
cross-origin frames remain blocked, and browser/OS permission is still required.
The server validates coordinates, accuracy, consent, source and freshness. This
is browser-reported information, not independent proof of physical presence.
It never overwrites the enterprise's registered business GPS or instrument GPS.

## Delivery Limits

The server awaits one Telegram send attempt with an eight-second timeout.
Telegram failure does not undo the accepted report, and the receipt/toast warns
when delivery was not confirmed. There is no automatic retry/outbox in this
change. A network timeout can leave delivery uncertain; do not resubmit the
report just to resend a message. The audit log records that attempt's outcome.

## Verification

- npm run annex8:notification-check (test doubles only; no real GPS or messages)
- npm run lint
- npm run build
- npm run routing:check (after build)

An owner-approved end-to-end test with a designated test company/report and test
Telegram group is still required to confirm the live bot configuration. Do not
use production report submissions as disposable test fixtures.
