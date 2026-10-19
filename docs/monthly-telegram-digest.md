# Monthly Telegram Digest Controls

Location: Superadmin > License Registry > Telegram Bot Settings >
Monthly Telegram digest. This is separate from the per-submission notification.

## Existing Configuration

The panel displays the active Report Group/Both bot and default group chat ID
from existing server-side bot settings. Configure Bot/Group opens the existing
bot editor. No new settings table, migration, password or token reset is needed.

The schedule remains the existing deployment configuration: day 8 at 08:00
Asia/Phnom_Penh, cron `0 1 8 * *` in UTC. It reports on the previous calendar
month, after the Article 21 deadline on day 7. This release displays the fixed
schedule; it does not add arbitrary schedule editing or a separate enable switch.

Automatic delivery requires a production Vercel deployment, a CRON_SECRET
environment variable, a configured active report-group bot/group, and the
existing monthly_report_digest_logs table. The panel shows missing prerequisites
instead of claiming automation is active. It cannot verify provider-side cron
enablement or that a bot has permission to post without a real send.

Vercel cron uses GET with a secret Authorization header. Public GET requests are
rejected, and cron cannot force a resend or select an arbitrary period. Manual
staff actions use POST. Company users cannot read the settings or invoke delivery.

## Preview And Delivery

Preview reads the selected month without Telegram calls, PDF conversion or log
writes. Send Now confirms the period, recipient group and disclosure of company
compliance information. Its expected recipient is rechecked against server
settings before sending. The browser never receives bot tokens or CRON_SECRET.

Existing Sent records skip a repeat send unless Allow Resend is explicitly
selected and confirmed. A missing/unreadable delivery log blocks sending. If
delivery was attempted but its log could not be saved, the panel reports that
uncertainty; check the group before resending. The existing log guard is not an
atomic distributed delivery claim: exactly-once delivery across overlapping
serverless workers is not guaranteed by this release.

PDF output uses the existing Gotenberg converter; without it, text messages are
sent. Report collection is paginated. OPEN/DRAFT reports do not count as filed;
submitted/returned/accepted receipts do. Totals use the same active licensee
population as the compliance figures. The displayed deadline is day 7 of the
following month, including year rollover.

## Checks

- `npm run annex8:digest-check`: pure calculations, over 1000 companies, message
  limits, deadline/month boundaries and delivery guard checks.
- `npm run build`, then `npm run routing:check`: actual bundled entry point,
  nested settings route and cron authorization/rejected force parameters.
- `npm run annex8:digest-api-check`: loopback-only existing local MySQL reads,
  role isolation, actual preview, unchanged delivery log. Does not request sends.
- Local browser: settings visibility, missing prerequisites, native month control
  and April preview were checked. No real Telegram messages were sent.

Production deployment and a real group send require owner approval. No production
environment variable or SQL migration is applied by these checks.
