import type { ActionDef } from '../types'
import { bump } from './bump'
import { toward } from './face'

const TAP_HZ = 5.5
const TAP_DIP = 2.2

// shortcut: posture does not persist across beats; a seated character stands between beats. Upgrade when the engine gets persistent postures.
export const typeLaptop: ActionDef = {
  id: 'type_laptop',
  version: 1,
  needsTarget: true,
  contact: true,
  duration: { min: 1.0, ideal: 2.5, max: 8.0 },
  description: 'Lean over a desk (the target) with both hands on the keys of the laptop, fingers tapping, head down.',
  apply({ rig, self, targetX, T, dur, t, base }) {
    const w = bump(rig, T, dur)
    // Hands low and forward over the desk top, as far as the arms go: the body hunches (knees bent, chest forward) to give them reach.
    const tap = (phase: number) => Math.max(0, Math.sin((T * TAP_HZ + phase) * 2 * Math.PI)) * TAP_DIP * w
    const target = rig.P({
      hip: [10, -51], chest: [24, -76], head: [34, -98], hang: 0, kF: [34, -27], kB: [24, -27],
      hF: [57, -44 + tap(0)], hB: [53, -43 + tap(0.5)],
    })
    return { pose: rig.mix(base, rig.breathe(target, t), w), facing: toward(self, targetX) }
  },
}
