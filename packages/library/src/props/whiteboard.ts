import type { PropDef } from '../types'

const W = 90
const H = 66
const TOP = -128

export const whiteboard: PropDef = {
  id: 'whiteboard',
  version: 1,
  width: W,
  description: 'A paper board on legs with a header line and rows of text; one row highlighted.',
  draw(g, rig, x) {
    const { C, rr, inkFill, ln, words, stand, text } = rig
    const left = x - W / 2
    stand(g, x - W / 2 + 14, x + W / 2 - 14, TOP + H, 5)
    rr(g, left, TOP, W, H, 5)
    inkFill(g, C.paper, 1.7)
    ln(g, left, TOP + 14, left + W, TOP + 14, 1.3)
    text(g, 'plan.md', left + 8, TOP + 10, 8, C.ink, 'left')
    for (let i = 0; i < 4; i++) {
      const y = TOP + 26 + i * 10
      if (i === 2) {
        rr(g, left + 4, y - 5, W - 8, 10, 2)
        g.fillStyle = '#dafbe1'
        g.fill()
      }
      words(g, left + 9 + (i % 2) * 6, y, 60 + ((i * 7) % 10), i * 5 + 3, i === 2 ? '#7cc48e' : '#cfcfcf', 2)
    }
  },
}
