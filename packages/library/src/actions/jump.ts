import type { ActionDef } from '../types'

const RISE = 22
const AIR_FROM = 0.4
const AIR_TO = 0.74

export const jump: ActionDef = {
  id: 'jump',
  version: 1,
  needsTarget: false,
  duration: { min: 0.8, ideal: 1.0, max: 1.6 },
  description: 'Crouches, jumps up with arms raised, lands.',
  apply({ rig, T, dur, base }) {
    const k = T / dur
    // Legs and arms run on separate, sparse timelines so the arms never stop dead at a leg key.
    const crouchLegs = { hip: [-2, -49], chest: [4, -79], head: [8, -104], kF: [32, -28], kB: [22, -28] }
    const body = rig.seq(k, [
      [0, base],
      [0.2, rig.P(crouchLegs)],
      [AIR_FROM, rig.P({ head: [3, -118] })],
      [0.55, rig.P({ head: [3, -118], fF: [8, -15], fB: [-6, -19], kF: [26, -38], kB: [14, -40] })],
      [0.66, rig.P({ head: [3, -118] })],
      [0.84, rig.P(crouchLegs)],
      [1, base],
    ])
    // hang: 0 turns off the back-arm relax, whose snap past the hanging cone trips the gate.
    const arms = rig.seq(k, [
      [0, base],
      [0.2, rig.P({ hang: 0, hF: [16, -58], hB: [20, -64] })],
      [0.55, rig.P({ hang: 0, hF: [14, -126], hB: [-8, -124] })],
      [0.84, rig.P({ hang: 0, hF: [18, -62], hB: [8, -44] })],
      [1, base],
    ])
    const pose = { ...body, hF: arms.hF, hB: arms.hB, hang: arms.hang }
    const lift = Math.sin(Math.PI * rig.seg(k, AIR_FROM, AIR_TO)) ** 1.5 * RISE
    return { pose: lift > 0 ? rig.shift(pose, 0, -lift) : pose }
  },
}
