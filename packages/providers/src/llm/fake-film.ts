import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const EXAMPLES = resolve(import.meta.dirname, '../../../../examples')
const readExample = (name: string): Record<string, any> => JSON.parse(readFileSync(join(EXAMPLES, name), 'utf8'))

/** The phan-so story and screenplay as FakeLlm responses; the screenplay's `start` is an array of {who, mark}, as the structured output schema wants. */
export function fakeFilmResponses(): { story: unknown; screenplay: unknown } {
  const sp = readExample('phan-so.screenplay.json')
  const scenes = sp.scenes.map((s: { start: Record<string, string> }) => ({
    ...s,
    start: Object.entries(s.start).map(([who, mark]) => ({ who, mark })),
  }))
  return { story: readExample('phan-so.story.json'), screenplay: { ...sp, scenes } }
}
