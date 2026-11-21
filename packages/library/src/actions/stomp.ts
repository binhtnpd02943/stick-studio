import type { ActionDef } from '../types'
import { bump } from './bump'

const STAMPS = 2
const LIFT = 15

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
    const target = rig.P({
      head: [7, -112], chest: [3, -88], hF: [9, -54 - lift * 2], hB: [-6, -54 - lift * 2],
      fF: [8, -2.5 - lift * LIFT], kF: [26, -40],
    })
    return { pose: rig.mix(base, target, w) }
  },
}
