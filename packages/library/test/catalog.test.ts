import { describe, expect, it } from 'vitest'
import { defaultCatalog } from '../src/index'

const GESTURES = ['shrug', 'shake_head', 'facepalm', 'clap', 'cry', 'laugh', 'stomp', 'look_around', 'scratch_head', 'cross_arms', 'bow', 'jump']

describe('catalog', () => {
  it('catalog has the 12 gesture actions, each with description ≤ 120 chars and min ≤ ideal ≤ max', () => {
    for (const id of GESTURES) {
      const a = defaultCatalog.actions[id]
      expect(a, id).toBeDefined()
      expect(a!.id).toBe(id)
      expect(a!.needsTarget).toBe(false)
      expect(a!.description.length).toBeLessThanOrEqual(120)
      const { min, ideal, max } = a!.duration
      expect(min).toBeLessThanOrEqual(ideal)
      expect(ideal).toBeLessThanOrEqual(max)
    }
  })
})
