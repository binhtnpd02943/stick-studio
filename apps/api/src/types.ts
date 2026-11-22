import type { FilmEvent, StepJob, StorageProvider } from '@stick/core'
import type { Db } from '@stick/db'
import type { ServerConfig } from '@stick/providers'
import type { Redis } from 'ioredis'

export interface ApiDeps {
  db: Db
  storage: StorageProvider
  cfg: ServerConfig
  /** Rate-limit store and readiness probe. */
  redis: Redis
  enqueue(job: StepJob): Promise<void>
  /** Announces a film status change to SSE listeners; best effort, see announce(). */
  publish(e: FilmEvent): Promise<void>
  subscribe(filmId: string, onEvent: (e: FilmEvent) => void): () => void
}
