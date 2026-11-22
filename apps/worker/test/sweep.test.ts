import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type FilmEvent, type StepJob, filmEventChannel } from '@stick/core'
import { type Db, createFilm, getFilm, runsOf, setFilmStatus, startRun, sweepStaleRuns } from '@stick/db'
import { createTestDb, seedWorkspace } from '@stick/db/testing'
import { runFilmStep } from '@stick/pipeline'
import { FsStorage, loadServerConfig } from '@stick/providers'
import { Redis } from 'ioredis'
import pino from 'pino'
import { afterAll, afterEach, beforeAll, describe, expect, inject, test } from 'vitest'
import { type WorkerDeps, runStepJob } from '../src/run-step.js'
import { startWorker } from '../src/start.js'

const redisUrl = inject('redisUrl')
const root = mkdtempSync(join(tmpdir(), 'stick-sweep-'))
const cfg = loadServerConfig({ STICK_FAKE: '1', STICK_STORAGE_DIR: join(root, 'storage'), STICK_CACHE_DIR: join(root, 'cache') }, 'worker')
const storage = new FsStorage({ root: cfg.storageDir })
const log = pino({ level: 'silent' })

let db: Db
let closeDb: () => Promise<void>
const cleanups: (() => Promise<unknown>)[] = []
beforeAll(async () => { ;({ db, close: closeDb } = await createTestDb()) })
afterEach(async () => { while (cleanups.length) await cleanups.pop()!() })
afterAll(async () => { await closeDb(); rmSync(root, { recursive: true, force: true }) })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function runningFilm() {
  const s = await seedWorkspace(db)
  const { film, version } = await createFilm(db, s.workspace.id, { channelId: s.channel.id, title: 'Phân số', createdBy: s.user.id })
  await setFilmStatus(db, s.workspace.id, film.id, 'running')
  const job: StepJob = { workspaceId: s.workspace.id, filmId: film.id, filmVersionId: version.id, step: 'story' }
  return { ws: s.workspace.id, film, version, job }
}

describe('the stale-run sweep', () => {
  test('runs at start and on its interval and publishes step failed and film failed', async () => {
    const f = await runningFilm()
    await startRun(db, { versionId: f.version.id, step: 'story', attempt: 1, inputHash: 'h' })
    const sub = new Redis(redisUrl)
    cleanups.push(async () => { sub.disconnect() })
    const events: FilmEvent[] = []
    sub.on('message', (_c, message) => events.push(JSON.parse(message) as FilmEvent))
    await sub.subscribe(filmEventChannel(f.film.id))
    const w = await startWorker({ db, storage, cfg, log }, { redisUrl, prefix: `sweep-${process.pid}-${Date.now()}`, sweepEveryMs: 50, staleAfterMs: 0 })
    cleanups.push(() => w.close())

    for (const deadline = Date.now() + 1_000; events.length < 2 && Date.now() < deadline;) await sleep(20)

    expect(events.map((e) => (e.type === 'step' ? `step ${e.status}` : `film ${e.status}`))).toEqual(['step failed', 'film failed'])
    expect(events[0]).toMatchObject({ filmId: f.film.id, versionId: f.version.id, step: 'story', attempt: 1 })
    expect((await getFilm(db, f.ws, f.film.id))?.status).toBe('failed')
    // The interval keeps sweeping without re-announcing an already failed run.
    await sleep(200)
    expect(events).toHaveLength(2)
  })

  test('a worker that finishes after its run was swept publishes nothing and does not advance', async () => {
    const f = await runningFilm()
    const enqueued: StepJob[] = []
    const events: FilmEvent[] = []
    const deps: WorkerDeps = {
      db, storage, cfg, log,
      enqueue: async (j) => { enqueued.push(j) }, publish: async (e) => { events.push(e) },
      runStep: async (...args) => { // the sweep lands just after the step's work
        const report = await runFilmStep(...args)
        await sweepStaleRuns(db, new Date(Date.now() + 1_000))
        return report
      },
    }
    const outcome = await runStepJob(deps, f.job, { n: 1, final: false })
    expect(outcome).toBe('stopped')
    expect(events.map((e) => (e.type === 'step' ? `step ${e.status}` : `film ${e.status}`))).toEqual(['step running'])
    expect(enqueued).toEqual([])
    expect((await runsOf(db, f.version.id)).map((r) => r.status)).toEqual(['failed'])
  })

  test('a worker whose step throws after its run was swept announces no second step failed', async () => {
    const f = await runningFilm()
    const enqueued: StepJob[] = []
    const events: FilmEvent[] = []
    const deps: WorkerDeps = {
      db, storage, cfg, log,
      enqueue: async (j) => { enqueued.push(j) }, publish: async (e) => { events.push(e) },
      runStep: async () => { // the sweep lands while the step is still working, then the step fails
        await sweepStaleRuns(db, new Date(Date.now() + 1_000))
        throw new Error('boom')
      },
    }
    const outcome = await runStepJob(deps, f.job, { n: 1, final: true })
    expect(outcome).toBe('stopped')
    expect(events.map((e) => (e.type === 'step' ? `step ${e.status}` : `film ${e.status}`))).toEqual(['step running'])
    expect(enqueued).toEqual([])
    expect((await runsOf(db, f.version.id)).map((r) => r.status)).toEqual(['failed'])
  })
})
