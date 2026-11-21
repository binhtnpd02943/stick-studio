import type { ActionDef } from '../types'

const RAMP = 0.22 // share of the run spent speeding up, and again slowing down

/** Trapezoid speed: a runner holds a pace, so the peak stays near the average and the legs never outrun the stride cap. */
const pace = (k: number): number => {
  const norm = 1 - RAMP
  if (k < RAMP) return (k * k) / (2 * RAMP * norm)
  if (k > 1 - RAMP) return 1 - ((1 - k) * (1 - k)) / (2 * RAMP * norm)
  return (RAMP / 2 + (k - RAMP)) / norm
}
const DEG = Math.PI / 180
const SWING_MID = 18 // degrees from straight down (positive is forward); each fist swings SWING_MID +- SWING_AMP
const SWING_AMP = 42
const ARM_LEN = 39 // shoulder to fist; a full arm is 42
const ARM_TUCK = 15
const ELBOW = 0.5 // 1 is a full bend: a half-straightened elbow keeps the upper arm from trailing behind
const SWING_TUCK_FROM = 20 // the arm shortens from this angle, over SWING_TUCK_SPAN degrees
const SWING_TUCK_SPAN = 55
const LEAN = 5 // chest and head lean into the run

export const runTo: ActionDef = {
  id: 'run_to',
  version: 1,
  needsTarget: true,
  speed: 200,
  // min: crossing left->right (190 world units) faster than 0.9 s snaps the knees (motion gate); the 0.6 s floor fits short hops only.
  duration: { min: 0.9, ideal: 0.95, max: 2.0 },
  description: 'Run to a world x position, turning to face it. Leaning forward, arms pumping.',
  apply({ rig, self, targetX, T, dur, base }) {
    const { chest, head } = base
    const to = targetX ?? self.x
    const ws = rig.walkSeg(T, 0, dur, self.x, to, undefined, pace)
    const facing = to === self.x ? self.facing : to > self.x ? 1 : -1
    const s = Math.sin(ws.ph * 2 * Math.PI)
    const fist = (k: number): [number, number] => {
      const swing = (SWING_MID + SWING_AMP * k) * DEG
      const len = ARM_LEN - ARM_TUCK * Math.min(1, Math.max(0, (swing / DEG - SWING_TUCK_FROM) / SWING_TUCK_SPAN))
      return [chest[0] + LEAN + len * Math.sin(swing), chest[1] + len * Math.cos(swing)]
    }
    // Each fist swings on a nearly straight arm behind the body and tucks in as it comes forward. Bent arms swung
    // under the body trip the motion gate (elbow-out-back); hang 0 keeps the back fist where it is put.
    const run = rig.P({ chest: [chest[0] + LEAN, chest[1]], head: [head[0] + LEAN, head[1]], hF: fist(s), hB: fist(-s), hang: 0, ef: ELBOW, eb: ELBOW })
    return { pose: rig.mix(base, run, ws.amp), x: ws.x, facing, gait: { ph: ws.ph, amp: ws.amp, stride: ws.stride } }
  },
}
