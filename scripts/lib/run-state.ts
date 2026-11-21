import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LlmProvider, LlmUsage } from '@stick/core'
import { costUsd } from '@stick/providers'
import { CliError } from './cli-error.js'
import { writeArtifact } from './run-dir.js'

export interface RunJson {
  topic: string
  model: string
  promptVersions: Record<string, string>
  usage: LlmUsage[]
  costUsd: number
  libraryRequests: string[]
  repairRounds?: number
  durationSec?: number
  steps: Partial<Record<'story' | 'screenplay' | 'voice' | 'render', string>>
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

  markStep(step: keyof RunJson['steps']): void {
    this.update({ steps: { ...this.state.steps, [step]: new Date().toISOString() } })
  }

  book(usage: LlmUsage): void {
    const all = [...this.state.usage, usage]
    this.update({ usage: all, costUsd: sumCost(all) })
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
 * Books every call into run.json as it returns (the repair loop's rejected drafts included) and refuses the
 * next call once the cap is passed. A call that ends over the cap is kept, so the film still finishes.
 */
export function budgeted(inner: LlmProvider, run: RunState, maxCostUsd: number): LlmProvider {
  return {
    async generate(req) {
      run.assertBudget(maxCostUsd)
      const res = await inner.generate(req)
      run.book(res.usage)
      return res
    },
  }
}
