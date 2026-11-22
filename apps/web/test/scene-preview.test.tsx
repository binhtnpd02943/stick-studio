import { act, fireEvent, render, screen } from '@testing-library/react'
import { defaultCatalog } from '@stick/library'
import { drawFrame } from '@stick/render/frame'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { rig } from '../src/stick/rig'
import { ScenePreview } from '../src/stick/ScenePreview'
import { StickState } from '../src/stick/StickState'
import { STICK_STATES } from '../src/stick/timelines'

vi.mock('@stick/render/frame', async (importOriginal) => ({ ...(await importOriginal<object>()), drawFrame: vi.fn() }))

const timeline = STICK_STATES.done
let frames: FrameRequestCallback[]
let intersect: (isIntersecting: boolean) => void
let reduced: boolean

beforeEach(() => {
  frames = []
  reduced = false
  vi.mocked(drawFrame).mockReset()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => { frames = [] })
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: IntersectionObserverCallback) {
      intersect = (isIntersecting) => cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
    }
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
  const recorder = new Proxy({}, { get: () => () => {} })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recorder as unknown as CanvasRenderingContext2D)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Run the pending animation frames once, at the current clock. */
async function step() {
  await act(async () => {
    const pending = frames
    frames = []
    for (const cb of pending) cb(performance.now())
  })
}

async function mount(ui: React.ReactElement) {
  render(ui)
  await act(async () => intersect(true))
}

describe('ScenePreview', () => {
  test('ScenePreview calls drawFrame from @stick/render/frame with the rig and defaultCatalog', async () => {
    await mount(<ScenePreview timeline={timeline} trigger="none" label="Phim" />)
    await step()
    expect(drawFrame).toHaveBeenCalledTimes(1)
    const [, tl, , usedRig, catalog] = vi.mocked(drawFrame).mock.calls[0]!
    expect(usedRig).toBe(rig)
    expect(catalog).toBe(defaultCatalog)
    expect(tl.scenes).toHaveLength(1) // the idle loop
    expect(screen.getByRole('img', { name: 'Phim' })).toHaveAttribute('tabindex', '0')
    expect(frames).toHaveLength(1) // keeps looping
  })

  test('ScenePreview plays on pointerenter when trigger is hover', async () => {
    await mount(<ScenePreview timeline={timeline} trigger="hover" label="Phim" />)
    await step()
    expect(vi.mocked(drawFrame).mock.calls[0]![1]).not.toBe(timeline)
    fireEvent.pointerEnter(screen.getByRole('img'))
    await step()
    expect(vi.mocked(drawFrame).mock.calls.at(-1)![1]).toBe(timeline)
  })

  test('ScenePreview does not start a loop under reduced motion', async () => {
    reduced = true
    await mount(<ScenePreview timeline={timeline} trigger="view" label="Phim" />)
    fireEvent.pointerEnter(screen.getByRole('img'))
    await step()
    expect(vi.mocked(drawFrame).mock.calls).toEqual([[expect.anything(), timeline, 0, rig, defaultCatalog]])
    expect(frames).toHaveLength(0)
    fireEvent.keyDown(screen.getByRole('img'), { key: 'Enter' })
    expect(frames).toHaveLength(1)
  })

  test('ScenePreview stops drawing when offscreen', async () => {
    await mount(<ScenePreview timeline={timeline} trigger="none" label="Phim" />)
    await act(async () => intersect(false))
    await step()
    expect(drawFrame).not.toHaveBeenCalled()
  })

  test('a preview below the fold draws one still frame and does not loop until it is on screen', async () => {
    render(<ScenePreview timeline={timeline} trigger="view" interactive={false} />)
    await act(async () => {})
    expect(drawFrame).toHaveBeenCalledTimes(1)
    expect(frames).toHaveLength(0)
  })

  test('a drawing error stops the loop and warns once with the title', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(drawFrame).mockImplementation(() => { throw new Error('boom') })
    await mount(<ScenePreview timeline={{ ...timeline, title: 'Bài học' }} trigger="none" label="Phim" />)
    await step()
    await step()
    expect(frames).toHaveLength(0)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('Bài học')
  })

  test('non-interactive previews are hidden from assistive tech', async () => {
    await mount(<StickState kind="empty" label="Chưa có phim" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(document.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('Chưa có phim')).toBeInTheDocument()
  })
})
