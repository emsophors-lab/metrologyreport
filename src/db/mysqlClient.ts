/**
 * MySQL behind the Supabase query builder.
 *
 * server.ts speaks to the database in exactly one dialect — the PostgREST
 * builder that @supabase/supabase-js exposes:
 *
 *     supabaseAdmin.from('annex8_reports').select('*').eq('licence_no', x).maybeSingle()
 *
 * There are 202 of those call sites. Rewriting them all to SQL would be a
 * large change to code that is working, reviewed and in production, and it
 * would have to be done twice — once for MySQL now, once more if MISTI picks
 * something else later. So the dialect stays and the backend moves: this
 * module implements the subset of that builder the application actually uses,
 * against MySQL, and `supabaseAdmin` points at it when DB_DRIVER=mysql.
 *
 * The subset is not a guess — it is every method server.ts calls:
 *
 *     select insert update upsert delete
 *     eq neq in is not or ilike gte lte gt lt
 *     order limit range single maybeSingle
 *     rpc
 *
 * Anything outside it throws by name rather than returning a quietly wrong
 * answer, because a silently ignored filter on this database means one
 * licensee reading another's reports.
 *
 * FOUR THINGS BEHAVE DIFFERENTLY FROM POSTGREST, and all four are handled
 * here rather than left for a caller to discover:
 *
 *  1. MySQL has no RETURNING. `.insert(...).select()` is served by generating
 *     the row id here, before the insert, and reading those ids back. A row
 *     whose table has no `id` column cannot be read back, and asking for it
 *     is an error instead of an empty array.
 *
 *  2. TINYINT(1) comes back as 0 and 1, not false and true. Left alone, a
 *     check as ordinary as `user.is_active !== false` would treat a
 *     deactivated account as active. Every TINYINT(1) is converted.
 *
 *  3. DATETIME comes back as a JS Date in the server's local zone. The
 *     application expects the ISO strings PostgREST returns, and compares
 *     them as text. Every DATETIME is returned as an ISO-8601 UTC string, and
 *     DATE stays 'YYYY-MM-DD' as PostgREST gives it.
 *
 *  4. `.ilike()` has no MySQL equivalent, but the database's collation
 *     (utf8mb4_0900_ai_ci) makes LIKE case-insensitive already, so LIKE is
 *     the correct translation, not an approximation.
 *
 * NOT IMPLEMENTED, deliberately: `.auth`. Supabase Auth is a separate service
 * and does not come with the data. Calls to it throw a message saying so.
 * Sign-in under this driver uses the server's own password verification
 * (verifyUserPasswordServer, which reads the `users` table through this
 * module), with the local header auth that ALLOW_LEGACY_API_HEADER_AUTH
 * already gates. Issuing signed session tokens server-side is the next step
 * and is tracked in docs/database-portability.md.
 */
import crypto from 'crypto';
import mysql from 'mysql2/promise';
import { consolidatedAggregationSql } from '../lib/consolidated/aggregationSql';
import { reportingPeriod } from '../lib/consolidated/periods';
import type { PeriodType } from '../lib/consolidated/periods';

