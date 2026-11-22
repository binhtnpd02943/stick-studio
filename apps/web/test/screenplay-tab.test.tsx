import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { IssueList } from '../src/components/IssueList'
import { FilmDetail } from '../src/pages/FilmDetail'
import { FakeEventSource, json, mockApi, ok, renderRoutes, stubCanvas } from './helpers'
import { asset, assetRoutes, detailWith, screenplay, story } from './film-fixtures'

const open = () => renderRoutes([{ path: '/films/:id', element: <FilmDetail /> }], '/films/f1')
const withAssets = (status: Parameters<typeof detailWith>[0]) =>
  detailWith(status, { assets: [asset('sp1', 'screenplay'), asset('st1', 'story')] })

let patch: ReturnType<typeof vi.fn<(url: URL, init?: RequestInit) => Response>>
beforeEach(() => {
  stubCanvas()
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  patch = vi.fn(() => ok(detailWith('queued')))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const serve = (status: Parameters<typeof detailWith>[0], extra: Record<string, () => Response> = {}) =>
  mockApi({
    '/v1/films/f1': () => ok(withAssets(status)),
    '/v1/films/f1/screenplay': (url, init) => patch(url, init),
    ...assetRoutes({ sp1: screenplay, st1: story }),
    ...extra,
  })
const sent = () => JSON.parse(String(patch.mock.calls[0]![1]!.body)) as { screenplay: typeof screenplay }
const startEdit = async () => userEvent.click(await screen.findByRole('button', { name: 'Sửa' }))

describe('screenplay tab', () => {
  test('reads the story: title, logline, genre, hook, lines per scene and content warnings', async () => {
    serve('approved')
    open()
    expect(await screen.findByText('Hai bạn chia bánh')).toBeInTheDocument()
    expect(screen.getByText('Minh: Một nửa cái bánh', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Con số cần kiểm chứng')).toBeInTheDocument()
  })

  test('editing a line and saving sends the full screenplay with only that text changed', async () => {
    serve('awaiting_review')
    open()
    await startEdit()
    const line = await screen.findByLabelText('Cảnh 2 · Lan')
    expect(line).toHaveAttribute('maxlength', '160')
    await userEvent.clear(line)
    await userEvent.type(line, 'Viết là một phần hai')
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    const expected = structuredClone(screenplay)
    expected.scenes[1]!.beats[0]!.say!.text = 'Viết là một phần hai'
    expect(sent().screenplay).toEqual(expected)
    expect(await screen.findByText('Đã lưu, phim đang chạy lại từ bước Kiểm tra')).toBeInTheDocument()
  })

  test('invalid JSON is caught before sending', async () => {
    serve('awaiting_review')
    open()
    await startEdit()
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa JSON' }))
    const box = screen.getByLabelText('Kịch bản (JSON)')
    expect(JSON.parse((box as HTMLTextAreaElement).value)).toEqual(screenplay)
    fireEvent.change(box, { target: { value: '{ nope' } })
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/^JSON không hợp lệ: /)
    expect(patch).not.toHaveBeenCalled()
  })

  test('a 422 lists each issue and keeps the edits', async () => {
    patch.mockImplementation(() => json(422, {
      data: null,
      error: { code: 'invalid_screenplay', message: 'x', details: { issues: [
        { code: 'unknown_action', path: 'scenes.0.beats.0', message: 'action nhảy không có', key: 'nhay' },
        'scenes.1.beats.0.say.text: too long',
      ] } },
      meta: {},
    }))
    serve('awaiting_review')
    open()
    await startEdit()
    const line = await screen.findByLabelText('Cảnh 1 · Minh')
    await userEvent.clear(line)
    await userEvent.type(line, 'Sửa rồi')
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('unknown_action')
    expect(alert).toHaveTextContent('action nhảy không có')
    expect(alert).toHaveTextContent('nhay')
    expect(alert).toHaveTextContent('scenes.1.beats.0.say.text: too long')
    expect(screen.getByLabelText('Cảnh 1 · Minh')).toHaveValue('Sửa rồi')
  })

  test('editing is disabled while running with the hint', async () => {
    serve('running')
    open()
    expect(await screen.findByRole('button', { name: 'Sửa' })).toBeDisabled()
    expect(screen.getByText('Chỉ sửa được khi phim đã dừng')).toBeInTheDocument()
  })

  test('a failed story asset shows the error instead of an empty view', async () => {
    serve('approved', { '/v1/assets/st1/url': () => json(500, { data: null, error: { code: 'internal', message: 'x', details: null }, meta: {} }) })
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ gặp lỗi')
  })
})

describe('IssueList', () => {
  test('renders plain-string issues and structured issues', () => {
    const { container } = renderIssues(<IssueList issues={['beat quá dài', { code: 'schema', path: 'a.b', message: 'sai', key: 'k' }]} />)
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByText('beat quá dài')).toBeInTheDocument()
    expect(screen.getByText('a.b', { exact: false })).toBeInTheDocument()
  })
})

function renderIssues(ui: React.ReactElement) {
  return renderRoutes([{ path: '/', element: ui }], '/')
}
