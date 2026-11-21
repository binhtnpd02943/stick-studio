import { describe, expect, test } from 'vitest'
import { parseScreenplay, type Screenplay } from '@stick/core'
import { defaultCatalog, type Catalog } from '@stick/library'
import { specExample } from '../../core/test/fixtures.js'
import { validateScreenplay } from '../src/index.js'

// The spec example uses scratch_head, which the starter library lacks; stub it here.
const catalog: Catalog = {
  ...defaultCatalog,
  actions: {
    ...defaultCatalog.actions,
    scratch_head: { ...defaultCatalog.actions.nod!, id: 'scratch_head' },
  },
}

// Fresh, mutable, schema-valid screenplay per call.
function sample() {
  const r = parseScreenplay(specExample())
  if (!r.ok) throw new Error(r.issues.join('; '))
  return structuredClone(r.value) as Screenplay & { scenes: Screenplay['scenes'] }
}

function expectOne(sp: Screenplay, code: string, path: string) {
  const issues = validateScreenplay(sp, catalog)
  expect(issues).toHaveLength(1)
  expect(issues[0]).toMatchObject({ code, path })
  return issues[0]!
}

describe('validateScreenplay', () => {
  test('accepts the spec example', () => {
    expect(validateScreenplay(sample(), catalog)).toEqual([])
  })

  test('unknown_action carries the missing library key', () => {
    const sp = sample()
    sp.scenes[0]!.beats[0]!.do![0]!.action = 'ride_bike'
    const issue = expectOne(sp, 'unknown_action', 'scenes.0.beats.0.do.0.action')
    expect(issue.key).toBe('ride_bike')
  })

  test('unknown_prop', () => {
    const sp = sample()
    sp.scenes[0]!.props[0]!.type = 'trampoline'
    const issue = expectOne(sp, 'unknown_prop', 'scenes.0.props.0.type')
    expect(issue.key).toBe('trampoline')
  })

  test('unknown_backdrop', () => {
    const sp = sample()
    sp.scenes[0]!.backdrop = 'moon'
    const issue = expectOne(sp, 'unknown_backdrop', 'scenes.0.backdrop')
    expect(issue.key).toBe('moon')
  })

  test('unknown_cast in a do', () => {
    const sp = sample()
    sp.scenes[0]!.beats[0]!.do![0]!.who = 'zed'
    expectOne(sp, 'unknown_cast', 'scenes.0.beats.0.do.0.who')
  })

  test('unknown_cast in say', () => {
    const sp = sample()
    sp.scenes[0]!.beats[0]!.say!.who = 'zed'
    expectOne(sp, 'unknown_cast', 'scenes.0.beats.0.say.who')
  })

  test('unknown_cast in start', () => {
    const sp = sample()
    sp.scenes[0]!.start.zed = 'right'
    expectOne(sp, 'unknown_cast', 'scenes.0.start.zed')
  })

  test('unknown_target for a missing prop id', () => {
    const sp = sample()
    sp.scenes[0]!.beats[1]!.do![0]!.target = 'door'
    expectOne(sp, 'unknown_target', 'scenes.0.beats.1.do.0.target')
  })

  test('unknown_target for near:<prop> without that prop', () => {
    const sp = sample()
    sp.scenes[0]!.beats[1]!.do![0]!.target = 'near:door'
    expectOne(sp, 'unknown_target', 'scenes.0.beats.1.do.0.target')
  })

  test('accepts marks, prop ids and cast ids as targets', () => {
    const sp = sample()
    const d = sp.scenes[0]!.beats[1]!.do!
    d[0]!.target = 'left'
    d[1]!.target = 'minh'
    expect(validateScreenplay(sp, catalog)).toEqual([])
    d[0]!.target = 'near:board'
    expect(validateScreenplay(sp, catalog)).toEqual([])
  })

  test('missing_target', () => {
    const sp = sample()
    delete sp.scenes[0]!.beats[1]!.do![0]!.target
    expectOne(sp, 'missing_target', 'scenes.0.beats.1.do.0.target')
  })

  test('not_on_stage when an actor lacks a start mark', () => {
    const sp = sample()
    delete sp.scenes[0]!.start.lan
    expectOne(sp, 'not_on_stage', 'scenes.0.beats.1.do.0.who')
  })

  test('not_on_stage when only a speaker lacks a start mark', () => {
    const sp = sample()
    delete sp.scenes[0]!.start.minh
    delete sp.scenes[0]!.beats[0]!.do
    expectOne(sp, 'not_on_stage', 'scenes.0.beats.0.say.who')
  })

  test('mark_collision reports the second character', () => {
    const sp = sample()
    sp.scenes[0]!.start.lan = 'left'
    expectOne(sp, 'mark_collision', 'scenes.0.start.lan')
  })

  test('start mark near:<prop> must name a scene prop', () => {
    const sp = sample()
    sp.scenes[0]!.start.lan = 'near:door'
    expectOne(sp, 'unknown_target', 'scenes.0.start.lan')
  })
})
