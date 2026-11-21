import type { ActionDef } from '../types'
import { atHead } from './face'
import { bump } from './bump'

const SOB_HZ = 5

// Tears are an overlay (added with the overlay hook), not part of the pose.
export const cry: ActionDef = {
  id: 'cry',
  version: 1,
  needsTarget: false,
  duration: { min: 1.2, ideal: 2.0, max: 5.0 },
  description: 'Head down, both hands at the eyes, shoulders shaking; small tear drops fall.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur)
    const sob = Math.sin(T * SOB_HZ * 2 * Math.PI) * 2
    const chest: [number, number] = [4, -87 + sob], head: [number, number] = [11, -106 + sob]
    const target = rig.P({ chest, head, hip: [1, -59], hF: atHead(chest, head, 7, 0), hB: atHead(chest, head, 3, 7) })
    return { pose: rig.mix(base, target, w) }
  },
}
