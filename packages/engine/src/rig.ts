import { readFileSync } from 'node:fs'
import { rigFromSource, type Rig } from './rig-core'

export type { Pose, Rig } from './rig-core'

const VENDOR = new URL('./vendor/stick-rig.js', import.meta.url)
const vendorSource = readFileSync(VENDOR, 'utf8')

export function loadRig(opts: { instrument?: boolean } = {}): Rig {
  return rigFromSource(vendorSource, opts)
}
