import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { FILM_STEPS, STEP_FILES, type FilmEvent, type FilmStatus, type FilmStep, type LlmProvider, type StepJob, filmEventChannel, stepJobId } from '@stick/core'
import { type Db, assetsOf, createFilm, getFilm, runsOf } from '@stick/db'
import { runFilmStep } from '@stick/pipeline'
import { createTestDb, seedWorkspace } from '@stick/db/testing'
import { FsStorage, loadServerConfig } from '@stick/providers'
import { Redis } from 'ioredis'
import pino from 'pino'
import { afterAll, afterEach, beforeAll, describe, expect, inject, test } from 'vitest'
import { stepProviders } from '../src/providers.js'
import { createQueues, enqueueStep } from '../src/queues.js'
import { startWorker } from '../src/start.js'
import type { WorkerDeps } from '../src/run-step.js'

const redisUrl = inject('redisUrl')
const root = mkdtempSync(join(tmpdir(), 'stick-queues-'))
const cfg = loadServerConfig({ STICK_FAKE: '1', STICK_STORAGE_DIR: join(root, 'storage'), STICK_CACHE_DIR: join(root, 'cache') }, 'worker')
const storage = new FsStorage({ root: cfg.storageDir })

let db: Db
let closeDb: () => Promise<void>
const cleanups: (() => Promise<unknown>)[] = []

beforeAll(async () => {
  ;({ db, close: closeDb } = await createTestDb())
})
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})
afterAll(async () => {
  await closeDb()
  rmSync(root, { recursive: true, force: true })
})

