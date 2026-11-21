import type { PropDef } from '../types'

const W = 34
const SEAT = -30

export const chair: PropDef = {
  id: 'chair',
  version: 1,
  width: W,
  seatY: SEAT,
  description: 'A simple wooden chair, side view, back on the left; a character can sit on it.',
  draw(g, rig, x) {
    const { C, rr, inkFill, ln } = rig
    ln(g, x - 14, SEAT + 4, x - 14, -0.2, 2.2)
    ln(g, x + 14, SEAT + 4, x + 14, -0.2, 2.2)
    rr(g, x - W / 2, -62, 4, 34, 1.5) // backrest
    inkFill(g, C.wood, 1.7)
    rr(g, x - W / 2, SEAT, W, 4, 1.5)
    inkFill(g, C.wood, 1.7)
  },
}
