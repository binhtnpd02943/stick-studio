import { FILM_STATUSES, FILM_STEPS, type FilmStatus, type FilmStep, REDOABLE_STATUSES, STEP_FILES, canTransition } from '@stick/core'
import { and, desc, eq, inArray, lt } from 'drizzle-orm'
import type { Db } from '../client.js'
import { ConflictError, NotFoundError } from '../errors.js'
import { page } from '../pagination.js'
import { assets, filmVersions, films } from '../schema.js'
import { toNumber } from './numeric.js'
import { type Asset, type StepRun, assetsOf, replaceAsset, runsOf } from './steps.js'

export type Film = Omit<typeof films.$inferSelect, 'status' | 'costUsd' | 'qaScore'> & {
  status: FilmStatus
  costUsd: number
  qaScore: number | null
}
export type FilmVersion = typeof filmVersions.$inferSelect

const toFilm = (row: typeof films.$inferSelect): Film => ({
  ...row, status: row.status as FilmStatus, costUsd: Number(row.costUsd), qaScore: toNumber(row.qaScore),
})

const inWorkspace = (workspaceId: string, id: string) => and(eq(films.workspaceId, workspaceId), eq(films.id, id))

const versionOf = async (db: Db, filmId: string, version: number) =>
  (await db.select().from(filmVersions).where(and(eq(filmVersions.filmId, filmId), eq(filmVersions.version, version))))[0]!

/** The step whose `writes` contain a work-dir relative path. */
function stepOfPath(path: string): FilmStep | undefined {
  return FILM_STEPS.find((s) => STEP_FILES[s].writes.some((w) => (w.endsWith('/') ? path.startsWith(w) : path === w)))
}

export interface FilmInput {
  channelId: string
  title: string
  brief?: string
  createdBy: string
  idempotencyKey?: string
}

export async function createFilm(db: Db, workspaceId: string, input: FilmInput): Promise<{ film: Film; version: FilmVersion; created: boolean }> {
  return db.transaction(async (tx) => {
    // ON CONFLICT DO NOTHING waits for a concurrent insert of the same key, so the select below then sees its film.
    const [row] = await tx.insert(films).values({
      workspaceId,
      channelId: input.channelId,
      title: input.title,
      brief: input.brief,
      status: 'queued',
      createdBy: input.createdBy,
      idempotencyKey: input.idempotencyKey,
    }).onConflictDoNothing({ target: [films.workspaceId, films.idempotencyKey] }).returning()
    if (row) {
      const [version] = await tx.insert(filmVersions).values({ filmId: row.id, version: 1, reason: 'initial' }).returning()
      return { film: toFilm(row), version: version!, created: true }
    }
    const [existing] = await tx.select().from(films)
      .where(and(eq(films.workspaceId, workspaceId), eq(films.idempotencyKey, input.idempotencyKey!)))
    if (existing!.channelId !== input.channelId || existing!.title !== input.title || existing!.brief !== (input.brief ?? null)) {
      throw new ConflictError('idempotency_conflict', 'idempotency key was used with a different request')
    }
    return { film: toFilm(existing!), version: await versionOf(tx, existing!.id, existing!.currentVersion), created: false }
  })
}

export async function getFilm(db: Db, workspaceId: string, id: string): Promise<Film | undefined> {
  const [row] = await db.select().from(films).where(inWorkspace(workspaceId, id))
  return row && toFilm(row)
}

export async function listFilms(
  db: Db, workspaceId: string, opts: { status?: FilmStatus; channelId?: string; limit: number; cursor?: string },
): Promise<{ items: Film[]; nextCursor: string | null }> {
  const rows = await db.select().from(films).where(and(
    eq(films.workspaceId, workspaceId),
    opts.status ? eq(films.status, opts.status) : undefined,
    opts.channelId ? eq(films.channelId, opts.channelId) : undefined,
    opts.cursor ? lt(films.id, opts.cursor) : undefined,
  )).orderBy(desc(films.id)).limit(opts.limit + 1)
  const { items, nextCursor } = page(rows, opts.limit)
  return { items: items.map(toFilm), nextCursor }
}

