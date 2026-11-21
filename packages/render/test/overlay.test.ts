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
