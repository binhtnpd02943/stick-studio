import type { PropDef } from '../types'

const W = 70

export const tree: PropDef = {
  id: 'tree',
  version: 1,
  width: W,
  description: 'A leafy green tree with a brown trunk.',
  draw(g, rig, x) {
    const { C, rr, inkFill, circle } = rig
    rr(g, x - 5, -76, 10, 76, 2)
    inkFill(g, C.wood, 1.7)
    for (const [dx, y, r] of [[-17, -92, 17], [17, -92, 17], [0, -112, 21]] as const) {
      circle(g, x + dx, y, r)
      inkFill(g, C.green, 1.7)
    }
  },
}
