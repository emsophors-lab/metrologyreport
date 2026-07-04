# Metrology License Report System

Digital license, report, dashboard, analytics, export, and Telegram notification system for National Metrology Center workflows.

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill only the values needed for local development.

3. Run the app:

   ```bash
   npm run dev
   ```

4. Validate before deployment:

   ```bash
   npm run lint
   npm run build
   npm audit
   ```

## Deployment Security Checklist

- Keep `.env`, `.env.local`, `.env.production`, backups, generated reports, log files, screenshots with secrets, and private company data out of Git.
- Store `SUPABASE_SERVICE_ROLE_KEY`, Telegram bot tokens, AI API keys, cron secrets, and webhook secrets only in Vercel Environment Variables.
- Use `VITE_` variables only for frontend-safe configuration such as the Supabase URL and public anon key.
- Do not enable `ALLOW_LEGACY_API_HEADER_AUTH` or `VITE_ALLOW_LEGACY_API_HEADER_AUTH` in production.
- Rotate any Supabase service role key, Telegram bot token, AI API key, or password that appears in code, logs, screenshots, browser responses, or Git history.
- Confirm Supabase Row Level Security policies enforce role and company ownership on sensitive tables.
- Confirm backup/export features redact passwords, tokens, API keys, service role keys, and private debug data.
- Confirm Telegram bot settings and tokens are managed server-side and are not visible in browser network responses.

See [SECURITY.md](SECURITY.md) for vulnerability reporting and secret-handling guidance.
