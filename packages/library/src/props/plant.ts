import type { PropDef } from '../types'

const W = 30
const POT_TOP = -22
const LEAVES = [[-50, 18], [-25, 30], [0, 38], [25, 30], [50, 18]] as const // [degrees from vertical, length]

export const plant: PropDef = {
  id: 'plant',
  version: 1,
  width: W,
  description: 'A potted plant: a terracotta pot with green leaves.',
  draw(g, rig, x) {
    const { C, inkFill, poly } = rig
    for (const [deg, len] of LEAVES) {
      const a = (deg * Math.PI) / 180
      const dx = Math.sin(a), dy = -Math.cos(a)
      g.beginPath()
      g.ellipse(x + (dx * len) / 2, POT_TOP + (dy * len) / 2, len / 2, 3.6, Math.atan2(dy, dx), 0, Math.PI * 2)
      inkFill(g, C.green, 1.5)
    }
    poly(g, [[x - 10, POT_TOP], [x + 10, POT_TOP], [x + 7, 0], [x - 7, 0]], true)
    inkFill(g, C.red, 1.7)
  },
}
