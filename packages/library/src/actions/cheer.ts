import type { ActionDef } from '../types'
import { bump } from './bump'

const PUMP_HZ = 3
/** The arms travel far (rest to a Y); ramping in/out faster than this snaps the hands (motion gate `jump`). */
const RAMP_S = 0.3

export const cheer: ActionDef = {
  id: 'cheer',
  version: 1,
  needsTarget: false,
  duration: { min: 0.6, ideal: 1.0, max: 2.0 },
  description: 'Both arms up in a Y, with a small pump.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur, Math.max(0.3, RAMP_S / dur))
    const pump = Math.sin(T * PUMP_HZ * 2 * Math.PI) * 3 * w
    const target = rig.P({ hF: [14, -132 + pump], hB: [-10, -130 - pump], head: [3, -118] })
    return { pose: rig.mix(base, target, w) }
  },
}
