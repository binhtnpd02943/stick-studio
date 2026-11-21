import type { Rig } from '@stick/engine'
import type { ActionDef, OverlayAt } from '../types'
import { bump } from './bump'

const SWAY_HZ = 0.4
const Z_PERIOD_S = 2.4
const Z_COUNT = 3
const Z_RISE = 40
const Z_DRIFT = 16

/** Drifting "z" letters in neutral ink, a pure function of `t`; `w` (0..1) fades them with the action. */
function drawZs(g: CanvasRenderingContext2D, rig: Rig, at: OverlayAt, w: number): void {
  g.save()
  for (let i = 0; i < Z_COUNT; i++) {
    const f = (at.t / Z_PERIOD_S + i / Z_COUNT) % 1
    g.globalAlpha = Math.min(1, w * 1.5) * Math.min(1, 2 * Math.sin(Math.PI * f))
    rig.text(g, 'z', at.head[0] + at.facing * (6 + f * Z_DRIFT), at.head[1] - 8 - f * Z_RISE, 10 + f * 9, rig.C.ink)
  }
  g.restore()
}

// shortcut: posture does not persist across beats; a seated character stands between beats. Upgrade when the engine gets persistent postures.
export const sleep: ActionDef = {
  id: 'sleep',
  version: 1,
  needsTarget: false,
  duration: { min: 1.5, ideal: 3.0, max: 10.0 },
  description: 'Standing asleep: head drooped forward, body slumped and swaying, "z" letters drifting up.',
  apply({ rig, T, dur, t, base }) {
    const w = bump(rig, T, dur)
    const sway = Math.sin(T * SWAY_HZ * 2 * Math.PI)
    // Eyes cannot shut on a faceless head, so the droop and the z's carry it. The head sinks and lifts slowly, as a nodding head does.
    const target = rig.P({ chest: [6 + sway, -86], head: [18 + sway * 2, -100 + sway * 2], hF: [6, -48], hB: [-2, -47], hang: 1 })
    return { pose: rig.mix(base, rig.breathe(target, t), w), overlay: (g, r, at) => drawZs(g, r, at, w) }
  },
}
