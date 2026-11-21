import { describe, expect, test } from 'vitest'
import { defaultCatalog, markX, propX, resolveTarget, startXs, stepAction, type StageScene } from '../src/index.js'

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

describe('stepAction', () => {
  const catalog = { ...defaultCatalog, actions: { ...defaultCatalog.actions, grab: { ...defaultCatalog.actions.wave!, id: 'grab', contact: true } } }

  test('locomotion moves the actor, standing clear of the prop on the approach side', () => {
    const xs = startXs({ ...scene, start: { a: 'left' }, beats: [] }, catalog)
    expect(xs.get('a')!.x).toBe(-95)
    expect(stepAction({ who: 'a', action: 'run_to', target: 'board' }, scene, xs, catalog)).toEqual({ from: -95, to: 95 - (90 / 2 + 18) })
    expect(xs.get('a')!.x).toBe(95 - (90 / 2 + 18))
  })

  test('a contact action reports its gap to the target surface and does not move the actor', () => {
    const xs = new Map([['a', { x: -95 }]])
    expect(stepAction({ who: 'a', action: 'grab', target: 'board' }, scene, xs, catalog)).toEqual({ from: -95, to: -95, gap: 95 - 45 + 95 })
    stepAction({ who: 'a', action: 'walk_to', target: 'board' }, scene, xs, catalog)
    expect(stepAction({ who: 'a', action: 'grab', target: 'board' }, scene, xs, catalog).gap).toBe(18) // NEAR_GAP
  })

  test('other actions report no gap', () => {
    const xs = new Map([['a', { x: -95 }]])
    expect(stepAction({ who: 'a', action: 'wave', target: 'board' }, scene, xs, catalog).gap).toBeUndefined()
  })
})
