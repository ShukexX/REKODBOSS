import fs from 'node:fs/promises'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL belum ditetapkan.')

const pool = new pg.Pool({ connectionString: url, max: 2 })
const files = ['migrations/0001_init.sql', 'migrations/0002_add_bank_details.sql']
try {
  await pool.query('BEGIN')
  for (const file of files) {
    let sql = await fs.readFile(file, 'utf8')
    sql = sql.replace(/--[^\r\n]*/g, '').replace(/\bBLOB\b/g, 'BYTEA')
    for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      await pool.query(statement)
    }
  }
  await pool.query('COMMIT')
  console.log('Migrasi PostgreSQL selesai.')
} catch (error) {
  await pool.query('ROLLBACK')
  throw error
} finally {
  await pool.end()
}

