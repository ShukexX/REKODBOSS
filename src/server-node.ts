import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import app from './index'
import { getPgDb } from './lib/pg-db'
import type { Env } from './lib/db'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL belum ditetapkan.')

const env: Env = {
  DB: getPgDb(connectionString),
  DOCS: undefined as any,
  DATABASE_URL: connectionString,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  MAIL_FROM: process.env.MAIL_FROM,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_NAME: process.env.SMTP_NAME,
  OTP_DEV_MODE: process.env.OTP_DEV_MODE,
  OTP_DEV_FALLBACK: process.env.OTP_DEV_FALLBACK,
  AUTH_DEV_BYPASS: process.env.AUTH_DEV_BYPASS,
  APP_ORIGIN: process.env.APP_ORIGIN,
}

app.use('/static/*', serveStatic({ root: './public' }))
app.use('/favicon.svg', serveStatic({ root: './public' }))

const port = Number(process.env.PORT || 3000)
const hostname = process.env.HOST || '0.0.0.0'
console.log(`Rekod Boss Node.js berjalan di http://127.0.0.1:${port}`)
serve({ fetch: (request) => app.fetch(request, env), port, hostname })

