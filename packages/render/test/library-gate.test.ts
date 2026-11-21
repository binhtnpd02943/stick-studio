import { defaultCatalog } from '@stick/library'
import { describe, expect, test } from 'vitest'
import { checkMotion } from '../src/index.js'
import { soloTimeline } from './solo.js'

// CI gate (spec §13): every starter action, alone, must move without a glitch.
describe('library motion gate', () => {
  test.each(Object.values(defaultCatalog.actions).map((a) => [a.id, a] as const))('%s moves cleanly', (_id, a) => {
    const tl = soloTimeline(a.id, a.duration.ideal, a.needsTarget ? 'right' : undefined)
    expect(checkMotion(tl, defaultCatalog)).toEqual([])
  }, 30_000)
})
