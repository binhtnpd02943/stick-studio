import { describe, expect, test } from 'vitest'
import { defaultCatalog, markX, propX, resolveTarget, type StageScene } from '../src/index.js'

const scene: StageScene = { id: 's1', props: [{ id: 'board', type: 'whiteboard', mark: 'right' }] }

describe('stage geometry', () => {
  test('bare marks resolve to their world x', () => {
    expect(markX('right', scene)).toBe(95)
  })

  test('near:<prop> stands clear of the prop width plus the gap, on the approach side', () => {
    expect(markX('near:board', scene, -95)).toBe(95 - (90 / 2 + 18))
  })

  test('walk to a cast member stops CAST_GAP short of them', () => {
    const xs = new Map([['lan', { x: 0 }]])
    expect(resolveTarget('lan', scene, xs, -95, true, defaultCatalog)).toBe(-40)
  })

  test('propX takes a plain screenplay scene, not only a timed one', () => {
    expect(propX('board', scene)).toBe(95)
    expect(() => propX('nope', scene)).toThrow(/unknown prop/)
  })
})
