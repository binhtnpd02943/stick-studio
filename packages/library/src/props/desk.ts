import type { PropDef } from '../types'
import { drawLaptop } from './laptop'

const W = 80
const TOP = -34

export const desk: PropDef = {
  id: 'desk',
  version: 1,
  width: W,
  description: 'A wood desk on two legs with a laptop on it.',
  draw(g, rig, x) {
    const { C, rr, inkFill, ln } = rig
    ln(g, x - W / 2 + 6, TOP + 5, x - W / 2 + 4, 0, 2.2)
    ln(g, x + W / 2 - 6, TOP + 5, x + W / 2 - 4, 0, 2.2)
    drawLaptop(g, rig, x, TOP)
    rr(g, x - W / 2, TOP, W, 6, 2.5)
    inkFill(g, C.wood, 1.7)
  },
}
