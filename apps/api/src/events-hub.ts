import { type FilmEvent, filmEventChannel } from '@stick/core'
import { Redis } from 'ioredis'

export interface EventHub {
  /** Resolves once the pattern subscription is active; events published before it are missed. */
  ready: Promise<void>
  subscribe(filmId: string, onEvent: (e: FilmEvent) => void): () => void
  listenerCount(filmId: string): number
  close(): Promise<void>
}

const PREFIX = filmEventChannel('')

/** One Redis subscriber for the whole process, fanned out in memory, so an SSE client costs no Redis connection. */
export function createEventHub(redisUrl: string, onError: (err: Error) => void = (err) => console.error('redis error:', err.message)): EventHub {
  const listeners = new Map<string, Set<(e: FilmEvent) => void>>()
  // ioredis re-subscribes after a reconnect on its own; maxRetriesPerRequest: null keeps it retrying.
  const sub = new Redis(redisUrl, { maxRetriesPerRequest: null }).on('error', onError)
  sub.on('pmessage', (_pattern: string, channel: string, message: string) => {
    const set = listeners.get(channel.slice(PREFIX.length))
    if (!set) return
    let event: FilmEvent
    try {
      event = JSON.parse(message) as FilmEvent
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
      return
    }
    for (const cb of set) cb(event)
  })
  const ready = sub.psubscribe(filmEventChannel('*')).then(() => undefined)
  ready.catch(onError)

  return {
    ready,
    subscribe(filmId, onEvent) {
      const set = listeners.get(filmId) ?? new Set()
      listeners.set(filmId, set.add(onEvent))
      return () => {
        set.delete(onEvent)
        if (set.size === 0 && listeners.get(filmId) === set) listeners.delete(filmId)
      }
    },
    listenerCount: (filmId) => listeners.get(filmId)?.size ?? 0,
    async close() {
      listeners.clear()
      await sub.quit()
    },
  }
}
