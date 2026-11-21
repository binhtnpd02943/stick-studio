import type { Timeline } from '@stick/core'

const BARE_MARKS = ['left', 'center', 'right']

/**
 * One scene, one beat, one character starting `left` doing `action` for `dur` seconds.
 * With `prop`, a prop of that type (id = type, so `near:<type>` resolves) stands at the target mark, or `right` when the target is not a bare mark.
 */
export function soloTimeline(action: string, dur: number, target?: string, prop?: string): Timeline {
  const track = { who: 'a', action, ...(target && { target }), params: {}, start: 0, end: dur }
  const mark = (BARE_MARKS.includes(target ?? '') ? target : 'right') as 'left' | 'center' | 'right'
  return {
    fps: 30,
    width: 1080,
    height: 1920,
    duration: dur,
    cast: [{ id: 'a', name: 'A', look: { ink: '#141414', hair: 'short' }, voice: 'male_young' }],
    scenes: [{ id: 's1', start: 0, end: dur, backdrop: 'blank', props: prop ? [{ id: prop, type: prop, mark }] : [], start_marks: { a: 'left' }, beats: [{ id: 's1.b0', start: 0, end: dur, tracks: [track] }] }],
  }
}
