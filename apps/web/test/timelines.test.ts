// @vitest-environment node
import { createCanvas } from '@napi-rs/canvas'
import type { Timeline } from '@stick/core'
import { loadRig, registerFonts } from '@stick/engine'
import { defaultCatalog } from '@stick/library'
import { drawFrame, FRAME, STAGE } from '@stick/render/frame'
import { describe, expect, test } from 'vitest'
import { castTimeline, idleTimeline, openingScene, STICK_STATES } from '../src/stick/timelines'

const film: Timeline = {
  fps: 30,
  width: 1080,
  height: 1920,
  duration: 9,
  title: 'Phim',
  cast: [
    { id: 'a', name: 'An', look: { ink: '#141414', hair: 'short' }, voice: 'male_young' },
    { id: 'b', name: 'Bình', look: { ink: '#1d4ed8' }, voice: 'female_young' },
  ],
  scenes: [
    {
      id: 's1', start: 0, end: 4, backdrop: 'office',
      props: [{ id: 'desk', type: 'desk', mark: 'right' }],
      start_marks: { a: 'left', b: 'center' },
      beats: [{ id: 's1.b0', start: 0, end: 4, line: { who: 'a', text: 'Chào', start: 0, end: 2 }, tracks: [{ who: 'a', action: 'wave', params: {}, start: 0, end: 2 }] }],
    },
    { id: 's2', start: 4, end: 9, backdrop: 'blank', props: [], start_marks: { a: 'left' }, beats: [{ id: 's2.b0', start: 4, end: 9, tracks: [] }] },
  ],
}

describe('web timelines', () => {
  test("idleTimeline keeps scene 0's backdrop, props and marks and glances from 5 to 6.5 s with no lines", () => {
    const idle = idleTimeline(film)
    expect(idle.duration).toBe(8)
    expect(idle.scenes).toHaveLength(1)
    const [scene] = idle.scenes
    expect(scene).toMatchObject({ start: 0, end: 8, backdrop: 'office', props: film.scenes[0]!.props, start_marks: { a: 'left', b: 'center' } })
    expect(scene!.beats).toEqual([{
      id: 's1.b0', start: 0, end: 8,
      tracks: [
        { who: 'a', action: 'look_around', params: {}, start: 5, end: 6.5 },
        { who: 'b', action: 'look_around', params: {}, start: 5, end: 6.5 },
      ],
    }])
  })

  test('openingScene keeps only scene 0', () => {
    const opening = openingScene(film)
    expect(opening.scenes).toEqual([film.scenes[0]])
    expect(opening.duration).toBe(4)
  })

  test('castTimeline waves with the given look', () => {
    const look = { ink: '#b45309', hair: 'ponytail' as const }
    const tl = castTimeline(look)
    expect(tl.cast[0]!.look).toEqual(look)
    expect(tl.scenes[0]!.beats[0]!.tracks[0]!.action).toBe('wave')
  })

  test('every action the web timelines use exists in defaultCatalog', () => {
    for (const id of ['wave', 'shrug', 'type_laptop', 'facepalm', 'cheer', 'look_around']) expect(defaultCatalog.actions[id], id).toBeDefined()
  })

  test('every stick state and castTimeline draw at start, middle and end without throwing', () => {
    registerFonts()
    const rig = loadRig()
    const canvas = createCanvas(FRAME.w, FRAME.h)
    const g = canvas.getContext('2d')
    const all = { ...STICK_STATES, cast: castTimeline({ ink: '#141414', hair: 'long' }), idle: idleTimeline(film) }
    for (const [name, tl] of Object.entries(all)) {
      for (const t of [0, tl.duration / 2, tl.duration - 1 / 30]) drawFrame(g, tl, t, rig, defaultCatalog)
      drawFrame(g, tl, tl.duration / 2, rig, defaultCatalog)
      // above the ground line, so only the figure (and props) count
      const { data } = g.getImageData(0, 0, FRAME.w, STAGE.groundY - 20)
      let dark = 0
      for (let i = 0; i < data.length; i += 4) if (data[i]! < 80 && data[i + 1]! < 80 && data[i + 2]! < 80) dark++
      expect(dark, `${name} has ink at mid`).toBeGreaterThan(2000)
    }
  })
})
