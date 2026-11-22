import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { FilmStatus } from '../src/api/schemas'
import { FilmDetail } from '../src/pages/FilmDetail'
import { STICK_STATES } from '../src/stick/timelines'
import { FakeEventSource, at, film, json, mockApi, ok, renderRoutes, stubCanvas } from './helpers'
import { asset, assetRoutes, detailWith, screenplay, story } from './film-fixtures'

const routes = [{ path: '/films/:id', element: <FilmDetail /> }, { path: '*', element: <p>nơi khác</p> }]
const open = (path = '/films/f1') => renderRoutes(routes, path)
const step = (name: string, status: string, error: unknown = null) =>
  ({ step: name, status, attempt: 1, error, started_at: at, finished_at: at }) as never
const conflict = () => json(409, { data: null, error: { code: 'conflict', message: 'x', details: null }, meta: {} })
const FINAL_URL = '/v1/assets/fin1/content?exp=9&sig=abc'

/** A finished film with its assets: final video, screenplay, story and timeline. */
function doneDetail(status: FilmStatus = 'awaiting_review', steps: never[] = []) {
  return detailWith(status, {
    film: film({ status, cost_usd: 0.38, qa_score: status === 'qa_failed' ? 41 : 88 }),
    steps,
    assets: [asset('fin1', 'final'), asset('sp1', 'screenplay'), asset('st1', 'story'), asset('tl1', 'timeline')],
  })
}
const doneRoutes = {
  ...assetRoutes({ sp1: screenplay, st1: story, tl1: { ...STICK_STATES.done, duration: 26 } }),
  '/v1/assets/fin1/url': () => ok({ url: FINAL_URL, expires_at: at }),
}

