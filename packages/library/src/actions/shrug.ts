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
    // The head sits at a fixed distance from the chest, so the shoulders cannot rise: the arms carry the shrug.
    // Hands split front and back with one pop of chest and hands in the middle third.
    const pop = Math.sin(Math.PI * rig.seg(T / dur, 0.35, 0.65))
    const target = rig.P({
      hF: [20, -62 - pop * 6], hB: [-13, -56 - pop * 6], head: [8, -113], chest: [0, -90 - pop * 4], hang: 0,
    })
    return { pose: rig.mix(base, target, w) }
  },
}
