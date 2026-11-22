export const FILM_STEPS = ['story', 'screenplay', 'validate', 'voice', 'timeline', 'gate', 'render', 'contact'] as const
export type FilmStep = (typeof FILM_STEPS)[number]

export const FILM_STATUSES = ['queued', 'running', 'qa_failed', 'awaiting_review', 'approved', 'publishing', 'published', 'failed', 'cancelled', 'blocked_budget'] as const
export type FilmStatus = (typeof FILM_STATUSES)[number]

/** Statuses a film can be re-queued from, as a new version. */
export const REDOABLE_STATUSES = ['awaiting_review', 'qa_failed', 'failed', 'cancelled', 'blocked_budget', 'approved'] as const satisfies readonly FilmStatus[]

const EDGES: Partial<Record<FilmStatus, readonly FilmStatus[]>> = {
  queued: ['running', 'cancelled', 'blocked_budget', 'failed'],
  running: ['awaiting_review', 'qa_failed', 'failed', 'cancelled', 'blocked_budget'],
  awaiting_review: ['approved'],
}

export function canTransition(from: FilmStatus, to: FilmStatus): boolean {
  if (to === 'queued') return (REDOABLE_STATUSES as readonly FilmStatus[]).includes(from)
  return EDGES[from]?.includes(to) ?? false
}

export const QUEUES = { film: 'film', render: 'render' } as const
export const stepQueue = (step: FilmStep): 'film' | 'render' => (step === 'render' ? QUEUES.render : QUEUES.film)

export interface StepJob { workspaceId: string; filmId: string; filmVersionId: string; step: FilmStep }
export const stepJobId = (versionId: string, step: FilmStep): string => `${versionId}.${step}`

export const STEP_JOB_OPTIONS = { attempts: 4, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: 1000 } as const

export type FilmEvent =
  | { type: 'step'; filmId: string; versionId: string; step: FilmStep; status: 'running' | 'succeeded' | 'failed' | 'skipped'; attempt: number; at: string }
  | { type: 'film'; filmId: string; status: FilmStatus; at: string }

export const filmEventChannel = (filmId: string): string => `film-events:${filmId}`

/** What each step reads from and writes to the film's directory; a trailing `/` means every file under that directory. */
export const STEP_FILES: Record<FilmStep, { reads: string[]; writes: string[] }> = {
  story: { reads: [], writes: ['story.json'] },
  screenplay: { reads: ['story.json'], writes: ['screenplay.json'] },
  validate: { reads: ['screenplay.json'], writes: [] },
  voice: { reads: ['screenplay.json'], writes: ['audio/'] },
  timeline: { reads: ['screenplay.json', 'audio/'], writes: ['timeline.json'] },
  gate: { reads: ['timeline.json'], writes: ['gate.json'] },
  render: { reads: ['timeline.json', 'audio/'], writes: ['film.mp4'] },
  contact: { reads: ['timeline.json'], writes: ['contact.png'] },
}

export interface StorageProvider {
  putFile(key: string, localPath: string): Promise<{ bytes: number; sha256: string }>
  getFile(key: string, localPath: string): Promise<void>
  localPath(key: string): string | undefined
  delete(key: string): Promise<void>
}
