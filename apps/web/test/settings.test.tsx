import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Channel, Workspace } from '../src/api/schemas'
import { Settings } from '../src/pages/Settings'
import { at, json, mockApi, ok, renderRoutes } from './helpers'

const workspace = (over: Partial<Workspace> = {}): Workspace => ({
  id: 'w1', name: 'Xưởng A', plan: 'free', max_cost_per_film_usd: 3, max_cost_per_day_usd: null,
  effective_max_cost_per_film_usd: 3, effective_max_cost_per_day_usd: 10, ...over,
})
const channel = (over: Partial<Channel> = {}): Channel => ({
  id: 'c1', platform: 'tiktok', display_name: 'Toán vui', locale: 'vi-VN', review_policy: 'manual', auto_score_threshold: null,
  created_at: at, updated_at: at, ...over,
})
const me = (role: string) => ok({ user: { id: 'u1', email: 'a@b.c', name: 'A' }, workspace: { id: 'w1', name: 'W', role } })
const body = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body))

const open = async (role = 'owner', channels: Channel[] = [channel()]) => {
  const patchWorkspace = vi.fn((_url: URL, init?: RequestInit) => ok(workspace(JSON.parse(String(init?.body)))))
  const saveChannel = vi.fn((_url: URL, init?: RequestInit) => ok(channel(JSON.parse(String(init?.body)))))
  const fetchMock = mockApi({
    '/v1/me': () => me(role),
    '/v1/workspace': (url, init) => (init?.method === 'PATCH' ? patchWorkspace(url, init) : ok(workspace())),
    '/v1/channels': (url, init) => (init?.method === 'POST' ? saveChannel(url, init) : ok(channels)),
    '/v1/channels/c1': saveChannel,
  })
  renderRoutes([{ path: '/settings', element: <Settings /> }], '/settings')
  await screen.findByLabelText('Tên')
  return { patchWorkspace, saveChannel, fetchMock }
}

afterEach(() => vi.unstubAllGlobals())

