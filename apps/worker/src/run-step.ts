import { join } from 'node:path'
import { FILM_STEPS, STEP_FILES, type FilmEvent, type FilmStatus, type FilmStep, type LlmUsage, type StepJob, type StorageProvider } from '@stick/core'
import {
  type Db, type Film, ConflictError, assetKindOf, bookUsage, filmDetail, findSucceededRun, finishRun, recentStories, replaceAsset, setFilmStatus, startRun,
} from '@stick/db'
import { defaultCatalog } from '@stick/library'
import {
  GateFailedError, STEP_VERSIONS, ScreenplayInvalidError, ScreenplayRejectedError, StoryRejectedError, type StepReport, runFilmStep,
} from '@stick/pipeline'
import { type Ledger, type ServerConfig, costUsd, storageKey } from '@stick/providers'
import type pino from 'pino'
import { checkBudget } from './budget.js'
import { BudgetExceededError, TransientStepError, classify } from './errors.js'
import { inputHash } from './hash.js'
import { stepProviders } from './providers.js'
import { downloadInputs, listOutputs, makeWorkDir, removeWorkDir } from './workdir.js'

export interface WorkerDeps {
  db: Db
  storage: StorageProvider
  cfg: ServerConfig
  log: pino.Logger
  enqueue(job: StepJob): Promise<void>
  publish(e: FilmEvent): Promise<void>
  /** Test seams. */
  providers?: typeof stepProviders
  runStep?: typeof runFilmStep
  now?: () => Date
}

export type StepOutcome = 'succeeded' | 'skipped' | 'stopped' | 'failed'

const MIME: Record<string, string> = { json: 'application/json', wav: 'audio/wav', mp4: 'video/mp4', png: 'image/png' }
const mimeOf = (path: string) => MIME[path.split('.').pop() ?? ''] ?? 'application/octet-stream'

const at = (deps: WorkerDeps) => (deps.now?.() ?? new Date()).toISOString()

/** The film when the job still belongs to it: in this workspace, queued or running, and for its current version. */
async function liveFilm(deps: WorkerDeps, job: StepJob) {
  const detail = await filmDetail(deps.db, job.workspaceId, job.filmId)
  if (!detail || detail.version.id !== job.filmVersionId) return undefined
  return detail.film.status === 'queued' || detail.film.status === 'running' ? detail : undefined
}

/** Guarded by the job's version number, so a late failure of an old version never touches a redo. */
async function setStatus(deps: WorkerDeps, job: StepJob, version: number, status: FilmStatus): Promise<void> {
  if (await setFilmStatus(deps.db, job.workspaceId, job.filmId, status, version)) {
    await deps.publish({ type: 'film', filmId: job.filmId, status, at: at(deps) })
  }
}

const publishStep = (deps: WorkerDeps, job: StepJob, status: 'running' | 'succeeded' | 'failed' | 'skipped', attempt: number) =>
  deps.publish({ type: 'step', filmId: job.filmId, versionId: job.filmVersionId, step: job.step, status, attempt, at: at(deps) })

/** Shared by success and skip: a cancel or redo during the step ends the chain here. */
async function advance(deps: WorkerDeps, job: StepJob): Promise<void> {
  const detail = await liveFilm(deps, job)
  if (detail?.film.status !== 'running') return
  const next: FilmStep | undefined = FILM_STEPS[FILM_STEPS.indexOf(job.step) + 1]
  if (next) return deps.enqueue({ ...job, step: next })
  // shortcut: no qa_score in P1, auto_if_score behaves as manual; upgrade with LLM-vision QA
  await setStatus(deps, job, detail.version.version, 'awaiting_review')
}

