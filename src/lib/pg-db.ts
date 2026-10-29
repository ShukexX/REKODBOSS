import pg from 'pg'
import { Buffer } from 'node:buffer'

type QueryResult = { rows: any[]; rowCount: number }

function postgresSql(sql: string) {
  let n = 0
  return sql.replace(/\?/g, () => `$${++n}`)
}

class PgStatement {
  constructor(private pool: pg.Pool, private sql: string, private values: any[] = []) {}
  bind(...values: any[]) {
    const normalized = values.map((value) => value instanceof ArrayBuffer ? Buffer.from(new Uint8Array(value)) : value)
    return new PgStatement(this.pool, this.sql, normalized)
  }
  async first<T = any>(): Promise<T | null> {
    const r = await this.pool.query(postgresSql(this.sql), this.values) as QueryResult
    return (r.rows[0] as T) ?? null
  }
  async all<T = any>(): Promise<{ results: T[] }> {
    const r = await this.pool.query(postgresSql(this.sql), this.values) as QueryResult
    return { results: r.rows as T[] }
  }
  async run(): Promise<{ meta: { changes: number } }> {
    const r = await this.pool.query(postgresSql(this.sql), this.values) as QueryResult
    return { meta: { changes: r.rowCount || 0 } }
  }
}

export class PgDatabase {
  constructor(private pool: pg.Pool) {}
  prepare(sql: string) { return new PgStatement(this.pool, sql) }
  async exec(sql: string) {
    for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      await this.pool.query(statement)
    }
  }
}

const pools = new Map<string, pg.Pool>()
const databases = new Map<string, PgDatabase>()

export function getPgDb(connectionString: string) {
  let db = databases.get(connectionString)
  if (db) return db
  let pool = pools.get(connectionString)
  if (!pool) {
    pool = new pg.Pool({ connectionString, max: 5 })
    pools.set(connectionString, pool)
  }
  db = new PgDatabase(pool)
  databases.set(connectionString, db)
  return db
}

