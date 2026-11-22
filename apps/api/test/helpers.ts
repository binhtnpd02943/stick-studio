import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { StepJob } from '@stick/core'
import type { Db } from '@stick/db'
import { createTestDb, seedWorkspace } from '@stick/db/testing'
import { FsStorage, loadServerConfig } from '@stick/providers'
import type { FastifyInstance } from 'fastify'
import { Redis } from 'ioredis'
import { inject } from 'vitest'
import { buildApp } from '../src/app.js'

export const TEST_SIGNING_KEY = 'test-url-signing-key-0123456789abcdef'

let counter = 0

export interface TestApiOptions {
  /** Replaces the test Redis, e.g. one pointed at a closed port. testApi does not close it. */
  redis?: Redis
  /** Receives every log line as JSON; logs are discarded otherwise. */
  logStream?: { write(line: string): void }
}

export interface TestApi {
  app: FastifyInstance
  db: Db
  seeded: Awaited<ReturnType<typeof seedWorkspace>>
  jobs: StepJob[]
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
  const jobs: StepJob[] = []
  const app = await buildApp({
    db,
    storage: new FsStorage({ root: cfg.storageDir }),
    cfg,
    redis: opts.redis ?? ownRedis!,
    enqueue: async (job) => { jobs.push(job) },
    subscribe: () => () => {},
  }, { logStream: opts.logStream ?? { write: () => {} }, rateLimitNamespace: `test-rl-${process.pid}-${Date.now()}-${counter++}:` })
  return {
    app, db, seeded, jobs,
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
