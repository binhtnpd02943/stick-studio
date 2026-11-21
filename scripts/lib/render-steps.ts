import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Timeline } from '@stick/core'
import { muxAudio, renderVideo } from '@stick/render'
import { audioClips } from './audio-clips.js'

/** Renders `tl` to `out`; with an audio dir, renders silent video to a temp file and muxes the clips in. */
export async function renderWithAudio(tl: Timeline, audioDir: string | undefined, out: string): Promise<{ frames: number; seconds: number }> {
  mkdirSync(dirname(out), { recursive: true })
  if (!audioDir) return renderVideo(tl, out)
  const tmp = mkdtempSync(join(tmpdir(), 'stick-render-'))
  try {
    const silent = join(tmp, 'silent.mp4')
    const stats = await renderVideo(tl, silent)
    await muxAudio(silent, audioClips(tl, audioDir), out)
    return stats
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
