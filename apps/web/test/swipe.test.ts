import { describe, expect, test } from 'vitest'
import { swipeDirection } from '../src/components/swipe'

describe('swipeDirection', () => {
  test('a left swipe is next and a right swipe is prev', () => {
    expect(swipeDirection(-80, 10)).toBe('next')
    expect(swipeDirection(80, 10)).toBe('prev')
  })

  test('a short or mostly vertical move is not a swipe', () => {
    expect(swipeDirection(-40, 0)).toBeNull()
    expect(swipeDirection(-80, 100)).toBeNull()
    expect(swipeDirection(60, 40)).toBeNull() // 60 is not > 1.5 * 40
  })

  test('the threshold is inclusive at 60px', () => {
    expect(swipeDirection(-60, 0)).toBe('next')
    expect(swipeDirection(60, 0)).toBe('prev')
  })
})