export interface MysqlResult<T = any> {
  data: T;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

type Filter =
  | { kind: 'cmp'; column: string; op: string; value: any }
  | { kind: 'in'; column: string; values: any[] }
  | { kind: 'null'; column: string; negate: boolean }
  | { kind: 'raw'; sql: string; params: any[] };

/** Tables whose primary key is not `id`, so an insert cannot be read back by one. */
const COMPOSITE_KEYS: Record<string, string[]> = {
  annex8_report_drafts: ['licence_no', 'period_month'],
  annex8_report_counters: ['period_month'],
};

/**
 * Whether a table's `id` is one WE generate, or one MySQL generates.
 *
 * Most tables here use CHAR(36) ids that PostgREST would have defaulted and
 * that we must supply ourselves to read an insert back. But
 * annex8_report_audit_log uses BIGINT AUTO_INCREMENT, and pushing a UUID into
 * it fails — which is how the audit log quietly recorded nothing at all.
 *
 * Asked of the database rather than kept as a list here, because a list is
 * one schema change away from being wrong, and being wrong is silent.
 */
const idKind = new Map<string, 'client' | 'auto' | 'none'>();

async function idKindOf(pool: mysql.Pool, table: string): Promise<'client' | 'auto' | 'none'> {
  const cached = idKind.get(table);
  if (cached) return cached;
  const [rows] = await pool.query(
    `SELECT EXTRA FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'id'`,
    [table],
  );
  const row = (rows as any[])[0];
  const kind: 'client' | 'auto' | 'none' = !row
    ? 'none'
    : String(row.EXTRA || '').includes('auto_increment') ? 'auto' : 'client';
  idKind.set(table, kind);
  return kind;
}

/** Reserved words among our column names; everything is quoted anyway. */
const q = (ident: string) => '`' + String(ident).replace(/`/g, '``') + '`';

/**
 * mysql2 hands back driver-shaped values. PostgREST-shaped values are what the
 * application reads, so the conversion happens once, here, for every query.
 */
function typeCast(field: any, next: () => any): any {
  // TINYINT(1) is the boolean. See note 2 above — this one is load-bearing.
  if (field.type === 'TINY' && field.length === 1) {
    const raw = field.string();
    return raw === null ? null : raw === '1';
  }
  if (field.type === 'DATETIME' || field.type === 'TIMESTAMP') {
    const raw = field.string();
    if (!raw) return null;
    // Stored UTC (every connection sets time_zone = '+00:00').
    return new Date(raw.replace(' ', 'T') + 'Z').toISOString();
  }
  if (field.type === 'DATE' || field.type === 'NEWDATE') {
    return field.string();          // 'YYYY-MM-DD', as PostgREST returns it
  }
  if (field.type === 'JSON') {
    // field.string() with no argument reads a JSON column as BINARY, which
    // turns every Khmer character in Part 6 and part2_summary into mojibake.
    // The encoding has to be named.
    const raw = field.string('utf8');
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return next();
}

/**
 * An ISO-8601 instant, which is what the application writes into timestamp
 * columns: '2026-10-18T06:07:49.085Z'. Plain '2026-10-05' is NOT matched —
 * that is a DATE and MySQL takes it as it is.
 */
const ISO_INSTANT = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,3})\d*)?(Z|[+-]\d{2}:?\d{2})$/;

