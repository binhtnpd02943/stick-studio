import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FILM_STEPS, type FilmStep, REDOABLE_STATUSES, parseScreenplay } from '@stick/core'
import { type FilmVersion, audit, createVersion, getFilm, insertReview, setFilmStatus } from '@stick/db'
import { defaultCatalog } from '@stick/library'
import { validateScreenplay } from '@stick/pipeline'
import { storageKey } from '@stick/providers'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { v7 } from 'uuid'
import { z } from 'zod/v4'
import { announce } from '../announce.js'
import { ok } from '../envelope.js'
import { ApiError, conflict, notFound } from '../errors.js'
import { IdParams } from '../schemas.js'
import type { ApiDeps } from '../types.js'
import { detailOr404, toDetailWire } from './films.js'

const Reason = z.string().min(1).max(500)
const RedoBody = z.strictObject({ from_step: z.enum(FILM_STEPS), reason: Reason })
const ReviewBody = z.discriminatedUnion('decision', [
  z.strictObject({ decision: z.literal('approved'), reason: Reason.optional() }),
  z.strictObject({ decision: z.literal('redo'), reason: Reason, redo_from_step: z.enum(FILM_STEPS).optional() }),
])
const ScreenplayBody = z.strictObject({ screenplay: z.unknown() })
const REVIEW_REDO_FROM = ['awaiting_review', 'qa_failed'] as const

const invalidScreenplay = (issues: unknown[]) => new ApiError(422, 'invalid_screenplay', 'invalid screenplay', { issues })

