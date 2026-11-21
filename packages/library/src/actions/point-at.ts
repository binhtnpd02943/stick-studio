import type { ActionDef } from '../types'
import { bump } from './bump'

export const pointAt: ActionDef = {
  id: 'point_at',
  version: 1,
  needsTarget: true,
  duration: { min: 0.5, ideal: 0.8, max: 1.5 },
  description: 'Raise the near arm and point toward the target, then lower it.',
  apply({ rig, self, targetX, T, dur, base }) {
    const target = rig.P({ hF: [40, -100], hB: [-4, -54], head: [10, -116] })
    const facing = targetX === undefined || targetX === self.x ? self.facing : targetX > self.x ? 1 : -1
    return { pose: rig.mix(base, target, bump(rig, T, dur)), facing }
  },
}
