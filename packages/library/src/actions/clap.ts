import type { ActionDef } from '../types'
import { bump } from './bump'

const CLAP_HZ = 3

export const clap: ActionDef = {
  id: 'clap',
  version: 1,
  needsTarget: false,
  duration: { min: 0.8, ideal: 1.5, max: 3.0 },
  description: 'Hands meet in front of the chest repeatedly.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur, Math.max(0.22, 0.3 / dur))
    const open = 0.5 + 0.5 * Math.cos(T * CLAP_HZ * 2 * Math.PI) // 1 apart, 0 together
    const target = rig.P({ hF: [19 + open * 10, -80], hB: [19 - open * 8, -80], head: [3, -116], hang: 0 })
    return { pose: rig.mix(base, target, w) }
  },
}
