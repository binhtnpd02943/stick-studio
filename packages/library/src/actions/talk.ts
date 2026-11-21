import type { ActionDef } from '../types'

const RAMP = 0.25

export const talk: ActionDef = {
  id: 'talk',
  version: 1,
  needsTarget: false,
  duration: { min: 0.3, ideal: 1.0, max: 30 },
  description: 'Small looping two-hand gesture while speaking.',
  apply({ rig, t, T, dur, base }) {
    const r = Math.min(RAMP, dur * 0.3)
    const env = rig.E.soft(rig.seg(T, 0, r)) * (1 - rig.E.soft(rig.seg(T, dur - r, dur)))
    const gesture = rig.P({
      hF: [22 + 6 * Math.sin(t * 5), -72 + 5 * Math.sin(t * 7 + 1)],
      hB: [8 + 5 * Math.sin(t * 4.3 + 2), -62 + 4 * Math.sin(t * 6.1)],
      head: [1 + Math.sin(t * 3) * 0.8, -116],
    })
    return { pose: rig.mix(base, gesture, env) }
  },
}
