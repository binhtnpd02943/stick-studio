import type { ActionDef } from '../types'
import { atHead } from './face'
import { bump } from './bump'

const HEAVE_HZ = 2.5

// Tears are an overlay (added with the overlay hook), not part of the pose.
export const cry: ActionDef = {
  id: 'cry',
  version: 1,
  needsTarget: false,
  duration: { min: 1.2, ideal: 2.0, max: 5.0 },
  description: 'Head down, both hands at the eyes, shoulders shaking; small tear drops fall.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur)
    const heave = Math.sin(T * HEAVE_HZ * 2 * Math.PI) * 4
    // Whole body hunches forward (the facepalm stays upright); the heave rides on chest, head and both fists.
    const chest: [number, number] = [7, -84 + heave], head: [number, number] = [15, -100 + heave]
    const target = rig.P({
      hip: [2, -58], chest, head, kF: [27, -30], kB: [15, -30],
      hF: atHead(chest, head, 7, 0), hB: atHead(chest, head, 4, 7), hang: 0,
    })
    return { pose: rig.mix(base, target, w) }
  },
}
