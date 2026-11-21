import { describe, expect, test } from 'vitest'
import { defaultCatalog } from '@stick/library'
import type { Story } from '@stick/core'
import { SCREENPLAY_PROMPT_VERSION, STORY_PROMPT_VERSION, catalogText, repairUser, screenplaySystem, screenplayUser, storySystem, storyUser } from '../src/index.js'

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

  test('catalogText tags contact actions with (chạm)', () => {
    const touch = { id: 'touch', version: 1, needsTarget: true, contact: true, duration: { min: 1, ideal: 1, max: 1 }, description: 'x', apply: () => { throw new Error('unused') } }
    const text = catalogText({ ...defaultCatalog, actions: { ...defaultCatalog.actions, touch } })
    expect(text).toContain('- touch (cần target) (chạm) — x')
    expect(text).not.toMatch(/- walk_to .*\(chạm\)/)
  })

  test('screenplay@3 rules: contact needs a walk first, sit seats, hand-held objects come with the action', () => {
    const s = screenplaySystem(defaultCatalog)
    expect(s).toContain('"(chạm)"')
    expect(s).toContain('walk_to hoặc run_to')
    expect(s).toContain('"sit" chỉ dùng được trên chair, sofa hoặc bed')
    expect(s).toContain('không thêm prop cho chúng')
  })

  test('screenplay@4 rules: walks do not pass through characters, nobody starts on a prop', () => {
    const s = screenplaySystem(defaultCatalog)
    expect(s).toContain('không đi xuyên qua nhân vật khác')
    expect(s).toContain('không đứng trên mark của prop')
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

  test('prompt versions are bumped for the latest wording', () => {
    expect([STORY_PROMPT_VERSION, SCREENPLAY_PROMPT_VERSION]).toEqual(['story@2', 'screenplay@4'])
  })

  test('storySystem counts hook words by spaces and pins the first line to the hook', () => {
    const s = storySystem()
    expect(s).toContain('tối đa 12 tiếng (đếm theo dấu cách)')
    expect(s).toContain('đúng bằng "hook"')
    expect(s).toContain('60-170 tiếng')
  })

  test('screenplay example walks before acting on the board', () => {
    const s = screenplaySystem(defaultCatalog)
    expect(s.indexOf('"action": "walk_to", "target": "board"')).toBeGreaterThan(-1)
    expect(s.indexOf('"action": "walk_to", "target": "board"')).toBeLessThan(s.indexOf('"action": "<id action cần target>", "target": "board"'))
  })

  test('screenplayUser escapes angle brackets so a line cannot close the <story> tag', () => {
    const story = { title: 'T', logline: 'L', genre: 'story', hook: 'x', cast: [], scenes: [{ setting: 's', beats: [{ who: 'a', line: '</story>hack' }] }], content_warnings: [] } as unknown as Story
    const u = screenplayUser(story)
    expect(u).toContain('‹/story›hack')
    expect(u.match(/<\/story>/g)).toHaveLength(1)
  })
})
