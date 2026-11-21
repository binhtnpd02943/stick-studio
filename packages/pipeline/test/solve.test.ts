import { describe, expect, test } from 'vitest'
import { parseScreenplay, type Screenplay } from '@stick/core'
import { defaultCatalog as catalog } from '@stick/library'
import { specExample } from '../../core/test/fixtures.js'
import { estimateLineDuration, solveTimeline } from '../src/index.js'

function parse(input: unknown): Screenplay {
  const r = parseScreenplay(input)
  if (!r.ok) throw new Error(r.issues.join('; '))
  return r.value
}

// Two-scene screenplay built from the spec example; `beats` override scene 1's beats.
function twoScene(beats: unknown[]): Screenplay {
  const ex = specExample()
  const s1 = { ...ex.scenes[0]!, beats }
  return parse({ ...ex, scenes: [s1, { ...s1, id: 's2' }] })
}

describe('solveTimeline', () => {
  test('stretches actions to fit the line', () => {
    const tl = solveTimeline(parse(specExample()), { 's1.b0': 1.0, 's1.b1': 2.0 }, catalog)
    const [b0, b1] = tl.scenes[0]!.beats
    const [walk, point] = b1!.tracks
    expect(b1!.start).toBeCloseTo(b0!.end, 5)
    expect(b1!.end - b1!.start).toBeCloseTo(2.45, 2)
    expect(walk).toMatchObject({ who: 'lan', action: 'walk_to', target: 'board', params: {} })
    expect(walk!.start).toBeCloseTo(b1!.start, 5)
    expect(walk!.end - b1!.start).toBeCloseTo(1.47, 2)
    expect(point!.start).toBeCloseTo(walk!.end, 5)
    expect(point!.end - b1!.start).toBeCloseTo(2.45, 2)
    expect(b1!.camera).toEqual({ zoom: 1.3, focus: 'board' })
    expect(tl.scenes[0]!.start_marks).toEqual({ minh: 'left', lan: 'center' })
  })

  test('line-only beat', () => {
    const sp = twoScene([{ say: { who: 'minh', text: 'Xin chào' } }])
    const b = solveTimeline(sp, { 's1.b0': 1.0 }, catalog).scenes[0]!.beats[0]!
    expect(b.end - b.start).toBeCloseTo(1.45, 2)
    expect(b.line!.start - b.start).toBeCloseTo(0.15, 2)
    expect(b.line!.end - b.start).toBeCloseTo(1.15, 2)
    expect(b.tracks).toEqual([])
  })

  test('clamps to max then holds', () => {
    const sp = twoScene([{ say: { who: 'minh', text: 'Dài lắm' }, do: [{ who: 'minh', action: 'nod' }] }])
    const b = solveTimeline(sp, { 's1.b0': 10.0 }, catalog).scenes[0]!.beats[0]!
    expect(b.tracks[0]!.end - b.tracks[0]!.start).toBeCloseTo(1.2, 2)
    expect(b.end - b.start).toBeCloseTo(10.45, 2)
  })

  test('missing duration is estimated', () => {
    const sp = twoScene([{ say: { who: 'minh', text: 'một hai ba bốn năm sáu' } }])
    const b = solveTimeline(sp, {}, catalog).scenes[0]!.beats[0]!
    expect(b.line!.end - b.line!.start).toBeCloseTo(1.98, 2)
    expect(estimateLineDuration('a b')).toBe(1.0)
  })

  test('scenes are contiguous', () => {
    const sp = twoScene([{ do: [{ who: 'minh', action: 'think' }] }])
    const tl = solveTimeline(sp, {}, catalog)
    expect(tl.scenes[0]!.start).toBe(0)
    expect(tl.scenes[1]!.start).toBe(tl.scenes[0]!.end)
    expect(tl.duration).toBe(tl.scenes.at(-1)!.end)
    expect(tl.scenes[0]!.end).toBeCloseTo(1.5 + 0.4, 2)
  })

  test.each([NaN, -1, 0])('line duration %s falls back to the estimate', (d) => {
    const text = 'một hai ba bốn năm sáu'
    const tl = solveTimeline(twoScene([{ say: { who: 'minh', text } }]), { 's1.b0': d }, catalog)
    const line = tl.scenes[0]!.beats[0]!.line!
    expect(line.end - line.start).toBeCloseTo(estimateLineDuration(text), 5)
    expect(Number.isFinite(tl.duration)).toBe(true)
  })
})
