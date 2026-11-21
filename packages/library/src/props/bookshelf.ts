import type { PropDef } from '../types'

const W = 60
const H = 110
const ROWS = 4
const ROW_H = H / ROWS

export const bookshelf: PropDef = {
  id: 'bookshelf',
  version: 1,
  width: W,
  description: 'A wooden shelf unit with rows of coloured book spines.',
  draw(g, rig, x) {
    const { C, rr, inkFill, ln } = rig
    const left = x - W / 2
    const spines = [C.red, C.green, C.butter, C.sky, C.steel, C.paper]
    rr(g, left, -H, W, H, 2)
    inkFill(g, C.wood, 1.7)
    for (let r = 0; r < ROWS; r++) {
      const shelf = -H + (r + 1) * ROW_H
      let bx = left + 4
      for (let i = 0; bx < left + W - 9; i++) {
        const w = 4 + ((i * 3 + r * 5) % 3)
        const h = 14 + ((i * 7 + r * 3) % 7)
        rr(g, bx, shelf - 1.5 - h, w, h, 0.8)
        inkFill(g, spines[(i + r * 2) % spines.length]!, 1.1)
        bx += w + 0.6
      }
      ln(g, left + 2, shelf, left + W - 2, shelf, 1.7)
    }
  },
}
