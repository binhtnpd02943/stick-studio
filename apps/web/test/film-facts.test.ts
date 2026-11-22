import { FILM_STEPS } from '@stick/core'
import { describe, expect, test } from 'vitest'
import { retryStep } from '../src/pages/film/facts'

const run = (step: string, status: string) => ({ step, status, attempt: 1, error: null, started_at: null, finished_at: null }) as never

describe('retryStep', () => {
  test('restarts from the step that failed', () => {
    expect(retryStep({ steps: [run('story', 'succeeded'), run('screenplay', 'succeeded'), run('voice', 'failed')] }, FILM_STEPS)).toBe('voice')
  })

  test('without a failed step, restarts from the first step not done; skipped counts as done', () => {
    expect(retryStep({ steps: [run('story', 'succeeded'), run('screenplay', 'skipped'), run('validate', 'running')] }, FILM_STEPS)).toBe('validate')
  })

  test('with nothing run yet it starts at the first step, and with everything done also at the first', () => {
    expect(retryStep({ steps: [] }, FILM_STEPS)).toBe('story')
    expect(retryStep({ steps: FILM_STEPS.map((s) => run(s, 'succeeded')) }, FILM_STEPS)).toBe('story')
  })
})
