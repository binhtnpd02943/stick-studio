import type { PropDef } from '../types'

const W = 40
const H = 26

export const box: PropDef = {
  id: 'box',
  version: 1,
  width: W,
  description: 'A cardboard box with the flaps open and a strip of tape.',
  draw(g, rig, x) {
    const { C, rr, inkFill, ln, poly } = rig
    const left = x - W / 2
    poly(g, [[left, -H], [left - 2, -H - 9], [x - 3, -H - 9], [x - 1, -H]], true) // flaps
    inkFill(g, C.woodDk, 1.6)
    poly(g, [[left + W, -H], [left + W + 2, -H - 9], [x + 3, -H - 9], [x + 1, -H]], true)
    inkFill(g, C.woodDk, 1.6)
    rr(g, left, -H, W, H, 1.5)
    inkFill(g, C.wood, 1.7)
    ln(g, x, -H, x, -H + 12, 4, C.woodDk) // tape
    rr(g, left + 22, -13, 12, 8, 1)
    inkFill(g, C.paper, 1)
  },
}
