import type { Pose } from '@stick/engine'
import type { ActionDef } from '../types'

const MAX_ANGLE = 86 * (Math.PI / 180) // from upright to lying on the back
const HIP_DROP = 54 // standing hip height (59) less a lying body's half thickness
const HIP_SLIDE = -10 // the hip lurches forward as the feet slip out: lying, the head still lands on stage from an edge mark (-95)
const FEET_KICK = 14 // the feet flick up on the way down (this also keeps both from skating on the ground)
const FLAIL = 20 // the hands fling up and forward mid-fall
const HEAD_REST_Y = 3 // a head lying on the ground rests on it, not in it
const FALL_SHARE = 0.32
const UP_SHARE = 0.36
const FALL_MIN_S = 0.45
const UP_MIN_S = 0.5

type Pt = [number, number]
/** Rotate `p` about `c` so that points above c swing backwards (negative x). */
const rot = (p: number[], c: number[], a: number): Pt => {
  const rx = p[0]! - c[0]!, ry = p[1]! - c[1]!
  return [c[0]! + rx * Math.cos(a) + ry * Math.sin(a), c[1]! - rx * Math.sin(a) + ry * Math.cos(a)]
}

export const fallDown: ActionDef = {
  id: 'fall_down',
  version: 1,
  needsTarget: false,
  duration: { min: 1.2, ideal: 1.8, max: 3.0 },
  description: 'Slips and topples backwards to lie flat on the ground, lies there a moment, then gets back up.',
  apply({ rig, T, dur, base }) {
    const fall = Math.max(FALL_MIN_S, dur * FALL_SHARE), up = Math.max(UP_MIN_S, dur * UP_SHARE)
    const k = rig.E.soft(rig.seg(T, 0, fall)) * (1 - rig.E.soft(rig.seg(T, dur - up, dur)))
    const a = MAX_ANGLE * k
    const drop = 1 - Math.cos(a)
    const hip: Pt = [base.hip[0] - HIP_SLIDE * drop, base.hip[1] + HIP_DROP * drop]
    // Every joint turns rigidly about the hip, then rides with it.
    const turned = (p: number[]): Pt => {
      const r = rot(p, base.hip, a)
      return [r[0] + hip[0] - base.hip[0], r[1] + hip[1] - base.hip[1]]
    }
    const kick = Math.sqrt(Math.sin(2 * a)) * FEET_KICK // sqrt: lifted from the first frames, so the sliding feet never read as planted
    const flail = Math.sin(a) * FLAIL
    const pose: Pose = {
      ...base,
      hip,
      chest: turned(base.chest),
      head: ((h) => [h[0], h[1] - HEAD_REST_Y * k] as Pt)(turned(base.head)),
      kF: turned(base.kF), kB: turned(base.kB),
      fF: ((f) => [f[0], f[1] - kick] as Pt)(turned(base.fF)),
      fB: ((f) => [f[0], f[1] - kick * 0.7] as Pt)(turned(base.fB)),
      hF: ((h) => [h[0] + flail * 0.5, h[1] - flail] as Pt)(turned(base.hF)),
      hB: ((h) => [h[0] + flail * 0.3, h[1] - flail * 0.8] as Pt)(turned(base.hB)),
      hang: 1 - k,
    }
    return { pose }
  },
}
