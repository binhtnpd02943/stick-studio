import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const EXAMPLES = resolve(import.meta.dirname, '../../../../examples')
const readExample = (name: string): Record<string, any> => JSON.parse(readFileSync(join(EXAMPLES, name), 'utf8'))

const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase('vi') + text.slice(1)

/**
 * The phan-so story and screenplay as FakeLlm responses; the screenplay's `start` is an array of {who, mark}, as the
 * structured output schema wants. Given the film's title, the story and screenplay carry it, and so does the opening
 * question, so a fake film's video says what its title says. Deterministic for a given title.
 */
export function fakeFilmResponses(title?: string): { story: unknown; screenplay: unknown } {
  const sp = readExample('phan-so.screenplay.json')
  const story = readExample('phan-so.story.json')
  const opening = title && `Lan ơi, ${lowerFirst(title)}`
  const scenes = sp.scenes.map((s: { start: Record<string, string>; beats: { say?: { text: string } }[] }, i: number) => ({
    ...s,
    start: Object.entries(s.start).map(([who, mark]) => ({ who, mark })),
    beats: s.beats.map((b, j) => (opening && i === 0 && j === 0 && b.say ? { ...b, say: { ...b.say, text: opening } } : b)),
  }))
  if (!title) return { story, screenplay: { ...sp, scenes } }
  const storyScenes = story.scenes.map((s: { beats: { line: string }[] }, i: number) =>
    i === 0 ? { ...s, beats: s.beats.map((b, j) => (j === 0 ? { ...b, line: opening } : b)) } : s)
  return { story: { ...story, title, hook: opening, scenes: storyScenes }, screenplay: { ...sp, title, scenes } }
}
