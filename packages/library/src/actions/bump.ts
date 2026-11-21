import type { Rig } from '@stick/engine'

const EDGE = 0.22

/** 0 at T=0 and T=dur, 1 in between: eases in over the first ~22% and out over the last ~22%. */
export function bump(rig: Rig, T: number, dur: number, edge = EDGE): number {
  const e = Math.min(dur * edge, 0.5)
  return rig.E.soft(rig.seg(T, 0, e)) * (1 - rig.E.soft(rig.seg(T, dur - e, dur)))
}
