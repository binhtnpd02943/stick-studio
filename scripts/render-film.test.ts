import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const SLOW = 300_000
const dir = mkdtempSync(join(tmpdir(), 'stick-cli-'))
const EXAMPLE = 'examples/phan-so.screenplay.json'
const DURATIONS = 'examples/phan-so.durations.json'

const cli = (...args: string[]) => spawnSync('npx', ['tsx', 'scripts/render-film.ts', ...args], { encoding: 'utf8' })

describe('render-film CLI', () => {
  test('renders the example', () => {
    const out = join(dir, 'nested', 'film.mp4') // parent dir is created on demand
    const r = cli(EXAMPLE, '--durations', DURATIONS, '--out', out)
    expect(r.stderr + r.stdout).toContain('render fps')
    expect(r.status).toBe(0)
    expect(existsSync(out)).toBe(true)
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out], { encoding: 'utf8' })
    expect(probe.stdout.trim()).toBe('1080,1920')
  }, SLOW)

  test('reports validation issues', () => {
    const sp = JSON.parse(readFileSync(EXAMPLE, 'utf8')) as { scenes: { beats: { do?: { action: string }[] }[] }[] }
    const bad = sp.scenes[0]!.beats.find((b) => b.do?.length)!
    bad.do![0]!.action = 'ride_bike'
    const file = join(dir, 'bad.json')
    writeFileSync(file, JSON.stringify(sp))
    const r = cli(file, '--durations', DURATIONS, '--out', join(dir, 'bad.mp4'))
    expect(r.status).toBe(2)
    expect(r.stdout).toContain('unknown_action')
  }, SLOW)

  test('usage error', () => {
    expect(cli().status).toBe(1)
  }, SLOW)
})
