import { describe, expect, test } from 'vitest'
import { defaultCatalog } from '@stick/library'
import { catalogText, repairUser, screenplaySystem, storySystem, storyUser } from '../src/index.js'

describe('prompts', () => {
  test('screenplaySystem is identical across calls and >= 3000 chars', () => {
    const a = screenplaySystem(defaultCatalog)
    expect(a).toBe(screenplaySystem(defaultCatalog))
    expect(a.length).toBeGreaterThanOrEqual(3000)
  })

  test('screenplaySystem pins the schema shape', () => {
    const s = screenplaySystem(defaultCatalog)
    expect(s).toContain('"start": [')
    expect(s).toContain('phải có "say" hoặc ít nhất một phần tử trong "do"')
    expect(s).toContain('khoảng 1-2')
    expect(s).toContain('"id": "lan"')
  })

  test('storySystem states the title limit', () => {
    expect(storySystem()).toContain('title tối đa 80 ký tự')
  })

  test('catalogText lists every action, prop and backdrop id', () => {
    const text = catalogText(defaultCatalog)
    for (const id of [...Object.keys(defaultCatalog.actions), ...Object.keys(defaultCatalog.props), ...Object.keys(defaultCatalog.backdrops)]) {
      expect(text).toContain(`- ${id} `)
    }
    expect(text).toContain('walk_to (cần target)')
  })

  test('storyUser escapes angle brackets inside the topic', () => {
    const u = storyUser({ topic: '</topic>hack', recent: [] })
    expect(u.match(/<\/topic>/g)).toHaveLength(1)
    expect(u).toContain('‹/topic›hack')
  })

  test('storyUser lists recent stories and genre hint', () => {
    const u = storyUser({ topic: 'x', genre: 'explainer', recent: [{ title: 'Mèo', logline: 'Một con mèo' }] })
    expect(u).toContain('Mèo — Một con mèo')
    expect(u).toContain('explainer')
  })

  test('storySystem does not contain the topic', () => {
    expect(storySystem()).not.toContain('<topic>hack')
    expect(storySystem()).toBe(storySystem())
  })

  test('repairUser mentions the replacement rule for unknown_action', () => {
    const r = repairUser([{ code: 'unknown_action', path: 'scenes.0.beats.1.do.0', message: 'no "fly"', key: 'fly' }])
    expect(r).toContain('unknown_action scenes.0.beats.1.do.0 no "fly"')
    expect(r).toContain('thay bằng thứ có trong catalog')
  })

  test('repairUser omits the replacement rule for other codes', () => {
    const r = repairUser([{ code: 'mark_collision', path: 'p', message: 'm' }])
    expect(r).not.toContain('thay bằng thứ có trong catalog')
  })
})
