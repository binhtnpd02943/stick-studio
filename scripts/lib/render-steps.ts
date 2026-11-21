import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Timeline } from '@stick/core'
import { defaultCatalog } from '@stick/library'
import { ensureSfx, mixFilm, muxAudio, renderVideo, sfxCues, SFX_IDS } from '@stick/render'
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

/** Like renderWithAudio, but mixes in synthesised SFX (cached in `sfxCacheDir`) and optional music, loudness-normalised. */
export async function renderMixed(tl: Timeline, audioDir: string, sfxCacheDir: string, music: string | undefined, out: string): Promise<{ frames: number; seconds: number }> {
  mkdirSync(dirname(out), { recursive: true })
  const cues = sfxCues(tl, defaultCatalog)
  const paths = new Map(await Promise.all(SFX_IDS.filter((id) => cues.some((c) => c.id === id)).map(async (id) => [id, await ensureSfx(id, sfxCacheDir)] as const)))
  const tmp = mkdtempSync(join(tmpdir(), 'stick-render-'))
  try {
    const silent = join(tmp, 'silent.mp4')
    const stats = await renderVideo(tl, silent)
    await mixFilm(silent, { voice: audioClips(tl, audioDir), sfx: cues.map((c) => ({ path: paths.get(c.id)!, start: c.start })), music }, out)
    return stats
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
