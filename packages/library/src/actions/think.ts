import type { ActionDef } from '../types'
import { bump } from './bump'

export const think: ActionDef = {
  id: 'think',
  version: 1,
  needsTarget: false,
  duration: { min: 0.8, ideal: 1.5, max: 3.0 },
  description: 'Hand to chin, head tilted, thinking.',
  apply({ rig, T, dur, base }) {
    const target = rig.P({ hF: [10, -96], head: [7, -116], hB: [-4, -54] })
    return { pose: rig.mix(base, target, bump(rig, T, dur)) }
  },
}
