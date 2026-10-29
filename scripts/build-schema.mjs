/* Tukar fail migrasi -> src/lib/schema.ts supaya Node boleh bootstrap skema
   sendiri pada runtime pertama. */
import fs from 'node:fs'

const sql = ['0001_init.sql', '0002_add_bank_details.sql', '0003_add_password.sql']
  .map((file) => fs.readFileSync(`migrations/${file}`, 'utf8'))
  .join('\n')
fs.writeFileSync(
  'src/lib/schema.ts',
  '/* DIJANA oleh scripts/build-schema.mjs daripada migrations/*.sql */\n' +
    'export const SCHEMA_SQL = ' + JSON.stringify(sql) + '\n'
)
console.log('schema.ts siap:', sql.length, 'bait SQL')

