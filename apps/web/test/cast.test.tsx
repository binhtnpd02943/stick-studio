import { drawFrame } from '@stick/render/frame'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Character } from '../src/api/schemas'
import { Cast } from '../src/pages/Cast'
import { at, json, mockApi, ok, renderRoutes } from './helpers'

vi.mock('@stick/render/frame', async (importOriginal) => ({ ...(await importOriginal<object>()), drawFrame: vi.fn() }))

const character = (over: Partial<Character> = {}): Character => ({
  id: 'ch1', name: 'Minh', look: { ink: '#1b1b1b', hair: 'short' }, voice_id: 'male_young', description: 'Học sinh lớp 6',
  archived_at: null, created_at: at, updated_at: at, ...over,
})
const me = (role: string) => ok({ user: { id: 'u1', email: 'a@b.c', name: 'A' }, workspace: { id: 'w1', name: 'W', role } })

let visible: Array<() => void>
beforeEach(() => {
  visible = []
  vi.mocked(drawFrame).mockReset()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: IntersectionObserverCallback) {
      visible.push(() => cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver))
    }
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  const recorder = new Proxy({}, { get: () => () => {} })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recorder as unknown as CanvasRenderingContext2D)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const looks = () => vi.mocked(drawFrame).mock.calls.map(([, tl]) => tl.cast[0]!.look)
const show = () => act(async () => {
  visible.forEach((fn) => fn())
  await new Promise((r) => setTimeout(r, 20))
})
const open = async (role = 'editor', list: Character[] = [character()]) => {
  const save = vi.fn((_url: URL, init?: RequestInit) => ok(character({ ...JSON.parse(String(init?.body ?? '{}')) })))
  const archive = vi.fn(() => ok(character({ archived_at: at })))
  const fetchMock = mockApi({
    '/v1/me': () => me(role),
    '/v1/characters': (url, init) => (init?.method === 'POST' ? save(url, init) : ok(list)),
    '/v1/characters/ch1': (url, init) => (init?.method === 'DELETE' ? archive() : save(url, init)),
  })
  renderRoutes([{ path: '/cast', element: <Cast /> }], '/cast')
  if (list.length) await screen.findByText('Minh')
  return { save, archive, fetchMock }
}

