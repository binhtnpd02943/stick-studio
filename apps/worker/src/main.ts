import { createDb } from '@stick/db'
import { FsStorage, loadServerConfig } from '@stick/providers'
import pino from 'pino'
import { startWorker } from './start.js'

const log = pino({ name: 'worker' })

async function main(): Promise<void> {
  const cfg = loadServerConfig(process.env, 'worker')
  // PGlite is single-process: a worker next to the API would each open its own copy of the data.
  if (!cfg.databaseUrl) throw new Error('worker needs DATABASE_URL: PGlite is single-process, use npm run dev')

  const { db, close: closeDb } = await createDb({
    url: cfg.databaseUrl,
    onError: (err) => log.error({ err }, 'postgres idle connection error'),
  })
  const worker = await startWorker(
    { db, storage: new FsStorage({ root: cfg.storageDir }), cfg, log },
    { redisUrl: cfg.redisUrl },
  )
  log.info({ redis: cfg.redisUrl.replace(/\/\/[^@/]*@/, '//'), fake: cfg.fake }, 'worker started')

  let stopping = false
  const stop = (signal: string) => {
    if (stopping) return
    stopping = true
    log.info({ signal }, 'shutting down')
    // In-flight jobs finish, then Redis, then the database.
    worker.close().then(closeDb).then(
      () => process.exit(0),
      (err: unknown) => { log.error({ err }, 'shutdown failed'); process.exit(1) },
    )
  }
  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT', () => stop('SIGINT'))
}

main().catch((err: unknown) => {
  log.fatal({ err: err instanceof Error ? err.message : String(err) }, 'worker failed to start')
  process.exit(1)
})
