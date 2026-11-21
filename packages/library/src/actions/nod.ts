import type { ActionDef } from '../types'

const NODS = 2

export const nod: ActionDef = {
  id: 'nod',
  version: 1,
  needsTarget: false,
  duration: { min: 0.4, ideal: 0.6, max: 1.2 },
  description: 'Two small nods of the head. Arms stay at rest.',
  apply({ rig, k, base }) {
    const dip = 0.5 - 0.5 * Math.cos(2 * Math.PI * NODS * k)
    const target = rig.P({ head: [4, -111], chest: [1, -89], hF: base.hF, hB: base.hB })
    return { pose: rig.mix(base, target, dip) }
  },
}