describe('settings', () => {
  test('caps show the effective default as a hint and an emptied cap sends null', async () => {
    const user = userEvent.setup()
    const { patchWorkspace } = await open()
    expect(screen.getByText('Để trống: dùng mặc định $10.00')).toBeInTheDocument()
    expect(screen.getByText('Đang đặt $3.00')).toBeInTheDocument() // a set cap is not the default, so no default hint for it
    expect(screen.getAllByText(/^Để trống/)).toHaveLength(1)
    const film = screen.getByLabelText('Trần chi phí mỗi phim (USD)')
    expect(film).toHaveValue(3)
    expect(film).toHaveAttribute('step', '0.01')
    expect(film).toHaveAttribute('min', '0.01')
    expect(film).toHaveAttribute('max', '99999')
    await user.clear(film)
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(patchWorkspace).toHaveBeenCalledTimes(1))
    expect(body(patchWorkspace.mock.calls[0]!)).toEqual({ max_cost_per_film_usd: null })
  })

  test('a cap of 0 or 100000 is blocked client-side', async () => {
    const user = userEvent.setup()
    const { patchWorkspace } = await open()
    const day = screen.getByLabelText('Trần chi phí mỗi ngày (USD)')
    for (const value of ['0', '100000']) {
      await user.clear(day)
      await user.type(day, value)
      await user.click(screen.getByRole('button', { name: 'Lưu' }))
      expect(day).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByText('Nhập số từ 0,01 đến 99999')).toBeInTheDocument()
    }
    expect(patchWorkspace).not.toHaveBeenCalled()
  })

  test('the review policy is hidden until publishing exists, and a save leaves an auto channel as stored', async () => {
    const user = userEvent.setup()
    const { saveChannel } = await open('owner', [channel({ review_policy: 'auto_if_score', auto_score_threshold: 80 })])
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByText(/duyệt/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ngưỡng điểm')).not.toBeInTheDocument()
    const name = screen.getByLabelText('Tên hiển thị')
    await user.clear(name)
    await user.type(name, 'Toán hay')
    await user.click(screen.getByRole('button', { name: 'Lưu kênh' }))
    await waitFor(() => expect(saveChannel).toHaveBeenCalledTimes(1))
    expect(body(saveChannel.mock.calls[0]!)).toEqual({ display_name: 'Toán hay' })
  })

  test('a channel PATCH sends only the changed field', async () => {
    const user = userEvent.setup()
    const { saveChannel } = await open()
    const name = screen.getByLabelText('Tên hiển thị')
    await user.clear(name)
    await user.type(name, 'Toán hay')
    await user.click(screen.getByRole('button', { name: 'Lưu kênh' }))
    await waitFor(() => expect(saveChannel).toHaveBeenCalledTimes(1))
    expect(body(saveChannel.mock.calls[0]!)).toEqual({ display_name: 'Toán hay' })
  })

  test('renaming a manual channel that holds a threshold sends only the name', async () => {
    const user = userEvent.setup()
    const { saveChannel } = await open('owner', [channel({ auto_score_threshold: 70 })])
    const name = screen.getByLabelText('Tên hiển thị')
    await user.clear(name)
    await user.type(name, 'Toán hay')
    await user.click(screen.getByRole('button', { name: 'Lưu kênh' }))
    await waitFor(() => expect(saveChannel).toHaveBeenCalledTimes(1))
    expect(body(saveChannel.mock.calls[0]!)).toEqual({ display_name: 'Toán hay' })
  })

  test('garbage in a number field (badInput reads as empty) blocks the save instead of sending null', async () => {
    const user = userEvent.setup()
    const { patchWorkspace } = await open('owner', [channel({ review_policy: 'auto_if_score', auto_score_threshold: 80 })])
    const garbage = (input: HTMLElement) => {
      Object.defineProperty(input, 'validity', { value: { badInput: true } })
      fireEvent.change(input, { target: { value: '' } })
    }
    const film = screen.getByLabelText('Trần chi phí mỗi phim (USD)')
    garbage(film)
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(film).toHaveAttribute('aria-invalid', 'true')
    expect(patchWorkspace).not.toHaveBeenCalled()
  })

  test('add channel posts display_name and locale vi-VN', async () => {
    const user = userEvent.setup()
    const { saveChannel } = await open()
    await user.click(screen.getByRole('button', { name: 'Thêm kênh' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Tên hiển thị'), 'Kênh mới')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu kênh' }))
    await waitFor(() => expect(saveChannel).toHaveBeenCalledTimes(1))
    expect(saveChannel.mock.calls[0]![0].pathname).toBe('/v1/channels')
    expect(body(saveChannel.mock.calls[0]!)).toEqual({ display_name: 'Kênh mới', locale: 'vi-VN', review_policy: 'manual' })
  })

  test('a viewer gets disabled fieldsets', async () => {
    await open('viewer')
    await waitFor(() => expect(screen.getAllByText('Chỉ xem')).toHaveLength(2))
    for (const label of ['Tên', 'Trần chi phí mỗi phim (USD)', 'Tên hiển thị']) expect(screen.getByLabelText(label)).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Thêm kênh' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument()
  })

  test('a failed refetch keeps the page and the typed edit', async () => {
    const user = userEvent.setup()
    let reads = 0
    mockApi({
      '/v1/me': () => me('owner'),
      '/v1/workspace': (_url, init) => (init?.method === 'PATCH' ? ok(workspace({ name: 'Xưởng B' })) : ++reads === 1 ? ok(workspace()) : json(500, { data: null, error: { code: 'internal', message: 'x' }, meta: {} })),
      '/v1/channels': () => ok([channel()]),
    })
    renderRoutes([{ path: '/settings', element: <Settings /> }], '/settings')
    const name = await screen.findByLabelText('Tên')
    await user.clear(name)
    await user.type(name, 'Xưởng B')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Tên')).toHaveValue('Xưởng B')
  })
})
