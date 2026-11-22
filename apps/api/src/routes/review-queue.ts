import { filmDetail, listReviewQueue } from '@stick/db'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { okList } from '../envelope.js'
import { ListQuery } from '../schemas.js'
import type { ApiDeps } from '../types.js'

export function reviewQueueRoutes(app: FastifyInstance, { db }: ApiDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.get('/v1/review-queue', { schema: { querystring: ListQuery, tags: ['review'] } }, async (req, reply) => {
    const { workspaceId } = req.principal
    const list = await listReviewQueue(db, workspaceId, req.query)
    // shortcut: one detail query per item (limit <= 100); join in SQL if the queue gets hot.
    const details = await Promise.all(list.items.map((f) => filmDetail(db, workspaceId, f.id)))
    const items = details.flatMap((d) => {
      if (!d) return [] // gone since the list query
      const { film, steps, assets } = d
      const gate = steps.find((s) => s.step === 'gate')
      return [{
        film: { id: film.id, title: film.title, status: film.status, cost_usd: film.costUsd, current_version: film.currentVersion },
        final_asset_id: assets.find((a) => a.kind === 'final')?.id ?? null,
        contact_asset_id: assets.find((a) => a.kind === 'contact_sheet')?.id ?? null,
        findings: film.status === 'qa_failed' && gate?.status === 'failed' ? gate.error : null,
      }]
    })
    return okList(reply, { items, nextCursor: list.nextCursor })
  })
}
