import type { ActionDef } from '../types'
import { bump } from './bump'

// shortcut: posture does not persist across beats; a seated character stands between beats. Upgrade when the engine gets persistent postures.
export const crossArms: ActionDef = {
  id: 'cross_arms',
  version: 1,
  needsTarget: false,
  duration: { min: 0.8, ideal: 2.0, max: 6.0 },
  description: 'Arms folded across the chest; holds.',
  apply({ rig, T, dur, base }) {
    const target = rig.P({ hF: [10, -82], hB: [12, -78], head: [3, -117], hang: 0 })
    return { pose: rig.mix(base, target, bump(rig, T, dur)) }
  },
}
