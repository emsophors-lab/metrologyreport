# MLRS on MySQL

A local MySQL database for MLRS, and the adapter that lets the application
use it without changing any of the 202 places that query the database.

This exists for two reasons. The first is development: with a database on
this machine, the Annex 8 entry and submit flow can actually be run, instead
of only typechecked. The second is the move off Supabase — this is the same
work MISTI's own server will need, done once.

---

## Quick start

```powershell
.\scripts\mysql-local.ps1 init     # once: create the data directory
.\scripts\mysql-local.ps1 start
.\scripts\mysql-local.ps1 load     # schema + functions + views
.\scripts\mysql-local.ps1 seed     # one NMC account, one licensed enterprise
.\scripts\mysql-local.ps1 status
```

Then point the server at it, in `.env`:

```
DB_DRIVER=mysql
MYSQL_URL=mysql://root@127.0.0.1:3306/mlrs
ANNEX8_STORAGE_DRIVER=fs
ALLOW_LEGACY_API_HEADER_AUTH=true
VITE_ALLOW_LEGACY_API_HEADER_AUTH=true
```

and `npm run dev`. Verify the adapter whenever either side changes:

```
npm run mysql:check
```

The data directory is `C:\mlrs-mysql\data` — deliberately outside the
repository, so Vite does not watch it, git does not see it, and deleting the
checkout does not delete the database. Nothing is installed as a Windows
service; the server runs only while you have started it.

The demo accounts are in `03_seed.sql`, with their passwords written in the
file. They are for a database that listens on this machine only. Change them
before this reaches anything shared.

---

## The files

| | |
|---|---|
| `01_schema.sql` | every table, as the final state after all `supabase_*.sql` migrations |
| `02_functions_views.sql` | the four routines the app calls through `.rpc()`, and the dashboard view |
| `03_seed.sql` | one NMC account, one enterprise, its licence scope, technicians and standards |
| `../src/db/mysqlClient.ts` | the Supabase query builder, implemented against MySQL |
| `../scripts/mysql-adapter-check.ts` | 31 checks of that adapter against a real database |

`01_schema.sql` is written as the finished schema rather than a replay of the
migrations, because a fresh database has nothing to migrate from.

---

## What had to be re-engineered, not translated

Most of the schema is ordinary SQL and moved unchanged. Six things did not,
and these are the ones worth reviewing.

**1. Partial unique indexes.** PostgreSQL enforces "one open month per
licensee" with

```sql
UNIQUE (licence_no, period_month) WHERE report_type <> 'AMENDMENT' AND status IN ('DRAFT','OPEN')
```

MySQL has no such thing. The rule is rebuilt as a STORED generated column
that is `NULL` when the predicate is false, with a plain unique index on it —
MySQL unique indexes ignore NULLs, so the constraint applies to exactly the
same rows. Three rules, three columns: `uniq_live_key`, `uniq_open_key`,
`uniq_amend_key`. Without these, a second device could open a second month
for one licensee and the entries would split silently between them.

Verified: a second OPEN month for the same licence is refused, and the keys
swap over correctly at submit.

**2. `annex8_next_report_id` is a PROCEDURE, not a function.** MySQL refuses
to create a non-deterministic function that writes unless the server-wide
`log_bin_trust_function_creators` is turned on. Asking MISTI to loosen a
replication safety setting for one counter is the wrong trade. Numbering is
still atomic: the new value is carried out of the UPDATE itself through
`LAST_INSERT_ID(expr)`, so two concurrent submissions cannot collide.

**3. TINYINT(1) is not a boolean.** MySQL returns `0` and `1`. Left alone, a
check as ordinary as `user.is_active !== false` would treat a deactivated
account as active, because `0 !== false`. The adapter converts every
TINYINT(1).

**4. DATETIME is not an ISO string.** The driver returns JS `Date` objects in
the server's local zone; the application expects the ISO strings PostgREST
returns and compares them as text. The adapter returns ISO-8601 UTC for
DATETIME and leaves DATE as `YYYY-MM-DD`. Every connection sets
`time_zone = '+00:00'` and every stored value is UTC.

**5. Article 21 lateness.** `annex8_deadline()` converts with the literal
offset `'+07:00'` rather than the zone name `Asia/Phnom_Penh`, because the
named zone needs MySQL's time-zone tables loaded and a fresh install does not
have them. Cambodia has never observed DST, so the fixed offset is exact.

Verified: September 2026 is due `2026-10-07 16:59:59Z`, which is 23:59:59 in
Phnom Penh; one second later is late.

**6. JSON columns and Khmer.** mysql2's `field.string()` reads a JSON column
as BINARY. Part 6 events and `part2_summary` contain Khmer, and this turned
every character into mojibake. The encoding has to be named explicitly:
`field.string('utf8')`. This was caught by `mysql:check`, not by reading the
code.

---

## What did not come across

**Row Level Security.** No MySQL equivalent, and the application does not
rely on it: every write already goes through the Express API and the browser
no longer reaches the database at all. Access control lives in `server.ts`.

**Supabase Auth.** It is a service, not data. Under `DB_DRIVER=mysql` the
`auth.*` calls return "not available" rather than throwing, so a bearer token
that cannot be verified becomes a clean 401 instead of a 500. Sign-in works
through the server's own PBKDF2 check against the `users` table — which is
already ours and already portable — with the local header auth that
`ALLOW_LEGACY_API_HEADER_AUTH` gates.

**This is the one real gap.** Before MySQL can be used by anyone but a
developer on this machine, the server needs to issue its own signed session
tokens in place of the Supabase one. The password check is already
server-side, so this is a small, self-contained piece of work; it is not
done. See `docs/database-portability.md`.

**Storage.** Licence photos in `src/services/enterpriseLicenseService.ts`
still call `.storage.from()` directly — three call sites that need the same
`ANNEX8_STORAGE_DRIVER=fs` treatment the Annex 8 documents already have.

---

## Moving real data across

Not attempted here, and not trivial: `pg_dump` output is not MySQL input.
The practical route is to export each table from Supabase as CSV and load it
with `LOAD DATA LOCAL INFILE`, in foreign-key order. Two things to watch:

- `TRUE`/`FALSE` become `1`/`0`
- PostgreSQL timestamps carry an offset (`+00`); MySQL DATETIME must receive
  them already in UTC with the offset stripped

Do it on a copy first, and check the Khmer with `CHAR_LENGTH()` rather than
by eye — mojibake and correct text look similar in a terminal.
