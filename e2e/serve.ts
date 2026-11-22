import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp, createEventHub } from '@stick/api'
import { createDb } from '@stick/db'
import { seedWorkspace } from '@stick/db/testing'
import { FsStorage, loadServerConfig } from '@stick/providers'
import { createQueues, enqueueStep, redisPublisher, startWorker } from '@stick/worker'
import { Redis } from 'ioredis'
import pino from 'pino'
import { startRedis } from '../vitest.redis-setup.js'
import { E2E_EMAIL, E2E_PASSWORD, E2E_PORT } from './constants.js'

// Undone in reverse on shutdown or on a failed start, so the redis child and the temp dir never outlive the run.
const cleanups: (() => Promise<unknown> | void)[] = []

async function stop(code: number): Promise<never> {
  try {
    for (const undo of cleanups.splice(0).reverse()) {
      try { await undo() } catch (err) { console.error(`e2e cleanup failed: ${err instanceof Error ? err.message : String(err)}`) }
    }
  } finally {
    process.exit(code)
  }
}

/** API, worker, private Redis and in-memory PGlite in one process for the Playwright suite. Fake providers only. */
async function main(): Promise<void> {
  const redisServer = await startRedis()
  cleanups.push(redisServer.stop)
  const root = mkdtempSync(join(tmpdir(), 'stick-e2e-'))
  cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  const cfg = loadServerConfig({
    STICK_FAKE: '1',
    STICK_URL_SIGNING_KEY: 'e2e-url-signing-key-0123456789abcdef',
    STICK_WEB_DIR: 'apps/web/dist',
    STICK_STORAGE_DIR: join(root, 'storage'),
    STICK_CACHE_DIR: join(root, 'cache'),
    REDIS_URL: redisServer.url,
    HOST: '127.0.0.1',
    PORT: String(E2E_PORT),
  }, 'dev')
  const { db, close: closeDb } = await createDb({})
  cleanups.push(closeDb)
  await seedWorkspace(db, { email: E2E_EMAIL, password: E2E_PASSWORD })
  const storage = new FsStorage({ root: cfg.storageDir })
  const redis = new Redis(cfg.redisUrl, { enableOfflineQueue: false, maxRetriesPerRequest: 1 })
  cleanups.push(() => redis.quit())
  const queues = createQueues(cfg.redisUrl)
  cleanups.push(() => queues.close())
  const hub = createEventHub(cfg.redisUrl)
  cleanups.push(() => hub.close())
  const publisher = redisPublisher(cfg.redisUrl, (err) => console.error('redis error:', err.message))
  cleanups.push(() => publisher.close())
  const worker = await startWorker({ db, storage, cfg, log: pino({ name: 'worker', level: 'warn' }) }, { redisUrl: cfg.redisUrl })
  cleanups.push(() => worker.close())
  const app = await buildApp({
    db, storage, cfg, redis,
    enqueue: (job) => enqueueStep(queues, job),
    publish: publisher.publish,
    subscribe: hub.subscribe,
  }, { logStream: { write: () => {} } })
  cleanups.push(() => app.close())
  await app.listen({ host: cfg.host, port: cfg.port })
  process.once('SIGTERM', () => void stop(0))
  process.once('SIGINT', () => void stop(0))
}

main().catch((err: unknown) => {
  console.error(`e2e server failed to start: ${err instanceof Error ? err.message : String(err)}`)
  void stop(1)
})
