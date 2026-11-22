import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, rename, rm } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { StorageProvider } from '@stick/core'

const KEY_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/

export const storageKey = (ws: string, filmId: string, version: number, path: string): string =>
  `ws/${ws}/films/${filmId}/v${version}/${path}`

export class FsStorage implements StorageProvider {
  private readonly root: string

  constructor(opts: { root: string }) {
    this.root = resolve(opts.root)
  }

  /** Whitelist charset (no `\`, `%`, NUL, spaces) plus no dot segments, so a key cannot leave `root`. */
  assertKey(key: string): void {
    if (!KEY_RE.test(key) || key.split('/').some((s) => s === '.' || s === '..')) throw new Error('invalid storage key')
  }

  localPath(key: string): string {
    this.assertKey(key)
    const p = resolve(this.root, key)
    if (!p.startsWith(this.root + sep)) throw new Error('invalid storage key') // belt and braces
    return p
  }

  async putFile(key: string, localPath: string): Promise<{ bytes: number; sha256: string }> {
    const dest = this.localPath(key)
    await mkdir(dirname(dest), { recursive: true })
    const tmp = `${dest}.${randomUUID()}.tmp`
    try {
      await copyFile(localPath, tmp)
      const hash = createHash('sha256')
      let bytes = 0
      await pipeline(createReadStream(tmp), async function* (src) {
        for await (const chunk of src as AsyncIterable<Buffer>) { hash.update(chunk); bytes += chunk.length }
      })
      await rename(tmp, dest)
      return { bytes, sha256: hash.digest('hex') }
    } catch (e) {
      await rm(tmp, { force: true })
      throw e
    }
  }

  async getFile(key: string, localPath: string): Promise<void> {
    const src = this.localPath(key)
    await mkdir(dirname(resolve(localPath)), { recursive: true })
    await copyFile(src, localPath)
  }

  async delete(key: string): Promise<void> {
    await rm(this.localPath(key), { force: true })
  }
}
