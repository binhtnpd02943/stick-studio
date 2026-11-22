import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { FilmDetail, FilmStatus } from '../src/api/schemas'
import { StudioFloor } from '../src/components/studio/StudioFloor'
import { at, detail, film } from './helpers'

const STEPS = ['story', 'screenplay', 'validate', 'voice', 'timeline', 'gate', 'render', 'contact']
const step = (name: string, status: string) => ({ step: name, status, attempt: 1, error: null, started_at: at, finished_at: null }) as FilmDetail['steps'][number]
/** `n` steps done, then the next one running (none when all are done or `running` is false). */
const at_ = (status: FilmStatus, n: number, running = true) =>
  detail(film({ status }), [...STEPS.slice(0, n).map((s) => step(s, 'succeeded')), ...(running && n < 8 ? [step(STEPS[n]!, 'running')] : [])])

let width = 1280
let reduced = false
class FakeResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe() { this.cb([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
  disconnect() {}
}

beforeEach(() => {
  width = 1280
  reduced = false
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Each timer schedules the next after a render, so time moves in small acts. */
function advance(ms: number) {
  for (let t = 0; t < ms; t += 100) act(() => { vi.advanceTimersByTime(100) })
}
const q = (sel: string) => document.querySelector(sel)

describe('studio floor', () => {
  test('the floor is aria-hidden and the status line names the working member in Vietnamese', () => {
    render(<StudioFloor detail={at_('running', 1)} />)
    expect(q('.studio-scene')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Tùng đang viết kịch bản')
    expect(q('[data-step], [data-status]')).toBeNull()
  })

  test('a step event that finishes story makes Mai walk to Tùng and Tùng start working', () => {
    const { rerender } = render(<StudioFloor detail={at_('running', 0)} />)
    expect(q('.studio-walker')).toBeNull()
    rerender(<StudioFloor detail={at_('running', 1)} />)

    const walker = q('.studio-walker[data-member="story"]')
    expect(walker).not.toBeNull()
    expect(walker!.querySelector('g')).toHaveAttribute('stroke', '#d97757')
    expect(screen.getByText('Xong phần mình rồi!')).toBeInTheDocument()
    advance(1600)
    expect(screen.getByText('Gửi Tùng nè!')).toBeInTheDocument()
    advance(1100)
    expect(screen.getByText('Ok, để mình lo!')).toBeInTheDocument()
    advance(2000)
    expect(q('.studio-walker')).toBeNull()
    expect(q('.studio-bubble[data-member="screenplay"]')).toBeVisible()
    expect(q('.studio-person.is-working[data-member="screenplay"]')).not.toBeNull()
  })

  test('handoffs queue: the next one starts after the current finishes', () => {
    const { rerender } = render(<StudioFloor detail={at_('running', 0)} />)
    rerender(<StudioFloor detail={at_('running', 1)} />)
    rerender(<StudioFloor detail={at_('running', 2)} />)
    expect(q('.studio-walker[data-member="story"]')).not.toBeNull()
    advance(4300)
    expect(q('.studio-walker[data-member="screenplay"]')).not.toBeNull()
    expect(screen.getByText('Xong phần mình rồi!')).toBeInTheDocument()
  })

  test('reduced motion renders no walker and no idle animation classes but still highlights the worker', () => {
    reduced = true
    const { rerender } = render(<StudioFloor detail={at_('running', 0)} />)
    rerender(<StudioFloor detail={at_('running', 1)} />)
    expect(q('.studio-walker')).toBeNull()
    expect(q('.studio-scene :is(.bob, .hop, .think, .scroll, .stretch, .sip, .type, .lean, .steam, .clock)')).toBeNull()
    expect(q('.studio-person.is-working[data-member="screenplay"]')).not.toBeNull()
    expect(q('.studio-bubble[data-member="screenplay"]')).not.toBeNull()
    advance(7000)
    expect(q('.studio-say')).toBeNull()
  })

  test('below 720px the floor is not rendered', () => {
    width = 600
    render(<StudioFloor detail={at_('running', 1)} />)
    expect(q('.studio-scene')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  test('qa_failed shows Nam\'s bubble with Trượt QA and no final card', () => {
    render(<StudioFloor detail={at_('qa_failed', 6, false)} />)
    expect(q('.studio-bubble[data-member="gate"]')).toHaveTextContent('Trượt QA')
    expect(q('.studio-final-card')).toBeNull()
    expect(q('.studio-walker')).toBeNull()
  })

  test('final puts the card on the owner\'s desk and the team cheers once', () => {
    const { rerender } = render(<StudioFloor detail={at_('running', 7)} />)
    rerender(<StudioFloor detail={at_('awaiting_review', 8)} />)
    expect(q('.studio-final-card')).not.toBeNull()
    expect(q('.studio-walker[data-member="contact"]')).not.toBeNull()
    let cheers = 0
    for (let t = 0; t < 15000; t += 100) {
      const before = screen.queryByText('Ship it!')
      advance(100)
      if (!before && screen.queryByText('Ship it!')) cheers += 1
    }
    expect(cheers).toBe(1)
    expect(screen.getByRole('status')).toHaveTextContent('Phim xong rồi, chờ bạn duyệt')
  })

  test('chatter: one idle line after 6 s, then at most one every 8 s', () => {
    render(<StudioFloor detail={at_('running', 1)} />)
    advance(5900)
    expect(q('.studio-say')).toBeNull()
    advance(200)
    expect(screen.getByText('Ai uống cà phê không?')).toBeInTheDocument()
    advance(7700)
    expect(screen.queryByText('Trưa nay ăn bún nha')).toBeNull()
    advance(200)
    expect(screen.getByText('Trưa nay ăn bún nha')).toBeInTheDocument()
    expect(document.querySelectorAll('.studio-say')).toHaveLength(1)
  })

  test.each([['cancelled', 'Đã huỷ'], ['blocked_budget', 'Chạm trần chi phí']] as const)('%s shows Hùng saying the note', (status, note) => {
    render(<StudioFloor detail={at_(status, 2, false)} />)
    expect(q('.studio-say')).toHaveTextContent(note)
    expect(screen.getByRole('status')).toHaveTextContent(`Hùng: ${note}`)
  })
})
