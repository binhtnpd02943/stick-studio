import type { ActionDef } from '../types'
import { bump } from './bump'
import { toward } from './face'

/** Local hip height of a seated figure: world -29, the middle of the chair/sofa/bed seats (-30/-28/-32). */
const SEAT_HIP_Y = -33
/** World units the hip may travel onto the seat; a real prop is at most ~75 away after a walk_to (bed: 55 + NEAR_GAP). */
const SHIFT_MAX = 75
const FOOT_LIFT = 5
const STEP_SPLIT = 0.75 // each foot steps over this share of the ramp, one after the other with an overlap; a shorter step snaps the knees (motion gate)

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

// shortcut: posture does not persist across beats; a seated character stands between beats. Upgrade when the engine gets persistent postures.
export const sit: ActionDef = {
  id: 'sit',
  version: 1,
  needsTarget: true,
  contact: true,
  needsSeat: true,
  duration: { min: 1.0, ideal: 3.0, max: 10.0 },
  description: 'Step onto a chair, sofa or bed (the target), sit with hands on the knees, then stand up again.',
  apply({ rig, self, targetX, T, dur, t, base }) {
    const w = bump(rig, T, dur)
    const hx = Math.min(Math.abs((targetX ?? self.x) - self.x), SHIFT_MAX) / rig.FS
    const y = SEAT_HIP_Y
    // Torso upright, thighs level, shins down: the hip lands on the seat, over the prop's centre.
    const seated = rig.P({
      hip: [hx, y], chest: [hx - 1, y - 31], head: [hx + 1, y - 57],
      hF: [hx + 24, y - 4], hB: [hx + 17, y - 3], hang: 0,
      kF: [hx + 32, y - 3], kB: [hx + 26, y - 3], fF: [hx + 30, -2.5], fB: [hx + 24, -2.5],
    })
    const m = rig.mix(base, rig.breathe(seated, t), w)
    const stepF = rig.seg(w, 0, STEP_SPLIT), stepB = rig.seg(w, 1 - STEP_SPLIT, 1)
    const foot = (from: number[], to: number[], k: number): [number, number] =>
      [lerp(from[0]!, to[0]!, rig.E.soft(k)), lerp(from[1]!, to[1]!, rig.E.soft(k)) - FOOT_LIFT * Math.sin(Math.PI * k)]
    return {
      pose: { ...m, fF: foot(base.fF, seated.fF, stepF), fB: foot(base.fB, seated.fB, stepB) },
      facing: toward(self, targetX),
    }
  },
}
