import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL belum ditetapkan.')

const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10000 })
try {
  const { rows } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `)
  const counts = {}
  for (const table of rows.map((r) => r.table_name)) {
    const result = await pool.query(`SELECT count(*)::int AS count FROM "${table.replaceAll('"', '""')}"`)
    counts[table] = result.rows[0].count
  }
  console.log(JSON.stringify({ tables: rows.map((r) => r.table_name), counts }, null, 2))
} finally {
  await pool.end()
}

