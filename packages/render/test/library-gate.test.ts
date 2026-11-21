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

const STEP_S = 0.1
// Locomotion is sized by the solver to distance / speed, clamped to [min, max], so it lands on any duration in range.
const sweep = Object.values(defaultCatalog.actions)
  .filter((a) => a.speed !== undefined)
  .flatMap((a) =>
    (['center', 'right'] as const).flatMap((target) => {
      const n = Math.floor((a.duration.max - a.duration.min) / STEP_S + 1e-9)
      return Array.from({ length: n + 1 }, (_, i) => [a.id, target, +(a.duration.min + i * STEP_S).toFixed(2)] as const)
    }),
  )

describe('locomotion duration sweep', () => {
  test.each(sweep)('%s to %s over %ss moves cleanly', (id, target, dur) => {
    expect(checkMotion(soloTimeline(id, dur, target), defaultCatalog)).toEqual([])
  }, 30_000)
})
