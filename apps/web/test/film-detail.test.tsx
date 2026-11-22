import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { FilmDetail } from '../src/pages/FilmDetail'
import { FakeEventSource, at, film, json, mockApi, ok, renderRoutes, stubCanvas } from './helpers'
import { asset, assetRoutes, detailWith } from './film-fixtures'

const routes = [{ path: '/films/:id', element: <FilmDetail /> }, { path: '/review', element: <p>trang duyệt</p> }]
const open = () => renderRoutes(routes, '/films/f1')
const step = (name: string, status: string, error: unknown = null) =>
  ({ step: name, status, attempt: 1, error, started_at: at, finished_at: at }) as never

beforeEach(() => {
  stubCanvas()
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('film detail', () => {
  test('detail shows player, status, version and the live step timeline', async () => {
    mockApi({ '/v1/films/f1': () => ok(detailWith('running')) })
    open()

    expect(await screen.findByRole('heading', { name: 'Phân số là gì?' })).toBeInTheDocument()
    expect(screen.getByText('v1 · initial')).toBeInTheDocument()
    expect(screen.getByText('$0.21')).toBeInTheDocument()
    act(() => {
      FakeEventSource.instances[0]!.emit('snapshot', detailWith('running'))
      FakeEventSource.instances[0]!.emit('step', { type: 'step', filmId: 'f1', versionId: 'f1-v1', step: 'story', status: 'running', attempt: 1, at })
    })
    await waitFor(() => expect(screen.getByText('Cốt truyện').closest('li')).toHaveTextContent('Đang chạy'))
  })

  test('a pending film is not shown as empty and a failed one shows the error', async () => {
    mockApi({ '/v1/films/f1': () => json(404, { data: null, error: { code: 'not_found', message: 'x', details: null }, meta: {} }) })
    open()
    expect(screen.getByText('Đang tải…')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy')
  })

  test('Huỷ appears only while queued or running and posts cancel after confirm', async () => {
    let status: 'running' | 'cancelled' = 'running'
    const cancel = vi.fn(() => { status = 'cancelled'; return ok(detailWith('cancelled')) })
    mockApi({ '/v1/films/f1': () => ok(detailWith(status)), '/v1/films/f1/cancel': cancel })
    open()

    await userEvent.click(await screen.findByRole('button', { name: 'Huỷ' }))
    expect(screen.getByRole('heading', { name: 'Huỷ phim này?' })).toBeInTheDocument()
    expect(cancel).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận huỷ' }))

    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Huỷ' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Làm lại' })).toBeInTheDocument()
  })

  test('Làm lại requires a reason and posts from_step and reason', async () => {
    const redo = vi.fn((_u: URL, _init?: RequestInit) => ok(detailWith('queued')))
    mockApi({ '/v1/films/f1': () => ok(detailWith('awaiting_review')), '/v1/films/f1/redo': redo })
    open()

    await userEvent.click(await screen.findByRole('button', { name: 'Làm lại' }))
    expect(screen.getByLabelText('Làm lại từ bước')).toHaveValue('story')
    await userEvent.click(screen.getByRole('button', { name: 'Chạy lại' }))
    expect(screen.getByText('Hãy nhập lý do')).toBeInTheDocument()
    expect(redo).not.toHaveBeenCalled()

    await userEvent.selectOptions(screen.getByLabelText('Làm lại từ bước'), 'voice')
    await userEvent.type(screen.getByLabelText('Lý do'), 'Giọng nhanh quá')
    await userEvent.click(screen.getByRole('button', { name: 'Chạy lại' }))

    await waitFor(() => expect(redo).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String(redo.mock.calls[0]![1]!.body))).toEqual({ from_step: 'voice', reason: 'Giọng nhanh quá' })
  })

  test('a 409 on redo shows the conflict notice and refetches', async () => {
    const get = vi.fn(() => ok(detailWith('awaiting_review')))
    mockApi({
      '/v1/films/f1': get,
      '/v1/films/f1/redo': () => json(409, { data: null, error: { code: 'conflict', message: 'x', details: null }, meta: {} }),
    })
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Làm lại' }))
    await userEvent.type(screen.getByLabelText('Lý do'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Chạy lại' }))

    expect(await screen.findByText('Phim vừa thay đổi, hãy tải lại')).toBeInTheDocument()
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1))
  })

  test('the review link shows for awaiting_review and qa_failed only', async () => {
    mockApi({ '/v1/films/f1': () => ok(detailWith('qa_failed')) })
    const { router, unmount } = open()
    await userEvent.click(await screen.findByRole('link', { name: 'Duyệt phim này' }))
    expect(router.state.location.pathname + router.state.location.search).toBe('/review?film=f1')
    unmount()

    mockApi({ '/v1/films/f1': () => ok(detailWith('approved')) })
    open()
    await screen.findByRole('heading', { name: 'Phân số là gì?' })
    expect(screen.queryByRole('link', { name: 'Duyệt phim này' })).not.toBeInTheDocument()
  })

  test('tabs move with the arrow keys', async () => {
    mockApi({ '/v1/films/f1': () => ok(detailWith('approved')), '/v1/films/f1/versions': () => ok([]) })
    open()
    const first = await screen.findByRole('tab', { name: 'Kịch bản' })
    expect(first).toHaveAttribute('aria-selected', 'true')
    first.focus()

    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'QA' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'QA' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'QA' }), { key: 'ArrowLeft' })
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Kịch bản' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Phiên bản' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('qa tab', () => {
  const qaTab = async () => {
    await userEvent.click(await screen.findByRole('tab', { name: 'QA' }))
  }

  test('qa_failed shows the gate findings; a passed gate with no findings says Không có cảnh báo', async () => {
    const failed = detailWith('qa_failed', {
      film: { ...film({ status: 'qa_failed', qa_score: 41 }) },
      steps: [step('gate', 'failed', { code: 'gate', message: 'qa', details: { findings: ['Minh đứng yên 2,8 giây'] } })],
    })
    mockApi({ '/v1/films/f1': () => ok(failed) })
    const { unmount } = open()
    await qaTab()
    expect(screen.getByText('Minh đứng yên 2,8 giây')).toBeInTheDocument()
    expect(screen.getByText('41')).toBeInTheDocument()
    unmount()

    const passed = detailWith('awaiting_review', { assets: [asset('qa1', 'qa_report'), asset('c1', 'contact_sheet')] })
    mockApi({ '/v1/films/f1': () => ok(passed), ...assetRoutes({ qa1: { findings: [] }, c1: {} }) })
    open()
    await qaTab()
    expect(await screen.findByText('Không có cảnh báo')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByAltText('Contact sheet các cảnh')).toBeInTheDocument()
  })

  test('findings of a passed gate come from the qa_report asset', async () => {
    const d = detailWith('awaiting_review', { assets: [asset('qa1', 'qa_report')] })
    mockApi({ '/v1/films/f1': () => ok(d), ...assetRoutes({ qa1: { findings: ['Cảnh 2 hơi dài'] } }) })
    open()
    await qaTab()
    expect(await screen.findByText('Cảnh 2 hơi dài')).toBeInTheDocument()
  })
})

describe('versions tab', () => {
  test('versions are newest first and the current one is marked', async () => {
    const v = (n: number, reason: string, from: string | null) => ({ id: `v${n}`, version: n, reason, restart_from_step: from, created_at: at })
    mockApi({
      '/v1/films/f1': () => ok(detailWith('approved', { film: film({ status: 'approved', current_version: 2 }) })),
      '/v1/films/f1/versions': () => ok([v(1, 'initial', null), v(2, 'Giọng nhanh quá', 'voice')]),
    })
    open()
    await userEvent.click(await screen.findByRole('tab', { name: 'Phiên bản' }))

    const items = await screen.findAllByRole('listitem')
    const rows = items.filter((li) => /^v\d/.test(li.textContent ?? ''))
    expect(rows.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^v2.*Giọng nhanh quá.*làm lại từ Lồng tiếng.*hiện tại/),
      expect.stringMatching(/^v1.*initial/),
    ])
    expect(within(rows[1]!).queryByText('hiện tại')).not.toBeInTheDocument()
  })
})
