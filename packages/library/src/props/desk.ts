import type { PropDef } from '../types'

const W = 80
const TOP = -34

export const desk: PropDef = {
  id: 'desk',
  version: 1,
  width: W,
  description: 'A wood desk on two legs with a side-on laptop.',
  draw(g, rig, x) {
    const { C, rr, inkFill, ln } = rig
    ln(g, x - W / 2 + 6, TOP + 5, x - W / 2 + 4, 0, 2.2)
    ln(g, x + W / 2 - 6, TOP + 5, x + W / 2 - 4, 0, 2.2)
    // laptop: base then tilted dark lid
    rr(g, x - 6, TOP - 4, 28, 4, 1.5)
    inkFill(g, C.steel, 1.4)
    ln(g, x - 4, TOP - 4, x - 12, TOP - 28, 4, '#2b2b2b')
    rr(g, x - W / 2, TOP, W, 6, 2.5)
    inkFill(g, C.wood, 1.7)
  },
}
