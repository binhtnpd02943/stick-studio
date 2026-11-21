import { describe, expect, test } from 'vitest'
import { beatId, parseScreenplay } from '../src/index.js'
import { specExample } from './fixtures.js'

describe('parseScreenplay', () => {
  test('parses the spec example', () => {
    const r = parseScreenplay(specExample())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.scenes[0]!.beats.length).toBe(2)
  })

  test('rejects landscape aspect', () => {
    const s = specExample()
    s.format.aspect = '16:9'
    const r = parseScreenplay(s)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.some((i) => i.includes('format.aspect'))).toBe(true)
  })

  test('rejects a beat with neither say nor do', () => {
    const s = specExample()
    s.scenes[0]!.beats.push({ camera: { zoom: 1, focus: 'board' } } as never)
    expect(parseScreenplay(s).ok).toBe(false)
  })

  test('rejects 5 cast members', () => {
    const s = specExample()
    s.cast = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`, name: `C${i}`, look: { ink: '#000000', hair: 'none' }, voice: 'male_young',
    }))
    expect(parseScreenplay(s).ok).toBe(false)
  })

  test('rejects a 161-character line', () => {
    const s = specExample()
    s.scenes[0]!.beats[0]!.say!.text = 'x'.repeat(161)
    expect(parseScreenplay(s).ok).toBe(false)
  })

  test('rejects ids that are not filename-safe', () => {
    for (const set of [
      (s: ReturnType<typeof specExample>) => (s.scenes[0]!.id = '../x'),
      (s: ReturnType<typeof specExample>) => (s.cast[0]!.id = 'a/b'),
      (s: ReturnType<typeof specExample>) => (s.scenes[0]!.props[0]!.id = 'x'.repeat(33)),
    ]) {
      const s = specExample()
      set(s)
      expect(parseScreenplay(s).ok).toBe(false)
    }
  })
})

test('rejects uppercase ids', () => {
  const s = specExample()
  ;(s.cast[0] as { id: string }).id = 'Minh'
  const r = parseScreenplay(s)
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.issues.some((i) => i.startsWith('cast.0.id'))).toBe(true)
})

test('beatId joins scene id and index', () => {
  expect(beatId('s1', 0)).toBe('s1.b0')
})
