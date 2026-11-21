import type { ActionDef } from '../types'
import { bump } from './bump'

const BOUNCE_HZ = 5

export const laugh: ActionDef = {
  id: 'laugh',
  version: 1,
  needsTarget: false,
  duration: { min: 0.8, ideal: 1.5, max: 3.0 },
  description: 'Leans back, hand on belly, shoulders bounce.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur)
    const b = Math.sin(T * BOUNCE_HZ * 2 * Math.PI) * 1.5
    const target = rig.P({ chest: [-5, -89 + b], head: [-11, -112 + b], hF: [5, -71 + b], hB: [-4, -64 + b] })
    return { pose: rig.mix(base, target, w) }
  },
}
