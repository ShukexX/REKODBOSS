/* Tukar migrations/0001_init.sql -> src/lib/schema.ts (string) supaya Worker
   boleh bootstrap skema sendiri pada runtime pertama. */
import fs from 'node:fs'

const sql = fs.readFileSync('migrations/0001_init.sql', 'utf8')
fs.writeFileSync(
  'src/lib/schema.ts',
  '/* DIJANA oleh scripts/build-schema.mjs daripada migrations/0001_init.sql */\n' +
    'export const SCHEMA_SQL = ' + JSON.stringify(sql) + '\n'
)
console.log('schema.ts siap:', sql.length, 'bait SQL')
