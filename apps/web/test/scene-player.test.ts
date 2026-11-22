import { describe, expect, test } from 'vitest'
import { createScenePlayer } from '../src/stick/scene-player'

describe('createScenePlayer', () => {
  test('idle frames loop over idleDuration', () => {
    const p = createScenePlayer({ actionDuration: 2, idleDuration: 8, reducedMotion: false })
    expect(p.frame(9000)).toEqual({ which: 'idle', t: 1 })
    expect(p.looping()).toBe(true)
  })

  test('play runs the action once then returns to idle at t 0', () => {
    const p = createScenePlayer({ actionDuration: 2, idleDuration: 8, reducedMotion: false })
    p.play(10_000)
    expect(p.frame(10_000)).toEqual({ which: 'action', t: 0 })
    expect(p.frame(11_500)).toEqual({ which: 'action', t: 1.5 })
    expect(p.frame(12_000)).toEqual({ which: 'idle', t: 0 })
    expect(p.frame(13_000)).toEqual({ which: 'idle', t: 1 })
  })

  test('reduced motion shows the first action frame and does not loop until played', () => {
    const p = createScenePlayer({ actionDuration: 2, idleDuration: 8, reducedMotion: true })
    expect(p.frame(9000)).toEqual({ which: 'action', t: 0 })
    expect(p.looping()).toBe(false)
    p.play(10_000)
    expect(p.looping()).toBe(true)
    expect(p.frame(11_000)).toEqual({ which: 'action', t: 1 })
    expect(p.frame(12_000)).toEqual({ which: 'action', t: 0 })
    expect(p.looping()).toBe(false)
  })
})
