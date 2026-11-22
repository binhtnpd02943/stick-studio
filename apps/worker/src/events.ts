import { type FilmEvent, filmEventChannel } from '@stick/core'
import { redisConnection } from './queues.js'

export function redisPublisher(redisUrl: string, onError?: (err: Error) => void): { publish(e: FilmEvent): Promise<void>; close(): Promise<void> } {
  const connection = redisConnection(redisUrl, onError)
  return {
    async publish(e) { await connection.publish(filmEventChannel(e.filmId), JSON.stringify(e)) },
    async close() { await connection.quit() },
  }
}
