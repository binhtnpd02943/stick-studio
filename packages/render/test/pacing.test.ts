import { readFileSync } from 'node:fs'
import { parseScreenplay, type TimedAction, type TimedBeat, type Timeline } from '@stick/core'
import { defaultCatalog } from '@stick/library'
import { solveTimeline } from '@stick/pipeline'
import { describe, expect, test } from 'vitest'
import { checkPacing } from '../src/index.js'

const example = (name: string) => JSON.parse(readFileSync(new URL(`../../../examples/${name}`, import.meta.url), 'utf8'))

const act = (start: number, end: number): TimedAction => ({ who: 'a', action: 'wave', params: {}, start, end })
const beat = (id: string, start: number, end: number, tracks: TimedAction[] = []): TimedBeat => ({ id, start, end, tracks })
/** One scene whose last beat ends at the film's end; the solver's scene tail follows it. */
const film = (beats: TimedBeat[]): Timeline => {
  const end = beats[beats.length - 1]!.end
  return {
    fps: 30, width: 1080, height: 1920, duration: end + 0.4, cast: [],
    scenes: [{ id: 's1', start: 0, end: end + 0.4, backdrop: 'home', props: [], start_marks: {}, beats }],
  } as unknown as Timeline
}

describe('checkPacing', () => {
  test('phan-so example has no idle gaps', () => {
    const sp = parseScreenplay(example('phan-so.screenplay.json'))
    if (!sp.ok) throw new Error(sp.issues.join('; '))
    expect(checkPacing(solveTimeline(sp.value, example('phan-so.durations.json'), defaultCatalog))).toEqual([])
  })

  test('a hand-built timeline with a 3 s empty beat is flagged with its start/end', () => {
    const tl = film([beat('b0', 0, 1, [act(0, 1)]), beat('b1', 1, 4), beat('b2', 4, 5, [act(4, 5)])])
    expect(checkPacing(tl)).toEqual([{ kind: 'idle', start: 1, end: 4 }])
  })

  test('exactly 2.5 s is allowed', () => {
    const tl = film([beat('b0', 0, 1, [act(0, 1)]), beat('b1', 1, 3.5), beat('b2', 3.5, 4.5, [act(3.5, 4.5)])])
    expect(checkPacing(tl)).toEqual([])
  })

  test('a spoken line fills a beat with no tracks', () => {
    const talk = { ...beat('b1', 1, 4), line: { who: 'a', text: 'hi', start: 1, end: 4 } }
    expect(checkPacing(film([beat('b0', 0, 1, [act(0, 1)]), talk, beat('b2', 4, 5, [act(4, 5)])]))).toEqual([])
  })
})
