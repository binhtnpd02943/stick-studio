import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Timeline } from '@stick/core'
import { describe, expect, test } from 'vitest'
import { CliError } from './lib/cli-error.js'
import { gateMotion } from './lib/motion-gate.js'

const SLOW = 300_000
const dir = mkdtempSync(join(tmpdir(), 'stick-cli-'))
const EXAMPLE = 'examples/phan-so.screenplay.json'
const DURATIONS = 'examples/phan-so.durations.json'

const cli = (args: string[], env: NodeJS.ProcessEnv = process.env) =>
  spawnSync('npx', ['tsx', 'scripts/render-film.ts', ...args], { encoding: 'utf8', env })
const write = (name: string, content: string) => {
  const file = join(dir, name)
  writeFileSync(file, content)
  return file
}
const streams = (file: string) =>
  spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim()

const MINIMAL = JSON.stringify({
  version: 1,
  format: { aspect: '9:16', fps: 30 },
  cast: [{ id: 'minh', name: 'Minh', look: { ink: '#141414' }, voice: 'male_young' }],
  scenes: [{ id: 's1', backdrop: 'classroom', props: [], start: { minh: 'center' }, beats: [{ say: { who: 'minh', text: 'Xin chào.' } }] }],
})

describe('render-film CLI', () => {
  test('renders the example', () => {
    const out = join(dir, 'nested', 'film.mp4') // parent dir is created on demand
    const r = cli([EXAMPLE, '--durations', DURATIONS, '--out', out])
    expect(r.stdout).toContain('render fps')
    expect(r.status).toBe(0)
    expect(streams(out)).toBe('video,1080,1920')
  }, SLOW)

  test('reports validation issues', () => {
    const sp = JSON.parse(readFileSync(EXAMPLE, 'utf8')) as { scenes: { beats: { do?: { action: string }[] }[] }[] }
    sp.scenes[0]!.beats.find((b) => b.do?.length)!.do![0]!.action = 'ride_bike'
    const r = cli([write('bad.json', JSON.stringify(sp)), '--durations', DURATIONS, '--out', join(dir, 'bad.mp4')])
    expect(r.status).toBe(2)
    expect(r.stdout).toContain('unknown_action')
  }, SLOW)

  test('usage error prints usage', () => {
    const r = cli([])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('usage:')
  }, SLOW)

  test('missing screenplay file exits 1', () => {
    const r = cli([join(dir, 'nope.json')])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('cannot read')
  }, SLOW)

  test('bad JSON exits 1', () => {
    const r = cli([write('broken.json', '{not json')])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('cannot read')
  }, SLOW)

  test('bad durations file exits 1 instead of rendering NaN', () => {
    const durations = write('d-bad.json', JSON.stringify({ 's1.b0': -5, 's1.b1': 'x' }))
    const r = cli([EXAMPLE, '--durations', durations, '--out', join(dir, 'nan.mp4')])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('finite numbers > 0')
    expect(existsSync(join(dir, 'nan.mp4'))).toBe(false)
  }, SLOW)

  test('--audio with a missing dir exits 1', () => {
    const r = cli([write('min.json', MINIMAL), '--audio', join(dir, 'no-such-dir')])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('cannot read audio dir')
  }, SLOW)

  test('--audio with no matching wavs exits 1 and warns about strays', () => {
    const empty = join(dir, 'strays')
    mkdirSync(empty)
    writeFileSync(join(empty, 'zzz.wav'), '')
    const r = cli([write('min2.json', MINIMAL), '--audio', empty])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('zzz.wav')
    expect(r.stderr).toContain('no <beatId>.wav files')
  }, SLOW)

  test('--audio muxes a wav and leaves no temp dir behind', () => {
    const audio = join(dir, 'audio')
    const tmp = join(dir, 'tmp')
    mkdirSync(audio)
    mkdirSync(tmp)
    const wav = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', join(audio, 's1.b0.wav')])
    expect(wav.status).toBe(0)
    const out = join(dir, 'av.mp4')
    const r = cli([write('min3.json', MINIMAL), '--audio', audio, '--out', out], { ...process.env, TMPDIR: tmp })
    expect(r.status).toBe(0)
    expect(streams(out)).toContain('audio')
    expect(readdirSync(tmp).filter((f) => f.startsWith('stick-render-'))).toEqual([])
  }, SLOW)
})

describe('gateMotion (exit 3)', () => {
  const tl = {} as Timeline
  const finding = { kind: 'jump' as const, from: 1, to: 1.1, note: 'fig0 handF 6.5' }

  test('throws CliError(3) listing the findings', () => {
    const run = () => gateMotion(tl, false, () => [finding])
    expect(run).toThrow(CliError)
    expect(run).toThrow(/jump 1\.00-1\.10s fig0 handF 6\.5/)
    try {
      run()
    } catch (e) {
      expect((e as CliError).exitCode).toBe(3)
    }
  })

  test('--skip-motion bypasses the check', () => {
    expect(() => gateMotion(tl, true, () => [finding])).not.toThrow()
  })

  test('clean film passes', () => {
    expect(() => gateMotion(tl, false, () => [])).not.toThrow()
  })
})
