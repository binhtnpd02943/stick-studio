import { expect, request, test } from '@playwright/test'
import { z } from 'zod/v4'
import { Channel, Character, FilmDetail, FilmListItem, Me, ReviewItem, Usage, Version, Workspace } from '../apps/web/src/api/schemas.js'
import { E2E_EMAIL, E2E_PASSWORD, E2E_PORT } from './constants.js'

test('every GET the web uses parses with the web schemas', async () => {
  const api = await request.newContext({ baseURL: `http://localhost:${E2E_PORT}` })
  expect((await api.post('/v1/auth/login', { data: { email: E2E_EMAIL, password: E2E_PASSWORD } })).ok()).toBe(true)
  const get = async (path: string) => {
    const res = await api.get(path)
    expect(res.ok(), path).toBe(true)
    return (await res.json() as { data: unknown }).data
  }

  const films = await get('/v1/films')
  const filmId = (films as { id: string }[])[0]?.id
  expect(filmId, 'the flow spec leaves a film behind').toBeTruthy()
  const day = new Date().toISOString().slice(0, 10)
  const checks: [string, z.ZodType][] = [
    ['/v1/me', Me],
    ['/v1/workspace', Workspace],
    ['/v1/channels', z.array(Channel)],
    ['/v1/characters', z.array(Character)],
    [`/v1/films/${filmId}`, FilmDetail],
    [`/v1/films/${filmId}/versions`, z.array(Version)],
    ['/v1/review-queue', z.array(ReviewItem)],
    [`/v1/usage?from=${day}&to=${day}`, Usage],
  ]
  expect(z.array(FilmListItem).safeParse(films).error?.issues, '/v1/films').toBeUndefined()
  for (const [path, schema] of checks) {
    expect(schema.safeParse(await get(path)).error?.issues, path).toBeUndefined()
  }
  await api.dispose()
})
