import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
type Pkg = { name: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }

// apps/ arrives with the API and worker; scan it only when present
const pkgs = ['packages', 'apps'].flatMap((group) => {
  const groupDir = join(ROOT, group)
  if (!existsSync(groupDir)) return []
  return readdirSync(groupDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
    const dir = join(groupDir, d.name)
    return { dir, pkg: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Pkg }
  })
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules') return []
    const p = join(dir, e.name)
    return e.isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(e.name) ? [p] : []
  })
}

describe('workspace packages', () => {
  test('no runtime dependency cycles between workspace packages', () => {
    const graph = new Map(pkgs.map(({ pkg }) => [pkg.name, Object.keys(pkg.dependencies ?? {}).filter((n) => n.startsWith('@stick/'))]))
    const state = new Map<string, 'visiting' | 'done'>()
    const visit = (n: string, path: string[]) => {
      if (state.get(n) === 'done') return
      expect(state.get(n), `cycle: ${[...path, n].join(' -> ')}`).toBeUndefined()
      state.set(n, 'visiting')
      for (const m of graph.get(n) ?? []) visit(m, [...path, n])
      state.set(n, 'done')
    }
    for (const n of graph.keys()) visit(n, [])
  })

  test('every package importing zod pins ~3.25.76', () => {
    const importers = pkgs.filter(({ dir }) => sourceFiles(dir).some((f) => /from ['"](zod|zod\/v4)['"]/.test(readFileSync(f, 'utf8'))))
    expect(importers.length).toBeGreaterThan(0)
    for (const { pkg } of importers) {
      expect({ pkg: pkg.name, zod: pkg.dependencies?.zod ?? pkg.devDependencies?.zod }).toEqual({ pkg: pkg.name, zod: '~3.25.76' })
    }
  })
})
