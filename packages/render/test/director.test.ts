import { createCanvas } from '@napi-rs/canvas'
import { parseScreenplay, type Timeline } from '@stick/core'
import { loadRig } from '@stick/engine'
import { defaultCatalog as catalog } from '@stick/library'
import { solveTimeline } from '@stick/pipeline'
import { describe, expect, test } from 'vitest'
import { specExample } from '../../core/test/fixtures.js'
import { cameraShift, drawFrame, FRAME, markX, sceneStateAt } from '../src/index.js'

function solved(input: unknown = specExample()): Timeline {
  const r = parseScreenplay(input)
  if (!r.ok) throw new Error(r.issues.join('; '))
  return solveTimeline(r.value, { 's1.b0': 1.6, 's1.b1': 2.0 }, catalog)
}

const tl = solved()
const rig = loadRig()
const scene = tl.scenes[0]!
const [b0, b1] = scene.beats as [NonNullable<(typeof scene.beats)[0]>, NonNullable<(typeof scene.beats)[0]>]
const char = (t: number, id: string) => sceneStateAt(tl, t, rig, catalog).chars.find((c) => c.id === id)!

describe('markX', () => {
  test('near:<prop> picks the side facing fromX', () => {
    expect(markX('near:board', scene, 0)).toBe(32)
    expect(markX('near:board', scene)).toBe(32)
    expect(markX('near:board', scene, 140)).toBe(158)
    expect(markX('left', scene)).toBe(-95)
  })
})

describe('sceneStateAt', () => {
  test('start marks', () => {
    expect(char(0, 'minh').x).toBe(-95)
    expect(char(0, 'lan').x).toBe(0)
  })

  test('walk persists', () => {
    expect(char(b1.end, 'lan').x).toBe(markX('near:board', scene, 0))
    expect(char(b1.end, 'lan').x).toBe(95 - (90 / 2 + 18))
    expect(char(b1.end - 0.1, 'lan').facing).toBe(1)
  })

  test('mid-walk', () => {
    const walk = b1.tracks[0]!
    const x = char((walk.start + walk.end) / 2, 'lan').x
    expect(x).toBeGreaterThan(0)
    expect(x).toBeLessThan(32)
  })

  test('talk while speaking', () => {
    // The fixture's b0 line overlaps minh's think track, so drop the action to isolate talk.
    const ex = specExample()
    const s1 = { ...ex.scenes[0]!, beats: [{ say: ex.scenes[0]!.beats[0]!.say }, ex.scenes[0]!.beats[1]!] }
    const quiet = solved({ ...ex, scenes: [s1] })
    const line = quiet.scenes[0]!.beats[0]!.line!
    const t = (line.start + line.end) / 2
    const rest = rig.breathe(rig.P({ hF: [12, -60], hB: [-4, -52] }), t)
    const pose = sceneStateAt(quiet, t, rig, catalog).chars.find((c) => c.id === 'minh')!.pose
    const moved = Math.max(...(['hF', 'hB'] as const).map((j) => Math.hypot(pose[j][0] - rest[j][0], pose[j][1] - rest[j][1])))
    expect(moved).toBeGreaterThan(1)
  })

  test('holds at rest after the line with no action', () => {
    const t = b1.end
    const rest = rig.breathe(rig.P({ hF: [12, -60], hB: [-4, -52] }), t)
    expect(char(t, 'minh').pose.hF).toEqual(rest.hF)
  })

  test('zoom eases', () => {
    const z = (t: number) => sceneStateAt(tl, t, rig, catalog).zoom
    expect(z(b1.start + 0.25)).toBeGreaterThan(1)
    expect(z(b1.start + 0.25)).toBeLessThan(1.3)
    expect(z(b1.start + 0.6)).toBe(1.3)
    expect(z(b0.start + 0.3)).toBe(1)
  })
})

describe('drawFrame', () => {
  test('is deterministic and draws the ground line', () => {
    const render = () => {
      const c = createCanvas(FRAME.w, FRAME.h)
      drawFrame(c.getContext('2d'), tl, 2.0, rig, catalog)
      return c
    }
    const a = render()
    const b = render()
    expect(a.toBuffer('image/png').equals(b.toBuffer('image/png'))).toBe(true)
    const [r, g, bl] = a.getContext('2d').getImageData(540, 1250, 1, 1).data
    expect(r! + g! + bl!).toBeLessThan(200)
  })
})

describe('cameraShift', () => {
  test('zooms about the focus when everyone fits', () => {
    expect(cameraShift(1.3, 95, [0, 32])).toBeCloseTo(95 * (1 - 1 / 1.3), 5)
    expect(cameraShift(1, 95, [-95, 32])).toBe(0)
  })
  test('slides back so the leftmost figure stays in frame', () => {
    const shift = cameraShift(1.3, 95, [-95, 32])
    expect(-95 - 18 - shift).toBeGreaterThanOrEqual(-150 / 1.3 - 1e-9)
  })
})

describe('continuity', () => {
  const FRAME_DT = 1 / 60
  const withScene = (patch: (s: Timeline['scenes'][number]) => void): Timeline => {
    const copy = structuredClone(tl)
    patch(copy.scenes[0]!)
    return copy
  }
  const frames = (from: number, to: number) => Array.from({ length: Math.round((to - from) / FRAME_DT) + 1 }, (_, i) => from + i * FRAME_DT)
  const maxStep = (xs: number[]) => Math.max(...xs.slice(1).map((x, i) => Math.abs(x - xs[i]!)))

  test('talk ramps in when the speaker’s action ends mid-line', () => {
    const quiet = withScene((s) => {
      s.beats[0]!.tracks = [{ who: 'minh', action: 'nod', params: {}, start: 0, end: 0.8 }]
    })
    const hands = frames(0.7, 0.9).map((t) => sceneStateAt(quiet, t, rig, catalog).chars.find((c) => c.id === 'minh')!.pose)
    const jumps = hands.slice(1).map((p, i) => Math.max(...(['hF', 'hB'] as const).map((j) => Math.hypot(p[j][0] - hands[i]![j][0], p[j][1] - hands[i]![j][1]))))
    expect(Math.max(...jumps)).toBeLessThan(3)
  })

  test('camera offset never jumps when figures cannot all fit', () => {
    const wide = withScene((s) => {
      s.start_marks = { minh: 'left', lan: 'right' }
      s.beats[1]!.tracks = []
      s.beats[1]!.camera = { zoom: 1.6, focus: 'board' }
    })
    const shifts = frames(b1.start - 0.1, b1.start + 0.7).map((t) => {
      const st = sceneStateAt(wide, t, rig, catalog)
      return cameraShift(st.zoom, st.focusX, st.chars.map((c) => c.x))
    })
    expect(maxStep(shifts)).toBeLessThan(6) // smooth easing peaks near 2.9 units per frame; the old snap was 21
  })

  test('focus eases between consecutive camera beats', () => {
    const pan = withScene((s) => {
      s.beats[0]!.camera = { zoom: 1.3, focus: 'left' }
    })
    const focus = frames(b1.start - 0.1, b1.start + 0.7).map((t) => sceneStateAt(pan, t, rig, catalog).focusX)
    expect(focus.at(0)).toBe(-95)
    expect(focus.at(-1)).toBe(95)
    expect(maxStep(focus)).toBeLessThan(15) // a soft 0.5 s pan of 190 units peaks near 10 units per frame
  })
})
