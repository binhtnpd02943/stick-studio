import { FILM_STEPS } from '@stick/core'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { FilmDetail } from '../src/api/schemas'
import { StepTimeline } from '../src/components/StepTimeline'

type Steps = FilmDetail['steps']
const run = (over: Partial<Steps[number]>): Steps[number] =>
  ({ step: 'story', status: 'succeeded', attempt: 1, error: null, started_at: '2026-11-22T10:00:00.000Z', finished_at: '2026-11-22T10:00:02.500Z', ...over })

describe('StepTimeline', () => {
  test('lists the 8 steps in order with Vietnamese labels and Chưa chạy for missing runs', () => {
    render(<StepTimeline steps={[run({ step: 'story' }), run({ step: 'screenplay', attempt: 2 })]} />)
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.getAttribute('data-step'))).toEqual([...FILM_STEPS])
    expect(items.map((li) => li.getAttribute('data-status'))).toEqual(['succeeded', 'succeeded', ...Array(6).fill('none')])
    expect(within(items[0]!).getByText('Cốt truyện')).toBeInTheDocument()
    expect(within(items[0]!).getByText('Xong')).toBeInTheDocument()
    expect(within(items[0]!).getByText('2.5s')).toBeInTheDocument()
    expect(within(items[1]!).getByText('lần 2')).toBeInTheDocument()
    expect(within(items[2]!).getByText('Chưa chạy')).toBeInTheDocument()
    expect(screen.getByRole('list')).toHaveAttribute('aria-live', 'polite')
  })

  test('a failed step shows its error message', () => {
    render(<StepTimeline steps={[run({ step: 'voice', status: 'failed', error: { code: 'internal', message: 'the worker stopped during this step' } })]} />)
    expect(screen.getByText('the worker stopped during this step')).toBeInTheDocument()
  })

  test('a budget failure shows the cap message', () => {
    const error = { code: 'budget', message: 'over', details: { scope: 'film', spentUsd: 10.2, capUsd: 10 } }
    render(<StepTimeline steps={[run({ step: 'voice', status: 'failed', error })]} />)
    expect(screen.getByText('Chạm trần mỗi phim: đã tiêu $10.20 / $10.00')).toBeInTheDocument()
    expect(screen.queryByText('over')).not.toBeInTheDocument()
  })

  test('a day budget failure names the day cap', () => {
    const error = { code: 'budget', message: 'over', details: { scope: 'day', spentUsd: 5, capUsd: 5 } }
    render(<StepTimeline steps={[run({ step: 'voice', status: 'failed', error })]} />)
    expect(screen.getByText('Chạm trần mỗi ngày: đã tiêu $5.00 / $5.00')).toBeInTheDocument()
  })

  test('a gate failure shows the number of QA findings', () => {
    const error = { code: 'gate', message: 'gate failed', details: { findings: [{}, {}, {}] } }
    render(<StepTimeline steps={[run({ step: 'gate', status: 'failed', error })]} />)
    expect(screen.getByText('3 cảnh báo QA')).toBeInTheDocument()
  })

  test('a running step is aria-current', () => {
    render(<StepTimeline steps={[run({ step: 'story' }), run({ step: 'screenplay', status: 'running', finished_at: null })]} />)
    const items = screen.getAllByRole('listitem')
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(items[0]).not.toHaveAttribute('aria-current')
  })
})
