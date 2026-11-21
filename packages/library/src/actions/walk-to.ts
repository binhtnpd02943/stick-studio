import type { ActionDef } from '../types'

export const walkTo: ActionDef = {
  id: 'walk_to',
  version: 1,
  needsTarget: true,
  speed: 110,
  // min: crossing left->right (190 world units) faster than 1.1 s snaps the knees and skates the feet (motion gate).
  duration: { min: 1.1, ideal: 1.2, max: 3.0 },
  description: 'Walk to a world x position, turning to face it. Arms stay relaxed.',
  apply({ rig, self, targetX, T, dur, base }) {
    const to = targetX ?? self.x
    const ws = rig.walkSeg(T, 0, dur, self.x, to)
    const facing = to === self.x ? self.facing : to > self.x ? 1 : -1
    return { pose: base, x: ws.x, facing, gait: { ph: ws.ph, amp: ws.amp, stride: ws.stride } }
  },
}
