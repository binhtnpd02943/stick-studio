import { describe, expect, test } from 'vitest'
import { defaultCatalog as catalog } from '@stick/library'
import { FakeLlm } from '@stick/providers'
import { ScreenplayRejectedError, draftScreenplay } from '../src/index.js'
import { llmScreenplay, story } from './llm-fixtures.js'

type Draft = ReturnType<typeof llmScreenplay>
const withFirstAction = (action: string): Draft => {
  const d = llmScreenplay()
  d.scenes[0]!.beats[0]!.do![0]!.action = action
  return d
}

describe('draftScreenplay', () => {
  test('returns a valid screenplay first try (rounds 0)', async () => {
    const llm = new FakeLlm([llmScreenplay()])
    const r = await draftScreenplay(llm, story(), catalog)
    expect(r.rounds).toBe(0)
    expect(r.libraryRequests).toEqual([])
    expect(r.usage).toHaveLength(1)
    expect(r.screenplay.scenes[0]!.start).toEqual({ minh: 'left', lan: 'center' })
    expect(llm.requests[0]).toMatchObject({ effort: 'high', maxTokens: 16000, cacheSystem: true })
  })

  test('repairs an unknown action in one round, records the library request, reuses the identical system prompt', async () => {
    const bad = withFirstAction('moonwalk')
    const llm = new FakeLlm([bad, llmScreenplay()])
    const r = await draftScreenplay(llm, story(), catalog)
    expect(r.rounds).toBe(1)
    expect(r.libraryRequests).toEqual(['moonwalk'])
    expect(llm.requests).toHaveLength(2)
    const [first, second] = llm.requests
    expect(second!.system).toBe(first!.system)
    expect(second!.messages).toHaveLength(3)
    expect(second!.messages[1]).toEqual({ role: 'assistant', content: JSON.stringify(bad) })
    expect(second!.messages[2]!.role).toBe('user')
    expect(second!.messages[2]!.content).toContain('unknown_action scenes.0.beats.0.do.0.action')
  })

  test('gives up after 3 repairs with ScreenplayRejectedError carrying issues and libraryRequests', async () => {
    const llm = new FakeLlm([withFirstAction('moonwalk'), withFirstAction('moonwalk'), withFirstAction('flip'), withFirstAction('moonwalk')])
    const err = await draftScreenplay(llm, story(), catalog).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ScreenplayRejectedError)
    const e = err as ScreenplayRejectedError
    expect(llm.requests).toHaveLength(4)
    expect(e.issues[0]).toMatchObject({ code: 'unknown_action' })
    expect(e.libraryRequests).toEqual(['moonwalk', 'flip'])
    expect(e.usage).toHaveLength(4)
  })

  test('schema-level errors (uppercase id) are fed to repair as code "schema"', async () => {
    const bad = llmScreenplay()
    bad.cast[0]!.id = 'Minh'
    const llm = new FakeLlm([bad, llmScreenplay()])
    const r = await draftScreenplay(llm, story(), catalog)
    expect(r.rounds).toBe(1)
    expect(llm.requests[1]!.messages[2]!.content).toContain('schema cast.0.id')
  })

  test('a duplicate start entry is reported as schema, not silently collapsed', async () => {
    const bad = llmScreenplay()
    bad.scenes[0]!.start.push({ who: 'minh', mark: 'right' })
    const llm = new FakeLlm([bad, llmScreenplay()])
    await draftScreenplay(llm, story(), catalog)
    expect(llm.requests[1]!.messages[2]!.content).toContain('schema scenes.0.start')
    expect(llm.requests[1]!.messages[2]!.content).toContain('minh')
  })

  test('a dropped story line triggers missing_line repair', async () => {
    const bad = llmScreenplay()
    const dropped = bad.scenes[0]!.beats[1]!.say!.text
    bad.scenes[0]!.beats[1]!.say!.text = 'Một câu khác hẳn.'
    const llm = new FakeLlm([bad, llmScreenplay()])
    const r = await draftScreenplay(llm, story(), catalog)
    expect(r.rounds).toBe(1)
    expect(llm.requests[1]!.messages[2]!.content).toContain(`missing_line scenes ${dropped}`)
  })
})
