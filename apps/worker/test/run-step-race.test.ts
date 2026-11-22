import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { StepJob } from '@stick/core'
import { type Db, createFilm, finishRun, getFilm, runsOf, setFilmStatus, startRun } from '@stick/db'
import { createTestDb, seedWorkspace } from '@stick/db/testing'
import { STEP_VERSIONS } from '@stick/pipeline'
import { FsStorage, loadServerConfig } from '@stick/providers'
import pino from 'pino'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { inputHash } from '../src/hash.js'
import { runStepJob } from '../src/run-step.js'

// The first findSucceededRun misses, as if a sibling delivery of the same attempt succeeded just after it looked.
const race = vi.hoisted(() => ({ missNext: false }))
vi.mock('@stick/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@stick/db')>()
  return {
    ...real,
    findSucceededRun: async (...args: Parameters<typeof real.findSucceededRun>) => {
      if (race.missNext) { race.missNext = false; return undefined }
      return real.findSucceededRun(...args)
    },
  }
})

let db: Db
let close: () => Promise<void>
const root = mkdtempSync(join(tmpdir(), 'stick-worker-race-'))
const cfg = loadServerConfig({ STICK_FAKE: '1', STICK_STORAGE_DIR: join(root, 'storage'), STICK_CACHE_DIR: join(root, 'cache') }, 'worker')

beforeAll(async () => { ;({ db, close } = await createTestDb()) })
afterAll(async () => { await close(); rmSync(root, { recursive: true, force: true }) })

test('a startRun conflict (a sibling delivery already succeeded) takes the skip path', async () => {
  const s = await seedWorkspace(db)
  const { film, version } = await createFilm(db, s.workspace.id, { channelId: s.channel.id, title: 'T', createdBy: s.user.id })
  await setFilmStatus(db, s.workspace.id, film.id, 'running')
  const run = await startRun(db, { versionId: version.id, step: 'validate', attempt: 1, inputHash: inputHash('validate', STEP_VERSIONS.validate, [], {}) })
  await finishRun(db, run.id, { status: 'succeeded' })
  const enqueued: StepJob[] = []
  let called = false
  race.missNext = true
  const job: StepJob = { workspaceId: s.workspace.id, filmId: film.id, filmVersionId: version.id, step: 'validate' }
  const outcome = await runStepJob({
    db, cfg, storage: new FsStorage({ root: cfg.storageDir }), log: pino({ level: 'silent' }),
    enqueue: async (j) => { enqueued.push(j) }, publish: async () => {},
    runStep: async () => { called = true; return {} },
  }, job, { n: 1, final: false })
  expect(outcome).toBe('skipped')
  expect(called).toBe(false)
  expect(enqueued).toEqual([{ ...job, step: 'voice' }])
  expect((await getFilm(db, s.workspace.id, film.id))!.status).toBe('running')
  expect((await runsOf(db, version.id)).map((r) => r.status)).toEqual(['succeeded'])
})