function ledgerFor(deps: WorkerDeps, job: StepJob): Ledger {
  const { db, cfg } = deps
  const book = (provider: string, model: string, units: unknown, cost: number) =>
    bookUsage(db, job.workspaceId, { filmId: job.filmId, filmVersionId: job.filmVersionId, step: job.step, provider, model, units, costUsd: cost })
  return {
    check: () => checkBudget(db, job.workspaceId, job.filmId, { film: cfg.maxCostPerFilmUsd, day: cfg.maxCostPerDayUsd }, deps.now?.()),
    bookLlm: async (u: LlmUsage) => {
      const { model, servedModel: _s, ...tokens } = u
      await book(model === 'fake' ? 'fake' : 'anthropic', model, tokens, costUsd(u))
    },
    // TTS is local (say) or fake in P1, so it costs nothing; it is still booked for the record.
    bookTts: async (chars, providerId) => { await book(providerId, providerId, { chars }, 0) },
  }
}

function metaFor(step: FilmStep, report: StepReport): Record<string, unknown> | undefined {
  if (step === 'story') return report.meta
  if (step === 'screenplay') return { libraryRequests: report.libraryRequests, repairRounds: report.repairRounds }
  return undefined
}

async function upload(deps: WorkerDeps, job: StepJob, film: Film, dir: string, paths: string[], meta?: Record<string, unknown>) {
  for (const path of paths) {
    const kind = assetKindOf(path)
    if (!kind) throw new Error(`no asset kind for ${path}`)
    const key = storageKey(job.workspaceId, job.filmId, film.currentVersion, path)
    const { bytes, sha256 } = await deps.storage.putFile(key, join(dir, path))
    await replaceAsset(deps.db, job.workspaceId, { filmVersionId: job.filmVersionId, kind, path, storageKey: key, mime: mimeOf(path), bytes, sha256, meta })
  }
}

function errorDetails(e: unknown): unknown {
  if (e instanceof GateFailedError) return { findings: e.findings }
  if (e instanceof ScreenplayRejectedError) return { issues: e.issues, libraryRequests: e.libraryRequests }
  if (e instanceof ScreenplayInvalidError || e instanceof StoryRejectedError) return { issues: e.issues }
  if (e instanceof BudgetExceededError) return { scope: e.scope, spentUsd: e.spentUsd, capUsd: e.capUsd }
  return {}
}

/** The step never started, so there is no input hash yet; the row exists to carry the reason. */
async function recordBudgetBlock(db: Db, job: StepJob, attempt: number, e: BudgetExceededError): Promise<void> {
  const run = await startRun(db, { versionId: job.filmVersionId, step: job.step, attempt, inputHash: 'budget-blocked' })
  await finishRun(db, run.id, { status: 'failed', error: { code: 'budget', message: e.message, details: errorDetails(e) } })
}

/** Runs one film step for one job. Throws TransientStepError only when the queue should retry. */
export async function runStepJob(deps: WorkerDeps, job: StepJob, attempt: { n: number; final: boolean }): Promise<StepOutcome> {
  const detail = await liveFilm(deps, job)
  if (!detail) return 'stopped'
  const version = detail.version.version
  // Once the step's work is recorded, a re-delivery heals any later failure through the skip path.
  const state = { healable: false, dir: undefined as string | undefined }
  try {
    return await runLive(deps, job, attempt, detail, state)
  } catch (e) {
    if (e instanceof TransientStepError) throw e
    const code = classify(e)
    if ((code === 'transient' || state.healable) && !attempt.final) throw new TransientStepError(e)
    deps.log.error({ job, attempt: attempt.n, code, err: e }, 'step job failed')
    await setStatus(deps, job, version, code === 'budget' ? 'blocked_budget' : 'failed')
    return 'failed'
  } finally {
    if (state.dir) await removeWorkDir(state.dir)
  }
}

