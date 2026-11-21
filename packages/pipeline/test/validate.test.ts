import { describe, expect, test } from 'vitest'
import { parseScreenplay, type Screenplay } from '@stick/core'
import { defaultCatalog, type ActionDef, type Catalog, type PropDef } from '@stick/library'
import { specExample } from '../../core/test/fixtures.js'
import { validateScreenplay } from '../src/index.js'

// `grab` is a test-only contact action; sit is the real one. A real chair arrives with the props task, so a stool stands in.
const stub = (id: string, extra: Partial<ActionDef>): ActionDef => ({ id, version: 1, needsTarget: true, duration: { min: 1, ideal: 1, max: 1 }, description: id, apply: ({ base }) => ({ pose: base }), ...extra })
const stool: PropDef = { id: 'stool', version: 1, width: 20, seatY: -20, description: 'stool', draw: () => {} }
const catalog: Catalog = {
  ...defaultCatalog,
  actions: { ...defaultCatalog.actions, grab: stub('grab', { contact: true }) },
  props: { ...defaultCatalog.props, stool },
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

  test('unknown_action for juggle, which the library lacks', () => {
    const sp = sample()
    sp.scenes[0]!.beats[0]!.do![0]!.action = 'juggle'
    const issue = expectOne(sp, 'unknown_action', 'scenes.0.beats.0.do.0.action')
    expect(issue.key).toBe('juggle')
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
    sp.scenes[0]!.start.zed = 'near:board'
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

  test('unknown_target for camera focus', () => {
    const sp = sample()
    sp.scenes[0]!.beats[1]!.camera!.focus = 'door'
    expectOne(sp, 'unknown_target', 'scenes.0.beats.1.camera.focus')
  })

  test('accepts marks, prop ids and cast ids as targets', () => {
    const sp = sample()
    const d = sp.scenes[0]!.beats[1]!.do!
    d[0]!.target = 'right'
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

  // Prototype keys must not count as catalog or record entries.
  test('prototype key as action is unknown_action', () => {
    const sp = sample()
    sp.scenes[0]!.beats[0]!.do![0]!.action = 'constructor'
    expectOne(sp, 'unknown_action', 'scenes.0.beats.0.do.0.action')
  })

  test('prototype key as prop type is unknown_prop', () => {
    const sp = sample()
    sp.scenes[0]!.props[0]!.type = 'valueOf'
    expectOne(sp, 'unknown_prop', 'scenes.0.props.0.type')
  })

  test('prototype key as backdrop is unknown_backdrop', () => {
    const sp = sample()
    sp.scenes[0]!.backdrop = 'toString'
    expectOne(sp, 'unknown_backdrop', 'scenes.0.backdrop')
  })

  test('prototype key as cast id without a start mark is not_on_stage', () => {
    const sp = sample()
    sp.cast.push({ ...sp.cast[0]!, id: 'toString' })
    sp.scenes[0]!.beats[0]!.do![0]!.who = 'toString'
    expectOne(sp, 'not_on_stage', 'scenes.0.beats.0.do.0.who')
  })

  test('a prop may not use a near: mark', () => {
    const sp = sample()
    sp.scenes[0]!.props[0]!.mark = 'near:board'
    expectOne(sp, 'unknown_target', 'scenes.0.props.0.mark')
  })

  test('duplicate_id for a repeated scene id', () => {
    const sp = sample()
    sp.scenes.push(structuredClone(sp.scenes[0]!))
    expectOne(sp, 'duplicate_id', 'scenes.1.id')
  })

  test('duplicate_id for a repeated cast id', () => {
    const sp = sample()
    sp.cast.push({ ...sp.cast[0]! })
    expectOne(sp, 'duplicate_id', 'cast.2.id')
  })

  test('duplicate_id for a repeated prop id in a scene', () => {
    const sp = sample()
    sp.scenes[0]!.props.push({ id: 'board', type: 'desk', mark: 'right' })
    expectOne(sp, 'duplicate_id', 'scenes.0.props.1.id')
  })

  test('duplicate_id for a prop id equal to a cast id', () => {
    const sp = sample()
    sp.scenes[0]!.props.push({ id: 'minh', type: 'desk', mark: 'right' })
    expectOne(sp, 'duplicate_id', 'scenes.0.props.1.id')
  })

  test('duplicate_id for ids equal to a mark name', () => {
    const sp = sample()
    sp.scenes[0]!.props.push({ id: 'center', type: 'desk', mark: 'right' })
    expectOne(sp, 'duplicate_id', 'scenes.0.props.1.id')
    const sp2 = sample()
    sp2.cast.push({ ...sp2.cast[0]!, id: 'left' })
    expectOne(sp2, 'duplicate_id', 'cast.2.id')
  })
})

describe('out_of_reach', () => {
  // minh starts left (-95), the board stands center (0, width 90), lan right (95): nobody walks through anybody.
  const beat = (...d: Array<[string, string, string?]>) => ({ do: d.map(([who, action, target]) => ({ who, action, ...(target && { target }) })) })
  const withBeats = (...beats: unknown[]) => {
    const sp = sample()
    sp.scenes[0]!.props[0]!.mark = 'center'
    sp.scenes[0]!.start.lan = 'right'
    sp.scenes[0]!.beats = beats as never
    return sp
  }

  test('contact action at a far prop', () => {
    const issue = expectOne(withBeats(beat(['minh', 'grab', 'board'])), 'out_of_reach', 'scenes.0.beats.0.do.0')
    expect(issue.message).toContain('walk_to')
  })

  test('walk_to then a contact action in the same beat is fine', () => {
    expect(validateScreenplay(withBeats(beat(['minh', 'walk_to', 'board'], ['minh', 'grab', 'board'])), catalog)).toEqual([])
  })

  test('run_to counts like walk_to', () => {
    expect(validateScreenplay(withBeats(beat(['minh', 'run_to', 'board'], ['minh', 'grab', 'board'])), catalog)).toEqual([])
  })

  test('a walk in an earlier beat is remembered', () => {
    expect(validateScreenplay(withBeats(beat(['minh', 'walk_to', 'board']), beat(['minh', 'grab', 'board'])), catalog)).toEqual([])
  })

  test('a walk by someone else does not help', () => {
    expectOne(withBeats(beat(['lan', 'walk_to', 'board'], ['minh', 'grab', 'board'])), 'out_of_reach', 'scenes.0.beats.0.do.1')
  })

  test('contact on a cast member uses their tracked x', () => {
    expectOne(withBeats(beat(['minh', 'grab', 'lan'])), 'out_of_reach', 'scenes.0.beats.0.do.0')
    expect(validateScreenplay(withBeats(beat(['minh', 'walk_to', 'lan'], ['minh', 'grab', 'lan'])), catalog)).toEqual([])
    expect(validateScreenplay(withBeats(beat(['lan', 'walk_to', 'minh']), beat(['minh', 'grab', 'lan'])), catalog)).toEqual([])
  })

  test('a non-contact action is never out of reach', () => {
    expect(validateScreenplay(withBeats(beat(['minh', 'point_at', 'board'])), catalog)).toEqual([])
  })

  test('an unrelated issue in the scene does not hide a far contact', () => {
    const sp = withBeats(beat(['minh', 'grab', 'board']))
    sp.scenes[0]!.backdrop = 'moon'
    const issues = validateScreenplay(sp, catalog)
    expect(issues.map((i) => i.code).sort()).toEqual(['out_of_reach', 'unknown_backdrop'])
  })

  test('only actions that failed validation are skipped', () => {
    const sp = withBeats(beat(['zed', 'grab', 'board'], ['minh', 'grab', 'ghost'], ['minh', 'grab', 'board']))
    const issues = validateScreenplay(sp, catalog)
    expect(issues.map((i) => `${i.code} ${i.path}`)).toEqual([
      'unknown_cast scenes.0.beats.0.do.0.who',
      'unknown_target scenes.0.beats.0.do.1.target',
      'out_of_reach scenes.0.beats.0.do.2',
    ])
  })

  test('a bad prop or start mark skips only the actions that depend on it', () => {
    const sp = withBeats(beat(['minh', 'grab', 'board']))
    sp.scenes[0]!.props.push({ id: 'seat', type: 'trampoline', mark: 'center' })
    sp.scenes[0]!.start.lan = 'near:ghost'
    const codes = validateScreenplay(sp, catalog).map((i) => i.code).sort()
    expect(codes).toEqual(['out_of_reach', 'unknown_prop', 'unknown_target'])
  })

  test('a contact target that is not on stage is unknown_target, not a crash', () => {
    const sp = withBeats(beat(['minh', 'grab', 'lan']))
    delete sp.scenes[0]!.start.lan
    expectOne(sp, 'unknown_target', 'scenes.0.beats.0.do.0.target')
  })
})

describe('needsSeat', () => {
  const sitOn = (type: string) => {
    const sp = sample()
    sp.scenes[0]!.props.push({ id: 'seat', type, mark: 'center' })
    delete sp.scenes[0]!.start.lan // she would stand on the seat
    sp.scenes[0]!.beats = [{ do: [{ who: 'minh', action: 'walk_to', target: 'seat' }, { who: 'minh', action: 'sit', target: 'seat' }] }] as never
    return sp
  }

  test('sit on a desk is unknown_target "cannot sit on desk"', () => {
    const issue = expectOne(sitOn('desk'), 'unknown_target', 'scenes.0.beats.0.do.1.target')
    expect(issue.message).toBe('cannot sit on desk')
  })

  test('sit on anything that is not a seat prop is rejected, marks and cast included', () => {
    for (const [target, name] of [['center', 'center'], ['lan', 'lan'], ['board', 'whiteboard']] as const) {
      const sp = sample()
      sp.scenes[0]!.beats = [{ do: [{ who: 'minh', action: 'sit', target }] }] as never
      expect(validateScreenplay(sp, catalog).map((i) => i.message)).toContain(`cannot sit on ${name}`)
    }
  })

  test('sit on a prop with seatY is fine', () => {
    expect(validateScreenplay(sitOn('stool'), catalog)).toEqual([])
  })
})

// One test per real contact action: far is out_of_reach, after a walk_to it is fine.
describe('real contact actions', () => {
  const run = (action: string, target: string, walk: boolean, type?: string) => {
    const sp = sample()
    sp.scenes[0]!.props.push({ id: 'thing', type: type ?? 'desk', mark: 'right' })
    sp.scenes[0]!.start = { minh: 'center', lan: 'left' } // lan stays out of minh's way
    const walkTo = walk ? [{ who: 'minh', action: 'walk_to', target }] : []
    sp.scenes[0]!.beats = [{ do: [...walkTo, { who: 'minh', action, target }] }] as never
    return validateScreenplay(sp, catalog)
  }
  test.each([
    ['type_laptop', 'thing', 'desk'],
    ['push', 'thing', 'desk'],
    ['knock', 'thing', 'desk'],
    ['hug', 'lan', undefined],
    ['sit', 'thing', 'stool'],
  ] as const)('%s on %s: far is out_of_reach, near after walk_to is fine', (action, target, type) => {
    expect(defaultCatalog.actions[action]?.contact).toBe(true)
    const far = run(action, target, false, type)
    expect(far.map((i) => i.code)).toEqual(['out_of_reach'])
    expect(far[0]!.path).toBe('scenes.0.beats.0.do.0')
    expect(run(action, target, true, type)).toEqual([])
  })
})

// minh starts left (-95), lan center (0), the board stands right (95): a walk from minh to the board crosses lan.
describe('path_blocked', () => {
  const walk = (...d: Array<[string, string, string]>) => {
    const sp = sample()
    sp.scenes[0]!.beats = [{ do: d.map(([who, action, target]) => ({ who, action, target })) }] as never
    return sp
  }

  test.each(['walk_to', 'run_to'])('%s through another character', (action) => {
    const issue = expectOne(walk(['minh', action, 'board']), 'path_blocked', 'scenes.0.beats.0.do.0')
    expect(issue.message).toContain('"lan"')
  })

  test('stopping inside CAST_GAP of a character counts as passing into them', () => {
    // lan already stands beside the box; minh walking to the same spot would stop on top of her.
    const sp = walk(['minh', 'walk_to', 'near:box'])
    sp.scenes[0]!.props = [{ id: 'box', type: 'box', mark: 'center' }]
    sp.scenes[0]!.start.lan = 'near:box'
    expectOne(sp, 'path_blocked', 'scenes.0.beats.0.do.0')
  })

  test("walking up to the character is fine: the walk stops at the gap", () => {
    expect(validateScreenplay(walk(['minh', 'walk_to', 'lan']), catalog)).toEqual([])
  })

  test('walking away from a character is fine', () => {
    expect(validateScreenplay(walk(['lan', 'walk_to', 'board']), catalog)).toEqual([])
  })

  test('a character who moved aside earlier no longer blocks', () => {
    const sp = walk(['lan', 'walk_to', 'right'])
    sp.scenes[0]!.props = []
    sp.scenes[0]!.beats = [...sp.scenes[0]!.beats, { do: [{ who: 'minh', action: 'walk_to', target: 'center' }] }] as never
    expect(validateScreenplay(sp, catalog)).toEqual([])
  })
})

describe('start on a prop', () => {
  test("a character starting on a prop's bare mark is mark_collision", () => {
    const sp = sample()
    sp.scenes[0]!.start.minh = 'right'
    const issue = expectOne(sp, 'mark_collision', 'scenes.0.start.minh')
    expect(issue.message).toContain('near:board')
  })

  test('near:<prop> is the fix', () => {
    const sp = sample()
    sp.scenes[0]!.start.minh = 'near:board'
    sp.scenes[0]!.beats = [sp.scenes[0]!.beats[0]!] // lan's walk to the board would stop on him
    expect(validateScreenplay(sp, catalog)).toEqual([])
  })
})
