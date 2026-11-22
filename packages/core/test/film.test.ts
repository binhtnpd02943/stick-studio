import { describe, expect, test } from 'vitest'
import { canTransition, FILM_STATUSES, FILM_STEPS, REDOABLE_STATUSES, stepQueue, type FilmStatus } from '../src/index.js'

const EDGES: Record<FilmStatus, FilmStatus[]> = {
  queued: ['running', 'cancelled', 'blocked_budget', 'failed'],
  running: ['awaiting_review', 'qa_failed', 'failed', 'cancelled', 'blocked_budget'],
  qa_failed: ['queued'],
  awaiting_review: ['approved', 'queued'],
  approved: ['queued'],
  publishing: [],
  published: [],
  failed: ['queued'],
  cancelled: ['queued'],
  blocked_budget: ['queued'],
}

describe('film lifecycle', () => {
  test('canTransition allows exactly the listed edges', () => {
    expect(FILM_STATUSES).toHaveLength(10)
    expect([...REDOABLE_STATUSES].sort()).toEqual(Object.keys(EDGES).filter((s) => EDGES[s as FilmStatus].includes('queued')).sort())
    for (const from of FILM_STATUSES) {
      for (const to of FILM_STATUSES) expect(canTransition(from, to), `${from}->${to}`).toBe(EDGES[from].includes(to))
    }
  })

  test('stepQueue sends only render to the render queue', () => {
    for (const step of FILM_STEPS) expect(stepQueue(step), step).toBe(step === 'render' ? 'render' : 'film')
  })
})
