import { beatId, estimateLineDuration, type Beat, type Screenplay, type TimedAction, type TimedBeat, type TimedScene, type Timeline } from '@stick/core'
import { lookup, markX, resolveTarget, type ActionDef, type Catalog } from '@stick/library'

export const LINE_LEAD = 0.15
export const BEAT_PAD = 0.3
export const MIN_BEAT = 0.8
export const SCENE_TAIL = 0.4
/** World units per second a character covers walking. */
export const WALK_SPEED = 110

type Scene = Screenplay['scenes'][number]
type Action = NonNullable<Beat['do']>[number]
type Duration = ActionDef['duration']
/** An action paired with the duration it was sized to. */
type Sized = { action: Action; d: Duration }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Group a beat's actions per character, preserving order.
function sequences(actions: Sized[]): Map<string, Sized[]> {
  const bySpeaker = new Map<string, Sized[]>()
  for (const s of actions) bySpeaker.set(s.action.who, [...(bySpeaker.get(s.action.who) ?? []), s])
  return bySpeaker
}

const idealOf = (seq: Sized[]) => seq.reduce((sum, s) => sum + s.d.ideal, 0)

/** Catalog duration, except walk_to whose ideal is the walk's distance at WALK_SPEED. Advances `xs` to where each walker ends. */
function sizeActions(beat: Beat, scene: Scene, xs: Map<string, { x: number }>, catalog: Catalog): Sized[] {
  return (beat.do ?? []).map((action) => {
    const d = lookup(catalog.actions, action.action)!.duration
    if (action.action !== 'walk_to' || action.target === undefined) return { action, d }
    const from = xs.get(action.who)?.x ?? 0
    const to = resolveTarget(action.target, scene, xs, from, true, catalog)
    xs.set(action.who, { x: to })
    return { action, d: { ...d, ideal: clamp(Math.abs(to - from) / WALK_SPEED, d.min, d.max) } }
  })
}

function packTrack(seq: Sized[], start: number, beatLen: number): TimedAction[] {
  const factor = beatLen / idealOf(seq)
  let cursor = start
  return seq.map(({ action: a, d }) => {
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

function solveBeat(beat: Beat, sized: Sized[], id: string, start: number, lineDur: number): TimedBeat {
  const seqs = sequences(sized)
  const lineLen = beat.say ? lineDur + LINE_LEAD + BEAT_PAD : 0
  const beatLen = Math.max(lineLen, MIN_BEAT, ...[...seqs.values()].map(idealOf))
  return {
    id,
    start,
    end: start + beatLen,
    ...(beat.say && {
      line: { who: beat.say.who, text: beat.say.text, start: start + LINE_LEAD, end: start + LINE_LEAD + lineDur },
    }),
    tracks: [...seqs.values()].flatMap((seq) => packTrack(seq, start, beatLen)),
    ...(beat.camera && { camera: beat.camera }),
  }
}

function solveScene(scene: Scene, start: number, durations: Record<string, number>, catalog: Catalog): TimedScene {
  let cursor = start
  const xs = new Map(Object.entries(scene.start).map(([id, mark]) => [id, { x: markX(mark, scene, undefined, catalog) }]))
  const beats = scene.beats.map((beat, i) => {
    const id = beatId(scene.id, i)
    const d = lookup(durations, id)
    // Probed durations are untrusted: NaN, negative or zero fall back to the estimate.
    const lineDur = d !== undefined && Number.isFinite(d) && d > 0 ? d : beat.say ? estimateLineDuration(beat.say.text) : 0
    const timed = solveBeat(beat, sizeActions(beat, scene, xs, catalog), id, cursor, lineDur)
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
