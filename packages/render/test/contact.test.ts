import { createCanvas } from '@napi-rs/canvas'
import type { Timeline } from '@stick/core'
import { loadRig, registerFonts } from '@stick/engine'
import { defaultCatalog } from '@stick/library'
import { beforeAll, describe, expect, test } from 'vitest'
import { drawFrame, FRAME, jointWorld, sceneStateAt, soloTimeline, STAGE } from '../src/index.js'

beforeAll(() => registerFonts())

// Seated and contact actions on furniture, approached from either side with walk_to first (the way the solver sequences them).
const WALK_S = 2.5
const ACT_S = 3
const MID = WALK_S + ACT_S / 2
const SIDES = ['left', 'right'] as const
const CHANNEL_TOL = 24
const MIRROR_MAX_PX = 400 // anti-aliasing slack; the old asymmetric chair, bed and desk differed by 4,600 to 15,600
const STEEL = { r: 0xe4, g: 0xe6, b: 0xe9 }
const HAND_BOX = { halfW: 10, up: 5, down: 5 } // world units around a hand
const MIN_STEEL_PX = 20

const rig = loadRig()

function timeline(action: string, prop: string, side: (typeof SIDES)[number]): Timeline {
  const base = soloTimeline(action, ACT_S, prop, prop)
  const scene = base.scenes[0]!
  const track = (a: string, start: number, end: number) => ({ who: 'a', action: a, target: prop, params: {}, start, end })
  return {
    ...base,
    duration: WALK_S + ACT_S,
    scenes: [{
      ...scene, end: WALK_S + ACT_S,
      props: [{ id: prop, type: prop, mark: 'center' }],
      start_marks: { a: side },
      beats: [{ id: 's1.b0', start: 0, end: WALK_S + ACT_S, tracks: [track('walk_to', 0, WALK_S), track(action, WALK_S, WALK_S + ACT_S)] }],
    }],
  }
}

const frame = (tl: Timeline, t: number) => {
  const g = createCanvas(FRAME.w, FRAME.h).getContext('2d')
  drawFrame(g, tl, t, rig, defaultCatalog)
  return g.getImageData(0, 0, FRAME.w, FRAME.h).data
}

const CASES = [['sit', 'chair'], ['sit', 'sofa'], ['sit', 'bed'], ['type_laptop', 'desk'], ['type_laptop', 'table']] as const

describe.each(CASES)('%s on %s', (action, prop) => {
  test('the scene is the same mirrored, whichever side the actor arrives from', () => {
    const [l, r] = SIDES.map((s) => frame(timeline(action, prop, s), MID))
    // Left arrival mirrors right arrival only if the prop reads correctly from both sides.
    const flipped = new Uint8ClampedArray(l!.length)
    for (let y = 0; y < FRAME.h; y++) for (let x = 0; x < FRAME.w; x++) flipped.set(l!.subarray((y * FRAME.w + x) * 4, (y * FRAME.w + x) * 4 + 4), (y * FRAME.w + (FRAME.w - 1 - x)) * 4)
    let n = 0
    for (let i = 0; i < l!.length; i += 4) if ([0, 1, 2].some((c) => Math.abs(flipped[i + c]! - r![i + c]!) > CHANNEL_TOL)) n++
    expect(n).toBeLessThanOrEqual(MIRROR_MAX_PX)
  })
})

describe.each(['chair', 'sofa', 'bed'])('sit on %s', (prop) => {
  test.each(SIDES)('hip lands over the seat, arriving from the %s', (side) => {
    const tl = timeline('sit', prop, side)
    const c = sceneStateAt(tl, MID, rig, defaultCatalog).chars[0]!
    const def = defaultCatalog.props[prop]!
    const [hx, hy] = jointWorld(c.pose, 'hip', c.x, c.facing)
    expect(Math.abs(hx), `hip x ${hx}`).toBeLessThanOrEqual(def.width / 2)
    expect(Math.abs(hy - def.seatY!), `hip y ${hy} vs seat ${def.seatY}`).toBeLessThanOrEqual(6)
    expect(c.facing).toBe(side === 'left' ? 1 : -1)
  })
})

describe.each(['desk', 'table'])('type_laptop on %s', (prop) => {
  test.each(SIDES)('a laptop is under the hands, arriving from the %s', (side) => {
    const tl = timeline('type_laptop', prop, side)
    const c = sceneStateAt(tl, MID, rig, defaultCatalog).chars[0]!
    // The prop alone, through the stage transform: count laptop-base (steel) pixels in a box around each hand.
    const g = createCanvas(FRAME.w, FRAME.h).getContext('2d')
    g.translate(FRAME.w / 2, STAGE.groundY)
    g.scale(STAGE.scale, STAGE.scale)
    defaultCatalog.props[prop]!.draw(g as unknown as CanvasRenderingContext2D, rig, 0, MID)
    const data = g.getImageData(0, 0, FRAME.w, FRAME.h).data
    for (const j of ['hF', 'hB'] as const) {
      const [hx, hy] = jointWorld(c.pose, j, c.x, c.facing)
      let steel = 0
      for (let py = Math.floor(STAGE.groundY + (hy - HAND_BOX.up) * STAGE.scale); py < STAGE.groundY + (hy + HAND_BOX.down) * STAGE.scale; py++) {
        for (let px = Math.floor(FRAME.w / 2 + (hx - HAND_BOX.halfW) * STAGE.scale); px < FRAME.w / 2 + (hx + HAND_BOX.halfW) * STAGE.scale; px++) {
          const i = (py * FRAME.w + px) * 4
          if (data[i + 3]! > 200 && Math.abs(data[i]! - STEEL.r) < 3 && Math.abs(data[i + 1]! - STEEL.g) < 3 && Math.abs(data[i + 2]! - STEEL.b) < 3) steel++
        }
      }
      expect(steel, `${prop} ${side} ${j} at (${hx.toFixed(1)}, ${hy.toFixed(1)})`).toBeGreaterThanOrEqual(MIN_STEEL_PX)
    }
  })
})
