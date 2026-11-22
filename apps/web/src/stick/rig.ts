import { rigFromSource } from '@stick/engine/core'
import source from '@stick/engine/vendor/stick-rig.js?raw'

/** One shared rig; drawFrame resets setSettle(1) every frame, so sharing is safe. */
export const rig = rigFromSource(source)

const RIG_FONT = "400 60px 'Balsamiq Sans'"
let fonts: Promise<void> | undefined

/** Resolves once the rig font is loaded (at once without document.fonts, as in jsdom). */
export function fontsReady(): Promise<void> {
  fonts ??= document.fonts
    ? document.fonts.load(RIG_FONT).then(
        () => undefined,
        (e: unknown) => console.warn('stick: rig font failed to load, drawing with a fallback', e),
      )
    : Promise.resolve()
  return fonts
}
