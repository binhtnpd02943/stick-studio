import type { Rig } from '@stick/engine'
import type { ActionDef, OverlayAt } from '../types'
import { atHead } from './face'
import { bump } from './bump'

const PHONE = { w: 6.5, h: 18 }
/** The hand arcs a long way up to the face, so the ramp is as slow as bump allows. */
const RAMP_EDGE = 0.5
const TILT = -0.3 // the earpiece end leans back, the mouthpiece forward
const WAVE_HZ = 1.4

/** A phone held to the ear, mirrored with the figure: neutral ink outline on white so it shows against the dark head. */
function drawPhone(g: CanvasRenderingContext2D, rig: Rig, at: OverlayAt, w: number): void {
  const [hx, hy] = at.hands.near
  g.save()
  g.globalAlpha = Math.min(1, w * 2)
  g.translate(hx, hy)
  g.scale(at.facing, 1)
  g.rotate(TILT)
  rig.rr(g, -PHONE.w / 2, -PHONE.h * 0.8, PHONE.w, PHONE.h, 1.6)
  rig.inkFill(g, rig.C.paper, 1.3)
  rig.ln(g, -1, -PHONE.h * 0.8 + 2, 1, -PHONE.h * 0.8 + 2, 0.9, rig.C.soft)
  g.fillStyle = at.ink
  g.beginPath()
  g.arc(0, 0.6, 2.4, 0, Math.PI * 2) // the fingers wrapped round it
  g.fill()
  g.restore()
}

// shortcut: posture does not persist across beats; a seated character stands between beats. Upgrade when the engine gets persistent postures.
export const phoneCall: ActionDef = {
  id: 'phone_call',
  version: 1,
  needsTarget: false,
  duration: { min: 1.0, ideal: 2.5, max: 10.0 },
  description: 'Near hand holds a phone up against the side of the head, head tilted, the other hand relaxed.',
  apply({ rig, T, dur, t, base }) {
    const w = bump(rig, T, dur, RAMP_EDGE)
    const chest: [number, number] = [-1, -90], head: [number, number] = [-2, -116]
    const nod = Math.sin(T * WAVE_HZ * 2 * Math.PI) * 1.5
    const target = rig.P({ chest, head: [head[0] - 4, head[1] + nod], hF: atHead(chest, [head[0] - 4, head[1]], 7, 5), hB: [-3, -50], hang: 1 })
    return { pose: rig.mix(base, rig.breathe(target, t), w), overlay: (g, r, at) => drawPhone(g, r, at, w) }
  },
}
