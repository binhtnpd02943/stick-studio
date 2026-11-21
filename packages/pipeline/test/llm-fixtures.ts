import { readFileSync } from 'node:fs'
import type { LlmScreenplay, Story } from '@stick/core'

type Core = { scenes: { start: Record<string, string> }[] } & Record<string, unknown>

/** examples/phan-so.screenplay.json in the shape the LLM returns (start as an array). */
export function llmScreenplay(): LlmScreenplay {
  const core = JSON.parse(readFileSync(new URL('../../../examples/phan-so.screenplay.json', import.meta.url), 'utf8')) as Core
  return {
    ...core,
    scenes: core.scenes.map((s) => ({ ...s, start: Object.entries(s.start).map(([who, mark]) => ({ who, mark })) })),
  } as unknown as LlmScreenplay
}

/** A story whose lines are exactly the say texts of llmScreenplay(). */
export function story(): Story {
  const sp = llmScreenplay()
  return {
    title: 'Phân số là gì?',
    logline: 'Lan giải thích phân số bằng cái bánh.',
    genre: 'explainer',
    hook: 'Phân số là gì vậy?',
    cast: sp.cast.map((c) => ({ ...c, look: { ink: c.look.ink, ...(c.look.hair && { hair: c.look.hair }) } })),
    scenes: sp.scenes.map((s) => ({
      setting: s.backdrop,
      beats: s.beats.flatMap((b) => (b.say ? [{ who: b.say.who, line: b.say.text }] : [])),
    })),
    content_warnings: [],
  }
}
