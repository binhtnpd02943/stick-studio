import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AssetImage } from '../src/components/AssetImage'
import { FilmPlayer } from '../src/components/FilmPlayer'

vi.mock('../src/stick/StickState', () => ({ StickState: ({ kind, label }: { kind: string; label: string }) => <p data-kind={kind}>{label}</p> }))

let reduced: boolean
let urls: string[]
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  reduced = false
  urls = ['https://signed.test/a?sig=1', 'https://signed.test/a?sig=2']
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { url: urls.shift() ?? 'https://signed.test/a?sig=x', expires_at: '2026-11-22T10:15:00.000Z' }, error: null }), { headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => vi.unstubAllGlobals())

const mount = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)
const video = () => document.querySelector('video')!

describe('FilmPlayer', () => {
  test('no asset shows the rendering stick state', () => {
    mount(<FilmPlayer />)
    expect(screen.getByText('Đang làm phim…')).toHaveAttribute('data-kind', 'rendering')
    expect(video()).toBeNull()
  })

  test('a signed src plays in a controlled video', () => {
    mount(<FilmPlayer src="https://signed.test/v.mp4" />)
    expect(video()).toHaveAttribute('src', 'https://signed.test/v.mp4')
    expect(video()).toHaveAttribute('controls')
    expect(video()).toHaveAttribute('preload', 'metadata')
    expect(video().autoplay).toBe(false)
  })

  test('a media error refetches the signed url once', async () => {
    mount(<FilmPlayer assetId="a1" />)
    await waitFor(() => expect(video()).toHaveAttribute('src', 'https://signed.test/a?sig=1'))
    fireEvent.error(video())
    await waitFor(() => expect(video()).toHaveAttribute('src', 'https://signed.test/a?sig=2'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    fireEvent.error(video())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('a media error on a given src asks the owner for a fresh one, once', () => {
    const onExpired = vi.fn()
    mount(<FilmPlayer src="https://signed.test/v.mp4" onExpired={onExpired} />)
    fireEvent.error(video())
    expect(onExpired).toHaveBeenCalledTimes(1)
    fireEvent.error(video())
    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  test('autoplay is muted and looping with an unmute button', () => {
    mount(<FilmPlayer src="https://signed.test/v.mp4" autoPlay />)
    expect(video().autoplay).toBe(true)
    expect(video().loop).toBe(true)
    expect(video().muted).toBe(true)
    act(() => screen.getByRole('button', { name: 'Bật tiếng' }).click())
    expect(video().muted).toBe(false)
    expect(screen.queryByRole('button', { name: 'Bật tiếng' })).not.toBeInTheDocument()
  })

  test('reduced motion never sets autoplay', () => {
    reduced = true
    mount(<FilmPlayer src="https://signed.test/v.mp4" autoPlay />)
    expect(video().autoplay).toBe(false)
    expect(video().loop).toBe(false)
    expect(screen.queryByRole('button', { name: 'Bật tiếng' })).not.toBeInTheDocument()
  })
})

describe('AssetImage', () => {
  test('an expired signed url is refetched once, then shows the error', async () => {
    mount(<AssetImage assetId="a1" alt="Ảnh tóm tắt" />)
    const img = () => screen.getByRole('img', { name: 'Ảnh tóm tắt' })
    await waitFor(() => expect(img()).toHaveAttribute('src', 'https://signed.test/a?sig=1'))
    fireEvent.error(img())
    await waitFor(() => expect(img()).toHaveAttribute('src', 'https://signed.test/a?sig=2'))
    fireEvent.error(img())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
