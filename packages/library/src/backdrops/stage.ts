import type { BackdropDef } from '../types'

const FOLDS = [0.33, 0.66]

export const stage: BackdropDef = {
  id: 'stage',
  version: 1,
  description: 'Faint theatre stage: curtains at both sides and a spotlight cone falling from the top centre.',
  draw(g, rig) {
    const { C, rr, inkFill, ln, poly } = rig
    for (const left of [-148, 112]) {
      rr(g, left, -184, 36, 182, 2) // curtains
      inkFill(g, C.line, 1.4, C.faint)
      for (const f of FOLDS) ln(g, left + 36 * f, -182, left + 36 * f, -4, 1.1, C.faint)
    }
    g.save()
    g.globalAlpha = 0.5
    poly(g, [[-6, -176], [6, -176], [56, -2], [-56, -2]], true) // spotlight
    g.fillStyle = C.butterSoft
    g.fill()
    g.restore()
    rr(g, -9, -184, 18, 8, 2)
    inkFill(g, C.faint, 1.2, C.faint)
  },
}
