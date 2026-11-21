import type { PropDef } from '../types'

const W = 30

export const lamp: PropDef = {
  id: 'lamp',
  version: 1,
  width: W,
  description: 'A standing floor lamp with a round base and a warm shade.',
  draw(g, rig, x) {
    const { C, rr, inkFill, ln, poly } = rig
    rr(g, x - 8, -3, 16, 3, 1.5)
    inkFill(g, C.steel, 1.5)
    ln(g, x, -3, x, -112, 2.4)
    poly(g, [[x - 9, -130], [x + 9, -130], [x + 14, -108], [x - 14, -108]], true)
    inkFill(g, C.butterSoft, 1.7)
  },
}