let phone = false
beforeEach(() => {
  phone = false
  stubCanvas()
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: phone && query.includes('max-width'), addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const wideFloor = () => vi.stubGlobal('ResizeObserver', class {
  constructor(private cb: ResizeObserverCallback) {}
  observe() { this.cb([{ contentRect: { width: 1280 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
  disconnect() {}
})

describe('film detail: running', () => {
  test('while running: the floor at full width, who works and the step, the steps folded away, Huỷ, and no video or download', async () => {
    wideFloor()
    mockApi({ '/v1/films/f1': () => ok(detailWith('running', { steps: [step('story', 'succeeded'), step('screenplay', 'running')] })) })
    open()

    expect(await screen.findByRole('heading', { level: 1, name: 'Phân số là gì?' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Đường dẫn' })).toHaveTextContent('Phim / Phân số là gì?')
    expect(document.querySelector('.studio-scene')).not.toBeNull()
    expect(screen.getByText('Tùng đang viết kịch bản · Bước 2 trên 8')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('img', { name: 'Bước 2 trên 8' })).toBeInTheDocument()
    const details = screen.getByText('Chi tiết các bước').closest('details')!
    expect(details).not.toHaveAttribute('open')
    expect(details.querySelectorAll('[data-step]')).toHaveLength(8)
    expect(details.querySelector('[data-step="screenplay"]')).toHaveAttribute('data-status', 'running')
    expect(document.querySelector('.studio-floor [data-step], .studio-floor [data-status]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Tải/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  test('step events update the folded timeline live', async () => {
    mockApi({ '/v1/films/f1': () => ok(detailWith('running')) })
    open()
    await screen.findByRole('heading', { name: 'Phân số là gì?' })
    act(() => {
      FakeEventSource.instances[0]!.emit('snapshot', detailWith('running'))
      FakeEventSource.instances[0]!.emit('step', { type: 'step', filmId: 'f1', versionId: 'f1-v1', step: 'story', status: 'running', attempt: 1, at })
    })
    await waitFor(() => expect(document.querySelector('[data-step="story"]')).toHaveAttribute('data-status', 'running'))
    expect(screen.getByRole('status')).toHaveTextContent('Mai đang nghĩ ý tưởng · Bước 1 trên 8')
  })

  test('Huỷ posts cancel after confirm', async () => {
    let status: FilmStatus = 'running'
    const cancel = vi.fn(() => { status = 'cancelled'; return ok(detailWith('cancelled')) })
    mockApi({ '/v1/films/f1': () => ok(detailWith(status)), '/v1/films/f1/cancel': cancel, '/v1/films/f1/versions': () => ok([]) })
    open()

    await userEvent.click(await screen.findByRole('button', { name: 'Huỷ' }))
    expect(cancel).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận huỷ' }))
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Bạn đã huỷ phim này.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Huỷ' })).not.toBeInTheDocument()
  })

  test('a pending film is not shown as empty and a missing one shows the error', async () => {
    mockApi({ '/v1/films/f1': () => json(404, { data: null, error: { code: 'not_found', message: 'x', details: null }, meta: {} }) })
    open()
    expect(screen.getByText('Đang tải…')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy')
  })
})

describe('film detail: done', () => {
  test('a finished film: player, title, one meta line, the quality chip, download as a signed link, and publish disabled with a note', async () => {
    mockApi({ '/v1/films/f1': () => ok(doneDetail()), ...doneRoutes })
    open()

    expect(await screen.findByRole('heading', { level: 1, name: 'Phân số là gì?' })).toBeInTheDocument()
    const download = await screen.findByRole('link', { name: 'Tải video MP4' })
    expect(download).toHaveAttribute('href', FINAL_URL)
    expect(download).toHaveAttribute('download')
    expect(download).toHaveClass('primary')
    const meta = document.querySelector('.film-meta')!
    await waitFor(() => expect(meta).toHaveTextContent('0:26'))
    expect(meta).toHaveTextContent('2 cảnh')
    expect(meta).toHaveTextContent('Minh, Lan')
    expect(meta).toHaveTextContent('$0.38')
    expect(within(meta as HTMLElement).getByText('Xong')).toBeInTheDocument()
    expect(screen.getByText('✓ Đạt kiểm tra chất lượng')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đăng lên TikTok' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Kết nối trong Cài đặt' })).toHaveAttribute('href', '/settings')
    expect(document.querySelectorAll('.primary')).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'Video phim' })).toBeInTheDocument()
    expect(screen.queryByText(/v1|initial|Chờ duyệt/)).not.toBeInTheDocument()
  })

  test('the redo box needs a note, then sends it with the user-word step', async () => {
    const redo = vi.fn((_u: URL, _init?: RequestInit) => ok(detailWith('queued')))
    mockApi({ '/v1/films/f1': () => ok(doneDetail()), '/v1/films/f1/redo': redo, ...doneRoutes })
    open()

    const box = (await screen.findByRole('heading', { name: 'Chưa ưng? Làm lại với góp ý' })).closest('form')!
    const from = within(box).getByRole('combobox', { name: 'Sửa từ' })
    expect([...from.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Cốt truyện', 'Kịch bản', 'Lồng tiếng', 'Hình ảnh'])
    expect(from).toHaveValue('screenplay')
    await userEvent.click(within(box).getByRole('button', { name: 'Làm lại' }))
    expect(within(box).getByText('Hãy viết điều bạn muốn sửa')).toBeInTheDocument()
    expect(redo).not.toHaveBeenCalled()

    await userEvent.selectOptions(from, 'render')
    await userEvent.type(within(box).getByRole('textbox', { name: 'Góp ý' }), 'Lan đứng gần bảng hơn')
    await userEvent.click(within(box).getByRole('button', { name: 'Làm lại' }))
    await waitFor(() => expect(redo).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String(redo.mock.calls[0]![1]!.body))).toEqual({ from_step: 'render', reason: 'Lan đứng gần bảng hơn' })
  })

  test('a 409 on redo shows the conflict notice and refetches', async () => {
    const get = vi.fn(() => ok(doneDetail()))
    mockApi({ '/v1/films/f1': get, '/v1/films/f1/redo': conflict, ...doneRoutes })
    open()
    await userEvent.type(await screen.findByRole('textbox', { name: 'Góp ý' }), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Làm lại' }))
    expect(await screen.findByText('Phim vừa thay đổi, hãy tải lại')).toBeInTheDocument()
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1))
  })

  test('#redo focuses the redo note', async () => {
    mockApi({ '/v1/films/f1': () => ok(doneDetail()), ...doneRoutes })
    open('/films/f1#redo')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Góp ý' })).toHaveFocus())
  })

  test('qa_failed shows a warn chip with the issue count, and ?tab=qa opens Chất lượng with the issues', async () => {
    const steps = [step('gate', 'failed', { code: 'gate', message: 'qa', details: { findings: ['Minh đứng yên 2,8 giây', 'Cảnh 2 hơi dài'] } })]
    mockApi({ '/v1/films/f1': () => ok(doneDetail('qa_failed', steps)), ...doneRoutes })
    open('/films/f1?tab=qa')

    expect(await screen.findByText('Cần xem lại · 2 điều')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Chất lượng' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Minh đứng yên 2,8 giây')).toBeInTheDocument()
    expect(screen.getByText('41')).toBeInTheDocument()
  })

  test('a passed gate with no findings says so; its findings otherwise come from the qa_report asset', async () => {
    const d = detailWith('approved', { assets: [asset('qa1', 'qa_report'), asset('c1', 'contact_sheet')] })
    mockApi({ '/v1/films/f1': () => ok(d), ...assetRoutes({ qa1: { findings: [] }, c1: {} }) })
    const first = open('/films/f1?tab=qa')
    expect(await screen.findByText('Không có điều gì cần xem lại.')).toBeInTheDocument()
    expect(screen.getByAltText('Các cảnh trong phim')).toBeInTheDocument()
    first.unmount()

    mockApi({ '/v1/films/f1': () => ok(detailWith('approved', { assets: [asset('qa1', 'qa_report')] })), ...assetRoutes({ qa1: { findings: ['Cảnh 2 hơi dài'] } }) })
    open('/films/f1?tab=qa')
    expect(await screen.findByText('Cảnh 2 hơi dài')).toBeInTheDocument()
  })

  test('tabs are Kịch bản, Chất lượng and Các bản (n), and move with the arrow keys', async () => {
    mockApi({ '/v1/films/f1': () => ok(detailWith('approved', { film: film({ status: 'approved', current_version: 2 }) })), '/v1/films/f1/versions': () => ok([]) })
    open()
    const first = await screen.findByRole('tab', { name: 'Kịch bản' })
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Kịch bản', 'Chất lượng', 'Các bản (2)'])
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Chất lượng' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Chất lượng' }), { key: 'ArrowLeft' })
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Kịch bản' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Các bản (2)' })).toHaveAttribute('aria-selected', 'true')
  })

  test('versions read as Bản n, newest first, with the first one named in user words', async () => {
    const v = (n: number, reason: string, from: string | null) => ({ id: `v${n}`, version: n, reason, restart_from_step: from, created_at: at })
    mockApi({
      '/v1/films/f1': () => ok(detailWith('approved', { film: film({ status: 'approved', current_version: 2 }) })),
      '/v1/films/f1/versions': () => ok([v(1, 'initial', null), v(2, 'Giọng nhanh quá', 'voice')]),
    })
    open('/films/f1?tab=versions')
    await screen.findByText('Bản 2')
    const rows = screen.getAllByRole('listitem').filter((li) => li.closest('.versions'))
    expect(rows.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^Bản 2Giọng nhanh quálàm lại từ Lồng tiếng.*đang dùng$/),
      expect.stringMatching(/^Bản 1Bản đầu tiên/),
    ])
    expect(screen.queryByText('initial')).not.toBeInTheDocument()
  })
})

