import { fileURLToPath } from 'node:url'
import { GlobalFonts } from '@napi-rs/canvas'

const FONT_PATH = fileURLToPath(new URL('../../../assets/fonts/PatrickHand-Regular.ttf', import.meta.url))
// The rig asks for 'Balsamiq Sans'; Patrick Hand stands in because it covers Vietnamese.
const ALIAS = 'Balsamiq Sans'

let registered = false

export function registerFonts(): void {
  if (registered) return
  if (!GlobalFonts.registerFromPath(FONT_PATH, ALIAS)) throw new Error(`fonts: cannot register ${FONT_PATH}`)
  registered = true
}
