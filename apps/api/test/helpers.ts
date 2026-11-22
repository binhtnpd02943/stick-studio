import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type FilmEvent, type StepJob, stepJobId } from '@stick/core'
import type { Db } from '@stick/db'
import { createTestDb, seedWorkspace } from '@stick/db/testing'
import { FsStorage, type ServerConfig, loadServerConfig } from '@stick/providers'
import type { FastifyInstance } from 'fastify'
import { Redis } from 'ioredis'
import { inject } from 'vitest'
import { type ApiDeps, buildApp } from '../src/app.js'

export const TEST_SIGNING_KEY = 'test-url-signing-key-0123456789abcdef'

let counter = 0

export interface TestApiOptions {
  /** Replaces the test Redis, e.g. one pointed at a closed port. testApi does not close it. */
  redis?: Redis
  /** Receives every log line as JSON; logs are discarded otherwise. */
  logStream?: { write(line: string): void }
  /** The first n enqueue calls throw, as if Redis were down. */
  enqueueFailures?: number
  /** Film event source for SSE; a no-op by default. */
  subscribe?: ApiDeps['subscribe']
  ssePingMs?: number
  /** Replaces the recording enqueue, e.g. with a real BullMQ queue; `jobs` then stays empty. */
  enqueue?: ApiDeps['enqueue']
  /** Replaces the recording publish, e.g. with one that rejects; `events` then stays empty. */
  publish?: ApiDeps['publish']
}

export interface TestApi {
  app: FastifyInstance
  db: Db
  seeded: Awaited<ReturnType<typeof seedWorkspace>>
  storage: FsStorage
  cfg: ServerConfig
  jobs: StepJob[]
  /** Film events the API published, in order. */
  events: FilmEvent[]
  close(): Promise<void>
}

/** PGlite, a temp FsStorage, the private test Redis under its own rate-limit namespace, and an enqueue that records jobs. */
export async function testApi(opts: TestApiOptions = {}): Promise<TestApi> {
  const root = mkdtempSync(join(tmpdir(), 'stick-api-'))
  const cfg = loadServerConfig({
    STICK_FAKE: '1', STICK_URL_SIGNING_KEY: TEST_SIGNING_KEY,
    STICK_STORAGE_DIR: join(root, 'storage'), STICK_CACHE_DIR: join(root, 'cache'),
  }, 'dev')
  const { db, close: closeDb } = await createTestDb()
  const seeded = await seedWorkspace(db)
  const ownRedis = opts.redis ? undefined : new Redis(inject('redisUrl'))
  // Deduped by stepJobId, as BullMQ dedupes by jobId.
  const jobs: StepJob[] = []
  let failures = opts.enqueueFailures ?? 0
  const enqueue = async (job: StepJob) => {
    if (failures > 0) { failures--; throw new Error('enqueue failed (test)') }
    const id = stepJobId(job.filmVersionId, job.step)
    if (!jobs.some((j) => stepJobId(j.filmVersionId, j.step) === id)) jobs.push(job)
  }
  const events: FilmEvent[] = []
  const storage = new FsStorage({ root: cfg.storageDir })
  const app = await buildApp({
    db,
    storage,
    cfg,
    redis: opts.redis ?? ownRedis!,
    enqueue: opts.enqueue ?? enqueue,
    publish: opts.publish ?? (async (e) => { events.push(e) }),
    subscribe: opts.subscribe ?? (() => () => {}),
  }, { logStream: opts.logStream ?? { write: () => {} }, ssePingMs: opts.ssePingMs, rateLimitNamespace: `test-rl-${process.pid}-${Date.now()}-${counter++}:` })
  return {
    app, db, seeded, storage, cfg, jobs, events,
    async close() {
      await app.close()
      await ownRedis?.quit()
      await closeDb()
      rmSync(root, { recursive: true, force: true })
    },
  }
}

/** Logs in through the API and returns the `sid` cookie header value and the csrf token. */
export async function login(app: FastifyInstance, email: string, password: string): Promise<{ cookie: string; csrf: string }> {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email, password } })
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`)
  const sid = res.cookies.find((c) => c.name === 'sid')!
  return { cookie: `sid=${sid.value}`, csrf: res.json().data.csrf_token }
}

export interface SseFrame { event?: string; data?: string; comment?: string }

/** Opens an SSE stream and parses frames as they arrive. */
export async function openSse(url: string, token: string) {
  const ctrl = new AbortController()
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: ctrl.signal })
  const frames: SseFrame[] = []
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return
        buf += value
        let i: number
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const frame: SseFrame = {}
          for (const line of buf.slice(0, i).split('\n')) {
            if (line.startsWith(':')) frame.comment = line.slice(1).trim()
            else if (line.startsWith('event: ')) frame.event = line.slice(7)
            else if (line.startsWith('data: ')) frame.data = line.slice(6)
          }
          frames.push(frame)
          buf = buf.slice(i + 2)
        }
      }
    } catch { /* aborted */ }
  })()
  const until = async (pred: () => boolean, ms = 5000) => {
    const end = Date.now() + ms
    while (!pred()) {
      if (Date.now() > end) throw new Error(`timed out; frames: ${JSON.stringify(frames)}`)
      await new Promise((r) => setTimeout(r, 10))
    }
  }
  return { res, frames, until, close: () => { ctrl.abort(); return pump } }
}
