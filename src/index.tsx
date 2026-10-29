import { Hono } from 'hono'
import type { Env } from './lib/db'
import { ensureReady, checkOrigin, HttpError } from './server/helpers'
import { authRoutes } from './server/auth-routes'
import { ledgerRoutes } from './server/ledger-routes'
import { vehicleRoutes } from './server/vehicle-routes'
import { miscRoutes } from './server/misc-routes'
import { page } from './server/page'
import { assessReadiness, runVerify, buildVerifyReport } from './server/verify'

const app = new Hono<{ Bindings: Env }>()

app.use('*', async (c, next) => {
  const url = new URL(c.req.url)
  if (url.pathname.startsWith('/api/')) {
    await ensureReady(c.env)
    checkOrigin(c)
  }
  await next()
})

app.route('/api/auth', authRoutes)
app.route('/api', ledgerRoutes)
app.route('/api', vehicleRoutes)
app.route('/api', miscRoutes)

app.get('/', (c) => c.html(page()))

app.get('/api/health', (c) => c.json({ ok: true }))

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as any)
  console.error(err)
  return c.json({ error: 'Ralat pelayan: ' + (err?.message || 'tidak diketahui') }, 500)
})

app.notFound((c) => c.json({ error: 'Tidak dijumpai' }, 404))

export default app
