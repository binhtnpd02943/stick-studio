import type { ActionDef } from '../types'
import { bump } from './bump'

export const shrug: ActionDef = {
  id: 'shrug',
  version: 1,
  needsTarget: false,
  duration: { min: 0.8, ideal: 1.2, max: 2.0 },
  description: 'Shoulders up, palms out at waist height, head tilts.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur)
    const up = Math.sin(Math.PI * Math.min(1, T / dur)) * 4 // hands rise and settle with the shoulders
    const target = rig.P({ hF: [26, -76 - up], hB: [15, -74 - up], head: [9, -108 + up * 0.5], chest: [1, -89] })
    return { pose: rig.mix(base, target, w) }
  },
}
