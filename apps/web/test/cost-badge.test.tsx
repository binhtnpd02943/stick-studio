import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { CostBadge } from '../src/components/CostBadge'

const badge = (spent: number, cap: number) => render(<CostBadge spentUsd={spent} capUsd={cap} label="Chi phí hôm nay" />)

describe('CostBadge', () => {
  test('0.42 of 10 is ok and reads $0.42 / $10.00', () => {
    badge(0.42, 10)
    expect(screen.getByText('$0.42 / $10.00')).toBeInTheDocument()
    const meter = screen.getByRole('meter', { name: 'Chi phí hôm nay' })
    expect(meter).toHaveAttribute('aria-valuemin', '0')
    expect(meter).toHaveAttribute('aria-valuemax', '10')
    expect(meter).toHaveAttribute('aria-valuenow', '0.42')
    expect(meter).toHaveAttribute('data-state', 'ok')
  })

  test('8 of 10 is warn', () => {
    badge(8, 10)
    expect(screen.getByRole('meter')).toHaveAttribute('data-state', 'warn')
  })

  test('10 of 10 is over and says Đã chạm trần', () => {
    badge(10, 10)
    expect(screen.getByRole('meter')).toHaveAttribute('data-state', 'over')
    expect(screen.getByText('Đã chạm trần')).toBeInTheDocument()
  })

  test('0.004 reads $0.0040', () => {
    badge(0.004, 10)
    expect(screen.getByText('$0.0040 / $10.00')).toBeInTheDocument()
  })

  test('nothing spent reads $0.00 and no over text appears below the cap', () => {
    badge(0, 10)
    expect(screen.getByText('$0.00 / $10.00')).toBeInTheDocument()
    expect(screen.queryByText('Đã chạm trần')).not.toBeInTheDocument()
  })
})
