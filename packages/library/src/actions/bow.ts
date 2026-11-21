import type { ActionDef } from '../types'
import { bump } from './bump'

const BEND = 1 // radians of torso lean at the bottom
const TORSO = 31
const NECK = 24

export const bow: ActionDef = {
  id: 'bow',
  version: 1,
  needsTarget: false,
  duration: { min: 1.0, ideal: 1.5, max: 2.5 },
  description: 'Bends forward at the hip, then straightens.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur, 0.4)
    // Rotate the torso about the hip so its length holds (a straight blend of joints would shorten it mid-bow).
    const a = w * BEND
    const hip: [number, number] = [-w * 6, -59]
    const chest: [number, number] = [hip[0] + TORSO * Math.sin(a), hip[1] - TORSO * Math.cos(a)]
    const n = a * 1.25
    const head: [number, number] = [chest[0] + NECK * Math.sin(n), chest[1] - NECK * Math.cos(n)]
    const hands = (dx: number): [number, number] => [chest[0] + dx + w * 6, chest[1] + 38 * (1 - 0.15 * w)]
    const bent = rig.P({ hip, chest, head, hF: hands(2), hB: hands(-3) })
    return { pose: rig.mix(base, bent, rig.E.sm(rig.seg(w, 0, 0.15))) }
  },
}
