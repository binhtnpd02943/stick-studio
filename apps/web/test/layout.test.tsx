import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, test } from 'vitest'
import { Layout } from '../src/components/Layout'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<p>nội dung</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('layout', () => {
  test('layout shows the five Vietnamese nav items and marks the current one', () => {
    renderAt('/films')
    const labels = ['Tổng quan', 'Phim', 'Duyệt', 'Nhân vật', 'Cài đặt']
    for (const label of labels) expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: new RegExp(`^(${labels.join('|')})$`) })).toHaveLength(5)
    expect(screen.getByRole('link', { name: 'Phim' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Tổng quan' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Đóng' })).not.toBeInTheDocument()
  })

  test('review route offers a close link back to the overview', () => {
    renderAt('/review')
    expect(screen.getByRole('link', { name: 'Đóng' })).toHaveAttribute('href', '/')
  })
})
