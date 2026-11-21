import type { ActionDef, ActionResult } from '../types'
import { bump } from './bump'
import { toward } from './face'

const KNOCKS = 2
const RETRACT = 6 // the fist pulls back this far between knocks
const LANDING = 0.08 // share of a knock, either side of contact, that shows the impact flicks
const FLICK_ANGLES = [-0.9, 0, 0.9]

export const knock: ActionDef = {
  id: 'knock',
  version: 1,
  needsTarget: true,
  contact: true,
  duration: { min: 0.8, ideal: 1.2, max: 2.5 },
  description: 'Near fist taps twice on the target (a door), the head cocked to listen.',
  apply({ rig, self, targetX, T, dur, base }) {
    const w = bump(rig, T, dur)
    // The knocks sit between the ramps: each pulls the fist back, then lands at the end of its period.
    const u = rig.seg(T, 0.3, Math.max(dur - 0.3, 0.31))
    const c = u * KNOCKS
    const phase = u > 0 && u < 1 ? c % 1 : 0
    const target = rig.P({ chest: [5, -89], head: [11, -115], hF: [31 - Math.sin(Math.PI * phase) * RETRACT * w, -80], hB: [-1, -54], hang: 1, ef: 0.6 })
    const landing = u > 0 && Math.abs(c - Math.round(c)) < LANDING && Math.round(c) >= 1
    const overlay: ActionResult['overlay'] = (g, r, at) => {
      if (!landing) return
      const [x, y] = at.hands.near
      for (const a of FLICK_ANGLES) r.ln(g, x + at.facing * (4 + 2 * Math.cos(a)), y + 5 * Math.sin(a), x + at.facing * (8 + 2 * Math.cos(a)), y + 9 * Math.sin(a), 1.4, r.C.muted)
    }
    return { pose: rig.mix(base, target, w), facing: toward(self, targetX), overlay }
  },
}
