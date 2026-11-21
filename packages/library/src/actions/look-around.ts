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
    const chest: [number, number] = [0, -90], head: [number, number] = [scan * 6 + 3, -116]
    const target = rig.P({ chest, head, hF: atHead(chest, head, 7, -5), hB: [-4, -54] })
    return { pose: rig.mix(base, target, w) }
  },
}
