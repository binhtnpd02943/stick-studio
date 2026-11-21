import type { Timeline } from '@stick/core'

/** One scene, one beat, one character starting `left` doing `action` for `dur` seconds. */
export function soloTimeline(action: string, dur: number, target?: string): Timeline {
  const track = { who: 'a', action, ...(target && { target }), params: {}, start: 0, end: dur }
  return {
    fps: 30,
    width: 1080,
    height: 1920,
    duration: dur,
    cast: [{ id: 'a', name: 'A', look: { ink: '#141414', hair: 'short' }, voice: 'male_young' }],
    scenes: [{ id: 's1', start: 0, end: dur, backdrop: 'blank', props: [], start_marks: { a: 'left' }, beats: [{ id: 's1.b0', start: 0, end: dur, tracks: [track] }] }],
  }
}
