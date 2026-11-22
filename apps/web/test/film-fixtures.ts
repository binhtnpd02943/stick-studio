import type { FilmDetail, FilmStatus } from '../src/api/schemas'
import { detail, film, json, ok } from './helpers'

export const screenplay = {
  version: 1,
  format: { aspect: '9:16', fps: 30 },
  title: 'Phân số',
  cast: [
    { id: 'minh', name: 'Minh', look: { ink: '#1b1b1b' }, voice: 'v1' },
    { id: 'lan', name: 'Lan', look: { ink: '#d97757' }, voice: 'v2' },
  ],
  scenes: [
    { id: 's1', backdrop: 'room', props: [], start: { minh: 'left' }, beats: [{ say: { who: 'minh', text: 'Một nửa cái bánh' } }] },
    { id: 's2', backdrop: 'room', props: [], start: { lan: 'right' }, beats: [{ say: { who: 'lan', text: 'Ta viết là 1/2' } }] },
  ],
}

export const story = {
  title: 'Phân số là gì?', logline: 'Hai bạn chia bánh', genre: 'explainer', hook: 'Một nửa cái bánh',
  cast: [{ id: 'minh', name: 'Minh', voice: 'v1', look: { ink: '#1b1b1b' } }],
  scenes: [{ setting: 'Phòng bếp', beats: [{ who: 'minh', line: 'Một nửa cái bánh' }] }],
  content_warnings: ['Con số cần kiểm chứng'],
}

export const asset = (id: string, kind: string) => ({ id, kind, path: null, mime: null, bytes: null })

/** Routes serving asset urls and their JSON bodies; `files` maps an asset id to its content. */
export function assetRoutes(files: Record<string, unknown>) {
  const routes: Record<string, () => Response> = {}
  for (const [id, body] of Object.entries(files)) {
    routes[`/v1/assets/${id}/url`] = () => ok({ url: `https://files.test/${id}.json?sig=1`, expires_at: '2026-11-22T10:15:00.000Z' })
    routes[`/${id}.json`] = () => json(200, body)
  }
  return routes
}

export const detailWith = (status: FilmStatus, over: Partial<FilmDetail> = {}): FilmDetail => ({ ...detail(film({ status })), ...over })
