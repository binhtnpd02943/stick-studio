import { describe, expect, test } from 'vitest'
import { defaultCatalog, markX, propX, REACH, resolveTarget, stepAction, trackPositions, type PlayScene, type StageScene } from '../src/index.js'

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

describe('trackPositions', () => {
  const play: PlayScene = {
    ...scene,
    start: { a: 'left', b: 'center' },
    beats: [
      { do: [{ who: 'a', action: 'walk_to', target: 'board' }, { who: 'b', action: 'wave' }] },
      { do: [{ who: 'b', action: 'run_to', target: 'a' }] },
      { do: [{ who: 'a', action: 'wave' }] },
    ],
  }

  test('x of each character at the start of every beat', () => {
    const [b0, b1, b2] = trackPositions(play, defaultCatalog)
    expect(b0).toEqual(new Map([['a', -95], ['b', 0]]))
    expect(b1!.get('a')).toBe(95 - (90 / 2 + 18)) // walked up to the board
    expect(b1!.get('b')).toBe(0)
    expect(b2!.get('b')).toBe(b1!.get('a')! - 40) // ran up to a, CAST_GAP short of them on the approach side
  })

  test('stepAction reports the gap to the target surface for contact actions only', () => {
    const catalog = { ...defaultCatalog, actions: { ...defaultCatalog.actions, grab: { ...defaultCatalog.actions.wave!, id: 'grab', contact: true } } }
    const xs = new Map([['a', { x: -95 }]])
    expect(stepAction({ who: 'a', action: 'grab', target: 'board' }, scene, xs, catalog).gap).toBe(95 - 45 + 95)
    expect(stepAction({ who: 'a', action: 'wave', target: 'board' }, scene, xs, catalog).gap).toBeUndefined()
    const { to } = stepAction({ who: 'a', action: 'walk_to', target: 'board' }, scene, xs, catalog)
    expect(stepAction({ who: 'a', action: 'grab', target: 'board' }, scene, xs, catalog).gap).toBe(18)
    expect(18).toBeLessThanOrEqual(REACH)
    expect(xs.get('a')!.x).toBe(to)
  })
})
