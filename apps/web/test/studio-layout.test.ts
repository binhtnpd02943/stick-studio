import { FILM_STEPS } from '@stick/core'
import { describe, expect, test } from 'vitest'
import { ROOMS, ROOM_LABELS, VIEW, doorOf, route, spot, tagAt, walkMs } from '../src/components/studio/layout'
import { vi } from '../src/i18n/vi'
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

  // Rough glyph widths: name 13px semibold, role 11px mono; the tag stacks the role under the name.
  const TAG_HEIGHT = 36
  const tagWidth = (key: (typeof TEAM)[number]['key']) => Math.max(vi.studio.team[key].name.length * 9, vi.studio.team[key].role.length * 7) + 16
  const tagBox = (key: (typeof TEAM)[number]['key']) => {
    const t = tagAt(key)
    const w = tagWidth(key)
    return { left: t.x - w / 2, right: t.x + w / 2, top: t.y, bottom: t.y + TAG_HEIGHT }
  }

  test('name tags of neighbours never overlap', () => {
    const keys = TEAM.map((m) => m.key)
    for (const a of keys) {
      for (const b of keys) {
        if (a >= b) continue
        const A = tagBox(a)
        const B = tagBox(b)
        const overlap = A.left < B.right && B.left < A.right && A.top < B.bottom && B.top < A.bottom
        expect(overlap, `${a} / ${b}`).toBe(false)
      }
    }
  })

  test('every name tag is whole inside the view and the bottom row hangs below its wall, not across it', () => {
    for (const m of TEAM) expect(tagBox(m.key).bottom, m.key).toBeLessThanOrEqual(VIEW.top + VIEW.height)
    const BOTTOM_WALL = 900
    for (const key of ROOMS.post) expect(tagBox(key).top, key).toBeGreaterThan(BOTTOM_WALL)
  })

  test('room labels never collide with a name tag and sit inside the visible view', () => {
    for (const label of ROOM_LABELS) {
      const box = { left: label.x, right: label.x + vi.studio.rooms[label.key].length * 7, top: label.y - 11, bottom: label.y + 3 }
      expect(box.top).toBeGreaterThanOrEqual(VIEW.top)
      expect(box.bottom).toBeLessThanOrEqual(VIEW.top + VIEW.height)
      for (const m of TEAM) {
        const t = tagBox(m.key)
        const overlap = box.left < t.right && t.left < box.right && box.top < t.bottom && t.top < box.bottom
        expect(overlap, `${label.key} / ${m.key}`).toBe(false)
      }
    }
  })
})
