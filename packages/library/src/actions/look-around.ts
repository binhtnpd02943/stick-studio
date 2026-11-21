import type { ActionDef } from '../types'
import { bump } from './bump'

const SCAN = 11

export const lookAround: ActionDef = {
  id: 'look_around',
  version: 1,
  needsTarget: false,
  duration: { min: 1.2, ideal: 2.0, max: 4.0 },
  description: 'Looks around: head scans, then turns to look back over the shoulder and returns.',
  apply({ rig, self, T, dur, k, base }) {
    const w = bump(rig, T, dur)
    // Head swings +-SCAN in each of three half-waves; the character turns around for the middle one.
    // Each flip happens where the head is at its neutral, so the mirrored pose is continuous.
    const scan = Math.sin(k * 3 * Math.PI)
    const behind = k > 1 / 3 && k < 2 / 3
    const chest: [number, number] = [scan * 2.5, -90], head: [number, number] = [scan * SCAN + 3, -116]
    const target = rig.P({ chest, head, hF: base.hF, hB: base.hB })
    return { pose: rig.mix(base, target, w), facing: behind ? (-self.facing as 1 | -1) : self.facing }
  },
}
