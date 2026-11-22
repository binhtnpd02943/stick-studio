import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { ok } from '../envelope.js'
import type { ApiDeps } from '../types.js'

const CHECK_TIMEOUT_MS = 1_000

// A down Redis or Postgres can leave a command pending for a long time; readiness must answer promptly.
async function check(probe: () => Promise<unknown>): Promise<'ok' | 'down'> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<'down'>((resolve) => { timer = setTimeout(() => resolve('down'), CHECK_TIMEOUT_MS) })
  try {
    return await Promise.race([probe().then(() => 'ok' as const, () => 'down' as const), timeout])
  } finally {
    clearTimeout(timer)
  }
}

export function healthRoutes(app: FastifyInstance, { db, redis }: ApiDeps): void {
  const config = { public: true, rateLimit: false } as const
  const schema = { hide: true }

  app.get('/healthz', { config, schema }, async (_req, reply) => ok(reply, { ok: true }))

  app.get('/readyz', { config, schema }, async (_req, reply) => {
    const [dbState, redisState] = await Promise.all([check(() => db.execute(sql`select 1`)), check(() => redis.ping())])
    reply.status(dbState === 'ok' && redisState === 'ok' ? 200 : 503)
    return ok(reply, { db: dbState, redis: redisState })
  })
}
