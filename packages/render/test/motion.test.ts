import { parseScreenplay } from '@stick/core'
import { defaultCatalog, type ActionDef, type PropDef } from '@stick/library'
import { solveTimeline } from '@stick/pipeline'
import { describe, expect, test } from 'vitest'
import { specExample } from '../../core/test/fixtures.js'
import { checkMotion } from '../src/index.js'
import { soloTimeline } from '../src/solo.js'

const snap: ActionDef = {
  id: 'snap',
  version: 1,
  needsTarget: false,
  duration: { min: 0.5, ideal: 1, max: 2 },
  description: 'test-only: bare switch from rest to cheer',
  apply: ({ rig, k, base }) => ({ pose: k < 0.5 ? base : rig.P({ hF: [14, -132], hB: [-10, -130], head: [3, -118] }) }),
}

// Props draw before figures, so to put this one in front, later drawing (the figure) goes underneath it.
const visor: PropDef = {
  id: 'visor',
  version: 1,
  width: 30,
  description: 'test-only: an opaque block in front of the head',
  draw: (g, _rig, x) => {
    g.fillStyle = '#ffffff'
    g.fillRect(x - 15, -140, 30, 60)
    g.globalCompositeOperation = 'destination-over'
  },
}

describe('checkMotion', () => {
  test('clean film', () => {
    const r = parseScreenplay(specExample())
    if (!r.ok) throw new Error(r.issues.join('; '))
    const tl = solveTimeline(r.value, { 's1.b0': 1.6, 's1.b1': 2.0 }, defaultCatalog)
    const t0 = performance.now()
    const found = checkMotion(tl, defaultCatalog)
    console.info(`checkMotion: ${tl.duration.toFixed(2)}s film in ${(performance.now() - t0).toFixed(0)} ms`)
    expect(found).toEqual([])
  }, 60_000)

  test('no talk sliver between a think and a long line', () => {
    const r = parseScreenplay(specExample())
    if (!r.ok) throw new Error(r.issues.join('; '))
    const tl = solveTimeline(r.value, { 's1.b0': 3.0 }, defaultCatalog)
    expect(checkMotion(tl, defaultCatalog)).toEqual([])
  }, 60_000)

  test('detects a snap', () => {
    const catalog = { ...defaultCatalog, actions: { ...defaultCatalog.actions, snap } }
    const found = checkMotion(soloTimeline('snap', 1), catalog)
    expect(found.some((f) => f.kind === 'jump')).toBe(true)
  }, 30_000)

  test('detects a covered head', () => {
    const catalog = { ...defaultCatalog, props: { ...defaultCatalog.props, visor } }
    const solo = soloTimeline('nod', 0.6)
    const tl = { ...solo, scenes: solo.scenes.map((s) => ({ ...s, props: [{ id: 'v', type: 'visor', mark: 'left' as const }] })) }
    expect(checkMotion(tl, catalog).map((f) => f.kind)).toEqual(['head-covered'])
  }, 30_000)
})