export function filmActionRoutes(app: FastifyInstance, { db, storage, enqueue, publish }: ApiDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const tags = ['films']

  /**
   * Enqueues the restart step of a version just committed. If that fails the film goes to `failed` (guarded by the
   * version), so it can be redone instead of staying queued with no job.
   */
  async function start(log: FastifyBaseLogger, workspaceId: string, filmId: string, version: FilmVersion, step: FilmStep): Promise<void> {
    try {
      await enqueue({ workspaceId, filmId, filmVersionId: version.id, step })
    } catch (err) {
      const failed = await setFilmStatus(db, workspaceId, filmId, 'failed', version.version)
        .catch((e: unknown) => { log.error({ err: e, filmId }, 'could not fail a film whose enqueue failed'); return false })
      if (failed) await announce(log, publish, filmId, 'failed')
      throw err
    }
  }

  const found = async (workspaceId: string, filmId: string) => {
    const film = await getFilm(db, workspaceId, filmId)
    if (!film) throw notFound()
    return film
  }

  r.post('/v1/films/:id/redo', { schema: { params: IdParams, body: RedoBody, tags } }, async (req, reply) => {
    const { workspaceId, userId } = req.principal
    const { id } = req.params
    const version = await db.transaction(async (tx) => {
      // A film of another workspace is a NotFoundError (404) from createVersion.
      const v = await createVersion(tx, workspaceId, id, { reason: req.body.reason, restartFrom: req.body.from_step })
      await audit(tx, workspaceId, { actorId: userId, action: 'film.redo', target: `film:${id}`, data: req.body })
      return v
    })
    await announce(req.log, publish, id, 'queued')
    await start(req.log, workspaceId, id, version, req.body.from_step)
    return ok(reply.status(202), toDetailWire(await detailOr404(db, workspaceId, id)))
  })

  r.post('/v1/films/:id/cancel', { schema: { params: IdParams, tags } }, async (req, reply) => {
    const { workspaceId, userId } = req.principal
    const { id } = req.params
    await found(workspaceId, id)
    // Compare-and-set; queued jobs then stop at the worker's live-film check.
    if (!(await setFilmStatus(db, workspaceId, id, 'cancelled'))) throw conflict()
    await audit(db, workspaceId, { actorId: userId, action: 'film.cancel', target: `film:${id}` })
    await announce(req.log, publish, id, 'cancelled')
    return ok(reply, toDetailWire(await detailOr404(db, workspaceId, id)))
  })

  r.post('/v1/films/:id/review', { schema: { params: IdParams, body: ReviewBody, tags } }, async (req, reply) => {
    const { workspaceId, userId } = req.principal
    const { id } = req.params
    const body = req.body
    const reviewed = (await detailOr404(db, workspaceId, id)).version
    const record = { action: 'film.review', target: `film:${id}`, actorId: userId, data: body }

    if (body.decision === 'approved') {
      await db.transaction(async (tx) => {
        // Guarded by the version reviewed, so an approval never lands on a redo made meanwhile.
        if (!(await setFilmStatus(tx, workspaceId, id, 'approved', reviewed.version))) throw conflict()
        await insertReview(tx, { filmVersionId: reviewed.id, reviewerId: userId, decision: 'approved', reason: body.reason })
        await audit(tx, workspaceId, record)
      })
      await announce(req.log, publish, id, 'approved')
      return ok(reply, toDetailWire(await detailOr404(db, workspaceId, id)))
    }

    const step = body.redo_from_step ?? 'story'
    const version = await db.transaction(async (tx) => {
      const v = await createVersion(tx, workspaceId, id, { reason: body.reason, restartFrom: step, from: REVIEW_REDO_FROM, expectedVersion: reviewed.version })
      await insertReview(tx, { filmVersionId: reviewed.id, reviewerId: userId, decision: 'redo', reason: body.reason, redoFromStep: step })
      await audit(tx, workspaceId, record)
      return v
    })
    await announce(req.log, publish, id, 'queued')
    await start(req.log, workspaceId, id, version, step)
    return ok(reply.status(202), toDetailWire(await detailOr404(db, workspaceId, id)))
  })

  r.patch('/v1/films/:id/screenplay', { schema: { params: IdParams, body: ScreenplayBody, tags } }, async (req, reply) => {
    const { workspaceId, userId } = req.principal
    const { id } = req.params
    const film = await found(workspaceId, id)
    // Early, so a doomed edit writes no file; createVersion re-checks under the row lock.
    if (!(REDOABLE_STATUSES as readonly string[]).includes(film.status)) throw conflict()
    const parsed = parseScreenplay(req.body.screenplay)
    if (!parsed.ok) throw invalidScreenplay(parsed.issues)
    const issues = validateScreenplay(parsed.value, defaultCatalog)
    if (issues.length > 0) throw invalidScreenplay(issues)

    // A unique key per edit, so concurrent edits never overwrite each other's file; meta.path stays screenplay.json.
    const key = storageKey(workspaceId, id, film.currentVersion + 1, `screenplay.${v7()}.json`)
    const dir = await mkdtemp(join(tmpdir(), 'stick-sp-'))
    let put: { bytes: number; sha256: string }
    try {
      await writeFile(join(dir, 'screenplay.json'), JSON.stringify(parsed.value, null, 2))
      put = await storage.putFile(key, join(dir, 'screenplay.json'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
    let version: FilmVersion
    try {
      version = await db.transaction(async (tx) => {
        // expectedVersion keeps the key's v<n> prefix true: a redo in between makes this a 409.
        const v = await createVersion(tx, workspaceId, id, {
          reason: 'screenplay edit', restartFrom: 'validate', screenplay: { storageKey: key, ...put }, expectedVersion: film.currentVersion,
        })
        await audit(tx, workspaceId, { actorId: userId, action: 'film.screenplay', target: `film:${id}`, data: { storage_key: key } })
        return v
      })
    } catch (err) {
      await storage.delete(key).catch((e: unknown) => req.log.error({ err: e, key }, 'could not delete an unused screenplay file'))
      throw err
    }
    await announce(req.log, publish, id, 'queued')
    await start(req.log, workspaceId, id, version, 'validate')
    return ok(reply.status(202), toDetailWire(await detailOr404(db, workspaceId, id)))
  })
}
