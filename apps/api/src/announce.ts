import type { FilmEvent, FilmStatus } from '@stick/core'
import type { FastifyBaseLogger } from 'fastify'
import type { ApiDeps } from './types.js'

/**
 * Publishes a film status change. Best effort: the DB transition is already committed and SSE clients resync on their
 * next snapshot, so a publish failure is logged, never thrown.
 */
export async function announce(log: FastifyBaseLogger, publish: ApiDeps['publish'], filmId: string, status: FilmStatus): Promise<void> {
  const event: FilmEvent = { type: 'film', filmId, status, at: new Date().toISOString() }
  try {
    await publish(event)
  } catch (err) {
    log.error({ err, filmId, status }, 'could not publish film event')
  }
}
