import { createDb } from '@stick/db'
import { FsStorage, loadServerConfig } from '@stick/providers'
import { createQueues, enqueueStep, urlTarget } from '@stick/worker'
import { Redis } from 'ioredis'
import { buildApp } from './app.js'
import { failStart, serve } from './serve.js'

async function main(): Promise<void> {
  const cfg = loadServerConfig(process.env, 'api')
  // PGlite is single-process: an API next to the worker would each open its own copy of the data.
  if (!cfg.databaseUrl) throw new Error('api needs DATABASE_URL: PGlite is single-process, use npm run dev')

  const { db, close: closeDb } = await createDb({
    url: cfg.databaseUrl,
    onError: (err) => console.error('postgres idle connection error:', err.message),
  })
  // No offline queue: with Redis down, rate-limit and readiness calls fail at once instead of piling up.
  const redis = new Redis(cfg.redisUrl, { enableOfflineQueue: false, maxRetriesPerRequest: 1 })
    .on('error', (err) => console.error('redis error:', err.message))
  const queues = createQueues(cfg.redisUrl)
  const app = await buildApp({
    db,
    storage: new FsStorage({ root: cfg.storageDir }),
    cfg,
    redis,
    enqueue: (job) => enqueueStep(queues, job),
    subscribe: () => () => {}, // Task 10 replaces this with the Redis event hub.
  })
  await serve(app, cfg.host, cfg.port, async () => {
    await queues.close()
    await redis.quit()
    await closeDb()
  })
  app.log.info({ redis: urlTarget(cfg.redisUrl), postgres: urlTarget(cfg.databaseUrl), fake: cfg.fake }, 'api started')
}

main().catch((err: unknown) => failStart('api', err))
