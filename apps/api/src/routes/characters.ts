import { VOICE_IDS } from '@stick/core'
import { type Character, archiveCharacter, createCharacter, listCharacters, updateCharacter } from '@stick/db'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { ok, okList } from '../envelope.js'
import { notFound } from '../errors.js'
import { IdParams, ListQuery, LookSchema } from '../schemas.js'
import type { ApiDeps } from '../types.js'

const fields = {
  name: z.string().min(1).max(40),
  look: LookSchema,
  voice_id: z.enum(VOICE_IDS),
  description: z.string().max(500).nullable(),
}
const CharacterBody = z.strictObject({ ...fields, description: fields.description.optional() })
const CharacterPatchBody = z.strictObject({
  name: fields.name.optional(),
  look: fields.look.optional(),
  voice_id: fields.voice_id.optional(),
  description: fields.description.optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'at least one field is required' })

const toInput = (b: z.infer<typeof CharacterPatchBody>) => ({ name: b.name, look: b.look, voiceId: b.voice_id, description: b.description })

const toWire = (c: Character) => ({
  id: c.id, name: c.name, look: c.look, voice_id: c.voiceId, description: c.description,
  archived_at: c.archivedAt, created_at: c.createdAt, updated_at: c.updatedAt,
})

export function characterRoutes(app: FastifyInstance, { db }: ApiDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const tags = ['characters']

  r.get('/v1/characters', { schema: { querystring: ListQuery, tags } }, async (req, reply) => {
    const list = await listCharacters(db, req.principal.workspaceId, req.query)
    return okList(reply, { items: list.items.map(toWire), nextCursor: list.nextCursor })
  })

  r.post('/v1/characters', { schema: { body: CharacterBody, tags } }, async (req, reply) => {
    return ok(reply, toWire(await createCharacter(db, req.principal.workspaceId, { ...toInput(req.body), name: req.body.name })))
  })

  r.patch('/v1/characters/:id', { schema: { params: IdParams, body: CharacterPatchBody, tags } }, async (req, reply) => {
    const c = await updateCharacter(db, req.principal.workspaceId, req.params.id, toInput(req.body))
    if (!c) throw notFound()
    return ok(reply, toWire(c))
  })

  r.delete('/v1/characters/:id', { schema: { params: IdParams, tags } }, async (req, reply) => {
    const c = await archiveCharacter(db, req.principal.workspaceId, req.params.id)
    if (!c) throw notFound()
    return ok(reply, toWire(c))
  })
}
