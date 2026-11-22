import { getAsset, getAssetForSignedUrl } from '@stick/db'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { ok } from '../envelope.js'
import { forbidden, notFound } from '../errors.js'
import { IdParams } from '../schemas.js'
import { signedAssetUrl, verifyAsset } from '../signing.js'
import type { ApiDeps } from '../types.js'

// Loose on purpose: a malformed sig or exp is a bad signature (403), which verifyAsset decides.
// A <video> issues many Range requests (iOS Safari especially), so content gets more than the shared limit.
export const ASSET_CONTENT_RATE_LIMIT = { max: 600, timeWindow: '1 minute' }

const ContentQuery = z.object({ exp: z.string().max(20), sig: z.string().max(128) })

export function assetRoutes(app: FastifyInstance, { db, storage, cfg }: ApiDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const tags = ['assets']

  r.get('/v1/assets/:id/url', { schema: { params: IdParams, tags } }, async (req, reply) => {
    const asset = await getAsset(db, req.principal.workspaceId, req.params.id)
    if (!asset) throw notFound()
    return ok(reply, signedAssetUrl(asset.id, cfg.urlSigningKey))
  })

  // Public: the signature is the only authorization, so a <video> tag can fetch it.
  r.get('/v1/assets/:id/content', {
    config: { public: true, rateLimit: { ...ASSET_CONTENT_RATE_LIMIT, keyGenerator: (req: { ip: string }) => req.ip } },
    schema: { params: IdParams, querystring: ContentQuery, hide: true },
  }, async (req, reply) => {
    const { id } = req.params
    if (!verifyAsset(id, Number(req.query.exp), req.query.sig, cfg.urlSigningKey)) throw forbidden('invalid or expired signature')
    const asset = await getAssetForSignedUrl(db, id)
    // localPath also rejects a storage key that could leave the storage root.
    if (!asset || !storage.localPath(asset.storageKey)) throw notFound()
    reply.header('content-type', asset.mime ?? 'application/octet-stream')
    return reply.sendFile(asset.storageKey, cfg.storageDir, { contentType: false })
  })
}
