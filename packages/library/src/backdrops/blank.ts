import type { BackdropDef } from '../types'

export const blank: BackdropDef = {
  id: 'blank',
  version: 1,
  description: 'Nothing: the ground line is drawn by the director.',
  draw() {},
}