describe('cast', () => {
  test('characters render with a live preview of their look', async () => {
    await open()
    await show()
    expect(screen.getByText('Nam trẻ')).toBeInTheDocument()
    expect(screen.getByText('Học sinh lớp 6')).toBeInTheDocument()
    expect(looks()).toContainEqual({ ink: '#1b1b1b', hair: 'short' })
  })

  test('changing Màu mực redraws the draft preview with the new ink', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'Sửa Minh' }))
    await show()
    vi.mocked(drawFrame).mockClear()
    fireEvent.change(screen.getByLabelText('Màu mực'), { target: { value: '#3d6fb4' } })
    await show()
    expect(looks()).toContainEqual({ ink: '#3d6fb4', hair: 'short' })
  })

  test('create posts name, look, voice_id and description', async () => {
    const user = userEvent.setup()
    const { save } = await open()
    await user.click(screen.getByRole('button', { name: 'Thêm nhân vật' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Tên'), ' Lan ')
    fireEvent.change(within(dialog).getByLabelText('Màu mực'), { target: { value: '#d97757' } })
    await user.selectOptions(within(dialog).getByLabelText('Tóc'), 'ponytail')
    await user.selectOptions(within(dialog).getByLabelText('Giọng'), 'female_young')
    await user.type(within(dialog).getByLabelText('Mô tả'), 'Bạn thân của Minh')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String(save.mock.calls[0]![1]!.body))).toEqual({
      name: 'Lan', look: { ink: '#d97757', hair: 'ponytail' }, voice_id: 'female_young', description: 'Bạn thân của Minh',
    })
    expect(save.mock.calls[0]![1]!.method).toBe('POST')
  })

  test('a name over 40 characters is not sent', async () => {
    const user = userEvent.setup()
    const { save } = await open()
    await user.click(screen.getByRole('button', { name: 'Thêm nhân vật' }))
    await user.type(screen.getByLabelText('Tên'), 'x'.repeat(41))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(save).not.toHaveBeenCalled()
    expect(screen.getByText('Tên tối đa 40 ký tự')).toBeInTheDocument()
  })

  test('edit patches only the changed fields', async () => {
    const user = userEvent.setup()
    const { save } = await open()
    await user.click(screen.getByRole('button', { name: 'Sửa Minh' }))
    await user.selectOptions(screen.getByLabelText('Giọng'), 'narrator')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0]![1]!.method).toBe('PATCH')
    expect(JSON.parse(String(save.mock.calls[0]![1]!.body))).toEqual({ voice_id: 'narrator' })
  })

  test('clearing the description patches null', async () => {
    const user = userEvent.setup()
    const { save } = await open()
    await user.click(screen.getByRole('button', { name: 'Sửa Minh' }))
    await user.clear(screen.getByLabelText('Mô tả'))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String(save.mock.calls[0]![1]!.body))).toEqual({ description: null })
  })

  test('a 400 shows the details and keeps the draft', async () => {
    const user = userEvent.setup()
    mockApi({
      '/v1/me': () => me('editor'),
      '/v1/characters': (_u, init) => init?.method === 'POST'
        ? json(400, { data: null, error: { code: 'bad_request', message: 'bad', details: [{ path: 'name', message: 'Too long' }] }, meta: {} })
        : ok([]),
    })
    renderRoutes([{ path: '/cast', element: <Cast /> }], '/cast')
    await user.click(await screen.findByRole('button', { name: 'Thêm nhân vật' }))
    await user.type(screen.getByLabelText('Tên'), 'Lan')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByText('name Too long')).toBeInTheDocument()
    expect(screen.getByLabelText('Tên')).toHaveValue('Lan')
  })

  test('archive asks for confirmation and sends DELETE', async () => {
    const user = userEvent.setup()
    const { archive } = await open()
    await user.click(screen.getByRole('button', { name: 'Lưu trữ Minh' }))
    expect(screen.getByRole('heading', { name: 'Lưu trữ Minh?' })).toBeInTheDocument()
    expect(archive).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Xác nhận lưu trữ' }))
    await waitFor(() => expect(archive).toHaveBeenCalledTimes(1))
  })

  test('a viewer sees no Thêm, Sửa, Lưu trữ or Lưu buttons', async () => {
    await open('viewer')
    expect(screen.queryByRole('button', { name: /Thêm|Sửa|Lưu/ })).not.toBeInTheDocument()
  })

  test('loading is not shown as empty', async () => {
    mockApi({ '/v1/me': () => me('editor'), '/v1/characters': () => new Promise<Response>(() => {}) })
    renderRoutes([{ path: '/cast', element: <Cast /> }], '/cast')
    expect(await screen.findByText('Đang tải…')).toBeInTheDocument()
    expect(screen.queryByText('Chưa có nhân vật nào')).not.toBeInTheDocument()
  })

  test('an empty cast says so', async () => {
    await open('editor', [])
    expect(await screen.findByText('Chưa có nhân vật nào')).toBeInTheDocument()
  })

  test('a failed list with cached data keeps the grid, and a failed save keeps the draft', async () => {
    const user = userEvent.setup()
    mockApi({
      '/v1/me': () => me('editor'),
      '/v1/characters': () => ok([character()]),
      '/v1/characters/ch1': () => json(500, { data: null, error: { code: 'internal', message: 'x' }, meta: {} }),
    })
    renderRoutes([{ path: '/cast', element: <Cast /> }], '/cast')
    await user.click(await screen.findByRole('button', { name: 'Sửa Minh' }))
    await user.type(screen.getByLabelText('Tên'), ' Hai')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByText('Máy chủ gặp lỗi')).toBeInTheDocument()
    expect(screen.getByLabelText('Tên')).toHaveValue('Minh Hai')
  })
})

describe('cast errors', () => {
  test('a failed list with no data shows the error, not the empty state', async () => {
    mockApi({
      '/v1/me': () => me('editor'),
      '/v1/characters': () => json(500, { data: null, error: { code: 'internal', message: 'x' }, meta: {} }),
    })
    renderRoutes([{ path: '/cast', element: <Cast /> }], '/cast')
    expect(await screen.findByText('Máy chủ gặp lỗi')).toBeInTheDocument()
    expect(screen.queryByText('Chưa có nhân vật nào')).not.toBeInTheDocument()
  })
})
