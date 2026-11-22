import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FilmEvent, LlmProvider, StepJob } from '@stick/core'
import {
  type Db, assetsOf, bookUsage, createFilm, createVersion, findSucceededRun, finishRun, getFilm, runsOf, setFilmStatus, startRun,
  updateWorkspace, usageEvents,
} from '@stick/db'
import { createTestDb, seedWorkspace } from '@stick/db/testing'
import { GateFailedError, STEP_VERSIONS, ScreenplayRejectedError, type runFilmStep } from '@stick/pipeline'
import { FakeTts, FsStorage, loadServerConfig, meteredLlm, meteredTts } from '@stick/providers'
import { eq } from 'drizzle-orm'
import pino from 'pino'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { inputHash } from '../src/hash.js'
import { TransientStepError } from '../src/errors.js'
import { type WorkerDeps, runStepJob } from '../src/run-step.js'

let db: Db
let close: () => Promise<void>
const root = mkdtempSync(join(tmpdir(), 'stick-worker-'))
const cfg = loadServerConfig({ STICK_FAKE: '1', STICK_STORAGE_DIR: join(root, 'storage'), STICK_CACHE_DIR: join(root, 'cache') }, 'worker')
const storage = new FsStorage({ root: cfg.storageDir })

beforeAll(async () => {
  ;({ db, close } = await createTestDb())
})
afterAll(async () => {
  await close()
  rmSync(root, { recursive: true, force: true })
})

type RunStep = typeof runFilmStep

function harness(overrides: Partial<WorkerDeps> = {}) {
  const enqueued: StepJob[] = []
  const events: FilmEvent[] = []
  const deps: WorkerDeps = {
    db, storage, cfg, log: pino({ level: 'silent' }),
    enqueue: async (j) => { enqueued.push(j) },
    publish: async (e) => { events.push(e) },
    ...overrides,
  }
  return { deps, enqueued, events }
}

async function newFilm(brief?: string) {
  const s = await seedWorkspace(db)
  const { film, version } = await createFilm(db, s.workspace.id, { channelId: s.channel.id, title: 'Phân số', brief, createdBy: s.user.id })
  const job = (step: StepJob['step']): StepJob => ({ workspaceId: s.workspace.id, filmId: film.id, filmVersionId: version.id, step })
  return { ws: s.workspace.id, film, version, job }
}

const first = { n: 1, final: false }
const status = async (ws: string, id: string) => (await getFilm(db, ws, id))!.status
const stub = (fn: RunStep): RunStep => fn

