import type { ActionDef } from '../types'

const RAMP = 0.26 // share of the run spent speeding up, and again slowing down

/** Speed rises smoothly, holds, and falls smoothly: a runner holds a pace, so the peak stays near the average and the legs never outrun the stride cap. */
const pace = (k: number): number => {
  const up = (u: number) => RAMP * (u ** 3 - u ** 4 / 2) // integral of smoothstep speed over a ramp, u in 0..1
  if (k < RAMP) return up(k / RAMP) / (1 - RAMP)
  if (k > 1 - RAMP) return 1 - up((1 - k) / RAMP) / (1 - RAMP)
  return (RAMP / 2 + (k - RAMP)) / (1 - RAMP)
}
const CADENCE_HZ_MAX = 2.4 // strides per second at which the fists still swing their full arc
const CADENCE_PROBE_S = 0.02
const ARM_RAMP_S = 0.3 // arms join and leave the run over a fixed time, not the few world units the legs take to get going
const DEG = Math.PI / 180
const SWING_MID = 18 // degrees from straight down (positive is forward); each fist swings SWING_MID +- SWING_AMP
const SWING_AMP = 42
const ARM_LEN = 39 // shoulder to fist; a full arm is 42
const ARM_TUCK = 15
const ELBOW = 0.5 // 1 is a full bend: a half-straightened elbow keeps the upper arm from trailing behind
const SWING_TUCK_FROM = 20 // the arm shortens from this angle, over SWING_TUCK_SPAN degrees
const SWING_TUCK_SPAN = 55
const LEAN = 8 // chest and head lean into the run

export const runTo: ActionDef = {
  id: 'run_to',
  version: 1,
  needsTarget: true,
  speed: 200,
  // min: the longest hop (left -> right, 190 world units) at 0.95 s is the fastest the rig's legs run cleanly; any quicker snaps the knees or feet (motion gate).
  duration: { min: 0.95, ideal: 1.0, max: 2.0 },
  description: 'Run to a world x position, turning to face it. Leaning forward, arms pumping.',
  apply({ rig, self, targetX, T, dur, base }) {
    const { chest, head } = base
    const to = targetX ?? self.x
    const ws = rig.walkSeg(T, 0, dur, self.x, to, undefined, pace)
    const facing = to === self.x ? self.facing : to > self.x ? 1 : -1
    // A fist's acceleration grows with cadence squared, so a fast cadence swings a smaller arc (the motion gate rejects a spike).
    const ahead = rig.walkSeg(Math.min(T + CADENCE_PROBE_S, dur), 0, dur, self.x, to, undefined, pace).ph
    const cadence = Math.abs(ahead - ws.ph) / Math.max(Math.min(T + CADENCE_PROBE_S, dur) - T, 1e-6)
    const arc = Math.min(1, (CADENCE_HZ_MAX / Math.max(cadence, 1e-6)) ** 2)
    const armW = rig.E.soft(rig.seg(T, 0, ARM_RAMP_S)) * (1 - rig.E.soft(rig.seg(T, dur - ARM_RAMP_S, dur)))
    const s = Math.sin(ws.ph * 2 * Math.PI)
    const fist = (k: number): [number, number] => {
      const swing = (SWING_MID + SWING_AMP * arc * k) * DEG
      const len = ARM_LEN - ARM_TUCK * Math.min(1, Math.max(0, (swing / DEG - SWING_TUCK_FROM) / SWING_TUCK_SPAN))
      return [chest[0] + LEAN + len * Math.sin(swing), chest[1] + len * Math.cos(swing)]
    }
    // Each fist swings on a nearly straight arm behind the body and tucks in as it comes forward. Bent arms swung
    // under the body trip the motion gate (elbow-out-back); hang 0 keeps the back fist where it is put.
    const run = rig.P({ chest: [chest[0] + LEAN, chest[1]], head: [head[0] + LEAN, head[1]], hF: fist(s), hB: fist(-s), hang: 0, ef: ELBOW, eb: ELBOW })
    return { pose: rig.mix(base, run, armW), x: ws.x, facing, gait: { ph: ws.ph, amp: ws.amp, stride: ws.stride } }
  },
}
