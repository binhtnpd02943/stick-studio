import type { ActionDef } from '../types'
import { bump } from './bump'
import { toward } from './face'

const SHOVES = 2
const SHOVE_REACH = 5

export const push: ActionDef = {
  id: 'push',
  version: 1,
  needsTarget: true,
  contact: true,
  duration: { min: 0.8, ideal: 1.5, max: 3.0 },
  description: 'Lean hard into the target (a prop or a person) with both arms straight out in front, shoving twice.',
  apply({ rig, self, targetX, T, dur, base }) {
    const w = bump(rig, T, dur)
    // A shove is a brief extra reach on top of the lean; it is zero at both ends of the ramp.
    const u = (T - 0.3) / Math.max(dur - 0.6, 0.2)
    const shove = u > 0 && u < 1 ? Math.sin(Math.PI * SHOVES * u) ** 2 * SHOVE_REACH * w : 0
    // A lunge: the body leans forward over the front foot, the back leg braced, arms level with the chest.
    const target = rig.P({
      hip: [6, -56], chest: [22, -80], head: [31, -103], hang: 0, ef: 0.2, eb: 0.2,
      hF: [60 + shove, -77], hB: [58 + shove, -70],
      fF: [24, -2.5], fB: [-16, -2.5], kF: [34, -30], kB: [10, -30],
    })
    return { pose: rig.mix(base, target, w), facing: toward(self, targetX) }
  },
}
