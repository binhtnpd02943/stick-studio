import type { FastifyInstance } from 'fastify'

/** Listens, and on SIGTERM/SIGINT closes the server first (no new requests), then `cleanup` in order. */
export async function serve(app: FastifyInstance, host: string, port: number, cleanup: () => Promise<void>): Promise<void> {
  await app.listen({ host, port })
  let stopping = false
  const stop = (signal: string) => {
    if (stopping) return
    stopping = true
    app.log.info({ signal }, 'shutting down')
    app.close().then(cleanup).then(
      () => process.exit(0),
      (err: unknown) => { app.log.error({ err }, 'shutdown failed'); process.exit(1) },
    )
  }
  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT', () => stop('SIGINT'))
}

/** Pre-listen failures: the message only, since a config or connection error must not dump env-derived values. */
export function failStart(name: string, err: unknown): never {
  console.error(`${name} failed to start: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
