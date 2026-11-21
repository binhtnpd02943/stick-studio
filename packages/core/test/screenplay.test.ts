import { describe, expect, test } from 'vitest'
import { beatId, parseScreenplay } from '../src/index.js'

const specExample = () => ({
  version: 1,
  format: { aspect: '9:16', fps: 30 },
  cast: [
    { id: 'minh', name: 'Minh', look: { ink: '#141414', hair: 'short' }, voice: 'male_young' },
    { id: 'lan', name: 'Lan', look: { ink: '#d97757', hair: 'ponytail' }, voice: 'female_young' },
  ],
  scenes: [
    {
      id: 's1',
      backdrop: 'classroom',
      props: [{ id: 'board', type: 'whiteboard', mark: 'right' }],
      start: { minh: 'left', lan: 'center' },
      beats: [
        {
          say: { who: 'minh', text: 'Lan ơi, phân số là gì vậy?' },
          do: [{ who: 'minh', action: 'scratch_head' }],
        },
        {
          do: [
            { who: 'lan', action: 'walk_to', target: 'board' },
            { who: 'lan', action: 'point_at', target: 'board' },
          ],
          say: { who: 'lan', text: 'Nhìn cái bánh pizza này nhé.' },
          camera: { zoom: 1.3, focus: 'board' },
        },
      ],
    },
  ],
})

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
})

test('beatId joins scene id and index', () => {
  expect(beatId('s1', 0)).toBe('s1.b0')
})
