import type { PropDef } from '../types'

const W = 34
const SEAT = -30
const BACK_TOP = -62

export const chair: PropDef = {
  id: 'chair',
  version: 1,
  width: W,
  seatY: SEAT,
  description: 'A simple wooden chair, front view, with a slatted backrest; a character can sit on it.',
  draw(g, rig, x) {
    const { C, rr, inkFill, ln } = rig
    ln(g, x - 14, SEAT + 4, x - 14, -0.2, 2.2)
    ln(g, x + 14, SEAT + 4, x + 14, -0.2, 2.2)
    rr(g, x - 15, BACK_TOP, 30, SEAT - BACK_TOP, 2) // backrest behind the sitter, so it is right from either side
    inkFill(g, C.wood, 1.7)
    for (const y of [BACK_TOP + 9, BACK_TOP + 18]) ln(g, x - 15, y, x + 15, y, 1.3, C.woodDk)
    rr(g, x - W / 2, SEAT, W, 4, 1.5)
    inkFill(g, C.wood, 1.7)
  },
}
