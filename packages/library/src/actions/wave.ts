import type { ActionDef } from '../types'
import { bump } from './bump'

const WAVE_HZ = 2.5

export const wave: ActionDef = {
  id: 'wave',
  version: 1,
  needsTarget: false,
  duration: { min: 0.6, ideal: 1.0, max: 2.0 },
  description: 'Raise the near hand beside the head and wave.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur)
    const sway = Math.sin(T * WAVE_HZ * 2 * Math.PI) * 7
    const target = rig.P({ hF: [24 + sway, -122], hB: [-4, -54], head: [4, -116] })
    return { pose: rig.mix(base, target, w) }
  },
}
