import { FILM_STATUSES, type FilmStep } from '@stick/core'
import { type Db, type Film, audit, createFilm, filmDetail, getChannel, listFilms, runsOf } from '@stick/db'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { ok, okList } from '../envelope.js'
import { notFound } from '../errors.js'
import { IdParams, ListQuery } from '../schemas.js'
import type { ApiDeps } from '../types.js'

type Detail = NonNullable<Awaited<ReturnType<typeof filmDetail>>>

export const toFilmWire = (f: Film) => ({
  id: f.id, channel_id: f.channelId, topic_id: f.topicId, source_type: f.sourceType, title: f.title, brief: f.brief, status: f.status,
  current_version: f.currentVersion, cost_usd: f.costUsd, qa_score: f.qaScore, created_by: f.createdBy, created_at: f.createdAt, updated_at: f.updatedAt,
})

export const toDetailWire = ({ film, version, steps, assets }: Detail) => ({
  film: toFilmWire(film),
  version: { version: version.version, reason: version.reason, restart_from_step: version.restartFromStep },
  steps: steps.map((s) => ({ step: s.step, status: s.status, attempt: s.attempt, error: s.error, started_at: s.startedAt, finished_at: s.finishedAt })),
  assets: assets.map((a) => ({ id: a.id, kind: a.kind, path: a.meta?.path ?? null, mime: a.mime, bytes: a.bytes })),
})

/** The scoped detail, or a 404. */
export async function detailOr404(db: Db, workspaceId: string, filmId: string): Promise<Detail> {
  const d = await filmDetail(db, workspaceId, filmId)
  if (!d) throw notFound()
  return d
}

const FilmBody = z.strictObject({
  channel_id: z.uuid(),
  title: z.string().min(1).max(80),
  brief: z.string().max(2000).optional(),
})
const CreateHeaders = z.object({ 'idempotency-key': z.string().min(1).max(200).optional() })
const FilmListQuery = ListQuery.extend({ status: z.enum(FILM_STATUSES).optional(), channel_id: z.uuid().optional() })

export function filmRoutes(app: FastifyInstance, { db, enqueue }: ApiDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const tags = ['films']

  r.post('/v1/films', { schema: { body: FilmBody, headers: CreateHeaders, tags } }, async (req, reply) => {
    const { workspaceId, userId } = req.principal
    if (!(await getChannel(db, workspaceId, req.body.channel_id))) throw notFound('channel not found')
    const { film, version, created } = await createFilm(db, workspaceId, {
      channelId: req.body.channel_id, title: req.body.title, brief: req.body.brief, createdBy: userId, idempotencyKey: req.headers['idempotency-key'],
    })
    const first = (step: FilmStep) => enqueue({ workspaceId, filmId: film.id, filmVersionId: version.id, step })
    if (created) {
      await audit(db, workspaceId, { actorId: userId, action: 'film.create', target: `film:${film.id}`, data: req.body })
      // A failed enqueue is a 500 here; the client's retry with the same key heals it below.
      await first('story')
    } else if (film.status === 'queued' && (await runsOf(db, version.id)).length === 0) {
      // Nothing has run yet, so the first enqueue may have failed. The jobId dedupes it if it did not.
      await first((version.restartFromStep as FilmStep | null) ?? 'story')
    }
    return ok(reply.status(created ? 201 : 200), toFilmWire(film))
  })

  r.get('/v1/films', { schema: { querystring: FilmListQuery, tags } }, async (req, reply) => {
    const { status, channel_id, limit, cursor } = req.query
    const list = await listFilms(db, req.principal.workspaceId, { status, channelId: channel_id, limit, cursor })
    return okList(reply, { items: list.items.map(toFilmWire), nextCursor: list.nextCursor })
  })

  r.get('/v1/films/:id', { schema: { params: IdParams, tags } }, async (req, reply) =>
    ok(reply, toDetailWire(await detailOr404(db, req.principal.workspaceId, req.params.id))))
}
