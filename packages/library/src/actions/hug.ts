import type { ActionDef } from '../types'
import { bump } from './bump'
import { toward } from './face'

const SQUEEZE_HZ = 1.6
const SQUEEZE = 2.5

const sh = (p: number[], dx: number, dy: number): [number, number] => [p[0]! + dx, p[1]! + dy]

// shortcut: posture does not persist across beats; a seated character stands between beats. Upgrade when the engine gets persistent postures.
export const hug: ActionDef = {
  id: 'hug',
  version: 1,
  needsTarget: true,
  contact: true,
  duration: { min: 1.0, ideal: 2.0, max: 4.0 },
  description: 'Open both arms wide toward the target (a person), then close them around them and squeeze. One-sided: the other need not act.',
  apply({ rig, self, targetX, T, dur, base }) {
    const w = bump(rig, T, dur)
    // The arms open up and out first, then close around the target's body, level with its chest.
    const close = rig.E.soft(rig.seg(T, 0.2, 0.2 + Math.max(0.35, dur * 0.2)))
    const squeeze = Math.sin(T * SQUEEZE_HZ * 2 * Math.PI) * SQUEEZE * close
    const open = { hF: [41, -108], hB: [35, -100] } as const
    const closed = { hF: sh([47, -85], squeeze, 0), hB: sh([44, -74], squeeze, 0) }
    const mixArm = (a: readonly number[], b: readonly number[]): [number, number] => [a[0]! + (b[0]! - a[0]!) * close, a[1]! + (b[1]! - a[1]!) * close]
    const target = rig.P({
      hip: [3, -58], chest: [11, -86], head: [18, -111], hang: 0, ef: 0.5, eb: 0.5,
      hF: mixArm(open.hF, closed.hF), hB: mixArm(open.hB, closed.hB),
    })
    return { pose: rig.mix(base, target, w), facing: toward(self, targetX) }
  },
}
