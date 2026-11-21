import type { PropDef } from '../types'

const W = 70
const TOP = -42

export const table: PropDef = {
  id: 'table',
  version: 1,
  width: W,
  description: 'A small round-top wooden table on one stem.',
  draw(g, rig, x) {
    const { C, rr, inkFill } = rig
    rr(g, x - 14, -4, 28, 4, 2) // foot
    inkFill(g, C.woodDk, 1.7)
    rr(g, x - 3, TOP + 4, 6, -TOP - 8, 2) // stem
    inkFill(g, C.woodDk, 1.7)
    rr(g, x - W / 2, TOP, W, 6, 3)
    inkFill(g, C.wood, 1.7)
  },
}
