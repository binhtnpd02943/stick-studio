import type { Rig } from '@stick/engine'
import type { ActionDef, OverlayAt } from '../types'
import { atHead } from './face'
import { bump } from './bump'

/** The hand arcs a long way up to the face, so the ramp is as slow as bump allows. */
const RAMP_EDGE = 0.5
const CUP = { top: 5.2, bottom: 3.8, h: 11.5 }
const MAX_TILT = 0.8 // radians, opening toward the mouth

/** A cup held in the near hand (neutral ink on white), tipping toward the mouth by `tilt`, mirrored with the figure. */
function drawCup(g: CanvasRenderingContext2D, rig: Rig, at: OverlayAt, w: number, tilt: number): void {
  const [hx, hy] = at.hands.near
  g.save()
  g.globalAlpha = Math.min(1, w * 2)
  g.translate(hx, hy)
  g.scale(at.facing, 1)
  g.rotate(-tilt) // the hand is ahead of the mouth, so the opening tips back toward it
  g.beginPath()
  g.moveTo(-CUP.top, -CUP.h)
  g.lineTo(CUP.top, -CUP.h)
  g.lineTo(CUP.bottom, 1)
  g.lineTo(-CUP.bottom, 1)
  g.closePath()
  rig.inkFill(g, rig.C.paper, 1.3)
  rig.ln(g, -CUP.top + 1, -CUP.h + 2.5, CUP.top - 1, -CUP.h + 2.5, 1, rig.C.soft) // the drink's surface
  g.fillStyle = at.ink
  g.beginPath()
  g.arc(CUP.bottom - 1, -1.5, 1.9, 0, Math.PI * 2) // the fingers
  g.fill()
  g.restore()
}

export const drink: ActionDef = {
  id: 'drink',
  version: 1,
  needsTarget: false,
  duration: { min: 1.0, ideal: 1.8, max: 3.0 },
  description: 'Near hand lifts a cup to the mouth and tips it back for a sip, then lowers it.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur, RAMP_EDGE)
    const u = T / dur
    const sip = rig.E.soft(rig.seg(u, 0.35, 0.55)) * (1 - rig.E.soft(rig.seg(u, 0.65, 0.8)))
    const chest: [number, number] = [0, -90], head: [number, number] = [-3 * sip, -116 + sip * 0.5]
    const target = rig.P({ chest, head, hF: atHead(chest, head, 16, 6), hB: [-3, -50], hang: 1 })
    return { pose: rig.mix(base, target, w), overlay: (g, r, at) => drawCup(g, r, at, w, MAX_TILT * sip * w) }
  },
}
