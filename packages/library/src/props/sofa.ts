import type { PropDef } from '../types'

const W = 90
const SEAT = -28

export const sofa: PropDef = {
  id: 'sofa',
  version: 1,
  width: W,
  seatY: SEAT,
  description: 'A two-seat pink sofa with cushions, front view; a character can sit on it.',
  draw(g, rig, x) {
    const { C, rr, inkFill, ln } = rig
    const left = x - W / 2
    ln(g, left + 7, -6, left + 6, -0.2, 2.2)
    ln(g, left + W - 7, -6, left + W - 6, -0.2, 2.2)
    rr(g, left + 7, -56, W - 14, 30, 6) // back
    inkFill(g, C.red, 1.7)
    rr(g, left + 7, SEAT, (W - 14) / 2, 16, 4) // two seat cushions
    inkFill(g, C.red, 1.7)
    rr(g, x, SEAT, (W - 14) / 2, 16, 4)
    inkFill(g, C.red, 1.7)
    rr(g, left, -40, 12, 36, 5) // arms
    inkFill(g, C.red, 1.7)
    rr(g, left + W - 12, -40, 12, 36, 5)
    inkFill(g, C.red, 1.7)
  },
}
