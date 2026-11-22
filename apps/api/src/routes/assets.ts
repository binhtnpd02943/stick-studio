import { getAsset, getAssetForSignedUrl } from '@stick/db'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { ok } from '../envelope.js'
import { forbidden, notFound } from '../errors.js'
import { IdParams } from '../schemas.js'
import { ASSET_URL_TTL_S, signAsset, verifyAsset } from '../signing.js'
import type { ApiDeps } from '../types.js'

// Loose on purpose: a malformed sig or exp is a bad signature (403), which verifyAsset decides.
const ContentQuery = z.object({ exp: z.string().max(20), sig: z.string().max(128) })

export function assetRoutes(app: FastifyInstance, { db, storage, cfg }: ApiDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const tags = ['assets']

  r.get('/v1/assets/:id/url', { schema: { params: IdParams, tags } }, async (req, reply) => {
    const asset = await getAsset(db, req.principal.workspaceId, req.params.id)
    if (!asset) throw notFound()
    const exp = Math.floor(Date.now() / 1000) + ASSET_URL_TTL_S
    const sig = signAsset(asset.id, exp, cfg.urlSigningKey)
    return ok(reply, { url: `/v1/assets/${asset.id}/content?exp=${exp}&sig=${sig}`, expires_at: new Date(exp * 1000).toISOString() })
  })

  // Public: the signature is the only authorization, so a <video> tag can fetch it.
  r.get('/v1/assets/:id/content', { config: { public: true }, schema: { params: IdParams, querystring: ContentQuery, hide: true } }, async (req, reply) => {
    const { id } = req.params
    if (!verifyAsset(id, Number(req.query.exp), req.query.sig, cfg.urlSigningKey)) throw forbidden('invalid or expired signature')
    const asset = await getAssetForSignedUrl(db, id)
    // localPath also rejects a storage key that could leave the storage root.
    if (!asset || !storage.localPath(asset.storageKey)) throw notFound()
    reply.header('content-type', asset.mime ?? 'application/octet-stream')
    return reply.sendFile(asset.storageKey, cfg.storageDir, { contentType: false })
  })
}
