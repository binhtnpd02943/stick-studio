import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
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
    await mixFilm(video, { voice: [{ path: clip, start: 0 }], sfx: [] }, out)
    expect(Math.abs(probe(out, 'format=duration') - VIDEO_S)).toBeLessThanOrEqual(0.05)
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
})
