import { mkdirSync } from 'node:fs'
import { createDb } from '@stick/db'
import { FsStorage, loadServerConfig } from '@stick/providers'
import { createQueues, enqueueStep, redisPublisher, startWorker, urlTarget } from '@stick/worker'
import { Redis } from 'ioredis'
import pino from 'pino'
import { buildApp } from './app.js'
import { createEventHub } from './events-hub.js'
import { failStart, serve } from './serve.js'

/** API and worker in one process, sharing one database: the only way to run on PGlite. */
async function main(): Promise<void> {
  const cfg = loadServerConfig(process.env, 'dev')
  if (!cfg.databaseUrl) mkdirSync(cfg.pgliteDir, { recursive: true })
  const { db, close: closeDb } = await createDb({
    url: cfg.databaseUrl,
    pgliteDir: cfg.pgliteDir,
    onError: (err) => console.error('postgres idle connection error:', err.message),
  })
  const storage = new FsStorage({ root: cfg.storageDir })
  const worker = await startWorker({ db, storage, cfg, log: pino({ name: 'worker' }) }, { redisUrl: cfg.redisUrl })
  const redis = new Redis(cfg.redisUrl, { enableOfflineQueue: false, maxRetriesPerRequest: 1 })
    .on('error', (err) => console.error('redis error:', err.message))
  const queues = createQueues(cfg.redisUrl)
  const hub = createEventHub(cfg.redisUrl)
  const publisher = redisPublisher(cfg.redisUrl, (err) => console.error('redis error:', err.message))
  const app = await buildApp({
    db, storage, cfg, redis,
    enqueue: (job) => enqueueStep(queues, job),
    publish: publisher.publish,
    subscribe: hub.subscribe,
  })
  await serve(app, cfg.host, cfg.port, async () => {
    await worker.close()
    await queues.close()
    await hub.close()
    await publisher.close()
    await redis.quit()
    await closeDb()
  })
  app.log.info({ redis: urlTarget(cfg.redisUrl), db: cfg.databaseUrl ? urlTarget(cfg.databaseUrl) : 'pglite', fake: cfg.fake }, 'dev api + worker started')
}

main().catch((err: unknown) => failStart('dev', err))
