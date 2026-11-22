import type { SKRSContext2D } from '@napi-rs/canvas'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import type { drawFrame } from '../src/frame.js'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const ENTRY = join(ROOT, 'packages/render/src/frame.ts')
const FORBIDDEN_FILES = ['packages/engine/src/rig.ts', 'packages/engine/src/fonts.ts'].map((f) => join(ROOT, f))
// import/export ... from 'x' (possibly multi-line), and bare side-effect imports
const FROM_RE = /^\s*(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s+['"]([^'"]+)['"]/gm
const SIDE_RE = /^\s*import\s+['"]([^'"]+)['"]/gm

// The ctx parameter takes both the browser and the node canvas context (checked by typecheck).
type Ctx = Parameters<typeof drawFrame>[0]
const typeCheckOnly = (dom: CanvasRenderingContext2D, node: SKRSContext2D): Ctx[] => [dom, node]

/** Value-import specifiers of a source file; `import type` and all-`type` specifier lists are skipped. */
function valueImports(src: string): string[] {
  const out: string[] = []
  for (const [, typeKw, clause, spec] of src.matchAll(FROM_RE)) {
    const braced = clause!.match(/^\{([\s\S]*)\}$/)
    const allType = braced && braced[1]!.split(',').map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith('type '))
    if (!typeKw && !allType) out.push(spec!)
  }
  for (const [, spec] of src.matchAll(SIDE_RE)) out.push(spec!)
  return out
}

function resolveSpec(spec: string, from: string): string | undefined {
  if (spec.startsWith('.')) {
    const base = resolve(dirname(from), spec.replace(/\.js$/, ''))
    return [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find(existsSync)
  }
  const m = spec.match(/^@stick\/([^/]+)(\/.*)?$/)
  if (!m) return undefined
  const dir = join(ROOT, 'packages', m[1]!)
  const exp = (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { exports: Record<string, string> }).exports[`.${m[2] ?? ''}`]
  expect(exp, `${spec} is not exported`).toBeDefined()
  return join(dir, exp!)
}

function walk(): { files: Set<string>; specs: Set<string> } {
  const files = new Set<string>()
  const specs = new Set<string>()
  const queue = [ENTRY]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (files.has(file)) continue
    files.add(file)
    for (const spec of valueImports(readFileSync(file, 'utf8'))) {
      specs.add(spec)
      const next = resolveSpec(spec, file)
      if (next) queue.push(next)
    }
  }
  return { files, specs }
}

describe('@stick/render/frame', () => {
  test('treats inline type-only specifier lists as type imports', () => {
    expect(valueImports("import { type Rig } from '@stick/engine'\nimport type { A } from 'b'\nimport { x, type Y } from 'c'")).toEqual(['c'])
    expect(typeCheckOnly).toBeTypeOf('function')
  })

  test('reaches no node-only module', () => {
    const { files, specs } = walk()
    expect(files.size).toBeGreaterThan(5)
    const bad = [...specs].filter((s) => s.startsWith('node:') || s === '@napi-rs/canvas' || s === '@stick/engine')
    expect(bad).toEqual([])
    expect(FORBIDDEN_FILES.filter((f) => files.has(f))).toEqual([])
  })
})
