import { type Channel, createChannel, getChannel, listChannels, updateChannel } from '@stick/db'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { ok, okList } from '../envelope.js'
import { notFound } from '../errors.js'
import { IdParams, ListQuery } from '../schemas.js'
import type { ApiDeps } from '../types.js'

const fields = {
  display_name: z.string().min(1).max(80),
  locale: z.string().min(2).max(35),
  review_policy: z.enum(['manual', 'auto_if_score']),
  auto_score_threshold: z.number().min(0).max(100).nullable(),
}
const ChannelBody = z.strictObject({
  display_name: fields.display_name,
  locale: fields.locale.default('vi-VN'),
  review_policy: fields.review_policy.optional(),
  auto_score_threshold: fields.auto_score_threshold.optional(),
})
const ChannelPatchBody = z.strictObject({
  display_name: fields.display_name.optional(),
  locale: fields.locale.optional(),
  review_policy: fields.review_policy.optional(),
  auto_score_threshold: fields.auto_score_threshold.optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'at least one field is required' })

const toInput = (b: z.infer<typeof ChannelPatchBody>) => ({
  displayName: b.display_name, locale: b.locale, reviewPolicy: b.review_policy, autoScoreThreshold: b.auto_score_threshold,
})

const toWire = (c: Channel) => ({
  id: c.id, platform: c.platform, display_name: c.displayName, locale: c.locale, review_policy: c.reviewPolicy,
  auto_score_threshold: c.autoScoreThreshold, created_at: c.createdAt, updated_at: c.updatedAt,
})

export function channelRoutes(app: FastifyInstance, { db }: ApiDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const tags = ['channels']

  r.get('/v1/channels', { schema: { querystring: ListQuery, tags } }, async (req, reply) => {
    const list = await listChannels(db, req.principal.workspaceId, req.query)
    return okList(reply, { items: list.items.map(toWire), nextCursor: list.nextCursor })
  })

  r.post('/v1/channels', { schema: { body: ChannelBody, tags } }, async (req, reply) => {
    const c = await createChannel(db, req.principal.workspaceId, { ...toInput(req.body), platform: 'tiktok', displayName: req.body.display_name })
    return ok(reply, toWire(c))
  })

  r.get('/v1/channels/:id', { schema: { params: IdParams, tags } }, async (req, reply) => {
    const c = await getChannel(db, req.principal.workspaceId, req.params.id)
    if (!c) throw notFound()
    return ok(reply, toWire(c))
  })

  r.patch('/v1/channels/:id', { schema: { params: IdParams, body: ChannelPatchBody, tags } }, async (req, reply) => {
    const c = await updateChannel(db, req.principal.workspaceId, req.params.id, toInput(req.body))
    if (!c) throw notFound()
    return ok(reply, toWire(c))
  })
}
