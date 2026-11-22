import { mkdirSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { type Db, createDb } from '@stick/db'
import { CliError } from './cli-error.js'

export const PGLITE_NOTE = 'On PGlite (no DATABASE_URL) stop npm run dev first: PGlite is single-process.'

/** Parses `--flag value` options; any missing required flag fails with the usage text. */
export function parseFlags<K extends string>(usage: string, required: K[], optional: string[] = []): Record<K, string> & Record<string, string | undefined> {
  const options = Object.fromEntries([...required, ...optional].map((k) => [k, { type: 'string' as const }]))
  let values: Record<string, string | boolean | undefined>
  try {
    ;({ values } = parseArgs({ options }))
  } catch (e) {
    throw new CliError(1, `${(e as Error).message}\n${usage}`)
  }
  for (const k of required) if (typeof values[k] !== 'string' || !values[k]) throw new CliError(1, usage)
  return values as Record<K, string>
}

/** Reads only DATABASE_URL and STICK_PGLITE_DIR, so the script never needs the server's other secrets. */
export async function openScriptDb(env: NodeJS.ProcessEnv): Promise<{ db: Db; close(): Promise<void> }> {
  const url = env.DATABASE_URL?.trim() || undefined
  if (url && !/^postgres(ql)?:\/\//.test(url)) throw new CliError(1, 'DATABASE_URL must start with postgres:// or postgresql://')
  const pgliteDir = env.STICK_PGLITE_DIR?.trim() || 'out/.pglite'
  if (!url) mkdirSync(pgliteDir, { recursive: true })
  return createDb({ url, pgliteDir })
}

export function runCli(main: () => Promise<void>): void {
  main().catch((e: unknown) => {
    console.error(e instanceof CliError ? e.message : `error: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  })
}
