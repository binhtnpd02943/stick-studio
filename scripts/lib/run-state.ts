import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LlmProvider, LlmUsage } from '@stick/core'
import { costUsd } from '@stick/providers'
import { CliError } from './cli-error.js'
import type { MusicLicense } from './music.js'
import { writeArtifact } from './run-dir.js'

const STEP_ORDER = ['story', 'screenplay', 'voice', 'render', 'contact'] as const
type StepName = (typeof STEP_ORDER)[number]

export interface RunJson {
  topic: string
  model: string
  promptVersions: Record<string, string>
  usage: LlmUsage[]
  costUsd: number
  libraryRequests: string[]
  repairRounds?: number
  durationSec?: number
  /** Licence of the background music mixed into film.mp4; absent when the film has none. */
  music?: MusicLicense
  steps: Partial<Record<StepName, string>>
}

const sumCost = (usage: LlmUsage[]): number => usage.reduce((t, u) => t + costUsd(u), 0)

/** `run.json`, rewritten on every change so a crash keeps the spend and finished steps. State is replaced, never edited in place. */
export class RunState {
  private constructor(
    private readonly dir: string,
    private state: RunJson,
  ) {}

  /** Resumes `run.json` if present. `fresh` forgets finished steps but keeps what was already spent. */
  static open(dir: string, topic: string, model: string, fresh: boolean, promptVersions: Record<string, string> = {}): RunState {
    const file = join(dir, 'run.json')
    let prior: Partial<RunJson> = {}
    if (existsSync(file)) {
      try {
        prior = JSON.parse(readFileSync(file, 'utf8')) as Partial<RunJson>
      } catch (e) {
        throw new CliError(1, `${file} is not valid JSON (${(e as Error).message}); fix or delete it`)
      }
    }
    if (!fresh && prior.topic !== undefined && prior.topic !== topic) {
      throw new CliError(1, `${dir} already holds a film for topic "${prior.topic}", not "${topic}"; rerun with --fresh to overwrite it or --out <dir> to use another directory`)
    }
    const usage = prior.usage ?? []
    const state: RunJson = {
      topic,
      model,
      promptVersions,
      usage,
      costUsd: sumCost(usage),
      libraryRequests: fresh ? [] : (prior.libraryRequests ?? []),
      ...(fresh || prior.repairRounds === undefined ? {} : { repairRounds: prior.repairRounds }),
      ...(fresh || prior.durationSec === undefined ? {} : { durationSec: prior.durationSec }),
      ...(fresh || prior.music === undefined ? {} : { music: prior.music }),
      steps: fresh ? {} : (prior.steps ?? {}),
    }
    const run = new RunState(dir, state)
    run.save()
    return run
  }

  snapshot(): Readonly<RunJson> {
    return this.state
  }

  update(patch: Partial<RunJson>): void {
    this.state = { ...this.state, ...patch }
    this.save()
  }

  markStep(step: StepName): void {
    this.update({ steps: { ...this.state.steps, [step]: new Date().toISOString() } })
  }

  /** Starting a step invalidates its own marker and every later one: their outputs derive from this step's. */
  clearFrom(step: StepName): void {
    const keep = STEP_ORDER.slice(0, STEP_ORDER.indexOf(step))
    this.update({ steps: Object.fromEntries(Object.entries(this.state.steps).filter(([k]) => keep.includes(k as StepName))) })
  }

  /** The usage is saved before it is priced, so a pricing failure can never lose spend. */
  book(usage: LlmUsage): void {
    const all = [...this.state.usage, usage]
    this.update({ usage: all })
    this.update({ costUsd: sumCost(all) })
  }

  assertBudget(maxCostUsd: number): void {
    if (this.state.costUsd > maxCostUsd) {
      throw new CliError(4, `budget exceeded: $${this.state.costUsd.toFixed(4)} spent, cap $${maxCostUsd.toFixed(4)} (raise STICK_MAX_COST_USD to continue); finished steps are kept in ${this.dir}`)
    }
  }

  private save(): void {
    writeArtifact(this.dir, 'run.json', this.state)
  }
}

/**
 * Books every call into run.json as it returns or fails after returning (the repair loop's rejected drafts included) and refuses the
 * next call once the cap is passed. A call that ends over the cap is kept, so the film still finishes.
 */
export function budgeted(inner: LlmProvider, run: RunState, maxCostUsd: number): LlmProvider {
  return {
    async generate(req) {
      run.assertBudget(maxCostUsd)
      try {
        const res = await inner.generate(req)
        run.book(res.usage)
        return res
      } catch (e) {
        // A call that returned but failed validation was still paid for.
        const usage = (e as { usage?: LlmUsage }).usage
        if (usage) run.book(usage)
        throw e
      }
    },
  }
}
