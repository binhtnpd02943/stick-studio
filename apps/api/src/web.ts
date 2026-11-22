import { statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { sendError } from './envelope.js'

const IMMUTABLE = 'public, max-age=31536000, immutable'
const API_PATH = /^\/(v1(\/|$)|healthz$|readyz$)/

/**
 * Maps a URL path to a file under webDir, as a path relative to it. Undefined when the path is not a regular file
 * inside webDir. `immutable` is true under assets/, whose file names carry a content hash.
 */
export function resolveWebFile(webDir: string, urlPath: string): { file: string; immutable: boolean } | undefined {
  let decoded: string
  try { decoded = decodeURIComponent(urlPath) } catch { return undefined }
  const segments = decoded.split(/[\\/]/).filter(Boolean)
  if (decoded.includes('\0') || segments.includes('..')) return undefined
  const file = join(...segments)
  const root = resolve(webDir)
  const abs = resolve(root, file)
  if (!segments.length || !abs.startsWith(root + sep)) return undefined
  try { if (!statSync(abs).isFile()) return undefined } catch { return undefined }
  return { file, immutable: segments[0] === 'assets' }
}

/**
 * Replaces the not-found handler. With a webDir, GET and HEAD for a non-API path serve the matching built file, or
 * index.html for an extensionless path (a client route). A missing file with an extension is a 404, never index.html:
 * after a rebuild an old page asking for /assets/app-old.js must not get HTML back.
 */
export function webFallback(app: FastifyInstance, webDir: string | undefined): void {
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0]!
    const spa = webDir && (req.method === 'GET' || req.method === 'HEAD') && !API_PATH.test(path)
    if (!spa) return sendError(reply, 404, 'not_found', 'not found')

    const hit = resolveWebFile(webDir, path)
    if (hit) return reply.header('cache-control', hit.immutable ? IMMUTABLE : 'no-cache').sendFile(hit.file, webDir, { cacheControl: false })
    if (extname(path) || path.startsWith('/assets/')) return sendError(reply, 404, 'not_found', 'not found')
    // The shell is framed nowhere (the approve button), and keeps signed asset URLs out of referrers.
    return reply
      .header('cache-control', 'no-cache')
      .header('x-frame-options', 'DENY')
      .header('referrer-policy', 'same-origin')
      .sendFile('index.html', webDir, { cacheControl: false })
  })
}
