import type { ActionDef } from '../types'
import { bump } from './bump'

export const crossArms: ActionDef = {
  id: 'cross_arms',
  version: 1,
  needsTarget: false,
  duration: { min: 0.8, ideal: 2.0, max: 6.0 },
  description: 'Arms folded across the chest; holds.',
  apply({ rig, T, dur, base }) {
    const target = rig.P({ hF: [9, -75], hB: [11, -69], head: [2, -115], hang: 0 })
    return { pose: rig.mix(base, target, bump(rig, T, dur)) }
  },
}
