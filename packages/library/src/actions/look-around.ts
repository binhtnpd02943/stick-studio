import type { ActionDef } from '../types'
import { atHead } from './face'
import { bump } from './bump'

export const lookAround: ActionDef = {
  id: 'look_around',
  version: 1,
  needsTarget: false,
  duration: { min: 1.2, ideal: 2.0, max: 4.0 },
  description: 'Head turns left, then right, scanning; hand shades the eyes.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur)
    const scan = Math.sin(((T / dur) * 2 + 0.25) * Math.PI) // back, then forward, then back
    const chest: [number, number] = [scan * 2.5, -90], head: [number, number] = [scan * 11 + 3, -116]
    // Flat hand at the brow, in front of the eyes (scratch_head sits on top of the head).
    const target = rig.P({ chest, head, hF: atHead(chest, head, 9, -3), hB: [-4, -54] })
    return { pose: rig.mix(base, target, w) }
  },
}
