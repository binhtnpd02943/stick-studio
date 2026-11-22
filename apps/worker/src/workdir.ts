import { mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { STEP_FILES, type FilmStep, type StorageProvider } from '@stick/core'
import type { Asset } from '@stick/db'

/** A fresh directory per job, so concurrent or re-delivered jobs never share files. */
export async function makeWorkDir(cacheDir: string, versionId: string, step: FilmStep): Promise<string> {
  const parent = join(cacheDir, 'work')
  await mkdir(parent, { recursive: true })
  return mkdtemp(join(parent, `${versionId}-${step}-`))
}

export const removeWorkDir = (dir: string): Promise<void> => rm(dir, { recursive: true, force: true })

/** A trailing `/` in a STEP_FILES entry matches every file under that directory. */
const matches = (entry: string, path: string) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry)

/** Downloads the version's assets the step reads into `dir`; returns their paths and hashes for the input hash. */
export async function downloadInputs(
  storage: StorageProvider, assets: Asset[], step: FilmStep, dir: string,
): Promise<{ path: string; sha256: string }[]> {
  // An asset without a sha256 never matches a past run, so the step is redone rather than wrongly skipped.
  const inputs = assets.flatMap((a) => {
    const path = a.meta?.path
    return path && STEP_FILES[step].reads.some((r) => matches(r, path)) ? [{ path, sha256: a.sha256 ?? `unhashed:${a.id}`, key: a.storageKey }] : []
  })
  await Promise.all(inputs.map((i) => storage.getFile(i.key, join(dir, i.path))))
  return inputs.map(({ path, sha256 }) => ({ path, sha256 }))
}

/** Work-dir relative paths of every file `entries` name; a named file that is missing is an error. */
export async function listOutputs(dir: string, entries: string[]): Promise<string[]> {
  const out: string[] = []
  for (const entry of entries) {
    if (!entry.endsWith('/')) {
      await stat(join(dir, entry)).catch(() => { throw new Error(`step did not write ${entry}`) })
      out.push(entry)
      continue
    }
    const files = await readdir(join(dir, entry), { recursive: true, withFileTypes: true })
    for (const f of files) if (f.isFile()) out.push(join(f.parentPath, f.name).slice(dir.length + 1))
  }
  return out
}
