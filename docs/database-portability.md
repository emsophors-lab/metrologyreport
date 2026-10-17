# Moving the MLRS database from Supabase to MISTI's internal server

The goal: host the same database on MISTI's own PostgreSQL server instead of
Supabase, without rewriting the application.

**The short answer.** The *data* is already portable — 29 tables across 13
`supabase_*.sql` files, all ordinary PostgreSQL. What is tied to Supabase is
not the schema but three services around it: authentication, file storage, and
the browser's direct database access. Those are **8 call sites in the
application code and 3 constructs in the SQL**, listed below.

This was checked against the code, not assumed.

---

## 1. What is already portable

| | |
|---|---|
| Tables, columns, constraints, indexes | standard PostgreSQL — move unchanged |
| `gen_random_uuid()` | built into PostgreSQL 13+; on older servers `CREATE EXTENSION pgcrypto` |
| Row Level Security, `CREATE POLICY` | a PostgreSQL feature, not a Supabase one |
| All Annex 8 tables | no Supabase-specific construct at all |
| `annex8_next_report_id()` | plain PL/pgSQL |

A plain `pg_dump` / `pg_restore` moves every table, with the three exceptions
below.

## 2. What is tied to Supabase

### 2.1 Authentication — the largest piece

| Where | What |
|---|---|
| `supabase_schema.sql:27` | `profiles.id` is a foreign key to `auth.users(id)` |
| `supabase_schema.sql:229` | a trigger on `auth.users` creates a profile row |
| `supabase_schema.sql` ×12 | RLS policies calling `auth.uid()` |
| `server.ts` ×2 | `supabaseAdmin.auth.getUser(token)` |
| `server.ts` ×3 | `auth.admin.createUser` / `updateUserById` / `listUsers` |

`auth.users` and `auth.uid()` are the GoTrue service, which does not exist on a
plain PostgreSQL server.

**This is less work than it looks.** The application does not actually rely on
those legacy RLS policies: they reference a `profiles` table the app no longer
maintains, which is why report writes already go through the service role in
`server.ts` instead of the browser. The real sign-in path is the `users` table
with PBKDF2 hashes verified by `verifyUserPasswordServer()` — already ours, and
already portable. Supabase Auth is used on top of that only to mint a session
token the API can verify.

**Plan:** replace the Supabase session token with a signed token the server
issues itself (the password check is already server-side), then drop the
`auth.*` policies and the `auth.users` foreign key. The `users` table is
untouched.

### 2.2 File storage

| Where | What |
|---|---|
| `src/annex8/officialDocument.ts` | official Annex 8 DOCX/PDF |
| `src/services/enterpriseLicenseService.ts` ×3 | licence attachments and photos |
| `supabase_annex8_report_storage.sql` | `storage.buckets`, `storage.objects` |

**Already done for Annex 8.** `officialDocument.ts` takes
`ANNEX8_STORAGE_DRIVER`:

```bash
ANNEX8_STORAGE_DRIVER=supabase          # default, how it runs today
ANNEX8_STORAGE_DRIVER=fs                # a directory on the server
ANNEX8_STORAGE_DIR=/srv/mlrs/annex8     # where, for the fs driver
```

Both drivers take and return the same object path, so the column values in
`annex8_reports.official_docx_path` stay valid either way; moving means copying
the bucket's files to that directory. Paths are checked so a stored value can
never read outside the store.

`supabase_annex8_report_storage.sql` detects a non-Supabase database and skips
the bucket block with a notice, so it runs on both.

**Still to do:** the same treatment for licence attachments in
`enterpriseLicenseService.ts` (3 call sites).

### 2.3 The browser talking to the database directly

`src/supabaseClient.ts`, used by `src/App.tsx`, `src/supabaseSync.ts`,
`src/services/*`, and `DeveloperConsole.tsx`.

supabase-js speaks to PostgREST, not to PostgreSQL. A self-hosted server has no
PostgREST unless one is installed.

**Two options:**

1. **Route the remaining reads through `server.ts`.** The writes already go
   this way. The frontend then talks only to our own API and knows nothing
   about the database. More work up front, but it ends the dependency for good
   and is the direction the code has been moving in anyway.
2. **Install PostgREST next to the internal PostgreSQL.** supabase-js keeps
   working against it with a changed URL. Much less code to change, but it
   keeps PostgREST and its RLS-based permission model in the picture.

Option 1 is the recommendation: it is the only one that leaves MISTI with a
plain PostgreSQL server and no extra service to operate.

---

## 3. Suggested order

1. **Now** — keep new work portable. Annex 8 already is.
2. Give licence attachments the same storage driver as Annex 8 (§2.2).
3. Move the remaining browser reads behind `server.ts` (§2.3, option 1).
4. Replace the Supabase session token with a server-issued one (§2.1).
5. Drop the `auth.*` policies and the `auth.users` foreign key; squash the 13
   SQL files into one ordered schema for the new server.
6. Rehearse: `pg_dump` from Supabase → restore into an internal PostgreSQL →
   run the application against it with `ANNEX8_STORAGE_DRIVER=fs`.

Steps 1–2 change nothing about how the system runs today. Steps 3–5 can each be
done and deployed on their own while still on Supabase, so the switch itself
becomes a change of connection string rather than a migration day.

## 4. What MISTI's server needs

- PostgreSQL 13 or newer (14+ preferred), with `pgcrypto` if on 13.
- A backup schedule — Supabase does this today; a self-hosted server will not.
- A directory for stored documents, included in those backups.
- TLS between the application and the database if they are on different hosts.
- For the official PDF, Gotenberg with the Khmer fonts
  (`docker/gotenberg.Dockerfile`) — independent of this move.
