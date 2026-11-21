import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CliError } from './cli-error.js'

const MAX_SLUG = 48

/** ASCII slug for the run directory; `đ` has no NFD decomposition so it is mapped by hand. */
export function slugify(topic: string): string {
  const slug = topic
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '')
  return slug || 'film'
}

export interface ArtifactSchema<T> {
  safeParse(raw: unknown): { success: true; data: T } | { success: false; error: { message: string } }
}

/** Undefined if absent; a present but unreadable or invalid file is exit 1, never overwritten. */
export function readArtifact<T>(dir: string, name: string, schema: ArtifactSchema<T>): T | undefined {
  const file = join(dir, name)
  if (!existsSync(file)) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new CliError(1, `${file} is not valid JSON (${(e as Error).message}); fix or delete it, or rerun with --fresh`)
  }
  const r = schema.safeParse(raw)
  if (!r.success) throw new CliError(1, `${file} is invalid: ${r.error.message}; fix or delete it, or rerun with --fresh`)
  return r.data
}

export function writeArtifact(dir: string, name: string, value: unknown): void {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, name)
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
  renameSync(tmp, file) // atomic: run.json is the spend ledger and must never be left truncated
}

/** Titles and loglines of earlier films under `outRoot`, newest first, so a new story avoids repeating them. */
export function recentStories(outRoot: string, n = 30): { title: string; logline: string }[] {
  if (!existsSync(outRoot)) return []
  return readdirSync(outRoot)
    .map((d) => join(outRoot, d, 'story.json'))
    .filter((f) => existsSync(f))
    .map((f) => ({ f, mtime: statSync(f).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, n)
    .flatMap(({ f }) => {
      try {
        const s = JSON.parse(readFileSync(f, 'utf8')) as { title?: unknown; logline?: unknown }
        return typeof s.title === 'string' && typeof s.logline === 'string' ? [{ title: s.title, logline: s.logline }] : []
      } catch {
        return [] // a broken story.json elsewhere must not stop an unrelated run
      }
    })
}
