import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rigFromSource } from '../src/rig-core'
import { loadRig } from '../src/index'

const source = readFileSync(new URL('../src/vendor/stick-rig.js', import.meta.url), 'utf8')

describe('rigFromSource', () => {
  it('builds the same rig as loadRig', () => {
    const rig = rigFromSource(source)
    expect(Object.keys(rig)).toEqual(Object.keys(loadRig()))
    expect(typeof rig.fig).toBe('function')
  })

  it('instrument still refuses source without the hook', () => {
    expect(() => rigFromSource('window.RIG = {}', { instrument: true })).toThrow('rig: cannot instrument fig()')
  })
})
