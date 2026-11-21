import type { PropDef } from '../types'

const W = 110
const SEAT = -32

export const bed: PropDef = {
  id: 'bed',
  version: 1,
  width: W,
  seatY: SEAT,
  description: 'A bed with a pillow and a blanket, side view, headboard on the left; a character can sit on it.',
  draw(g, rig, x) {
    const { C, rr, inkFill } = rig
    const left = x - W / 2
    rr(g, left, -54, 6, 54, 2) // headboard
    inkFill(g, C.wood, 1.7)
    rr(g, left + W - 6, -26, 6, 26, 2) // footboard
    inkFill(g, C.wood, 1.7)
    rr(g, left + 3, -20, W - 6, 12, 2) // frame
    inkFill(g, C.woodDk, 1.7)
    rr(g, left + 6, SEAT, W - 12, 14, 4) // mattress
    inkFill(g, C.paper, 1.7)
    rr(g, left + 9, SEAT - 8, 22, 9, 4) // pillow
    inkFill(g, C.paper, 1.7)
    rr(g, x + 12, SEAT - 3, W / 2 - 16, 20, 3) // blanket draped over the side, clear of where a sitter lands
    inkFill(g, C.sky, 1.7)
  },
}
