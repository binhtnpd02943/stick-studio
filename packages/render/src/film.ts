import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Timeline } from '@stick/core'
import type { Catalog } from '@stick/library'
import { audioClips } from './audio-clips.js'
import { mixFilm } from './mix.js'
import { ensureSfx, sfxCues, SFX_IDS } from './sfx.js'
import { renderVideo } from './video.js'

export interface FilmRenderOptions { audioDir: string; sfxCacheDir: string; music?: string; catalog: Catalog }

/** Renders `tl` with its voice clips, synthesised SFX (cached in `sfxCacheDir`) and optional music, loudness-normalised. */
export async function renderFilm(tl: Timeline, { audioDir, sfxCacheDir, music, catalog }: FilmRenderOptions, out: string): Promise<{ frames: number; seconds: number }> {
  mkdirSync(dirname(out), { recursive: true })
  const cues = sfxCues(tl, catalog)
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
