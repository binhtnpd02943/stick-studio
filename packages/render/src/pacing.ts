import type { Timeline } from '@stick/core'

export const MAX_IDLE_S = 2.5
export interface PacingFinding { kind: 'idle'; start: number; end: number }

const EPS = 1e-9

/** Gaps longer than `maxIdle` with no active track and no spoken line, from the end of the first beat to the end of the last beat (= last scene end − SCENE_TAIL). */
export function checkPacing(tl: Timeline, maxIdle = MAX_IDLE_S): PacingFinding[] {
  const beats = tl.scenes.flatMap((s) => s.beats)
  if (!beats.length) return []
  const to = beats[beats.length - 1]!.end
  const busy = beats
    .flatMap((b) => [...b.tracks, ...(b.line ? [b.line] : [])])
    .map((i): [number, number] => [i.start, i.end])
    .sort((a, b) => a[0] - b[0])
  const gaps: PacingFinding[] = []
  let cursor = beats[0]!.end
  const close = (end: number) => {
    if (end - cursor > maxIdle + EPS) gaps.push({ kind: 'idle', start: cursor, end })
  }
  for (const [start, end] of busy) {
    if (start >= to) break
    close(Math.min(start, to))
    cursor = Math.max(cursor, end)
  }
  close(to)
  return gaps
}
