import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CliError } from './cli-error.js'

export interface MusicLicense { title: string; author: string; license: string; source: string }
const FIELDS = ['title', 'author', 'license', 'source'] as const

/** The music file and its `<file>.license.json` sidecar, validated. Music is never downloaded or used without a licence on record. */
export function readMusic(file: string): { path: string; license: MusicLicense } {
  if (!existsSync(file)) throw new CliError(1, `--music: ${file} does not exist`)
  const sidecar = `${file}.license.json`
  if (!existsSync(sidecar)) throw new CliError(1, `${sidecar}: not found (music needs { "title", "author", "license", "source" })`)
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(readFileSync(sidecar, 'utf8')) as Record<string, unknown>
  } catch (e) {
    throw new CliError(1, `${sidecar}: not valid JSON (${(e as Error).message})`)
  }
  const license = Object.fromEntries(
    FIELDS.map((f) => {
      const v = raw?.[f]
      if (typeof v !== 'string' || !v.trim()) throw new CliError(1, `${sidecar}: missing "${f}"`)
      return [f, v]
    }),
  ) as unknown as MusicLicense
  return { path: resolve(file), license }
}
