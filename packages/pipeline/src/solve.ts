import { beatId, type Beat, type Screenplay, type TimedAction, type TimedBeat, type TimedScene, type Timeline } from '@stick/core'
import type { Catalog } from '@stick/library'

export const LINE_LEAD = 0.15
export const BEAT_PAD = 0.3
export const MIN_BEAT = 0.8
export const SCENE_TAIL = 0.4
const SECONDS_PER_WORD = 0.33
const MIN_LINE = 1.0

type Scene = Screenplay['scenes'][number]
type Action = NonNullable<Beat['do']>[number]

export function estimateLineDuration(text: string): number {
  return Math.max(MIN_LINE, text.trim().split(/\s+/).length * SECONDS_PER_WORD)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Group a beat's actions per character, preserving order.
function sequences(actions: Action[]): Map<string, Action[]> {
  const bySpeaker = new Map<string, Action[]>()
  for (const a of actions) bySpeaker.set(a.who, [...(bySpeaker.get(a.who) ?? []), a])
  return bySpeaker
}

function packTrack(seq: Action[], start: number, beatLen: number, catalog: Catalog): TimedAction[] {
  const durations = seq.map((a) => catalog.actions[a.action]!.duration)
  const factor = beatLen / durations.reduce((sum, d) => sum + d.ideal, 0)
  let cursor = start
  return seq.map((a, i) => {
    const d = durations[i]!
    const end = cursor + clamp(d.ideal * factor, d.min, d.max)
    const timed: TimedAction = {
      who: a.who,
      action: a.action,
      ...(a.target !== undefined && { target: a.target }),
      params: a.params ?? {},
      start: cursor,
      end,
    }
    cursor = end
    return timed
  })
}

function solveBeat(beat: Beat, id: string, start: number, lineDur: number, catalog: Catalog): TimedBeat {
  const seqs = sequences(beat.do ?? [])
  const idealOf = (seq: Action[]) => seq.reduce((sum, a) => sum + catalog.actions[a.action]!.duration.ideal, 0)
  const lineLen = beat.say ? lineDur + LINE_LEAD + BEAT_PAD : 0
  const beatLen = Math.max(lineLen, MIN_BEAT, ...[...seqs.values()].map(idealOf))
  return {
    id,
    start,
    end: start + beatLen,
    ...(beat.say && {
      line: { who: beat.say.who, text: beat.say.text, start: start + LINE_LEAD, end: start + LINE_LEAD + lineDur },
    }),
    tracks: [...seqs.values()].flatMap((seq) => packTrack(seq, start, beatLen, catalog)),
    ...(beat.camera && { camera: beat.camera }),
  }
}

function solveScene(scene: Scene, start: number, durations: Record<string, number>, catalog: Catalog): TimedScene {
  let cursor = start
  const beats = scene.beats.map((beat, i) => {
    const id = beatId(scene.id, i)
    const lineDur = durations[id] ?? (beat.say ? estimateLineDuration(beat.say.text) : 0)
    const timed = solveBeat(beat, id, cursor, lineDur, catalog)
    cursor = timed.end
    return timed
  })
  return {
    id: scene.id,
    start,
    end: cursor + SCENE_TAIL,
    backdrop: scene.backdrop,
    props: scene.props,
    start_marks: scene.start,
    beats,
  }
}

/** Assumes validateScreenplay returned no issues. Pure and deterministic; keys of `lineDurations` are beat ids. */
export function solveTimeline(sp: Screenplay, lineDurations: Record<string, number>, catalog: Catalog): Timeline {
  let cursor = 0
  const scenes = sp.scenes.map((scene) => {
    const timed = solveScene(scene, cursor, lineDurations, catalog)
    cursor = timed.end
    return timed
  })
  return {
    fps: 30,
    width: 1080,
    height: 1920,
    duration: cursor,
    ...(sp.title !== undefined && { title: sp.title }),
    cast: sp.cast,
    scenes,
  }
}
