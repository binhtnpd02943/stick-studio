import type { ActionDef } from '../types'

const RISE = 22
/** Airtime at which the full rise is reachable; a shorter hop rises less, in proportion to airtime squared (constant acceleration). */
const FULL_RISE_AIR_S = 0.22
/** The crouch and the landing each take at least this long (action contract), so the airtime is what is left. */
const SQUAT_S = 0.3
const MIN_TUCK_AIR_S = 0.15

/** Crouch and landing bottoms (`a`, `b`) and the key phases between them, as shares of the action. */
const jumpKeys = (dur: number) => {
  const a = Math.max(0.2, SQUAT_S / dur), b = 1 - a
  const span = b - a
  return { a, b, airFrom: a + 0.15 * span, standAt: a + 0.4 * span, tuckAt: a + 0.58 * span, fallAt: a + 0.78 * span, airTo: a + 0.88 * span }
}

export const jump: ActionDef = {
  id: 'jump',
  version: 1,
  needsTarget: false,
  duration: { min: 0.8, ideal: 1.0, max: 1.6 },
  description: 'Crouches, jumps up with arms raised, lands.',
  sfx(dur) {
    const { airFrom, airTo } = jumpKeys(dur)
    return [{ id: 'whoosh', at: airFrom * dur }, { id: 'thud', at: airTo * dur }]
  },
  apply({ rig, T, dur, base }) {
    const k = T / dur
    const { a, b, airFrom, standAt, tuckAt, fallAt, airTo } = jumpKeys(dur)
    // Legs and arms run on separate, sparse timelines so the arms never stop dead at a leg key.
    const crouchLegs = { hip: [-2, -49], chest: [4, -79], head: [8, -104], kF: [32, -28], kB: [22, -28] }
    const airS = (airTo - airFrom) * dur
    const air = Math.min(1, airS / FULL_RISE_AIR_S)
    const tuck = rig.E.sm(rig.seg(airS, MIN_TUCK_AIR_S, FULL_RISE_AIR_S)) // a hop too brief for a tuck just stays straight
    const stand = rig.P({ head: [3, -118] })
    const body = rig.seq(k, [
      [0, base],
      [a, rig.P(crouchLegs)],
      [standAt, stand],
      [tuckAt, rig.mix(stand, rig.P({ head: [3, -118], fF: [8, -15], fB: [-6, -19], kF: [26, -38], kB: [14, -40] }), tuck)],
      [fallAt, stand],
      [b, rig.P(crouchLegs)],
      [1, base],
    ])
    // hang: 0 turns off the back-arm relax, whose snap past the hanging cone trips the gate.
    const arms = rig.seq(k, [
      [0, base],
      [a / 2, rig.P({ hang: 0, hF: [16, -58], hB: [20, -64] })],
      [(airFrom + airTo) / 2, rig.P({ hang: 0, hF: [14, -122], hB: [0, -114] })],
      [1 - a / 2, rig.P({ hang: 0, hF: [18, -62], hB: [8, -44] })],
      [1, base],
    ])
    const pose = { ...body, hF: arms.hF, hB: arms.hB, hang: arms.hang }
    const rise = RISE * air ** 2
    const lift = Math.sin(Math.PI * rig.seg(k, airFrom, airTo)) ** 2 * rise
    return { pose: lift > 0 ? rig.shift(pose, 0, -lift) : pose }
  },
}
