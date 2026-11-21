import {
  LlmScreenplaySchema,
  fromLlmScreenplay,
  parseScreenplay,
  type LlmMessage,
  type LlmProvider,
  type LlmScreenplay,
  type LlmUsage,
  type Issue,
  type Screenplay,
  type Story,
} from '@stick/core'
import type { Catalog } from '@stick/library'
import { repairUser, screenplaySystem, screenplayUser } from '@stick/prompts'
import { validateScreenplay } from './validate.js'

export class ScreenplayRejectedError extends Error {
  constructor(
    readonly issues: Issue[],
    readonly libraryRequests: string[],
    /** Tokens spent on the rejected drafts, so the caller can still book the cost. */
    readonly usage: LlmUsage[] = [],
  ) {
    super(`screenplay rejected after repair: ${issues.map((i) => `${i.code} ${i.path}`).join('; ')}`)
    this.name = 'ScreenplayRejectedError'
  }
}

/** fromLlmScreenplay keeps the last duplicate `who`, so catch it before converting. */
function duplicateStarts(raw: LlmScreenplay): Issue[] {
  return raw.scenes.flatMap((s, si) => {
    const seen = new Set<string>()
    return s.start.flatMap(({ who }) => {
      const dup = seen.has(who)
      seen.add(who)
      return dup ? [{ code: 'schema' as const, path: `scenes.${si}.start`, message: `"${who}" appears twice in start` }] : []
    })
  })
}

interface Said {
  who: string
  text: string
}
const show = (l: Said | undefined) => (l ? `${l.who}: "${l.text}"` : 'nothing')
const normalize = (l: Said): Said => ({ who: l.who, text: l.text.normalize('NFC').trim() })

/** The spoken lines must be the story's lines, same speaker, same order. Reports the first difference. */
function lineMismatch(story: Story, sp: Screenplay): Issue[] {
  const want = story.scenes.flatMap((s) => s.beats.map((b) => normalize({ who: b.who, text: b.line })))
  const got = sp.scenes.flatMap((s) => s.beats.flatMap((b) => (b.say ? [normalize(b.say)] : [])))
  const i = Array.from({ length: Math.max(want.length, got.length) }, (_, k) => k).find(
    (k) => want[k]?.who !== got[k]?.who || want[k]?.text !== got[k]?.text,
  )
  if (i === undefined) return []
  return [{ code: 'line_mismatch', path: 'scenes', message: `beat ${i}: expected ${show(want[i])}, got ${show(got[i])}` }]
}

function check(raw: LlmScreenplay, story: Story, catalog: Catalog): { screenplay?: Screenplay; issues: Issue[] } {
  const issues = duplicateStarts(raw)
  const parsed = parseScreenplay(fromLlmScreenplay(raw))
  if (!parsed.ok) {
    const schema = parsed.issues.map((s): Issue => {
      const i = s.indexOf(': ') // zod paths contain no ": "
      return { code: 'schema', path: s.slice(0, i), message: s.slice(i + 2) }
    })
    return { issues: [...issues, ...schema] }
  }
  issues.push(...validateScreenplay(parsed.value, catalog), ...lineMismatch(story, parsed.value))
  return { screenplay: parsed.value, issues }
}

export async function draftScreenplay(
  llm: LlmProvider,
  story: Story,
  catalog: Catalog,
  { maxRepairs = 3 }: { maxRepairs?: number } = {},
): Promise<{ screenplay: Screenplay; usage: LlmUsage[]; libraryRequests: string[]; rounds: number }> {
  // One system string for every round, so repair calls hit the prompt cache.
  const system = screenplaySystem(catalog)
  const messages: LlmMessage[] = [{ role: 'user', content: screenplayUser(story) }]
  const usage: LlmUsage[] = []
  const libraryRequests = new Set<string>()

  for (let rounds = 0; ; rounds++) {
    const res = await llm.generate({
      system,
      cacheSystem: true,
      messages: [...messages],
      schema: LlmScreenplaySchema,
      effort: 'high',
      maxTokens: 16000,
    })
    usage.push(res.usage)
    const { screenplay, issues } = check(res.value, story, catalog)
    if (screenplay && issues.length === 0) return { screenplay, usage, libraryRequests: [...libraryRequests], rounds }
    for (const i of issues) if (i.key !== undefined) libraryRequests.add(i.key)
    if (rounds >= maxRepairs) throw new ScreenplayRejectedError(issues, [...libraryRequests], usage)
    messages.push({ role: 'assistant', content: JSON.stringify(res.value) }, { role: 'user', content: repairUser(issues) })
  }
}
