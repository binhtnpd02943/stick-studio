import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { defaultCatalog } from '@stick/library'
import { runFilmStep, ScreenplayRejectedError, type FilmInput, type StepEnv } from '@stick/pipeline'
import { SCREENPLAY_PROMPT_VERSION, STORY_PROMPT_VERSION } from '@stick/prompts'
import { CliError } from './lib/cli-error.js'
import { describeFailure } from './lib/make-errors.js'
import { loadDotEnv, makeProviders } from './lib/make-providers.js'
import { readStory, screenplayReusable, storyReusable, voiceReusable } from './lib/make-steps.js'
import { readMusic } from './lib/music.js'
import { recentStories, slugify } from './lib/run-dir.js'
import { budgeted, RunState, type RunJson, type StepName } from './lib/run-state.js'

const USAGE = 'usage: npm run make -- "<topic>" [--genre story|explainer] [--out out/<slug>] [--fake] [--skip-motion] [--fresh] [--music <file>]'

function parseCli() {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        genre: { type: 'string' },
        out: { type: 'string' },
        fake: { type: 'boolean', default: false },
        'skip-motion': { type: 'boolean', default: false },
        fresh: { type: 'boolean', default: false },
        music: { type: 'string' },
      },
    })
    const topic = positionals[0]?.trim()
    if (positionals.length !== 1 || !topic) throw new Error('expected exactly one non-empty topic')
    const genre = values.genre as 'story' | 'explainer' | undefined
    if (genre !== undefined && genre !== 'story' && genre !== 'explainer') throw new Error('--genre must be story or explainer')
    return { topic, genre, out: values.out ?? join('out', slugify(topic)), fake: values.fake!, skipMotion: values['skip-motion']!, fresh: values.fresh!, music: values.music }
  } catch (e) {
    throw new CliError(1, `${(e as Error).message}\n${USAGE}`)
  }
}

async function main(): Promise<void> {
  const opts = parseCli()
  const music = opts.music === undefined ? undefined : readMusic(opts.music) // before any paid call
  const outRoot = dirname(opts.out)
  loadDotEnv()
  const { llm, tts, model, maxCostUsd } = makeProviders(opts.fake, join(outRoot, '.tts-cache'), !opts.fresh && existsSync(join(opts.out, 'story.json')))
  const promptVersions = { story: STORY_PROMPT_VERSION, screenplay: SCREENPLAY_PROMPT_VERSION }
  const run = RunState.open(opts.out, opts.topic, model, opts.fresh, promptVersions)
  const env: StepEnv = {
    dir: opts.out, llm: budgeted(llm, run, maxCostUsd), tts, catalog: defaultCatalog,
    sfxCacheDir: join(outRoot, '.sfx-cache'), music: music?.path, skipGates: opts.skipMotion,
  }
  const input: FilmInput = { topic: opts.topic, genre: opts.genre, recent: recentStories(outRoot) }
  /** A marked step: clear its marker and every later one, run it, record its report, then mark it done. */
  const runMarked = async (step: StepName, patch: Partial<RunJson> = {}): Promise<void> => {
    run.clearFrom(step)
    const { libraryRequests, repairRounds } = await runFilmStep(step, env, input)
    run.update({ ...(libraryRequests && { libraryRequests }), ...(repairRounds !== undefined && { repairRounds }), ...patch })
    run.markStep(step)
  }

  const storyRan = !storyReusable(opts.out, opts.fresh)
  if (storyRan) await runMarked('story')
  for (const w of readStory(opts.out)!.content_warnings) console.error(`warning: ${w}`) // the human review gate decides
  if (!screenplayReusable(opts.out, opts.fresh || storyRan)) {
    try {
      await runMarked('screenplay')
    } catch (e) {
      if (e instanceof ScreenplayRejectedError) run.update({ libraryRequests: e.libraryRequests })
      throw e
    }
  }
  await runFilmStep('validate', env, input) // a hand-edited screenplay.json must pass the same checks as a generated one
  if (!voiceReusable(opts.out, run)) await runMarked('voice')
  const { durationSec } = await runFilmStep('timeline', env, input)
  await runFilmStep('gate', env, input)
  run.update({ durationSec })

  const film = join(opts.out, 'film.mp4')
  // shortcut: a changed music file with an identical sidecar is not noticed; pass --fresh then.
  const sameMusic = JSON.stringify(run.snapshot().music) === JSON.stringify(music?.license)
  if (!run.snapshot().steps.render || !existsSync(film) || !sameMusic) await runMarked('render', { music: music?.license })
  if (!run.snapshot().steps.contact || !existsSync(join(opts.out, 'contact.png'))) {
    try {
      await runMarked('contact')
    } catch (e) {
      console.error(`warning: contact sheet failed, film.mp4 is complete: ${(e as Error).message}`) // a review aid must not fail a finished film
    }
  }
  const done = run.snapshot()
  console.log(`out path: ${film}`)
  console.log(`duration: ${durationSec!.toFixed(2)}s`)
  console.log(`cost: $${done.costUsd.toFixed(4)}`)
  console.log(`repair rounds: ${done.repairRounds ?? 0}`)
  console.log(`library requests: ${done.libraryRequests.join(', ') || 'none'}`)
}

main().catch((e: unknown) => {
  const { code, text } = describeFailure(e)
  ;(code === 1 ? console.error : console.log)(text)
  process.exit(code)
})
