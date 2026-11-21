import type { ActionDef } from '../types'
import { bump } from './bump'

const STAMPS = 2
const LIFT = 12
const KNEE_LIFT = 6
const FIST_PUMP = 8
const BODY_DIP = 2
/** A stamp rises over half its period; 0.3 s keeps the foot from covering its lift in a snap. */
const MIN_PERIOD_S = 0.3

export const stomp: ActionDef = {
  id: 'stomp',
  version: 1,
  needsTarget: false,
  duration: { min: 0.8, ideal: 1.2, max: 2.5 },
  description: 'Angry: fists up, head forward, one foot stamps twice.',
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur)
    const period = Math.min(0.4, Math.max(MIN_PERIOD_S, (dur - 0.5) / STAMPS))
    const u = (T - (dur - STAMPS * period) / 2) / period
    const lift = u > 0 && u < STAMPS ? Math.sin(Math.PI * (u % 1)) ** 2 : 0
    // Anger sits in the upper body: head forward and down, chest pulled forward, both fists up and bent.
    const target = rig.P({ head: [12, -106], chest: [4, -87], hF: [14, -80], hB: [10, -82], hang: 0, fF: [2, -2.5] })
    const m = rig.mix(base, target, w)
    // The stamp rides on top of the ramp (lift is 0 at both ends). Fists and body drop as the foot lands.
    const up = (p: number[], dy: number): [number, number] => [p[0]!, p[1]! + dy]
    const pose = {
      ...m,
      hip: up(m.hip, -lift * BODY_DIP), chest: up(m.chest, -lift * BODY_DIP), head: up(m.head, -lift * BODY_DIP),
      hF: up(m.hF, -lift * FIST_PUMP), hB: up(m.hB, -lift * FIST_PUMP),
      fF: up(m.fF, -lift * LIFT), kF: up(m.kF, -lift * KNEE_LIFT),
    }
    return { pose }
  },
}
