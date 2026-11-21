import type { ActionDef } from '../types'
import { bump } from './bump'

const BOUNCE_HZ = 4

export const laugh: ActionDef = {
  id: 'laugh',
  version: 1,
  needsTarget: false,
  duration: { min: 0.8, ideal: 1.5, max: 3.0 },
  description: 'Leans back, hand on belly, shoulders bounce.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur)
    const b = Math.sin(T * BOUNCE_HZ * 2 * Math.PI) * 3
    const target = rig.P({ chest: [-9, -88 + b], head: [-20, -107 + b], hF: [4, -66 + b], hB: [-6, -52 + b], hang: 0 })
    return { pose: rig.mix(base, target, w) }
  },
}
