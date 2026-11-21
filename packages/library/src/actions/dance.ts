import type { ActionDef } from '../types'
import { bump } from './bump'

const BEAT_HZ = 2 // arm swings per second
const SWING_MID = 100 // degrees from straight down, forward positive; each arm swings SWING_MID +- SWING_AMP
const SWING_AMP = 60
const ARM_LEN = 36
const SWAY = 4
const BOUNCE = 2.5
const STEP_LIFT = 7
const DEG = Math.PI / 180

// shortcut: posture does not persist across beats; a seated character stands between beats. Upgrade when the engine gets persistent postures.
export const dance: ActionDef = {
  id: 'dance',
  version: 1,
  needsTarget: false,
  duration: { min: 1.5, ideal: 3.0, max: 8.0 },
  description: 'Dance in place: the arms swing in opposite directions, the hips sway and the feet step to the beat.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur)
    const ph = T * BEAT_HZ * 2 * Math.PI
    const s = Math.sin(ph)
    const sway = Math.sin(ph / 2) * SWAY, bounce = Math.abs(Math.sin(ph / 2)) * BOUNCE
    const chest: [number, number] = [-sway * 0.5, -90 + bounce]
    const fist = (k: number): [number, number] => {
      const a = (SWING_MID + SWING_AMP * k) * DEG
      return [chest[0] + ARM_LEN * Math.sin(a), chest[1] + ARM_LEN * Math.cos(a)]
    }
    // The hips go one way, the shoulders the other; the feet take turns to lift on the beat.
    const target = rig.P({
      hip: [sway, -59 + bounce], chest, head: [-sway * 0.6, -116 + bounce], hF: fist(s), hB: fist(-s), hang: 0,
      fF: [4, -2.5 - Math.max(0, Math.sin(ph / 2)) * STEP_LIFT], fB: [-5, -2.5 - Math.max(0, -Math.sin(ph / 2)) * STEP_LIFT],
    })
    return { pose: rig.mix(base, target, w) }
  },
}
