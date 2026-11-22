import type { FilmStep } from '@stick/core'
import { and, asc, eq, lt, ne, sql } from 'drizzle-orm'
import type { Db } from '../client.js'
import { ConflictError } from '../errors.js'
import { assets, filmVersions, films, stepRuns } from '../schema.js'
import { setFilmStatus } from './films.js'

export type StepRun = typeof stepRuns.$inferSelect
export type AssetMeta = { path?: string } & Record<string, unknown>
export type Asset = Omit<typeof assets.$inferSelect, 'meta'> & { meta: AssetMeta | null }
export type AssetKind = 'story' | 'screenplay' | 'timeline' | 'audio' | 'qa_report' | 'final' | 'contact_sheet'

const toAsset = (row: typeof assets.$inferSelect): Asset => ({ ...row, meta: row.meta as AssetMeta | null })

const KIND_BY_FILE: Record<string, AssetKind> = {
  'story.json': 'story',
  'screenplay.json': 'screenplay',
  'timeline.json': 'timeline',
  'gate.json': 'qa_report',
  'film.mp4': 'final',
  'contact.png': 'contact_sheet',
}

/** The asset kind of a work-dir relative path, or undefined for a file no step writes. */
export function assetKindOf(path: string): AssetKind | undefined {
  return path.startsWith('audio/') ? 'audio' : KIND_BY_FILE[path]
}

// Step-run functions take no workspaceId: step_runs has none, and callers reach a version id only after a scoped film lookup.

export async function findSucceededRun(db: Db, versionId: string, step: FilmStep, inputHash: string): Promise<StepRun | undefined> {
  const [row] = await db.select().from(stepRuns).where(and(
    eq(stepRuns.filmVersionId, versionId), eq(stepRuns.step, step), eq(stepRuns.inputHash, inputHash), eq(stepRuns.status, 'succeeded'),
  )).limit(1)
  return row
}

/**
 * A stalled job re-delivered after a worker crash keeps its attempt number, so an existing unfinished or failed row
 * for (version, step, attempt) is reset to `running` rather than inserted again. A succeeded one is a conflict.
 */
export async function startRun(db: Db, input: { versionId: string; step: FilmStep; attempt: number; inputHash: string }): Promise<StepRun> {
  const startedAt = new Date()
  const [row] = await db.insert(stepRuns)
    .values({ filmVersionId: input.versionId, step: input.step, attempt: input.attempt, inputHash: input.inputHash, status: 'running', startedAt })
    .onConflictDoUpdate({
      target: [stepRuns.filmVersionId, stepRuns.step, stepRuns.attempt],
      set: { status: 'running', inputHash: input.inputHash, error: sql`null`, startedAt, finishedAt: null, updatedAt: startedAt },
      setWhere: ne(stepRuns.status, 'succeeded'),
    })
    .returning()
  if (!row) throw new ConflictError('conflict', `step ${input.step} attempt ${input.attempt} already succeeded`)
  return row
}

/** Only a run still `running` is finished, so a run the sweep failed stays failed and a late worker learns it from `undefined`. */
export async function finishRun(
  db: Db, runId: string, result: { status: 'succeeded' | 'failed' | 'skipped'; error?: unknown },
): Promise<StepRun | undefined> {
  const [row] = await db.update(stepRuns)
    .set({ status: result.status, error: result.error ?? sql`null`, finishedAt: new Date() })
    .where(and(eq(stepRuns.id, runId), eq(stepRuns.status, 'running')))
    .returning()
  return row
}

export interface SweptRun {
  runId: string
  workspaceId: string
  filmId: string
  versionId: string
  step: FilmStep
  attempt: number
  /** False when the film had moved on (a redo, a cancel), so there is nothing to announce for it. */
  filmFailed: boolean
}

/** Fails runs left `running` since before `staleBefore` (their worker died) and fails each film still at that run's version. */
export async function sweepStaleRuns(db: Db, staleBefore: Date): Promise<SweptRun[]> {
  return db.transaction(async (tx) => {
    const failed = await tx.update(stepRuns)
      .set({ status: 'failed', error: { code: 'stale', message: 'the worker stopped during this step' }, finishedAt: new Date() })
      .where(and(eq(stepRuns.status, 'running'), lt(stepRuns.startedAt, staleBefore)))
      .returning()
    const swept: SweptRun[] = []
    for (const run of failed) {
      const [owner] = await tx.select({ workspaceId: films.workspaceId, filmId: films.id, version: filmVersions.version })
        .from(filmVersions).innerJoin(films, eq(films.id, filmVersions.filmId)).where(eq(filmVersions.id, run.filmVersionId))
      const filmFailed = await setFilmStatus(tx, owner!.workspaceId, owner!.filmId, 'failed', owner!.version)
      swept.push({
        runId: run.id, workspaceId: owner!.workspaceId, filmId: owner!.filmId, versionId: run.filmVersionId,
        step: run.step as FilmStep, attempt: run.attempt, filmFailed,
      })
    }
    return swept
  })
}

/** Runs of a version ordered by step then attempt. */
export async function runsOf(db: Db, versionId: string): Promise<StepRun[]> {
  return db.select().from(stepRuns).where(eq(stepRuns.filmVersionId, versionId)).orderBy(asc(stepRuns.step), asc(stepRuns.attempt))
}

export async function assetsOf(db: Db, workspaceId: string, versionId: string): Promise<Asset[]> {
  const rows = await db.select().from(assets)
    .where(and(eq(assets.workspaceId, workspaceId), eq(assets.filmVersionId, versionId)))
    .orderBy(asc(assets.id))
  return rows.map(toAsset)
}

export async function getAsset(db: Db, workspaceId: string, id: string): Promise<Asset | undefined> {
  const [row] = await db.select().from(assets).where(and(eq(assets.workspaceId, workspaceId), eq(assets.id, id)))
  return row && toAsset(row)
}

/**
 * Unscoped: only for the signed content route, where a valid HMAC over the id is the authorization and there is no
 * principal to scope by. Everything else uses `getAsset`.
 */
export async function getAssetForSignedUrl(db: Db, id: string): Promise<Asset | undefined> {
  const [row] = await db.select().from(assets).where(eq(assets.id, id))
  return row && toAsset(row)
}

export interface AssetInput {
  filmVersionId: string
  kind: string
  path: string
  storageKey: string
  mime: string
  bytes: number
  sha256: string
  meta?: Record<string, unknown>
}

/** One row per (version, path): the old row goes in the same transaction. */
export async function replaceAsset(db: Db, workspaceId: string, input: AssetInput): Promise<Asset> {
  return db.transaction(async (tx) => {
    await tx.delete(assets).where(and(
      eq(assets.workspaceId, workspaceId), eq(assets.filmVersionId, input.filmVersionId), sql`${assets.meta}->>'path' = ${input.path}`,
    ))
    const [row] = await tx.insert(assets).values({
      workspaceId,
      filmVersionId: input.filmVersionId,
      kind: input.kind,
      storageKey: input.storageKey,
      mime: input.mime,
      bytes: input.bytes,
      sha256: input.sha256,
      meta: { ...input.meta, path: input.path },
    }).returning()
    return toAsset(row!)
  })
}
