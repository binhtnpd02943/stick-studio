import { usageSummary } from '@stick/db'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { ok } from '../envelope.js'
import { ApiError } from '../errors.js'
import type { ApiDeps } from '../types.js'

const DAY_MS = 86_400_000
const DEFAULT_DAYS = 30
const MAX_DAYS = 366

const UsageQuery = z.strictObject({ from: z.iso.date().optional(), to: z.iso.date().optional() })

const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

export function usageRoutes(app: FastifyInstance, { db }: ApiDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  // `from` and `to` are inclusive UTC dates.
  r.get('/v1/usage', { schema: { querystring: UsageQuery, tags: ['usage'] } }, async (req, reply) => {
    const to = req.query.to ? new Date(`${req.query.to}T00:00:00Z`) : utcDay(new Date())
    const from = req.query.from ? new Date(`${req.query.from}T00:00:00Z`) : new Date(to.getTime() - (DEFAULT_DAYS - 1) * DAY_MS)
    const days = (to.getTime() - from.getTime()) / DAY_MS + 1
    if (days < 1) throw new ApiError(400, 'bad_request', 'from must not be after to')
    if (days > MAX_DAYS) throw new ApiError(400, 'bad_request', `range must be at most ${MAX_DAYS} days`)
    const s = await usageSummary(db, req.principal.workspaceId, { from, to: new Date(to.getTime() + DAY_MS) })
    return ok(reply, {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      total_usd: s.totalUsd,
      by_day: s.byDay.map((d) => ({ day: d.day, cost_usd: d.costUsd })),
      by_provider: s.byProvider.map((p) => ({ provider: p.provider, model: p.model, cost_usd: p.costUsd })),
      by_film: s.byFilm.map((f) => ({ film_id: f.filmId, title: f.title, cost_usd: f.costUsd })),
    })
  })
}
