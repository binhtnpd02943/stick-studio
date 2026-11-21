import type { Rig } from '@stick/engine'
import type { ActionDef, OverlayAt } from '../types'
import { bump } from './bump'

const PAGE_W = 11 // each page
const PAGE_H = 15
const TILT = 0.2 // the top leans toward the reader
const FLIP_PERIOD_S = 1.7
const FLIP_S = 0.3

/** An open book resting on both hands (neutral ink, mirrored with the figure); a page turns now and then, a pure function of `t`. */
function drawBook(g: CanvasRenderingContext2D, rig: Rig, at: OverlayAt, w: number): void {
  const cx = (at.hands.near[0] + at.hands.far[0]) / 2, cy = Math.max(at.hands.near[1], at.hands.far[1])
  const flip = rig.seg(at.t % FLIP_PERIOD_S, 0, FLIP_S)
  g.save()
  g.globalAlpha = Math.min(1, w * 2)
  g.translate(cx, cy + 1)
  g.scale(at.facing, 1)
  g.rotate(TILT)
  const { C } = rig
  // cover, then the two pages meeting at the spine
  rig.rr(g, -PAGE_W - 1.5, -PAGE_H - 1.5, PAGE_W * 2 + 3, PAGE_H + 2.5, 1.5)
  rig.inkFill(g, C.faint, 1.3)
  for (const side of [-1, 1]) {
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(side * PAGE_W, -0.8)
    g.lineTo(side * PAGE_W, -PAGE_H)
    g.lineTo(0, -PAGE_H + 0.8)
    g.closePath()
    rig.inkFill(g, C.paper, 1)
    for (let i = 0; i < 3; i++) rig.ln(g, side * 2, -4 - i * 3.5, side * (PAGE_W - 2), -4.4 - i * 3.5, 0.9, C.soft)
  }
  if (flip > 0 && flip < 1) {
    const reach = Math.cos(Math.PI * flip) * PAGE_W
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(reach, -2.5 * Math.sin(Math.PI * flip))
    g.lineTo(reach, -PAGE_H - 2.5 * Math.sin(Math.PI * flip))
    g.lineTo(0, -PAGE_H + 0.8)
    g.closePath()
    rig.inkFill(g, C.paper, 1)
  }
  rig.ln(g, 0, 0.5, 0, -PAGE_H, 1.4)
  g.restore()
}

// shortcut: posture does not persist across beats; a seated character stands between beats. Upgrade when the engine gets persistent postures.
export const readBook: ActionDef = {
  id: 'read_book',
  version: 1,
  needsTarget: false,
  duration: { min: 1.0, ideal: 2.5, max: 8.0 },
  description: 'Hold an open book in both hands at chest height, head bowed to read, turning a page now and then.',
  apply({ rig, T, dur, t, base }) {
    const w = bump(rig, T, dur)
    const target = rig.P({ chest: [3, -89], head: [11, -112], hF: [22, -64], hB: [18, -62], hang: 0 })
    return { pose: rig.mix(base, rig.breathe(target, t), w), overlay: (g, r, at) => drawBook(g, r, at, w) }
  },
}
