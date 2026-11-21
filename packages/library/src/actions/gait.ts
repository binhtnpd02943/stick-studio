import type { Rig } from '@stick/engine'

const BISECT_STEPS = 30

/**
 * Seconds, from the action start, at which a foot touches down: the rig's gait phase `ph` passes each half-integer
 * (foot A lands at whole phases, foot B half a cycle later). Reads the same `walkSeg` that `apply` draws from, so
 * `ease` must be the one `apply` passes.
 */
export function footfalls(rig: Rig, dur: number, distance: number, ease?: (k: number) => number): number[] {
  const ph = (T: number): number => rig.walkSeg(T, 0, dur, 0, distance, undefined, ease).ph
  const steps = Math.floor(ph(dur) * 2 + 1e-6)
  return Array.from({ length: steps }, (_, i) => {
    let lo = 0, hi = dur
    for (let n = 0; n < BISECT_STEPS; n++) {
      const mid = (lo + hi) / 2
      if (ph(mid) < (i + 1) / 2) lo = mid
      else hi = mid
    }
    return hi
  })
}
