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

/** API, worker, private Redis and in-memory PGlite in one process for the Playwright suite. Fake providers only. */
async function main(): Promise<void> {
  const redisServer = await startRedis()
  const root = mkdtempSync(join(tmpdir(), 'stick-e2e-'))
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
  await seedWorkspace(db, { email: E2E_EMAIL, password: E2E_PASSWORD })
  const storage = new FsStorage({ root: cfg.storageDir })
  const worker = await startWorker({ db, storage, cfg, log: pino({ name: 'worker', level: 'warn' }) }, { redisUrl: cfg.redisUrl })
  const redis = new Redis(cfg.redisUrl, { enableOfflineQueue: false, maxRetriesPerRequest: 1 })
  const queues = createQueues(cfg.redisUrl)
  const hub = createEventHub(cfg.redisUrl)
  const publisher = redisPublisher(cfg.redisUrl, (err) => console.error('redis error:', err.message))
  const app = await buildApp({
    db, storage, cfg, redis,
    enqueue: (job) => enqueueStep(queues, job),
    publish: publisher.publish,
    subscribe: hub.subscribe,
  }, { logStream: { write: () => {} } })
  await app.listen({ host: cfg.host, port: cfg.port })

  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    await app.close()
    await worker.close()
    await queues.close()
    await hub.close()
    await publisher.close()
    await redis.quit()
    await closeDb()
    await redisServer.stop()
    rmSync(root, { recursive: true, force: true })
    process.exit(0)
  }
  process.on('SIGTERM', () => void stop())
  process.on('SIGINT', () => void stop())
}

main().catch((err: unknown) => {
  console.error(`e2e server failed to start: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
