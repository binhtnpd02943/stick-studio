import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseScreenplay } from '@stick/core'
import { defaultCatalog, type Catalog } from '@stick/library'
import { solveTimeline } from '@stick/pipeline'
import { describe, expect, test } from 'vitest'
import { specExample } from '../../core/test/fixtures.js'
import { renderFilm } from '../src/index.js'

const SLOW = 120_000

describe('renderFilm', () => {
  test('draws the frames with the catalog it is given, not the default one', async () => {
    const parsed = parseScreenplay(specExample())
    if (!parsed.ok) throw new Error(parsed.issues.join('; '))
    const tl = solveTimeline(parsed.value, { 's1.b0': 1.6, 's1.b1': 2.0 }, defaultCatalog)
    let draws = 0
    const backdrops = Object.fromEntries(
      Object.entries(defaultCatalog.backdrops).map(([id, b]) => [id, { ...b, draw: (...a: Parameters<typeof b.draw>) => { draws++; return b.draw(...a) } }]),
    )
    const catalog: Catalog = { ...defaultCatalog, backdrops }
    const dir = mkdtempSync(join(tmpdir(), 'stick-render-film-'))
    const { frames } = await renderFilm(tl, { audioDir: dir, sfxCacheDir: join(dir, '.sfx-cache'), catalog }, join(dir, 'film.mp4'))
    expect(draws).toBeGreaterThanOrEqual(frames)
  }, SLOW)
})
