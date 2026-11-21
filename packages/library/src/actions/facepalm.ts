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
    // Stays upright and one-handed, unlike cry. 7 units out keeps the forearm clear of the head disc (gate arm-through-face).
    const chest: [number, number] = [1, -90], head: [number, number] = [9, -110]
    const target = rig.P({ chest, head, hF: atHead(chest, head, 7, 1), hB: [-4, -52] })
    return { pose: rig.mix(base, target, w) }
  },
}
