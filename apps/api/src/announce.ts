import type { FilmEvent, FilmStatus } from '@stick/core'
import type { FastifyBaseLogger } from 'fastify'
import type { ApiDeps } from './types.js'

/** Redis down means ioredis queues the publish forever; waiting longer than this would hang the API action. */
export const ANNOUNCE_TIMEOUT_MS = 1000

/**
 * Publishes a film status change. Best effort: the DB transition is already committed and SSE clients resync on their
 * next snapshot, so a publish failure or timeout is logged, never thrown.
 */
export async function announce(log: FastifyBaseLogger, publish: ApiDeps['publish'], filmId: string, status: FilmStatus): Promise<void> {
  const event: FilmEvent = { type: 'film', filmId, status, at: new Date().toISOString() }
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`publish timed out after ${ANNOUNCE_TIMEOUT_MS} ms`)), ANNOUNCE_TIMEOUT_MS)
  })
  try {
    await Promise.race([publish(event), timeout])
  } catch (err) {
    log.error({ err, filmId, status }, 'could not publish film event')
  } finally {
    clearTimeout(timer)
  }
}
