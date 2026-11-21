import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { killAndWait, runFfmpeg } from './ffmpeg.js'

export interface AudioClip {
  path: string
  /** Offset into the video, in seconds. */
  start: number
}

function filterGraph(clips: AudioClip[]): string {
  const delayed = clips.map((c, i) => `[${i + 1}:a]adelay=${Math.round(c.start * 1000)}:all=1[a${i}]`)
  const labels = clips.map((_, i) => `[a${i}]`).join('')
  // apad: keep the video's full length under -shortest even when the audio is shorter.
  const mix = clips.length === 1 ? `${labels}apad[aout]` : `${labels}amix=inputs=${clips.length}:normalize=0,apad[aout]`
  return [...delayed, mix].join(';')
}

/** Mixes `clips` at their offsets onto `videoPath`; with no clips the video is copied unchanged. */
export async function muxAudio(
  videoPath: string,
  clips: AudioClip[],
  outPath: string,
  opts: { ffmpegPath?: string } = {},
): Promise<void> {
  // Checked first: the failure path below deletes outPath, which would delete the source.
  if (resolve(outPath) === resolve(videoPath)) throw new Error('muxAudio: outPath must differ from videoPath')
  const { ffmpegPath = 'ffmpeg' } = opts
  const args =
    clips.length === 0
      ? ['-y', '-i', videoPath, '-c', 'copy', outPath]
      : [
          '-y', '-i', videoPath, ...clips.flatMap((c) => ['-i', c.path]),
          '-filter_complex', filterGraph(clips), '-map', '0:v', '-map', '[aout]',
          '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', outPath,
        ]
  const run = runFfmpeg(ffmpegPath, args)
  run.child.stdin.end()
  try {
    await run.done
  } catch (e) {
    await killAndWait(run)
    await rm(outPath, { force: true })
    throw e
  }
}
