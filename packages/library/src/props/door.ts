import type { PropDef } from '../types'

const W = 44
const H = 120

export const door: PropDef = {
  id: 'door',
  version: 1,
  width: W,
  description: 'A closed wooden door in a frame with a round knob; a character can knock on it.',
  draw(g, rig, x) {
    const { C, rr, inkFill, circle } = rig
    const left = x - W / 2
    rr(g, left, -H, W, H, 2) // frame
    inkFill(g, C.woodDk, 1.7)
    rr(g, left + 4, -H + 4, W - 8, H - 4, 1.5) // leaf
    inkFill(g, C.wood, 1.7)
    for (const [y, h] of [[-H + 12, 38], [-H + 58, 52]] as const) {
      rr(g, left + 10, y, W - 20, h, 2) // inset panels
      inkFill(g, null, 1.2, C.soft)
    }
    circle(g, x + 12, -58, 2.6)
    inkFill(g, C.butterHi, 1.4)
  },
}
