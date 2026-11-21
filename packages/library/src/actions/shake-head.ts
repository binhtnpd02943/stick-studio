import type { ActionDef } from '../types'
import { bump } from './bump'

const SHAKE_HZ = 3

export const shakeHead: ActionDef = {
  id: 'shake_head',
  version: 1,
  needsTarget: false,
  duration: { min: 0.8, ideal: 1.2, max: 2.5 },
  description: 'Head shakes side to side: no.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur)
    const swing = Math.sin(T * SHAKE_HZ * 2 * Math.PI) * 13
    const target = rig.P({ head: [swing, -113], hF: base.hF, hB: base.hB })
    return { pose: rig.mix(base, target, w) }
  },
}
