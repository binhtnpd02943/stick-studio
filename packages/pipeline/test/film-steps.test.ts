import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { FILM_STEPS, type FilmStep, type TimedAction, type TimedBeat, type Timeline } from '@stick/core'
import { defaultCatalog } from '@stick/library'
import { FakeLlm, FakeTts, fakeFilmResponses } from '@stick/providers'
import { describe, expect, test } from 'vitest'
import { GateFailedError, runFilmStep, ScreenplayInvalidError, STEP_FILES, type FilmInput, type StepEnv } from '../src/index.js'

const SLOW = 300_000
const root = mkdtempSync(join(tmpdir(), 'stick-film-steps-'))
const sfxCacheDir = join(root, '.sfx-cache')
const input: FilmInput = { topic: 'Phân số là gì?', recent: [] }
const fake = fakeFilmResponses()

const env = (dir: string, extra: Partial<StepEnv> = {}): StepEnv => ({
  dir, llm: new FakeLlm([fake.story, fake.screenplay]), tts: new FakeTts(), catalog: defaultCatalog, sfxCacheDir, ...extra,
})
const probe = (file: string, entries: string) =>
  spawnSync('ffprobe', ['-v', 'error', '-show_entries', entries, '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim()

/** Every step in order, once per file; both slow tests share it. */
let full: Promise<{ dir: string; durationSec: number }> | undefined
const fullRun = () =>
  (full ??= (async () => {
    const dir = join(root, 'full')
    const e = env(dir)
    let durationSec = 0
    for (const step of FILM_STEPS) {
      const r = await runFilmStep(step, e, input)
      if (r.durationSec !== undefined) durationSec = r.durationSec
    }
    return { dir, durationSec }
  })())

const present = (dir: string, entry: string) =>
  entry.endsWith('/') ? existsSync(join(dir, entry)) && spawnSync('ls', [join(dir, entry)], { encoding: 'utf8' }).stdout.trim() !== '' : existsSync(join(dir, entry))

const act = (start: number, end: number): TimedAction => ({ who: 'a', action: 'wave', params: {}, start, end })
const beat = (id: string, start: number, end: number, tracks: TimedAction[] = []): TimedBeat => ({ id, start, end, tracks })
/** As in pacing.test.ts (plus one cast member, which the motion check draws): beat b1 is idle for 3 s. */
const idleTimeline = (): Timeline => {
  const beats = [beat('b0', 0, 1, [act(0, 1)]), beat('b1', 1, 4), beat('b2', 4, 5, [act(4, 5)])]
  return {
    fps: 30, width: 1080, height: 1920, duration: 5.4,
    cast: [{ id: 'a', name: 'A', look: { ink: '#141414' }, voice: 'narrator' }],
    scenes: [{ id: 's1', start: 0, end: 5.4, backdrop: 'home', props: [], start_marks: { a: 'center' }, beats }],
  } as unknown as Timeline
}
const gateDir = () => {
  const dir = mkdtempSync(join(root, 'gate-'))
  writeFileSync(join(dir, 'timeline.json'), JSON.stringify(idleTimeline()))
  return dir
}

describe('runFilmStep', () => {
  test('running every step in order produces every STEP_FILES write', async () => {
    const { dir, durationSec } = await fullRun()
    for (const step of FILM_STEPS) for (const w of STEP_FILES[step].writes) expect(present(dir, w), `${step} ${w}`).toBe(true)
    const film = join(dir, 'film.mp4')
    expect(existsSync(join(dir, 'film.partial.mp4'))).toBe(false)
    expect(probe(film, 'stream=width,height')).toBe('1080,1920')
    expect(Math.abs(Number(probe(film, 'format=duration')) - durationSec)).toBeLessThan(0.1)
  }, SLOW)

  test('each step reads only its declared reads', async () => {
    const { dir } = await fullRun()
    for (const step of FILM_STEPS) {
      const only = mkdtempSync(join(root, `only-${step}-`))
      for (const r of STEP_FILES[step].reads) {
        mkdirSync(dirname(join(only, r)), { recursive: true })
        cpSync(join(dir, r), join(only, r), { recursive: true })
      }
      const llm = new FakeLlm(step === 'story' ? [fake.story] : step === 'screenplay' ? [fake.screenplay] : [])
      await expect(runFilmStep(step as FilmStep, env(only, { llm }), input), step).resolves.toBeDefined()
    }
  }, SLOW)

  test('validate throws ScreenplayInvalidError for a screenplay with an unknown action', async () => {
    const dir = mkdtempSync(join(root, 'invalid-'))
    const sp = JSON.parse(readFileSync(new URL('../../../examples/phan-so.screenplay.json', import.meta.url), 'utf8'))
    sp.scenes[0].beats[0].do[0].action = 'ride_unicorn'
    writeFileSync(join(dir, 'screenplay.json'), JSON.stringify(sp))
    const err = await runFilmStep('validate', env(dir), input).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ScreenplayInvalidError)
    expect((err as ScreenplayInvalidError).issues.map((i) => i.code)).toContain('unknown_action')
  })

  test('gate writes gate.json and throws GateFailedError when findings exist', async () => {
    const dir = gateDir()
    const err = await runFilmStep('gate', env(dir), input).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GateFailedError)
    expect((err as GateFailedError).findings).toEqual(['pacing idle 1.00-4.00s'])
    expect(JSON.parse(readFileSync(join(dir, 'gate.json'), 'utf8'))).toEqual({ findings: ['pacing idle 1.00-4.00s'] })
  })

  test('gate with skipGates writes findings and does not throw', async () => {
    const dir = gateDir()
    await expect(runFilmStep('gate', env(dir, { skipGates: true }), input)).resolves.toBeDefined()
    expect(JSON.parse(readFileSync(join(dir, 'gate.json'), 'utf8'))).toEqual({ findings: ['pacing idle 1.00-4.00s'] })
  })
})
