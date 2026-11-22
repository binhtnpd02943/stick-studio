import { FILM_STEPS } from '@stick/core'
import { describe, expect, test } from 'vitest'
import { doorOf, route, spot, walkMs } from '../src/components/studio/layout'
import { TEAM } from '../src/components/studio/team'

describe('studio layout', () => {
  test('every FILM_STEP has exactly one member and a spot', () => {
    for (const step of FILM_STEPS) {
      expect(TEAM.filter((m) => m.key === step)).toHaveLength(1)
      expect(Number.isFinite(spot(step).x)).toBe(true)
    }
    expect(TEAM.map((m) => m.key)).toEqual(['intake', ...FILM_STEPS])
    expect(TEAM.find((m) => m.key === 'screenplay')).toMatchObject({ name: 'Tùng', role: 'biên kịch', ink: '#3d6fb4' })
  })

  test('a route inside one room goes straight to the target', () => {
    expect(route('story', 'screenplay')).toEqual([spot('screenplay')])
    expect(route('gate', 'render')).toEqual([spot('render')])
  })

  test('a route between rooms passes the exit door and the target door on the corridor floor', () => {
    const corridor = spot('intake').y
    const exit = doorOf('creative', 'studio')
    const enter = doorOf('studio', 'creative')
    expect(route('validate', 'voice')).toEqual([
      { x: exit, y: spot('validate').y }, { x: exit, y: corridor },
      { x: enter, y: corridor }, { x: enter, y: spot('voice').y },
      spot('voice'),
    ])
    // intake is already on the corridor: no corridor door points of its own
    expect(route('intake', 'story')).toEqual([{ x: 640, y: corridor }, { x: 640, y: spot('story').y }, spot('story')])
    expect(doorOf('post', 'review')).toBe(480)
    expect(doorOf('post', 'studio')).toBe(1020)
  })

  test('walkMs grows with distance and is at least 450', () => {
    const a = { x: 0, y: 0 }
    expect(walkMs(a, { x: 10, y: 0 })).toBe(450)
    expect(walkMs(a, { x: 200, y: 100 })).toBe(900)
    expect(walkMs(a, { x: 400, y: 100 })).toBeGreaterThan(walkMs(a, { x: 200, y: 100 }))
  })
})
