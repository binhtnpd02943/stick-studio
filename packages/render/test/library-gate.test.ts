import { defaultCatalog } from '@stick/library'
import { describe, expect, test } from 'vitest'
import { checkMotion } from '../src/index.js'
import { soloTimeline } from '../src/solo.js'

/** Longest film the gate plays for one action (talk's max is 30 s). */
const GATE_MAX_S = 5

const cases = Object.values(defaultCatalog.actions).flatMap((a) =>
  (['min', 'ideal', 'max'] as const).map((which) => [a.id, which, Math.min(a.duration[which], GATE_MAX_S), a.needsTarget] as const),
)

// CI gate (spec §13): every starter action, alone, at any duration the solver may pick, must move without a glitch.
describe('library motion gate', () => {
  test.each(cases)('%s at %s (%ss) moves cleanly', (id, _which, dur, needsTarget) => {
    expect(checkMotion(soloTimeline(id, dur, needsTarget ? 'right' : undefined), defaultCatalog)).toEqual([])
  }, 30_000)
})