export async function filmDetail(
  db: Db, workspaceId: string, id: string,
): Promise<{ film: Film; version: FilmVersion; steps: StepRun[]; assets: Asset[] } | undefined> {
  const film = await getFilm(db, workspaceId, id)
  if (!film) return undefined
  const version = await versionOf(db, film.id, film.currentVersion)
  const latest = new Map<string, StepRun>()
  for (const run of await runsOf(db, version.id)) latest.set(run.step, run) // ordered by attempt, so the last one wins
  const steps = FILM_STEPS.flatMap((s) => latest.get(s) ?? [])
  return { film, version, steps, assets: await assetsOf(db, workspaceId, version.id) }
}

/** One conditional UPDATE, so a cancel cannot be overwritten by a late transition from the old status. */
export async function setFilmStatus(db: Db, workspaceId: string, filmId: string, to: FilmStatus): Promise<boolean> {
  const from = FILM_STATUSES.filter((s) => canTransition(s, to))
  if (from.length === 0) return false
  const rows = await db.update(films).set({ status: to })
    .where(and(inWorkspace(workspaceId, filmId), inArray(films.status, from)))
    .returning({ id: films.id })
  return rows.length > 0
}

export interface VersionInput {
  reason: string
  restartFrom: FilmStep
  screenplay?: { storageKey: string; bytes: number; sha256: string }
}

export async function createVersion(db: Db, workspaceId: string, filmId: string, input: VersionInput): Promise<FilmVersion> {
  return db.transaction(async (tx) => {
    // The row lock serialises against setFilmStatus and a second redo.
    const [film] = await tx.select().from(films).where(inWorkspace(workspaceId, filmId)).for('update')
    if (!film) throw new NotFoundError('film not found')
    if (!(REDOABLE_STATUSES as readonly string[]).includes(film.status)) throw new ConflictError('conflict', `a ${film.status} film cannot be redone`)
    const parent = await versionOf(tx, filmId, film.currentVersion)
    const [version] = await tx.insert(filmVersions).values({
      filmId, version: parent.version + 1, parentVersion: parent.version, reason: input.reason, restartFromStep: input.restartFrom,
    }).returning()
    const kept = FILM_STEPS.slice(0, FILM_STEPS.indexOf(input.restartFrom)) as readonly FilmStep[]
    const copies = (await assetsOf(tx, workspaceId, parent.id))
      .filter((a) => { const step = a.meta?.path && stepOfPath(a.meta.path); return !!step && kept.includes(step) })
      .map(({ id: _id, createdAt: _c, updatedAt: _u, ...a }) => ({ ...a, filmVersionId: version!.id }))
    if (copies.length > 0) await tx.insert(assets).values(copies)
    if (input.screenplay) {
      await replaceAsset(tx, workspaceId, {
        filmVersionId: version!.id, kind: 'screenplay', path: 'screenplay.json', mime: 'application/json', ...input.screenplay,
      })
    }
    await tx.update(films).set({ currentVersion: version!.version, status: 'queued' }).where(inWorkspace(workspaceId, filmId))
    return version!
  })
}

/** Titles and loglines of the channel's latest stories, so the story step can avoid repeating itself. */
export async function recentStories(db: Db, workspaceId: string, channelId: string, n = 30): Promise<{ title: string; logline: string }[]> {
  const rows = await db.select({ meta: assets.meta }).from(assets)
    .innerJoin(filmVersions, eq(filmVersions.id, assets.filmVersionId))
    .innerJoin(films, eq(films.id, filmVersions.filmId))
    .where(and(eq(assets.workspaceId, workspaceId), eq(films.channelId, channelId), eq(assets.kind, 'story')))
    .orderBy(desc(assets.id))
    .limit(n)
  return rows.map(({ meta }) => {
    const m = meta as { title?: string; logline?: string } | null
    return { title: m?.title ?? '', logline: m?.logline ?? '' }
  })
}
