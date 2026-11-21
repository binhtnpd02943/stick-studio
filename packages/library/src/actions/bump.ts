import type { Rig } from '@stick/engine'

const EDGE = 0.22
/** The action contract: every ramp in and out lasts at least this long. */
const MIN_RAMP_S = 0.3

/** 0 at T=0 and T=dur, 1 in between: eases in over the first ~22% and out over the last ~22%, never faster than MIN_RAMP_S. */
export function bump(rig: Rig, T: number, dur: number, edge = EDGE): number {
  const e = Math.min(Math.max(dur * edge, MIN_RAMP_S), 0.5)
  return rig.E.soft(rig.seg(T, 0, e)) * (1 - rig.E.soft(rig.seg(T, dur - e, dur)))
}
