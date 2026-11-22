import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { FsStorage, storageKey } from '../src/index.js'

let dir: string
let storage: FsStorage
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stick-storage-'))
  storage = new FsStorage({ root: join(dir, 'root') })
})

describe('FsStorage', () => {
  it('put then get round-trips bytes and reports sha256', async () => {
    const bytes = Buffer.from('hello stick')
    const src = join(dir, 'src.bin')
    await writeFile(src, bytes)
    const key = storageKey('w1', 'f1', 2, 'out/film.mp4')
    expect(key).toBe('ws/w1/films/f1/v2/out/film.mp4')

    const res = await storage.putFile(key, src)
    expect(res).toEqual({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })

    const dst = join(dir, 'dst.bin')
    await storage.getFile(key, dst)
    expect(await readFile(dst)).toEqual(bytes)
    // no temp file is left beside the object
    const { readdir } = await import('node:fs/promises')
    expect(await readdir(join(storage.localPath(key)!, '..'))).toEqual(['film.mp4'])
  })

  it.each([
    '', '/etc/passwd', '..', '../x', 'a/../b', 'a/..', '.', 'a/./b', 'a//b', 'a/', '/a',
    'a\\b', '..\\x', 'a/%2e%2e/b', 'a\0b', 'a b', 'a/..%2fb', 'C:\\x',
  ])('keys with .., absolute paths, backslashes or empty segments are refused: %j', async (key) => {
    expect(() => storage.localPath(key)).toThrow(/invalid storage key/)
    await expect(storage.putFile(key, join(dir, 'nope'))).rejects.toThrow(/invalid storage key/)
    await expect(storage.getFile(key, join(dir, 'out'))).rejects.toThrow(/invalid storage key/)
    await expect(storage.delete(key)).rejects.toThrow(/invalid storage key/)
  })

  it('localPath stays under root', () => {
    const root = resolve(dir, 'root')
    for (const key of ['a', 'a/b.txt', 'ws/x/films/y/v1/...', 'a/.hidden']) {
      const p = storage.localPath(key)!
      expect(p.startsWith(root + sep)).toBe(true)
    }
  })

  it('delete of a missing key is not an error, and deletes an existing one', async () => {
    await expect(storage.delete('no/such/key')).resolves.toBeUndefined()
    const src = join(dir, 'src.bin')
    await writeFile(src, 'x')
    await storage.putFile('k/x', src)
    await storage.delete('k/x')
    await expect(stat(storage.localPath('k/x')!)).rejects.toThrow()
  })
})
