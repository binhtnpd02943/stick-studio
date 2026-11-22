import type { ServerResponse } from 'node:http'
import type { FilmEvent } from '@stick/core'
import { getFilm } from '@stick/db'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { notFound } from '../errors.js'
import { IdParams } from '../schemas.js'
import type { ApiDeps } from '../types.js'
import { detailOr404, toDetailWire } from './films.js'

export const SSE_PING_MS = 15_000

export function filmEventRoutes(app: FastifyInstance, { db, subscribe }: ApiDeps, opts: { pingMs?: number } = {}): void {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const open = new Set<ServerResponse>()
  // An open stream is never idle, so the server could not close while one is connected.
  app.addHook('preClose', async () => { for (const raw of open) raw.end() })

  r.get('/v1/films/:id/events', { schema: { params: IdParams, tags: ['films'] } }, async (req, reply) => {
    const { workspaceId } = req.principal
    const { id } = req.params
    if (!(await getFilm(db, workspaceId, id))) throw notFound()

    // Subscribed before the snapshot is read, so no event falls between them; ones that arrive first wait for it.
    const pending: FilmEvent[] = []
    let forward: ((e: FilmEvent) => void) | undefined
    const unsubscribe = subscribe(id, (e) => (forward ? forward(e) : pending.push(e)))
    let snapshot: ReturnType<typeof toDetailWire>
    try {
      snapshot = toDetailWire(await detailOr404(db, workspaceId, id))
    } catch (err) {
      unsubscribe()
      throw err
    }

    reply.hijack()
    const raw = reply.raw
    let closed = false
    const ping = setInterval(() => { if (!closed) raw.write(': ping\n\n') }, opts.pingMs ?? SSE_PING_MS)
    const cleanup = () => {
      if (closed) return
      closed = true
      clearInterval(ping)
      unsubscribe()
      open.delete(raw)
    }
    raw.on('close', cleanup)
    raw.on('error', (err) => { req.log.warn({ err }, 'sse stream error'); cleanup() })
    open.add(raw)

    raw.writeHead(200, {
      'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no', connection: 'keep-alive', 'x-request-id': req.id,
    })
    const send = (event: string, data: unknown) => { if (!closed) raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
    send('snapshot', snapshot)
    forward = (e) => send(e.type, e)
    for (const e of pending) forward(e)
    if (req.raw.socket?.destroyed) cleanup() // the client left before the close listener was attached
    return reply
  })
}