async function runLive(
  deps: WorkerDeps, job: StepJob, attempt: { n: number; final: boolean },
  detail: NonNullable<Awaited<ReturnType<typeof liveFilm>>>, state: { healable: boolean; dir?: string },
): Promise<StepOutcome> {
  const { db, cfg, log } = deps
  const { film } = detail
  const version = detail.version.version
  try {
    await checkBudget(db, job.workspaceId, job.filmId, { film: cfg.maxCostPerFilmUsd, day: cfg.maxCostPerDayUsd }, deps.now?.())
  } catch (e) {
    // Record why in step_runs (same shape as an in-step block) so the film detail shows it; runStepJob's catch then sets blocked_budget.
    if (e instanceof BudgetExceededError) {
      // Best effort: a failure here (e.g. this attempt already succeeded) must not mask the budget block.
      await recordBudgetBlock(db, job, attempt.n, e).catch((err: unknown) => log.warn({ job, err }, 'could not record budget block'))
    }
    throw e
  }

  const dir = (state.dir = await makeWorkDir(cfg.cacheDir, job.filmVersionId, job.step))
  const topic = film.brief ? `${film.title}\n\n${film.brief}` : film.title
  const inputs = await downloadInputs(deps.storage, detail.assets, job.step, dir)
  const hash = inputHash(job.step, STEP_VERSIONS[job.step], inputs, job.step === 'story' ? { topic } : {})

  const skip = async (): Promise<StepOutcome> => {
    state.healable = true
    await publishStep(deps, job, 'skipped', attempt.n)
    await advance(deps, job)
    return 'skipped'
  }
  if (await findSucceededRun(db, job.filmVersionId, job.step, hash)) return skip()

  let run
  try {
    run = await startRun(db, { versionId: job.filmVersionId, step: job.step, attempt: attempt.n, inputHash: hash })
  } catch (e) {
    // A sibling delivery of this attempt succeeded since we looked.
    if (e instanceof ConflictError && (await findSucceededRun(db, job.filmVersionId, job.step, hash))) return skip()
    throw e
  }
  await setStatus(deps, job, version, 'running') // false when already running, which is fine
  await publishStep(deps, job, 'running', attempt.n)

  try {
    const ledger = ledgerFor(deps, job)
    const { llm, tts } = (deps.providers ?? stepProviders)(cfg, job.step, ledger, film.title)
    const recent = job.step === 'story' ? await recentStories(db, job.workspaceId, film.channelId) : []
    const env = { dir, llm, tts, catalog: defaultCatalog, sfxCacheDir: join(cfg.cacheDir, 'sfx') }
    const report = await (deps.runStep ?? runFilmStep)(job.step, env, { topic, recent })
    await upload(deps, job, film, dir, await listOutputs(dir, STEP_FILES[job.step].writes), metaFor(job.step, report))
  } catch (e) {
    const code = classify(e)
    log.warn({ job, attempt: attempt.n, code, err: e }, 'step failed')
    const finished = await finishRun(db, run.id, { status: 'failed', error: { code, message: e instanceof Error ? e.message : String(e), details: errorDetails(e) } })
    if (!finished) { // the sweep already failed this run and announced it
      log.warn({ job, attempt: attempt.n }, 'run was swept as stale before it failed; not announcing')
      return 'stopped'
    }
    await publishStep(deps, job, 'failed', attempt.n)
    if (code === 'transient' && !attempt.final) throw new TransientStepError(e)
    if (code === 'gate') {
      // The report is a convenience; failing to store it must not leave the film running.
      await upload(deps, job, film, dir, await listOutputs(dir, ['gate.json']).catch(() => []))
        .catch((err: unknown) => log.error({ job, err }, 'could not store gate.json'))
      await setStatus(deps, job, version, 'qa_failed')
    } else {
      await setStatus(deps, job, version, code === 'budget' ? 'blocked_budget' : 'failed')
    }
    return 'failed'
  }

  state.healable = true
  // undefined: the sweep failed this run while the step was still working, so announce nothing and leave the chain stopped.
  if (!(await finishRun(db, run.id, { status: 'succeeded' }))) {
    log.warn({ job, attempt: attempt.n }, 'run was swept as stale before it finished; not advancing')
    return 'stopped'
  }
  await publishStep(deps, job, 'succeeded', attempt.n)
  await advance(deps, job)
  return 'succeeded'
}