let counter = 0
const newPrefix = () => `test-${process.pid}-${Date.now()}-${counter++}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function queuesFor(prefix: string) {
  const q = createQueues(redisUrl, { prefix })
  cleanups.push(() => q.close())
  return q
}

async function newFilm() {
  const s = await seedWorkspace(db)
  const { film, version } = await createFilm(db, s.workspace.id, { channelId: s.channel.id, title: 'Phân số', createdBy: s.user.id })
  const job = (step: FilmStep): StepJob => ({ workspaceId: s.workspace.id, filmId: film.id, filmVersionId: version.id, step })
  return { ws: s.workspace.id, film, version, job }
}

const TERMINAL: FilmStatus[] = ['awaiting_review', 'failed', 'qa_failed', 'blocked_budget', 'cancelled']
async function waitTerminal(ws: string, id: string, timeoutMs: number): Promise<FilmStatus> {
  for (const deadline = Date.now() + timeoutMs; Date.now() < deadline; await sleep(100)) {
    const { status } = (await getFilm(db, ws, id))!
    if (TERMINAL.includes(status)) return status
  }
  throw new Error('film did not reach a terminal status in time')
}

type Deps = Omit<WorkerDeps, 'enqueue' | 'publish'>
const deps = (extra: Partial<Deps> = {}): Deps => ({ db, storage, cfg, log: pino({ level: 'silent' }), ...extra })

async function startWorkerFor(prefix: string, extra: Partial<Deps> = {}, backoffMs?: number) {
  const w = await startWorker(deps(extra), { redisUrl, prefix, backoffMs })
  cleanups.push(() => w.close())
  return w
}

/** Writes every file the step promises, so the queue plumbing is tested without rendering. */
const stubRunStep: WorkerDeps['runStep'] = async (step, env) => {
  for (const entry of STEP_FILES[step].writes) {
    const file = entry.endsWith('/') ? join(entry, 'a.wav') : entry
    mkdirSync(dirname(join(env.dir, file)), { recursive: true })
    writeFileSync(join(env.dir, file), '{}')
  }
  return {}
}

/** The real story step (so the LLM seam is exercised), stubs for the rest so the film finishes fast. */
const storyThenStubs: WorkerDeps['runStep'] = (step, env, input) => (step === 'story' ? runFilmStep(step, env, input) : stubRunStep!(step, env, input))

/** The LLM throws a 503 on its first `failures` calls (all calls when Infinity) across the whole test. */
function flakyProviders(failures: number): { providers: WorkerDeps['providers']; calls: () => number } {
  let calls = 0
  const providers: WorkerDeps['providers'] = (c, step, ledger) => {
    const real = stepProviders(c, step, ledger)
    const llm: LlmProvider = {
      generate: async (req) => {
        if (calls++ < failures) throw Object.assign(new Error('overloaded'), { status: 503 })
        return real.llm.generate(req)
      },
    }
    return { llm, tts: real.tts }
  }
  return { providers, calls: () => calls }
}

describe('enqueueStep', () => {
  test('puts render on the render queue and every other step on film', async () => {
    const queues = queuesFor(newPrefix())
    const f = await newFilm()
    for (const step of FILM_STEPS) await enqueueStep(queues, f.job(step))
    for (const step of FILM_STEPS) {
      const id = stepJobId(f.version.id, step)
      const [own, other] = step === 'render' ? [queues.render, queues.film] : [queues.film, queues.render]
      expect((await own.getJob(id))?.name, step).toBe(step)
      expect(await other.getJob(id), step).toBeUndefined()
    }
  })

  test('enqueuing the same step twice keeps one job', async () => {
    const queues = queuesFor(newPrefix())
    const f = await newFilm()
    await enqueueStep(queues, f.job('story'))
    await enqueueStep(queues, f.job('story'))
    expect(await queues.film.getJobCounts('waiting', 'delayed', 'active')).toMatchObject({ waiting: 1 })
  })

  test('jobs carry the retry policy: 4 attempts, exponential backoff', async () => {
    const queues = queuesFor(newPrefix())
    const f = await newFilm()
    await enqueueStep(queues, f.job('story'))
    const job = await queues.film.getJob(stepJobId(f.version.id, 'story'))
    expect(job?.opts).toMatchObject({ attempts: 4, backoff: { type: 'exponential', delay: 2000 } })
  })
})

describe('startWorker', () => {
  test('a fake film runs story→contact through both queues to awaiting_review', async () => {
    const prefix = newPrefix()
    const queues = queuesFor(prefix)
    const w = await startWorkerFor(prefix)
    const completed: [string, string][] = []
    for (const worker of w.workers) worker.on('completed', (job) => completed.push([job.queueName, job.name]))
    const f = await newFilm()

    await enqueueStep(queues, f.job('story'))

    expect(await waitTerminal(f.ws, f.film.id, 240_000)).toBe('awaiting_review')
    const runs = await runsOf(db, f.version.id)
    expect(runs.filter((r) => r.status === 'succeeded').map((r) => r.step).sort()).toEqual([...FILM_STEPS].sort())
    const final = (await assetsOf(db, f.ws, f.version.id)).find((a) => a.kind === 'final')!
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', storage.localPath(final.storageKey)!], { encoding: 'utf8' })
    expect(probe.stdout.trim().split('\n')[0]).toBe('1080,1920')
    // the last job's `completed` fires just after it sets the film's final status
    for (const deadline = Date.now() + 5_000; completed.length < FILM_STEPS.length && Date.now() < deadline;) await sleep(20)
    expect(completed.filter(([queue]) => queue === 'render')).toEqual([['render', 'render']])
    expect(completed.filter(([queue]) => queue === 'film')).toHaveLength(FILM_STEPS.length - 1)
  })

  test('a transient failure retries with backoff and succeeds on attempt 3', async () => {
    const prefix = newPrefix()
    const queues = queuesFor(prefix)
    const flaky = flakyProviders(2)
    await startWorkerFor(prefix, { providers: flaky.providers, runStep: storyThenStubs }, 10)
    const f = await newFilm()

    await enqueueStep(queues, f.job('story'), { backoffMs: 10 })

    expect(await waitTerminal(f.ws, f.film.id, 60_000)).toBe('awaiting_review')
    const story = (await runsOf(db, f.version.id)).filter((r) => r.step === 'story')
    expect(story.map((r) => [r.attempt, r.status])).toEqual([[1, 'failed'], [2, 'failed'], [3, 'succeeded']])
    expect(flaky.calls()).toBe(3)
  })

  test('four transient failures fail the film', async () => {
    const prefix = newPrefix()
    const queues = queuesFor(prefix)
    const flaky = flakyProviders(Infinity)
    await startWorkerFor(prefix, { providers: flaky.providers, runStep: storyThenStubs }, 10)
    const f = await newFilm()

    await enqueueStep(queues, f.job('story'), { backoffMs: 10 })

    expect(await waitTerminal(f.ws, f.film.id, 60_000)).toBe('failed')
    const story = (await runsOf(db, f.version.id)).filter((r) => r.step === 'story')
    expect(story.map((r) => [r.attempt, r.status])).toEqual([[1, 'failed'], [2, 'failed'], [3, 'failed'], [4, 'failed']])
  })

  test('step and film events are published to film-events:<id>', async () => {
    const prefix = newPrefix()
    const queues = queuesFor(prefix)
    await startWorkerFor(prefix, { runStep: stubRunStep })
    const f = await newFilm()
    const sub = new Redis(redisUrl)
    cleanups.push(async () => { sub.disconnect() })
    const events: FilmEvent[] = []
    sub.on('message', (_channel, message) => events.push(JSON.parse(message) as FilmEvent))
    await sub.subscribe(filmEventChannel(f.film.id))

    await enqueueStep(queues, f.job('story'))

    await waitTerminal(f.ws, f.film.id, 60_000)
    for (const deadline = Date.now() + 5_000; !events.some((e) => e.type === 'film' && e.status === 'awaiting_review') && Date.now() < deadline;) await sleep(20)
    const labels = events.map((e) => (e.type === 'step' ? `step ${e.step} ${e.status}` : `film ${e.status}`))
    expect(labels.slice(0, 3)).toEqual(['film running', 'step story running', 'step story succeeded'])
    expect(labels.at(-1)).toBe('film awaiting_review')
    expect(events.every((e) => e.filmId === f.film.id)).toBe(true)
  })
})
