export interface ScenePlayer {
  frame(nowMs: number): { which: 'idle' | 'action'; t: number }
  play(nowMs: number): void
  looping(): boolean
}

/** Picks which timeline (idle loop or the action) and which t to draw at a given clock time. */
export function createScenePlayer(o: { actionDuration: number; idleDuration: number; reducedMotion: boolean }): ScenePlayer {
  let playing = false
  let since = 0
  return {
    frame(now) {
      if (playing) {
        const t = (now - since) / 1000
        if (t < o.actionDuration) return { which: 'action', t }
        playing = false
        since = now
      }
      if (o.reducedMotion) return { which: 'action', t: 0 }
      return { which: 'idle', t: ((now - since) / 1000) % o.idleDuration }
    },
    play(now) {
      playing = true
      since = now
    },
    looping: () => playing || !o.reducedMotion,
  }
}
