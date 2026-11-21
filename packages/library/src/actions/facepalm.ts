import type { ActionDef } from '../types'
import { atHead } from './face'
import { bump } from './bump'

export const facepalm: ActionDef = {
  id: 'facepalm',
  version: 1,
  needsTarget: false,
  duration: { min: 1.0, ideal: 1.5, max: 3.0 },
  description: 'Near hand covers the face, head drops.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur)
    const chest: [number, number] = [3, -88], head: [number, number] = [9, -108]
    // 7 units out keeps the forearm clear of the head disc (motion gate arm-through-face).
    const target = rig.P({ chest, head, hip: [1, -59], hF: atHead(chest, head, 7, 1), hB: [-4, -52] })
    return { pose: rig.mix(base, target, w) }
  },
}
