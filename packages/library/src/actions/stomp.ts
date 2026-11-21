import type { ActionDef } from '../types'
import { bump } from './bump'

const STAMPS = 2
const LIFT = 20
const KNEE_LIFT = 8

export const stomp: ActionDef = {
  id: 'stomp',
  version: 1,
  needsTarget: false,
  duration: { min: 0.8, ideal: 1.2, max: 2.5 },
  description: 'Angry: fists down, one foot stamps twice.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur)
    const period = Math.min(0.4, Math.max(0.2, (dur - 0.5) / STAMPS))
    const u = (T - (dur - STAMPS * period) / 2) / period
    const lift = u > 0 && u < STAMPS ? Math.sin(Math.PI * (u % 1)) ** 2 : 0
    // Hunched, arms stiff and a little back; the foot lands under the hip.
    const target = rig.P({ head: [10, -108], chest: [3, -88], hF: [2, -47], hB: [-6, -48], hang: 0, fF: [2, -2.5] })
    const pose = rig.mix(base, target, w)
    // The stamp rides on top of the ramp so it stays full strength at short durations; lift is 0 at both ends.
    return { pose: { ...pose, fF: [pose.fF[0], pose.fF[1] - lift * LIFT], kF: [pose.kF[0], pose.kF[1] - lift * KNEE_LIFT] } }
  },
}
