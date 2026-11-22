import { type Workspace, audit, getWorkspace, updateWorkspace } from '@stick/db'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { ok } from '../envelope.js'
import { notFound } from '../errors.js'
import type { ApiDeps } from '../types.js'

const cap = z.number().positive().finite().nullable()
const WorkspacePatchBody = z.strictObject({
  name: z.string().min(1).max(80).optional(),
  max_cost_per_film_usd: cap.optional(),
  max_cost_per_day_usd: cap.optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'at least one field is required' })

const toWire = (w: Workspace) => ({
  id: w.id, name: w.name, plan: w.plan, max_cost_per_film_usd: w.maxCostPerFilmUsd, max_cost_per_day_usd: w.maxCostPerDayUsd,
})

export function workspaceRoutes(app: FastifyInstance, { db }: ApiDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.get('/v1/workspace', { schema: { tags: ['workspace'] } }, async (req, reply) => {
    const w = await getWorkspace(db, req.principal.workspaceId)
    if (!w) throw notFound()
    return ok(reply, toWire(w))
  })

  r.patch('/v1/workspace', { schema: { body: WorkspacePatchBody, tags: ['workspace'] } }, async (req, reply) => {
    const { workspaceId, userId } = req.principal
    const w = await db.transaction(async (tx) => {
      const updated = await updateWorkspace(tx, workspaceId, {
        name: req.body.name, maxCostPerFilmUsd: req.body.max_cost_per_film_usd, maxCostPerDayUsd: req.body.max_cost_per_day_usd,
      })
      if (updated) await audit(tx, workspaceId, { actorId: userId, action: 'workspace.update', target: `workspace:${workspaceId}`, data: req.body })
      return updated
    })
    if (!w) throw notFound()
    return ok(reply, toWire(w))
  })
}
