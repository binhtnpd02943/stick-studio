import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'
import { ensureSfx, mixFilm } from '../src/index.js'

const dir = mkdtempSync(join(tmpdir(), 'stick-mix-'))
const VIDEO_S = 6
const video = join(dir, 'video.mp4')
const voice = join(dir, 'voice.wav')
const music = join(dir, 'music.wav')

const ff = (...args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
}
const probe = (file: string, entries: string, stream = '') =>
  Number(spawnSync('ffprobe', ['-v', 'error', ...(stream ? ['-select_streams', stream] : []), '-show_entries', entries, '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim())
const lufs = (file: string): number => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' })
  const all = [...r.stderr.matchAll(/^\s+I:\s+(-?[\d.]+) LUFS/gm)]
  return Number(all.at(-1)![1])
}

/** Mean level in dB of `[from, from + len]`, optionally through a narrow bandpass at `hz`. */
const meanDb = (file: string, from: number, len: number, hz?: number): number => {
  const filter = `${hz ? `bandpass=f=${hz}:width_type=h:w=60,` : ''}volumedetect`
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-ss', String(from), '-t', String(len), '-i', file, '-vn', '-af', filter, '-f', 'null', '-'], { encoding: 'utf8' })
  return Number(r.stderr.match(/mean_volume:\s+(-?[\d.]+|-inf) dB/)![1])
}

beforeAll(() => {
  ff('-f', 'lavfi', '-i', `color=c=black:s=64x64:r=30:d=${VIDEO_S}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video)
  // A speech-like stand-in: modulated tones at 22.05 kHz, as the TTS providers emit.
  ff('-f', 'lavfi', '-i', 'sine=f=180:d=4:r=22050', '-f', 'lavfi', '-i', 'sine=f=900:d=4:r=22050', '-filter_complex', '[0][1]amix=inputs=2,tremolo=f=4:d=0.7', '-ac', '1', voice)
  ff('-f', 'lavfi', '-i', 'sine=f=330:d=30:r=44100', '-ac', '2', music)
})

describe('mixFilm', () => {
  test('voice-only mix integrates to -14 ±1 LUFS', async () => {
    const out = join(dir, 'voice-only.mp4')
    await mixFilm(video, { voice: [{ path: voice, start: 0.5 }], sfx: [] }, out)
    expect(Math.abs(lufs(out) + 14)).toBeLessThanOrEqual(1)
    expect(probe(out, 'stream=sample_rate', 'a:0')).toBe(48000)
  }, 60_000)

  test('voice, sfx and ducked music still land on -14 ±1 LUFS', async () => {
    const out = join(dir, 'full.mp4')
    const step = await ensureSfx('step', join(dir, 'sfx'))
    await mixFilm(video, { voice: [{ path: voice, start: 0.5 }], sfx: [{ path: step, start: 1 }, { path: step, start: 1.5 }], music }, out)
    expect(Math.abs(lufs(out) + 14)).toBeLessThanOrEqual(1)
  }, 60_000)

  test('music longer than the video is trimmed to video length ±0.05 s', async () => {
    const out = join(dir, 'trim.mp4')
    await mixFilm(video, { voice: [], sfx: [], music }, out)
    expect(Math.abs(probe(out, 'format=duration') - VIDEO_S)).toBeLessThanOrEqual(0.05)
  }, 60_000)

  test('music with a very short voice does not end early', async () => {
    const out = join(dir, 'short-voice.mp4')
    const clip = join(dir, 'blip.wav')
    ff('-f', 'lavfi', '-i', 'sine=f=300:d=0.3:r=22050', '-ac', '1', clip)
    await mixFilm(video, { voice: [{ path: clip, start: 1 }], sfx: [], music }, out)
    expect(Math.abs(probe(out, 'format=duration') - VIDEO_S)).toBeLessThanOrEqual(0.05)
    // the voice bus ends at 1.3 s; the music must keep playing to the end of the film
    expect(meanDb(out, VIDEO_S - 1.5, 1)).toBeGreaterThan(-60)
  }, 60_000)

  test('music is ducked while the voice plays', async () => {
    const out = join(dir, 'duck.mp4')
    const tone = join(dir, 'tone3k.wav')
    ff('-f', 'lavfi', '-i', 'sine=f=3000:d=2.5:r=22050', '-ac', '1', tone) // far above the 330 Hz music, so a bandpass tells them apart
    await mixFilm(video, { voice: [{ path: tone, start: 2 }], sfx: [], music }, out)
    const before = meanDb(out, 0.5, 1, 330), during = meanDb(out, 2.8, 1.2, 330)
    expect(before - during).toBeGreaterThan(3)
  }, 60_000)

  test('no voice, no sfx, no music still produces a file of video length', async () => {
    const out = join(dir, 'silent.mp4')
    await mixFilm(video, { voice: [], sfx: [] }, out)
    expect(Math.abs(probe(out, 'format=duration') - VIDEO_S)).toBeLessThanOrEqual(0.05)
    expect(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout.trim()).toBe('aac')
  }, 60_000)

  test('refuses outPath === videoPath and leaves the source alone', async () => {
    const source = join(dir, 'guard.mp4')
    writeFileSync(source, 'stand-in video bytes')
    await expect(mixFilm(source, { voice: [], sfx: [] }, source)).rejects.toThrow('mixFilm: outPath must differ from videoPath')
    expect(existsSync(source)).toBe(true)
  })

  describe('loudness pass with a fake ffmpeg', () => {
    const script = (name: string, body: string): string => {
      const path = join(dir, name)
      writeFileSync(path, `#!/bin/sh\n${body}\n`)
      chmodSync(path, 0o755)
      return path
    }
    const ffprobePath = script('fake-ffprobe', 'echo 2.0')

    test('loudness pass that hangs is killed after loudnessTimeoutMs', async () => {
      const ffmpegPath = script('hang-ffmpeg', 'sleep 30')
      const started = Date.now()
      await expect(
        mixFilm(video, { voice: [], sfx: [] }, join(dir, 'hang.mp4'), { ffmpegPath, ffprobePath, loudnessTimeoutMs: 300 }),
      ).rejects.toThrow(/loudness pass timed out after 300 ms/)
      expect(Date.now() - started).toBeLessThan(5000)
    }, 10_000)

    test('loudness pass failure reports the stderr tail, not the filtergraph', async () => {
      const ffmpegPath = script('fail-ffmpeg', 'for i in $(seq 1 30); do echo "line $i" >&2; done\nexit 1')
      const err = await mixFilm(video, { voice: [], sfx: [] }, join(dir, 'fail.mp4'), { ffmpegPath, ffprobePath }).catch((e: Error) => e)
      expect(err).toBeInstanceOf(Error)
      const { message } = err as Error
      expect(message).toContain('line 30')
      expect(message).not.toContain('line 10')
      expect(message).not.toContain('filter_complex')
      expect(message).not.toContain('amix=')
    })
  })
})
