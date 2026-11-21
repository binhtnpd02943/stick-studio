import { existsSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { defaultCatalog } from '@stick/library'
import { solveTimeline } from '@stick/pipeline'
import { SCREENPLAY_PROMPT_VERSION, STORY_PROMPT_VERSION } from '@stick/prompts'
import { renderContactSheet } from '@stick/render'
import { CliError } from './lib/cli-error.js'
import { describeFailure } from './lib/make-errors.js'
import { loadDotEnv, makeProviders } from './lib/make-providers.js'
import { assertValid, screenplayStep, storyStep, voiceStep } from './lib/make-steps.js'
import { gateMotion } from './lib/motion-gate.js'
import { renderWithAudio } from './lib/render-steps.js'
import { slugify } from './lib/run-dir.js'
import { budgeted, RunState } from './lib/run-state.js'

const USAGE = 'usage: npm run make -- "<topic>" [--genre story|explainer] [--out out/<slug>] [--fake] [--skip-motion] [--fresh]'

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
      },
    })
    const topic = positionals[0]?.trim()
    if (positionals.length !== 1 || !topic) throw new Error('expected exactly one non-empty topic')
    const genre = values.genre as 'story' | 'explainer' | undefined
    if (genre !== undefined && genre !== 'story' && genre !== 'explainer') throw new Error('--genre must be story or explainer')
    return { topic, genre, out: values.out ?? join('out', slugify(topic)), fake: values.fake!, skipMotion: values['skip-motion']!, fresh: values.fresh! }
  } catch (e) {
    throw new CliError(1, `${(e as Error).message}\n${USAGE}`)
  }
}

async function main(): Promise<void> {
  const opts = parseCli()
  const outRoot = dirname(opts.out)
  loadDotEnv()
  const { llm, tts, model, maxCostUsd } = makeProviders(opts.fake, join(outRoot, '.tts-cache'), !opts.fresh && existsSync(join(opts.out, 'story.json')))
  const promptVersions = { story: STORY_PROMPT_VERSION, screenplay: SCREENPLAY_PROMPT_VERSION }
  const run = RunState.open(opts.out, opts.topic, model, opts.fresh, promptVersions)
  const ctx = { dir: opts.out, run, fresh: opts.fresh }
  const paid = budgeted(llm, run, maxCostUsd)

  const story = await storyStep(ctx, paid, opts.topic, opts.genre, outRoot)
  for (const w of story.value.content_warnings) console.error(`warning: ${w}`) // the human review gate decides
  const screenplay = await screenplayStep({ ...ctx, fresh: opts.fresh || story.ran }, paid, story.value)
  assertValid(screenplay.value)
  const voice = await voiceStep(ctx, screenplay.value, tts)
  const tl = solveTimeline(screenplay.value, voice.value, defaultCatalog)
  gateMotion(tl, opts.skipMotion)
  run.update({ durationSec: tl.duration })

  const film = join(opts.out, 'film.mp4')
  if (!run.snapshot().steps.render || !existsSync(film)) {
    run.clearFrom('render')
    const partial = join(opts.out, 'film.partial.mp4') // renamed only when complete, so film.mp4 is never truncated
    try {
      await renderWithAudio(tl, join(opts.out, 'audio'), partial)
      renameSync(partial, film)
    } finally {
      rmSync(partial, { force: true })
    }
    run.markStep('render')
  }
  const contact = join(opts.out, 'contact.png')
  if (!run.snapshot().steps.contact || !existsSync(contact)) {
    await renderContactSheet(tl, contact)
    run.markStep('contact')
  }
  const done = run.snapshot()
  console.log(`out path: ${film}`)
  console.log(`duration: ${tl.duration.toFixed(2)}s`)
  console.log(`cost: $${done.costUsd.toFixed(4)}`)
  console.log(`repair rounds: ${done.repairRounds ?? 0}`)
  console.log(`library requests: ${done.libraryRequests.join(', ') || 'none'}`)
}

main().catch((e: unknown) => {
  const { code, text } = describeFailure(e)
  ;(code === 1 ? console.error : console.log)(text)
  process.exit(code)
})
