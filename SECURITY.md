# Security Policy

## Reporting Security Issues

Do not open public GitHub issues for suspected vulnerabilities, exposed credentials, private company data, Telegram bot tokens, Supabase service role keys, AI API keys, or authentication bypasses.

Report issues privately to the system owner or repository administrator with:

- A short description of the issue.
- The affected page, API route, or file path.
- Steps to reproduce, if safe to share.
- Whether any credential, screenshot, report export, or backup may have been exposed.

## Secret Handling

- Store server-only secrets only in the deployment provider environment variables.
- Never commit `.env`, `.env.local`, `.env.production`, logs, backups, generated reports, screenshots containing credentials, or private company data.
- Treat any exposed Supabase service role key, Telegram bot token, AI API key, database password, or admin password as compromised and rotate it immediately.
- Only frontend-safe values may use the `VITE_` prefix.

## Production Security Expectations

- Supabase Row Level Security must be enabled for sensitive tables.
- Company users must only access their own license, report, and Telegram connection records.
- Superadmin-only modules must be enforced by backend policies and API authorization, not only hidden UI buttons.
- Telegram bot tokens and service role output must never be returned to the browser.
- Backups and exports must redact passwords, tokens, API keys, and service keys.

## Local Development

Legacy local/demo authentication helpers must not be enabled in production. If temporary local testing requires legacy API header auth, use non-production data only and disable it before deployment.