describe('film detail: stopped', () => {
  test('a failed film says where it stopped and Thử lại redoes from that step', async () => {
    const redo = vi.fn((_u: URL, _init?: RequestInit) => ok(detailWith('queued')))
    mockApi({
      '/v1/films/f1': () => ok(detailWith('failed', { steps: [step('story', 'succeeded'), step('screenplay', 'succeeded'), step('validate', 'succeeded'), step('voice', 'failed')] })),
      '/v1/films/f1/redo': redo,
    })
    open()
    expect(await screen.findByText('Phim dừng ở bước Lồng tiếng. Phần đã làm vẫn được giữ.')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Thử lại' })
    expect(retry).toHaveClass('primary')
    await userEvent.click(retry)
    await waitFor(() => expect(redo).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String(redo.mock.calls[0]![1]!.body))).toEqual({ from_step: 'voice', reason: 'Thử lại' })
  })

  test('a budget block says so in user words and retries from the first unfinished step', async () => {
    const redo = vi.fn((_u: URL, _init?: RequestInit) => ok(detailWith('queued')))
    mockApi({ '/v1/films/f1': () => ok(detailWith('blocked_budget', { steps: [step('story', 'succeeded')] })), '/v1/films/f1/redo': redo })
    open()
    expect(await screen.findByText(/đã chạm trần chi phí/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(redo).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String(redo.mock.calls[0]![1]!.body)).from_step).toBe('screenplay')
  })
})