describe('runStepJob', () => {
  test('story job writes story.json as a story asset, records a succeeded run and enqueues screenplay', async () => {
    const f = await newFilm()
    const h = harness()
    expect(await runStepJob(h.deps, f.job('story'), first)).toBe('succeeded')
    const assets = await assetsOf(db, f.ws, f.version.id)
    expect(assets).toHaveLength(1)
    expect(assets[0]).toMatchObject({ kind: 'story', mime: 'application/json', meta: { path: 'story.json', title: expect.any(String), logline: expect.any(String) } })
    expect(existsSync(storage.localPath(assets[0]!.storageKey))).toBe(true)
    const runs = await runsOf(db, f.version.id)
    expect(runs.map((r) => [r.step, r.status, r.attempt])).toEqual([['story', 'succeeded', 1]])
    expect(h.enqueued).toEqual([f.job('screenplay')])
    expect(await status(f.ws, f.film.id)).toBe('running')
    expect(h.events.map((e) => e.type === 'step' ? `step:${e.status}` : `film:${e.status}`)).toEqual(['film:running', 'step:running', 'step:succeeded'])
  })

  test('a re-delivered job leaves one asset per path and one succeeded run', async () => {
    const f = await newFilm()
    const h = harness()
    expect(await runStepJob(h.deps, f.job('story'), first)).toBe('succeeded')
    expect(await runStepJob(h.deps, f.job('story'), first)).toBe('skipped')
    expect(await assetsOf(db, f.ws, f.version.id)).toHaveLength(1)
    expect((await runsOf(db, f.version.id)).filter((r) => r.status === 'succeeded')).toHaveLength(1)
    expect(h.enqueued).toEqual([f.job('screenplay'), f.job('screenplay')])
    expect(h.events.at(-1)).toMatchObject({ type: 'step', step: 'story', status: 'skipped' })
  })

  test('a stalled re-delivery (run started, never finished) redoes the step and the film continues', async () => {
    const f = await newFilm()
    await setFilmStatus(db, f.ws, f.film.id, 'running')
    await startRun(db, { versionId: f.version.id, step: 'story', attempt: 1, inputHash: 'crashed' }) // the worker died here
    const h = harness()
    expect(await runStepJob(h.deps, f.job('story'), first)).toBe('succeeded')
    const runs = await runsOf(db, f.version.id)
    expect(runs.map((r) => [r.status, r.attempt])).toEqual([['succeeded', 1]])
    expect(h.enqueued).toEqual([f.job('screenplay')])
  })

  test('a re-delivered contact job whose run already succeeded still finalizes the film', async () => {
    const f = await newFilm()
    await setFilmStatus(db, f.ws, f.film.id, 'running')
    const run = await startRun(db, { versionId: f.version.id, step: 'contact', attempt: 1, inputHash: inputHash('contact', STEP_VERSIONS.contact, [], {}) })
    await finishRun(db, run.id, { status: 'succeeded' }) // the worker died before finalizing
    const h = harness()
    expect(await runStepJob(h.deps, f.job('contact'), first)).toBe('skipped')
    expect(await status(f.ws, f.film.id)).toBe('awaiting_review')
    expect(h.enqueued).toEqual([])
    expect(h.events.at(-1)).toMatchObject({ type: 'film', status: 'awaiting_review' })
  })

  test('the contact step finalizes the film as awaiting_review', async () => {
    const f = await newFilm()
    const runStep = stub(async (_s, env) => { writeFileSync(join(env.dir, 'contact.png'), 'png'); return {} })
    const h = harness({ runStep })
    expect(await runStepJob(h.deps, f.job('contact'), first)).toBe('succeeded')
    expect(await status(f.ws, f.film.id)).toBe('awaiting_review')
    expect((await assetsOf(db, f.ws, f.version.id))[0]).toMatchObject({ kind: 'contact_sheet', mime: 'image/png' })
  })

  test('cancel during a step: the film stays cancelled and nothing is enqueued', async () => {
    const f = await newFilm('một bài học')
    let topic = ''
    const runStep = stub(async (_s, env, input) => {
      topic = input.topic
      await setFilmStatus(db, f.ws, f.film.id, 'cancelled')
      writeFileSync(join(env.dir, 'story.json'), JSON.stringify({ title: 't', logline: 'l' }))
      return { meta: { title: 't', logline: 'l' } }
    })
    const h = harness({ runStep })
    await runStepJob(h.deps, f.job('story'), first)
    expect(topic).toBe('Phân số\n\nmột bài học')
    expect(await status(f.ws, f.film.id)).toBe('cancelled')
    expect(h.enqueued).toEqual([])
  })

  test("a cancelled film's job is stopped before any work", async () => {
    const f = await newFilm()
    await setFilmStatus(db, f.ws, f.film.id, 'cancelled')
    let called = false
    const h = harness({ runStep: stub(async () => { called = true; return {} }) })
    expect(await runStepJob(h.deps, f.job('story'), first)).toBe('stopped')
    expect(called).toBe(false)
    expect(await runsOf(db, f.version.id)).toEqual([])
  })

  test('a job for a superseded version is stopped', async () => {
    const f = await newFilm()
    await setFilmStatus(db, f.ws, f.film.id, 'failed')
    await createVersion(db, f.ws, f.film.id, { reason: 'redo', restartFrom: 'story' })
    let called = false
    const h = harness({ runStep: stub(async () => { called = true; return {} }) })
    expect(await runStepJob(h.deps, f.job('story'), first)).toBe('stopped')
    expect(called).toBe(false)
  })

  test('a job for another workspace is stopped', async () => {
    const f = await newFilm()
    const other = await seedWorkspace(db)
    const h = harness()
    expect(await runStepJob(h.deps, { ...f.job('story'), workspaceId: other.workspace.id }, first)).toBe('stopped')
  })

  test('film cap: a step whose call books $2 against a $1 cap blocks the next call and sets blocked_budget', async () => {
    const f = await newFilm()
    await updateWorkspace(db, f.ws, { maxCostPerFilmUsd: 1 })
    const pricey: LlmProvider = {
      async generate() {
        return { value: {} as never, usage: { model: 'claude-sonnet-5-5', inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }
      },
    }
    const providers: WorkerDeps['providers'] = (_cfg, _step, ledger) => ({ llm: meteredLlm(pricey, ledger), tts: meteredTts(new FakeTts(), ledger) })
    const runStep = stub(async (_s, env) => {
      for (let i = 0; i < 2; i++) await env.llm.generate({ system: '', cacheSystem: false, messages: [], schema: {} as never, effort: 'low', maxTokens: 1 })
      return {}
    })
    const h = harness({ providers, runStep })
    expect(await runStepJob(h.deps, f.job('story'), first)).toBe('failed')
    const usage = await db.select().from(usageEvents).where(eq(usageEvents.workspaceId, f.ws))
    expect(usage).toHaveLength(1)
    expect(usage[0]).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5', step: 'story' })
    const film = (await getFilm(db, f.ws, f.film.id))!
    expect(film.costUsd).toBe(2)
    expect(film.status).toBe('blocked_budget')
    const [run] = await runsOf(db, f.version.id)
    expect(run).toMatchObject({ status: 'failed', error: { code: 'budget', details: { scope: 'film', spentUsd: 2, capUsd: 1 } } })
  })

  test('day cap already reached blocks before the step runs', async () => {
    const f = await newFilm()
    await updateWorkspace(db, f.ws, { maxCostPerDayUsd: 1 })
    const other = await createFilm(db, f.ws, { channelId: f.film.channelId, title: 'other', createdBy: f.film.createdBy })
    await bookUsage(db, f.ws, { filmId: other.film.id, filmVersionId: other.version.id, step: 'story', provider: 'anthropic', model: 'claude-sonnet-5-5', units: {}, costUsd: 1 })
    let called = false
    const h = harness({ runStep: stub(async () => { called = true; return {} }) })
    expect(await runStepJob(h.deps, f.job('story'), first)).toBe('failed')
    expect(called).toBe(false)
    expect(await status(f.ws, f.film.id)).toBe('blocked_budget')
    expect(h.events.at(-1)).toMatchObject({ type: 'film', status: 'blocked_budget' })
  })

  test('GateFailedError sets qa_failed with findings in step_runs.error and a qa_report asset', async () => {
    const f = await newFilm()
    const runStep = stub(async (_s, env) => {
      writeFileSync(join(env.dir, 'gate.json'), JSON.stringify({ findings: ['b1 idle 3s'] }))
      throw new GateFailedError(['b1 idle 3s'])
    })
    const h = harness({ runStep })
    expect(await runStepJob(h.deps, f.job('gate'), first)).toBe('failed')
    expect(await status(f.ws, f.film.id)).toBe('qa_failed')
    const [run] = await runsOf(db, f.version.id)
    expect(run).toMatchObject({ status: 'failed', error: { code: 'gate', message: expect.stringContaining('b1 idle'), details: { findings: ['b1 idle 3s'] } } })
    expect((await assetsOf(db, f.ws, f.version.id)).map((a) => [a.kind, a.meta?.path])).toEqual([['qa_report', 'gate.json']])
    expect(h.events.at(-1)).toMatchObject({ type: 'film', status: 'qa_failed' })
  })

  test('ScreenplayRejectedError fails the film with issues and library requests in the error', async () => {
    const f = await newFilm()
    const issue = { code: 'unknown_action' as const, path: 'scenes.0.beats.0', message: 'no such action' }
    const runStep = stub(async () => { throw new ScreenplayRejectedError([issue], ['climb a ladder']) })
    const h = harness({ runStep })
    expect(await runStepJob(h.deps, f.job('screenplay'), { n: 1, final: false })).toBe('failed')
    expect(await status(f.ws, f.film.id)).toBe('failed')
    const [run] = await runsOf(db, f.version.id)
    expect(run).toMatchObject({ status: 'failed', error: { code: 'logic', details: { issues: [issue], libraryRequests: ['climb a ladder'] } } })
    expect(h.enqueued).toEqual([])
  })

  test('transient error on attempt 1 throws TransientStepError and leaves the film running; on the final attempt the film fails', async () => {
    const f = await newFilm()
    const runStep = stub(async () => { throw Object.assign(new Error('overloaded'), { status: 503 }) })
    const h = harness({ runStep })
    await expect(runStepJob(h.deps, f.job('story'), { n: 1, final: false })).rejects.toBeInstanceOf(TransientStepError)
    expect(await status(f.ws, f.film.id)).toBe('running')
    expect(await runStepJob(h.deps, f.job('story'), { n: 4, final: true })).toBe('failed')
    expect(await status(f.ws, f.film.id)).toBe('failed')
    const runs = await runsOf(db, f.version.id)
    expect(runs.map((r) => [r.attempt, r.status, (r.error as { code: string }).code])).toEqual([[1, 'failed', 'transient'], [4, 'failed', 'transient']])
    expect(await findSucceededRun(db, f.version.id, 'story', runs[0]!.inputHash!)).toBeUndefined()
  })

  test('two jobs never share a work dir', async () => {
    const f = await newFilm()
    const dirs: string[] = []
    let release!: () => void
    const bothIn = new Promise<void>((r) => { release = r })
    const runStep = stub(async (_s, env) => {
      dirs.push(env.dir)
      if (dirs.length === 2) release()
      await bothIn
      return {}
    })
    const h = harness({ runStep })
    await Promise.all([runStepJob(h.deps, f.job('validate'), { n: 1, final: false }), runStepJob(h.deps, f.job('validate'), { n: 2, final: false })])
    expect(dirs).toHaveLength(2)
    expect(dirs[0]).not.toBe(dirs[1])
    for (const d of dirs) expect(existsSync(d)).toBe(false)
  })

  test('an input download error (ENOENT) fails the film and publishes it', async () => {
    const f = await newFilm()
    expect(await runStepJob(harness().deps, f.job('story'), first)).toBe('succeeded')
    class NoGet extends FsStorage {
      override async getFile(): Promise<void> { throw Object.assign(new Error('gone'), { code: 'ENOENT' }) }
    }
    const h = harness({ storage: new NoGet({ root: cfg.storageDir }) })
    expect(await runStepJob(h.deps, f.job('screenplay'), first)).toBe('failed')
    expect(await status(f.ws, f.film.id)).toBe('failed')
    expect(h.events.at(-1)).toMatchObject({ type: 'film', status: 'failed' })
    expect(h.enqueued).toEqual([])
  })

  test('a transient input download error on a non-final attempt is retried', async () => {
    const f = await newFilm()
    expect(await runStepJob(harness().deps, f.job('story'), first)).toBe('succeeded')
    class FlakyGet extends FsStorage {
      override async getFile(): Promise<void> { throw Object.assign(new Error('reset'), { code: 'ECONNRESET' }) }
    }
    const h = harness({ storage: new FlakyGet({ root: cfg.storageDir }) })
    await expect(runStepJob(h.deps, f.job('screenplay'), first)).rejects.toBeInstanceOf(TransientStepError)
    expect(await status(f.ws, f.film.id)).toBe('running')
    expect(await runStepJob(h.deps, f.job('screenplay'), { n: 4, final: true })).toBe('failed')
    expect(await status(f.ws, f.film.id)).toBe('failed')
  })

  test('an enqueue failure after success is retried, and the re-delivery skips and enqueues', async () => {
    const f = await newFilm()
    const broken = harness({ enqueue: async () => { throw new Error('redis down') } })
    await expect(runStepJob(broken.deps, f.job('story'), first)).rejects.toBeInstanceOf(TransientStepError)
    expect(await status(f.ws, f.film.id)).toBe('running')
    const h = harness()
    expect(await runStepJob(h.deps, f.job('story'), { n: 2, final: false })).toBe('skipped')
    expect(h.enqueued).toEqual([f.job('screenplay')])
  })

  test('an enqueue failure after success on the final attempt fails the film', async () => {
    const f = await newFilm()
    const h = harness({ enqueue: async () => { throw new Error('redis down') } })
    expect(await runStepJob(h.deps, f.job('story'), { n: 4, final: true })).toBe('failed')
    expect(await status(f.ws, f.film.id)).toBe('failed')
  })

  test('a gate failure still reaches qa_failed when uploading gate.json throws', async () => {
    const f = await newFilm()
    class NoPut extends FsStorage {
      override async putFile(): Promise<{ bytes: number; sha256: string }> { throw new Error('disk full') }
    }
    const runStep = stub(async (_s, env) => {
      writeFileSync(join(env.dir, 'gate.json'), JSON.stringify({ findings: ['idle'] }))
      throw new GateFailedError(['idle'])
    })
    const h = harness({ storage: new NoPut({ root: cfg.storageDir }), runStep })
    expect(await runStepJob(h.deps, f.job('gate'), first)).toBe('failed')
    expect(await status(f.ws, f.film.id)).toBe('qa_failed')
    expect((await runsOf(db, f.version.id))[0]).toMatchObject({ status: 'failed', error: { code: 'gate' } })
  })

  test('a v1 step failing after a cancel and redo leaves v2 untouched', async () => {
    const f = await newFilm()
    const runStep = stub(async () => {
      await setFilmStatus(db, f.ws, f.film.id, 'cancelled')
      await createVersion(db, f.ws, f.film.id, { reason: 'redo', restartFrom: 'story' })
      await setFilmStatus(db, f.ws, f.film.id, 'running')
      throw new Error('boom')
    })
    const h = harness({ runStep })
    expect(await runStepJob(h.deps, f.job('story'), first)).toBe('failed')
    expect(await getFilm(db, f.ws, f.film.id)).toMatchObject({ status: 'running', currentVersion: 2 })
    expect(h.events.filter((e) => e.type === 'film').map((e) => e.status)).toEqual(['running'])
  })
})