/** Values going the other way: objects become JSON, instants become DATETIME. */
function toParam(value: any): any {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return mysqlDateTime(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && ISO_INSTANT.test(value)) {
    // MySQL rejects the 'T' and the trailing zone outright, so an ISO string
    // has to be converted — and converted to UTC, since that is what every
    // column in this database holds and what typeCast reads back.
    return mysqlDateTime(new Date(value));
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function mysqlDateTime(date: Date): string {
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

/**
 * PostgREST's `.or()` takes its filters as one string:
 *     'serial_no.ilike.%x%,instrument_name.ilike.%x%'
 * Only the operators the application uses in an or() are accepted; an
 * unrecognised one is an error, never a filter that silently matches
 * everything.
 */
function parseOr(expression: string): { sql: string; params: any[] } {
  const parts: string[] = [];
  const params: any[] = [];
  // Split on commas that are not inside parentheses.
  for (const clause of expression.split(/,(?![^(]*\))/)) {
    const m = /^([a-zA-Z0-9_]+)\.(eq|neq|ilike|like|gt|gte|lt|lte|is)\.(.*)$/.exec(clause.trim());
    if (!m) throw new Error(`mysqlClient: cannot parse or() clause "${clause}"`);
    const [, column, op, rawValue] = m;
    const value = rawValue.replace(/\\([%_,()])/g, '$1');
    switch (op) {
      case 'eq':  parts.push(`${q(column)} = ?`);    params.push(value); break;
      case 'neq': parts.push(`${q(column)} <> ?`);   params.push(value); break;
      case 'gt':  parts.push(`${q(column)} > ?`);    params.push(value); break;
      case 'gte': parts.push(`${q(column)} >= ?`);   params.push(value); break;
      case 'lt':  parts.push(`${q(column)} < ?`);    params.push(value); break;
      case 'lte': parts.push(`${q(column)} <= ?`);   params.push(value); break;
      case 'like':
      case 'ilike': parts.push(`${q(column)} LIKE ?`); params.push(value); break;
      case 'is':  parts.push(value === 'null' ? `${q(column)} IS NULL` : `${q(column)} = ?`);
                  if (value !== 'null') params.push(value); break;
    }
  }
  return { sql: `(${parts.join(' OR ')})`, params };
}

class QueryBuilder implements PromiseLike<MysqlResult> {
  private filters: Filter[] = [];
  private orderBy: Array<{ column: string; asc: boolean }> = [];
  private limitN: number | null = null;
  private offsetN = 0;
  private mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: any = null;
  private onConflict: string[] = [];
  private wantRows = false;          // a .select() was chained onto a write
  private rowMode: 'many' | 'single' | 'maybe' = 'many';
  private insertedKeys: Array<Record<string, any>> = [];

  constructor(private pool: mysql.Pool, private table: string) {}

  /* ---------------- shaping ---------------- */

  select(_columns?: string): this {
    // Column lists are accepted and ignored: PostgREST uses them to shape the
    // response, and every caller here either passes '*' or a list of plain
    // columns. Embedded resources ('a(b)') are not used anywhere in server.ts
    // and are refused rather than silently returning the whole row.
    // The refusal is recorded and raised when the query runs, not thrown from
    // here: every caller in server.ts reads `{ data, error }`, and a throw out
    // of the builder would crash the request instead of being handled.
    if (_columns && /\(/.test(_columns)) {
      this.unsupported = `mysqlClient: embedded select "${_columns}" is not supported`;
    }
    if (this.mode === 'select') this.selectColumns = _columns && _columns !== '*' ? _columns : '*';
    else this.wantRows = true;
    return this;
  }
  private selectColumns = '*';
  private unsupported: string | null = null;

  insert(values: any): this { this.mode = 'insert'; this.payload = values; return this; }
  update(values: any): this { this.mode = 'update'; this.payload = values; return this; }
  delete(): this { this.mode = 'delete'; return this; }

  upsert(values: any, options?: { onConflict?: string }): this {
    this.mode = 'upsert';
    this.payload = values;
    this.onConflict = (options?.onConflict || 'id').split(',').map((s) => s.trim());
    return this;
  }

  /* ---------------- filters ---------------- */

  eq(column: string, value: any)  { this.filters.push({ kind: 'cmp', column, op: '=',  value }); return this; }
  neq(column: string, value: any) { this.filters.push({ kind: 'cmp', column, op: '<>', value }); return this; }
  gt(column: string, value: any)  { this.filters.push({ kind: 'cmp', column, op: '>',  value }); return this; }
  gte(column: string, value: any) { this.filters.push({ kind: 'cmp', column, op: '>=', value }); return this; }
  lt(column: string, value: any)  { this.filters.push({ kind: 'cmp', column, op: '<',  value }); return this; }
  lte(column: string, value: any) { this.filters.push({ kind: 'cmp', column, op: '<=', value }); return this; }

  like(column: string, pattern: string)  { this.filters.push({ kind: 'cmp', column, op: 'LIKE', value: pattern }); return this; }
  ilike(column: string, pattern: string) { this.filters.push({ kind: 'cmp', column, op: 'LIKE', value: pattern }); return this; }

  in(column: string, values: any[]) { this.filters.push({ kind: 'in', column, values: values || [] }); return this; }

  is(column: string, value: null | boolean) {
    if (value === null) this.filters.push({ kind: 'null', column, negate: false });
    else this.filters.push({ kind: 'cmp', column, op: '=', value: value ? 1 : 0 });
    return this;
  }

  not(column: string, op: string, value: any) {
    if (op === 'is' && value === null) this.filters.push({ kind: 'null', column, negate: true });
    else if (op === 'eq') this.filters.push({ kind: 'cmp', column, op: '<>', value });
    else if (op === 'in') this.filters.push({ kind: 'raw', sql: `${q(column)} NOT IN (?)`, params: [value] });
    else throw new Error(`mysqlClient: not('${column}','${op}',…) is not supported`);
    return this;
  }

  or(expression: string) {
    const { sql, params } = parseOr(expression);
    this.filters.push({ kind: 'raw', sql, params });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy.push({ column, asc: options?.ascending !== false });
    return this;
  }

  limit(n: number) { this.limitN = n; return this; }

  range(from: number, to: number) { this.offsetN = from; this.limitN = to - from + 1; return this; }

  single()      { this.rowMode = 'single'; return this; }
  maybeSingle() { this.rowMode = 'maybe';  return this; }

  /* ---------------- execution ---------------- */

  private where(): { sql: string; params: any[] } {
    if (!this.filters.length) return { sql: '', params: [] };
    const parts: string[] = [];
    const params: any[] = [];
    for (const f of this.filters) {
      if (f.kind === 'cmp') { parts.push(`${q(f.column)} ${f.op} ?`); params.push(toParam(f.value)); }
      else if (f.kind === 'in') {
        if (!f.values.length) { parts.push('1 = 0'); continue; }   // IN () is a syntax error
        parts.push(`${q(f.column)} IN (${f.values.map(() => '?').join(',')})`);
        params.push(...f.values.map(toParam));
      }
      else if (f.kind === 'null') parts.push(`${q(f.column)} IS ${f.negate ? 'NOT ' : ''}NULL`);
      else { parts.push(f.sql); params.push(...f.params.map(toParam)); }
    }
    return { sql: ' WHERE ' + parts.join(' AND '), params };
  }

  private tail(): string {
    let sql = '';
    if (this.orderBy.length) {
      sql += ' ORDER BY ' + this.orderBy.map((o) => `${q(o.column)} ${o.asc ? 'ASC' : 'DESC'}`).join(', ');
    }
    if (this.limitN !== null) sql += ` LIMIT ${Number(this.limitN)}`;
    if (this.offsetN) sql += ` OFFSET ${Number(this.offsetN)}`;
    return sql;
  }

  /** Rows as given, with an id filled in so an insert can be read back. */
  private async prepareRows(): Promise<any[]> {
    const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
    const composite = COMPOSITE_KEYS[this.table];
    // Only mint an id where the database expects US to. On an AUTO_INCREMENT
    // key a generated UUID is simply rejected, and on a table with no id at
    // all there is nothing to mint.
    const kind = composite ? 'none' : await idKindOf(this.pool, this.table);
    return rows.map((row) => {
      const copy: any = { ...row };
      for (const k of Object.keys(copy)) if (copy[k] === undefined) delete copy[k];
      if (kind === 'client' && copy.id === undefined) copy.id = crypto.randomUUID();
      return copy;
    });
  }

  private keyOf(row: any): Record<string, any> {
    const composite = COMPOSITE_KEYS[this.table];
    if (composite) return Object.fromEntries(composite.map((c) => [c, row[c]]));
    return { id: row.id };
  }

  /** An insert this module cannot identify afterwards, so cannot read back. */
  private unreadable(): boolean {
    return this.insertedKeys.some((k) => Object.values(k).some((v) => v === undefined));
  }

  private async readBack(): Promise<any[]> {
    if (!this.insertedKeys.length) return [];
    const columns = Object.keys(this.insertedKeys[0]);
    const clause = this.insertedKeys
      .map(() => `(${columns.map((c) => `${q(c)} = ?`).join(' AND ')})`).join(' OR ');
    const params = this.insertedKeys.flatMap((k) => columns.map((c) => toParam(k[c])));
    const [rows] = await this.pool.query({
      sql: `SELECT * FROM ${q(this.table)} WHERE ${clause}`, typeCast,
    }, params);
    return rows as any[];
  }

  private async run(): Promise<MysqlResult> {
    try {
      if (this.unsupported) throw new Error(this.unsupported);
      let rows: any[] = [];

      if (this.mode === 'select') {
        const { sql, params } = this.where();
        const columns = this.selectColumns === '*'
          ? '*'
          : this.selectColumns.split(',').map((c) => q(c.trim())).join(', ');
        const [result] = await this.pool.query(
          { sql: `SELECT ${columns} FROM ${q(this.table)}${sql}${this.tail()}`, typeCast },
          params,
        );
        rows = result as any[];

      } else if (this.mode === 'insert' || this.mode === 'upsert') {
        const prepared = await this.prepareRows();
        if (!prepared.length) return { data: [], error: null };
        const columns = Array.from(new Set(prepared.flatMap((r) => Object.keys(r))));
        const placeholders = prepared
          .map(() => `(${columns.map(() => '?').join(',')})`).join(', ');
        const params = prepared.flatMap((r) => columns.map((c) => toParam(r[c])));

        let sql = `INSERT INTO ${q(this.table)} (${columns.map(q).join(',')}) VALUES ${placeholders}`;
        if (this.mode === 'upsert') {
          // Every column except the conflict key is overwritten, which is what
          // PostgREST's upsert does.
          const updates = columns.filter((c) => !this.onConflict.includes(c));
          sql += updates.length
            ? ` ON DUPLICATE KEY UPDATE ${updates.map((c) => `${q(c)} = VALUES(${q(c)})`).join(', ')}`
            // Nothing to change: keep the row and report success, as PostgREST does.
            : ` ON DUPLICATE KEY UPDATE ${q(this.onConflict[0])} = ${q(this.onConflict[0])}`;
        }
        await this.pool.execute(sql, params);
        this.insertedKeys = prepared.map((r) => this.keyOf(r));
        if (this.wantRows) {
          if (this.unreadable()) {
            throw new Error(
              `mysqlClient: cannot read back an insert into ${this.table} — its id is generated by the database`,
            );
          }
          rows = await this.readBack();
        }

      } else if (this.mode === 'update') {
        const values: any = { ...this.payload };
        for (const k of Object.keys(values)) if (values[k] === undefined) delete values[k];
        const columns = Object.keys(values);
        if (!columns.length) return { data: [], error: null };
        const { sql, params } = this.where();
        await this.pool.execute(
          `UPDATE ${q(this.table)} SET ${columns.map((c) => `${q(c)} = ?`).join(', ')}${sql}`,
          [...columns.map((c) => toParam(values[c])), ...params],
        );
        if (this.wantRows) {
          // Re-read through the same filters. Callers in server.ts filter an
          // update by id, so this returns the rows that were just written.
          const [result] = await this.pool.query(
            { sql: `SELECT * FROM ${q(this.table)}${sql}${this.tail()}`, typeCast }, params,
          );
          rows = result as any[];
        }

      } else {
        const { sql, params } = this.where();
        if (!sql) throw new Error(`mysqlClient: refusing an unfiltered DELETE on ${this.table}`);
        await this.pool.execute(`DELETE FROM ${q(this.table)}${sql}`, params);
      }

      if (this.rowMode === 'single') {
        if (rows.length !== 1) {
          return {
            data: null,
            error: { message: `JSON object requested, multiple (or no) rows returned`, code: 'PGRST116' },
          };
        }
        return { data: rows[0], error: null };
      }
      if (this.rowMode === 'maybe') {
        return { data: rows.length ? rows[0] : null, error: null };
      }
      return { data: rows, error: null, count: rows.length };

    } catch (err: any) {
      return { data: this.rowMode === 'many' ? [] : null, error: { message: err?.message || String(err), code: err?.code } };
    }
  }

  then<R1 = MysqlResult, R2 = never>(
    onfulfilled?: ((value: MysqlResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

/**
 * The three database routines the application calls through .rpc().
 * annex8_next_report_id is a PROCEDURE in MySQL (see mysql/02_functions_views.sql
 * for why), so it is called differently from the two functions.
 */
const PROCEDURES = new Set(['annex8_next_report_id']);

const AUTH_UNAVAILABLE =
  'Supabase Auth is not available under DB_DRIVER=mysql. Sign-in uses the ' +
  'server password check against the users table. See docs/database-portability.md.';

const RPC_ARGUMENTS: Record<string, string[]> = {
  annex8_part2_totals:   ['p_report_uuid'],
  annex8_next_report_id: ['p_period'],
  annex8_deadline:       ['p_period'],
  annex8_is_on_time:     ['p_period'],
};

export function createMysqlClient(connectionUrl: string) {
  const pool = mysql.createPool({
    uri: connectionUrl,
    waitForConnections: true,
    connectionLimit: 10,
    // Every DATETIME in this database is UTC; see note 3 above.
    timezone: 'Z',
    dateStrings: true,
    charset: 'utf8mb4_0900_ai_ci',
    supportBigNumbers: true,
  });

  // A pooled connection can be handed out after the session default has been
  // changed elsewhere, so the time zone is set per connection, not once.
  pool.on('connection', (conn: any) => { conn.query("SET time_zone = '+00:00'"); });

  return {
    from(table: string) { return new QueryBuilder(pool, table); },
    // CAS must use affectedRows, not a SELECT with the old revision filter.
    async compareAndSwapMlState(revision: number, payload: unknown): Promise<boolean> {
      const [result]: any = await pool.execute(
        'UPDATE ml_lifecycle SET revision = revision + 1, payload = ? WHERE id = ? AND revision = ?',
        [JSON.stringify(payload), 'main', revision],
      );
      return result.affectedRows === 1;
    },

    async rpc(name: string, params: Record<string, any> = {}): Promise<MysqlResult> {
      try {
        if (name === 'mlrs_consolidated_preview') {
          const period = reportingPeriod(params.p_period_type as PeriodType, Number(params.p_year), Number(params.p_index ?? 1));
          const sql = consolidatedAggregationSql('mysql', ['?', '?', 'UTC_TIMESTAMP(3)']);
          const [rows] = await pool.query(sql, [period.start,period.end]);
          const result = (rows as any[])[0]?.result;
          return { data: typeof result === 'string' ? JSON.parse(result) : result, error:null };
        }
        const expected = RPC_ARGUMENTS[name];
        if (!expected) throw new Error(`mysqlClient: unknown database routine "${name}"`);
        const args = expected.map((key) => toParam(params[key]));

        if (PROCEDURES.has(name)) {
          // A procedure's final SELECT comes back as the first result set.
          const [sets] = await pool.query(
            { sql: `CALL ${q(name)}(${args.map(() => '?').join(',')})`, typeCast }, args,
          );
          const first = (sets as any[])[0] as any[];
          const row = first?.[0];
          return { data: row ? Object.values(row)[0] : null, error: null };
        }

        const [rows] = await pool.query(
          { sql: `SELECT ${q(name)}(${args.map(() => '?').join(',')}) AS result`, typeCast }, args,
        );
        return { data: (rows as any[])[0]?.result ?? null, error: null };
      } catch (err: any) {
        return { data: null, error: { message: err?.message || String(err), code: err?.code } };
      }
    },

    /**
     * Supabase Auth is a service, not data; it does not move with the
     * database. These return the shape the caller checks — an error and no
     * user — rather than throwing, so a bearer token that cannot be verified
     * under this driver becomes a clean 401 instead of a 500. Sign-in works
     * through the server's own password check against the `users` table.
     */
    auth: {
      async getUser(_token?: string) { return { data: { user: null }, error: { message: AUTH_UNAVAILABLE } }; },
      admin: {
        async listUsers(_options?: any)        { return { data: { users: [] }, error: { message: AUTH_UNAVAILABLE } }; },
        async createUser(_attributes?: any)    { return { data: { user: null }, error: { message: AUTH_UNAVAILABLE } }; },
        async updateUserById(_id: string, _a?: any) { return { data: { user: null }, error: { message: AUTH_UNAVAILABLE } }; },
      },
    },

    async end() { await pool.end(); },
  };
}

export type MysqlClient = ReturnType<typeof createMysqlClient>;