describe('film detail: phone', () => {
  const neighbours = [
    film({ id: 'f0', status: 'approved', updated_at: '2026-11-22T12:00:00.000Z' }),
    film({ id: 'f1', status: 'awaiting_review', updated_at: '2026-11-22T11:00:00.000Z' }),
    film({ id: 'f2', status: 'published', updated_at: '2026-11-22T10:00:00.000Z' }),
  ]

  test('the phone view stacks the video, title and a dock whose Tải về is the one accent', async () => {
    phone = true
    mockApi({ '/v1/films/f1': () => ok(doneDetail()), '/v1/films': () => ok(neighbours), ...doneRoutes })
    open()

    const dock = (await screen.findByRole('link', { name: 'Tải về' })).closest('.dock')!
    expect(within(dock as HTMLElement).getByRole('link', { name: 'Tải về' })).toHaveAttribute('href', FINAL_URL)
    expect(within(dock as HTMLElement).getByRole('link', { name: 'Tải về' })).toHaveClass('primary')
    expect([...dock.children].map((c) => c.textContent)).toEqual(['Làm lại', 'Đăng', 'Tải về'])
    expect(within(dock as HTMLElement).getByRole('button', { name: 'Đăng' })).toBeDisabled()
    expect(document.querySelectorAll('.primary')).toHaveLength(1)
    expect(await screen.findByText('2 / 3 · vuốt để xem phim khác')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Chưa ưng? Làm lại với góp ý' })).not.toBeInTheDocument()
  })

  test('Làm lại opens the redo box as a sheet', async () => {
    phone = true
    const redo = vi.fn((_u: URL, _init?: RequestInit) => ok(detailWith('queued')))
    mockApi({ '/v1/films/f1': () => ok(doneDetail()), '/v1/films': () => ok(neighbours), '/v1/films/f1/redo': redo, ...doneRoutes })
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Làm lại' }))
    const sheet = screen.getByRole('dialog')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Góp ý' }), 'Chậm hơn')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Làm lại' }))
    await waitFor(() => expect(redo).toHaveBeenCalledTimes(1))
  })

  test('swiping left on the video opens the next finished film, right the previous one', async () => {
    phone = true
    mockApi({ '/v1/films/f1': () => ok(doneDetail()), '/v1/films': () => ok(neighbours), ...doneRoutes })
    const { router } = open()
    await screen.findByText('2 / 3 · vuốt để xem phim khác')
    const video = screen.getByRole('region', { name: 'Video phim' })
    vi.spyOn(video, 'getBoundingClientRect').mockReturnValue({ bottom: 800 } as DOMRect)
    fireEvent.pointerDown(video, { clientX: 300, clientY: 300 })
    fireEvent.pointerUp(video, { clientX: 150, clientY: 310 })
    await waitFor(() => expect(router.state.location.pathname).toBe('/films/f2'))
  })
})
