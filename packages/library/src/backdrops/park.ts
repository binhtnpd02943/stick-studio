import type { BackdropDef } from '../types'

const TREES: ReadonlyArray<readonly [x: number, r: number]> = [[-120, 20], [-62, 15], [74, 16], [128, 20]]

export const park: BackdropDef = {
  id: 'park',
  version: 1,
  description: 'Faint park: distant round trees, a sun in the corner and the outline of a bench.',
  draw(g, rig) {
    const { C, inkFill, ln, circle, poly } = rig
    for (const [x, r] of TREES) {
      ln(g, x, -2, x, -80 - r, 3, C.faint)
      circle(g, x, -88 - r, r)
      inkFill(g, C.line, 1.4, C.faint)
    }
    circle(g, 10, -164, 13) // sun
    inkFill(g, C.butterSoft, 1.4, C.faint)
    poly(g, [[-24, -28], [24, -28], [24, -17], [-24, -17]], true) // bench outline
    inkFill(g, null, 1.3, C.faint)
    ln(g, -24, -17, -24, -2, 1.3, C.faint)
    ln(g, 24, -17, 24, -2, 1.3, C.faint)
    ln(g, -24, -38, 24, -38, 1.3, C.faint)
  },
}
