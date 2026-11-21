import type { ActionDef } from '../types'
import { bump } from './bump'

const CLAP_HZ = 3
const clapEdge = (dur: number): number => Math.max(0.22, 0.3 / dur)

export const clap: ActionDef = {
  id: 'clap',
  version: 1,
  needsTarget: false,
  duration: { min: 0.8, ideal: 1.5, max: 3.0 },
  description: 'Overhead applause: both hands raised above the head, clapping together.',
  // The hands meet where `open` hits 0; a meet inside the ramps is too faint to see, so it stays silent.
  sfx(dur, { rig }) {
    const meets = Array.from({ length: Math.ceil(dur * CLAP_HZ) }, (_, n) => (n + 0.5) / CLAP_HZ).filter((at) => at < dur)
    return meets.filter((at) => bump(rig, at, dur, clapEdge(dur)) >= 0.5).map((at) => ({ id: 'clap', at }))
  },
  apply({ rig, T, dur, base }) {
    const w = bump(rig, T, dur, clapEdge(dur))
    const open = 0.5 + 0.5 * Math.cos(T * CLAP_HZ * 2 * Math.PI) // 1 apart, 0 together
    // Both hands above and in front of the face so both forearms show as a V that opens and closes.
    const target = rig.P({ hF: [16 + open * 9, -122 + open * 4], hB: [16 - open * 9, -122 - open * 4], head: [3, -116], hang: 0 })
    return { pose: rig.mix(base, target, w) }
  },
}
