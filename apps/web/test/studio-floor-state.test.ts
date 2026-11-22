import { describe, expect, test } from 'vitest'
import type { FilmDetail, FilmStatus } from '../src/api/schemas'
import { deriveFloor, handoffsBetween } from '../src/components/studio/floor-state'
import { at, detail, film } from './helpers'

const step = (name: string, status: string) => ({ step: name, status, attempt: 1, error: null, started_at: at, finished_at: null }) as FilmDetail['steps'][number]
const floorOf = (status: FilmStatus, steps: FilmDetail['steps'] = []) => deriveFloor(detail(film({ status }), steps))
const upTo = (n: number, last?: string) => [
  ...['story', 'screenplay', 'validate', 'voice', 'timeline', 'gate', 'render', 'contact'].slice(0, n).map((s) => step(s, 'succeeded')),
  ...(last ? [step(last, 'running')] : []),
]

describe('floor state', () => {
  test('queued means Hùng is working', () => {
    expect(floorOf('queued')).toMatchObject({ working: 'intake', failed: null, final: false, note: null })
  })

  test('a running screenplay means Tùng works and story is done', () => {
    const f = floorOf('running', upTo(1, 'screenplay'))
    expect(f.working).toBe('screenplay')
    expect([...f.done]).toEqual(['story'])
  })

  test('awaiting_review is final', () => {
    expect(floorOf('awaiting_review', upTo(8))).toMatchObject({ working: null, final: true })
    expect(floorOf('publishing').final).toBe(true)
    expect(floorOf('published').final).toBe(true)
  })

  test('qa_failed fails the gate', () => {
    expect(floorOf('qa_failed', upTo(6))).toMatchObject({ failed: 'gate', working: null, final: false })
    expect(floorOf('failed', [...upTo(3), step('voice', 'failed')]).failed).toBe('voice')
  })

  test('cancelled and blocked_budget carry a note, skipped counts as done', () => {
    expect(floorOf('cancelled').note).toBe('Đã huỷ')
    expect(floorOf('blocked_budget').note).toBe('Chạm trần chi phí')
    expect(floorOf('running', [step('story', 'skipped')]).done.has('story')).toBe(true)
  })

  test('one step finishing yields one handoff to the next member', () => {
    expect(handoffsBetween(floorOf('running', upTo(0, 'story')), floorOf('running', upTo(1, 'screenplay'))))
      .toEqual([{ from: 'story', to: 'screenplay' }])
    expect(handoffsBetween(floorOf('running', upTo(1)), floorOf('running', upTo(1, 'screenplay')))).toEqual([])
  })

  test('a snapshot that skips several steps yields only the last handoff', () => {
    expect(handoffsBetween(floorOf('running', upTo(1)), floorOf('running', upTo(4, 'timeline'))))
      .toEqual([{ from: 'voice', to: 'timeline' }])
  })

  test('contact finishing hands off to review', () => {
    expect(handoffsBetween(floorOf('running', upTo(7, 'contact')), floorOf('awaiting_review', upTo(8))))
      .toEqual([{ from: 'contact', to: 'review' }])
  })
})
