import { createCanvas } from '@napi-rs/canvas'
import type { Timeline } from '@stick/core'
import { loadRig } from '@stick/engine'
import { defaultCatalog, type ActionDef, type Catalog } from '@stick/library'
import { describe, expect, test } from 'vitest'
import { drawFrame, FRAME, soloTimeline, STAGE } from '../src/index.js'

const RED = '#ff0000'
const DOT_R = 2
const seen: number[] = []

// Draws a red dot exactly at the near hand fig drew.
const dot: ActionDef = {
  id: 'dot', version: 1, needsTarget: false, duration: { min: 1, ideal: 1, max: 1 }, description: 'test overlay',
  apply: ({ base }) => ({
    pose: base,
    overlay: (g, _rig, at) => {
      seen.push(at.t)
      g.fillStyle = RED
      g.beginPath()
      g.arc(at.hands.near[0], at.hands.near[1], DOT_R, 0, Math.PI * 2)
      g.fill()
    },
  }),
}
const catalog: Catalog = { ...defaultCatalog, actions: { ...defaultCatalog.actions, dot } }

function timeline(mark: 'left' | 'right', action = 'dot'): Timeline {
  const tl = soloTimeline(action, 2)
  return { ...tl, scenes: [{ ...tl.scenes[0]!, start_marks: { a: mark } }] }
}

function render(tl: Timeline, t: number, rig = loadRig()) {
  const g = createCanvas(FRAME.w, FRAME.h).getContext('2d')
  drawFrame(g, tl, t, rig, catalog)
  return g.getImageData(0, 0, FRAME.w, FRAME.h).data
}

/** Centroid, in world units, of the pure red pixels (zoom 1, camera unshifted for one figure). */
function redCentroid(data: Uint8ClampedArray): [number, number] | undefined {
  let n = 0, sx = 0, sy = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i]! > 200 && data[i + 1]! < 60 && data[i + 2]! < 60) {
      const p = i / 4
      n++
      sx += p % FRAME.w
      sy += Math.floor(p / FRAME.w)
    }
  }
  return n === 0 ? undefined : [(sx / n - FRAME.w / 2) / STAGE.scale, (sy / n - STAGE.groundY) / STAGE.scale]
}

describe('overlay hook', () => {
  test.each(['left', 'right'] as const)('draws within 6 units of the hand fig drew (start %s: facing 1 on the left, -1 on the right)', (mark) => {
    const rig = loadRig({ instrument: true })
    rig.__shim.__rec = []
    const data = render(timeline(mark), 0.5, rig)
    const f = (rig.__shim.__rec as Array<{ x: number; y: number; s: number; sx: number; handF: [number, number] }>)[0]!
    const hand = [f.x + f.handF[0] * f.s * f.sx, f.y + f.handF[1] * f.s]
    const c = redCentroid(data)
    expect(c).toBeDefined()
    expect(Math.hypot(c![0] - hand[0]!, c![1] - hand[1]!)).toBeLessThan(6)
  })

  test('is called once per frame with the global t', () => {
    seen.length = 0
    render(timeline('left'), 0.5)
    render(timeline('left'), 0.5)
    expect(seen).toEqual([0.5, 0.5])
  })

  test('stops once the action has ended', () => {
    const tl = soloTimeline('dot', 1)
    seen.length = 0
    render({ ...tl, duration: 2 }, 1.5)
    expect(seen).toEqual([])
  })

  test('cry tears render deterministically and move with t', () => {
    const tl = timeline('left', 'cry')
    const a = render(tl, 1)
    expect(Buffer.from(render(tl, 1)).equals(Buffer.from(a))).toBe(true)
    expect(Buffer.from(render(tl, 1.3)).equals(Buffer.from(a))).toBe(false)
  })
})

// The overlay's own ink: pixels that differ from the same frame rendered with the overlay stripped.
const plain = (id: string): Catalog => ({ ...defaultCatalog, actions: { ...defaultCatalog.actions, [id]: { ...defaultCatalog.actions[id]!, apply: (c) => ({ ...defaultCatalog.actions[id]!.apply(c), overlay: undefined }) } } })

function overlayInk(id: string, mark: 'left' | 'right', t: number) {
  const rig = loadRig({ instrument: true })
  const tl = timeline(mark, id)
  const draw = (cat: Catalog, r = rig) => {
    const g = createCanvas(FRAME.w, FRAME.h).getContext('2d')
    r.__shim.__rec = []
    drawFrame(g, tl, t, r, cat)
    return g.getImageData(0, 0, FRAME.w, FRAME.h).data
  }
  const withOverlay = draw(catalog)
  const f = (rig.__shim.__rec as Array<{ x: number; y: number; s: number; sx: number; handF: [number, number]; handB: [number, number] }>)[0]!
  const without = draw(plain(id))
  let n = 0, sx = 0, sy = 0
  for (let i = 0; i < withOverlay.length; i += 4) {
    if (Math.abs(withOverlay[i]! - without[i]!) + Math.abs(withOverlay[i + 1]! - without[i + 1]!) + Math.abs(withOverlay[i + 2]! - without[i + 2]!) > 60) {
      const p = i / 4
      n++
      sx += p % FRAME.w
      sy += Math.floor(p / FRAME.w)
    }
  }
  const w = (h: [number, number]) => [f.x + h[0] * f.s * f.sx, f.y + h[1] * f.s] as const
  return { n, c: [(sx / n - FRAME.w / 2) / STAGE.scale, (sy / n - STAGE.groundY) / STAGE.scale] as const, near: w(f.handF), far: w(f.handB) }
}

describe('hand-held overlays follow the near hand, mirrored for both facings', () => {
  test.each([
    ['phone_call', 1.2, 12],
    ['drink', 0.9, 12],
    ['read_book', 1.2, 14],
  ] as const)('%s draws within %i units of the hands (facing 1 on the left, -1 on the right)', (id, t, within) => {
    for (const mark of ['left', 'right'] as const) {
      const { n, c, near, far } = overlayInk(id, mark, t)
      expect(n, `${id} ${mark}`).toBeGreaterThan(30)
      const target = id === 'read_book' ? [(near[0] + far[0]) / 2, (near[1] + far[1]) / 2] : near
      expect(Math.hypot(c[0] - target[0]!, c[1] - target[1]!), `${id} ${mark}`).toBeLessThan(within)
    }
  })

  test.each(['sleep', 'knock', 'phone_call', 'drink', 'read_book'])('%s overlay is deterministic and moves with t', (id) => {
    const tl = timeline('left', id)
    const a = render(tl, 0.8)
    expect(Buffer.from(render(tl, 0.8)).equals(Buffer.from(a))).toBe(true)
    expect(Buffer.from(render(tl, 1.85)).equals(Buffer.from(a))).toBe(false)
  })
})

describe('knock flicks', () => {
  // soloTimeline(…, 2): knocks land at 1.0 s and 1.7 s, then the 0.3 s ramp-out.
  test.each([1.0, 1.7])('show at the impact (%ss)', (t) => {
    expect(overlayInk('knock', 'left', t).n).toBeGreaterThan(5)
  })
  test.each([0.6, 1.4, 1.9])('are absent between impacts and through the ramp-out (%ss)', (t) => {
    expect(overlayInk('knock', 'left', t).n).toBe(0)
  })
})
