import type { ActionDef } from '../types'
import { atHead } from './face'
import { bump } from './bump'

const SCRATCH_HZ = 4

export const scratchHead: ActionDef = {
  id: 'scratch_head',
  version: 1,
  needsTarget: false,
  duration: { min: 1.0, ideal: 1.5, max: 3.0 },
  description: 'Near hand scratches the top of the head, puzzled.',
  sfx: (dur) => [{ id: 'ting', at: dur * 0.4 }],
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur)
    const rub = Math.sin(T * SCRATCH_HZ * 2 * Math.PI) * 3
    const chest: [number, number] = [0, -90], head: [number, number] = [-2, -116]
    const target = rig.P({ chest, head, hF: atHead(chest, head, 2 + rub, -9), hB: [-4, -54] })
    return { pose: rig.mix(base, target, w) }
  },
}
