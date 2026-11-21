import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseScreenplay, type Timeline } from '@stick/core'
import { defaultCatalog as catalog } from '@stick/library'
import { solveTimeline } from '@stick/pipeline'
import { beforeAll, describe, expect, test } from 'vitest'
import { specExample } from '../../core/test/fixtures.js'
import { muxAudio, renderVideo } from '../src/index.js'

const SLOW = 120_000
const dir = mkdtempSync(join(tmpdir(), 'stick-video-'))
const parsed = parseScreenplay(specExample())
if (!parsed.ok) throw new Error(parsed.issues.join('; '))
const tl: Timeline = solveTimeline(parsed.value, { 's1.b0': 1.6, 's1.b1': 2.0 }, catalog)

const probe = (file: string) =>
  JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', file]).toString(),
  ) as { streams: { codec_type: string; width?: number; height?: number }[]; format: { duration: string } }

const video = join(dir, 'film.mp4')

beforeAll(async () => {
  await renderVideo(tl, video)
}, SLOW)

describe('renderVideo', () => {
  test('renders a 2-scene film', () => {
    const p = probe(video)
    const v = p.streams.find((s) => s.codec_type === 'video')!
    expect([v.width, v.height]).toEqual([1080, 1920])
    expect(Math.abs(Number(p.format.duration) - tl.duration)).toBeLessThan(0.1)
  })

  test('fails loudly without ffmpeg', async () => {
    const out = join(dir, 'bad.mp4')
    await expect(renderVideo(tl, out, { ffmpegPath: '/nonexistent/ffmpeg' })).rejects.toThrow()
    expect(existsSync(out)).toBe(false)
  }, SLOW)

  test('rejects (no unhandled EPIPE) when ffmpeg exits early', async () => {
    const out = join(dir, 'early.mp4')
    await expect(renderVideo(tl, out, { ffmpegPath: '/usr/bin/false' })).rejects.toThrow(/exited with code 1/)
    expect(existsSync(out)).toBe(false)
  }, SLOW)

  test('kills ffmpeg and leaves no file when drawing/progress throws', async () => {
    const out = join(dir, 'aborted.mp4')
    const pidFile = join(dir, 'ffmpeg.pid')
    const wrapper = join(dir, 'ffmpeg-wrapper.sh')
    writeFileSync(wrapper, `#!/bin/sh\necho $$ > '${pidFile}'\nexec ffmpeg "$@"\n`)
    chmodSync(wrapper, 0o755)
    const boom = () => {
      throw new Error('boom')
    }
    await expect(renderVideo(tl, out, { ffmpegPath: wrapper, onProgress: boom })).rejects.toThrow('boom')
    expect(existsSync(out)).toBe(false)
    const pid = Number(readFileSync(pidFile, 'utf8'))
    expect(() => process.kill(pid, 0)).toThrow(/ESRCH/)
  }, SLOW)
})

describe('muxAudio', () => {
  const tone = join(dir, 'tone.wav')
  beforeAll(() => {
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=f=440:d=1', tone], { stdio: 'ignore' })
  })

  test('muxes audio at offsets', async () => {
    const out = join(dir, 'with-audio.mp4')
    await muxAudio(video, [{ path: tone, start: 0.5 }], out)
    const p = probe(out)
    expect(p.streams.filter((s) => s.codec_type === 'audio')).toHaveLength(1)
    expect(Math.abs(Number(p.format.duration) - Number(probe(video).format.duration))).toBeLessThan(0.1)
  }, SLOW)

  test('mixes several clips and copies the video with none', async () => {
    const two = join(dir, 'two.mp4')
    await muxAudio(video, [{ path: tone, start: 0 }, { path: tone, start: 1.2 }], two)
    expect(probe(two).streams.filter((s) => s.codec_type === 'audio')).toHaveLength(1)
    const none = join(dir, 'none.mp4')
    await muxAudio(video, [], none)
    expect(probe(none).streams.filter((s) => s.codec_type === 'audio')).toHaveLength(0)
  }, SLOW)

  test('rejects with the stderr tail on failure', async () => {
    await expect(muxAudio(video, [{ path: join(dir, 'missing.wav'), start: 0 }], join(dir, 'x.mp4'))).rejects.toThrow(/missing\.wav/)
  }, SLOW)
})
