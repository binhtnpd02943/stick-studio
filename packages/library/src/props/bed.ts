import type { PropDef } from '../types'

const W = 110
const SEAT = -32
const BOARD_H = 44

export const bed: PropDef = {
  id: 'bed',
  version: 1,
  width: W,
  seatY: SEAT,
  description: 'A bed with a pillow at each end and a blanket across the middle; a character can sit on it.',
  draw(g, rig, x) {
    const { C, rr, inkFill } = rig
    const left = x - W / 2
    for (const bx of [left, left + W - 6]) {
      rr(g, bx, -BOARD_H, 6, BOARD_H, 2) // a board at each end, so the bed is right from either side
      inkFill(g, C.wood, 1.7)
    }
    rr(g, left + 3, -20, W - 6, 12, 2) // frame
    inkFill(g, C.woodDk, 1.7)
    rr(g, left + 6, SEAT, W - 12, 14, 4) // mattress
    inkFill(g, C.paper, 1.7)
    for (const px of [left + 9, left + W - 31]) {
      rr(g, px, SEAT - 8, 22, 9, 4) // pillows
      inkFill(g, C.paper, 1.7)
    }
    rr(g, x - 22, SEAT - 1, 44, 20, 3) // blanket draped over the front, under the sitter
    inkFill(g, C.sky, 1.7)
  },
}
