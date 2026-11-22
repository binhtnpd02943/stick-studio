import { type Page, expect } from '@playwright/test'
import { E2E_EMAIL, E2E_PASSWORD } from './constants.js'

export const STEP_TIMEOUT_MS = 280_000

export async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.getByLabel('Mật khẩu').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible()
}

/** Creates a film through the "Phim mới" dialog on /films and returns its detail url. */
export async function createFilm(page: Page, title: string): Promise<string> {
  await page.goto('/films')
  await page.getByRole('button', { name: 'Phim mới' }).click()
  await page.getByLabel('Tiêu đề').fill(title)
  await page.getByRole('button', { name: 'Làm phim' }).click()
  await expect(page).toHaveURL(/\/films\/[0-9a-f-]{36}$/)
  return page.url()
}

export async function expectAllStepsSucceeded(page: Page): Promise<void> {
  const rows = page.locator('[data-step]')
  await expect(rows).toHaveCount(8)
  await expect(page.locator('[data-step][data-status="succeeded"]')).toHaveCount(8, { timeout: STEP_TIMEOUT_MS })
}
