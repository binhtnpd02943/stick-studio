import { type Page, expect } from '@playwright/test'
import { E2E_EMAIL, E2E_PASSWORD } from './constants.js'

export const STEP_TIMEOUT_MS = 280_000

export async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.getByLabel('Mật khẩu').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Hôm nay làm phim gì?' })).toBeVisible()
}

/** Creates a film from the overview's topic field and returns its detail url. */
export async function createFilm(page: Page, title: string): Promise<string> {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Chủ đề phim' }).fill(title)
  const make = page.getByRole('button', { name: 'Làm phim' })
  await expect(make).toBeEnabled() // enabled once the channel has loaded
  await make.click()
  await expect(page).toHaveURL(/\/films\/[0-9a-f-]{36}$/)
  return page.url()
}

/** The film page's status word, as the user reads it ("Xong" once a film is finished). */
export const filmStatus = (page: Page) => page.locator('.film-meta .film-status')

export async function expectAllStepsSucceeded(page: Page): Promise<void> {
  const rows = page.locator('[data-step]')
  await expect(rows).toHaveCount(8)
  await expect(page.locator('[data-step][data-status="succeeded"]')).toHaveCount(8, { timeout: STEP_TIMEOUT_MS })
}

/** A film of this test's own that has run every step and is finished; returns its detail url. */
export async function createDoneFilm(page: Page, title: string): Promise<string> {
  const url = await createFilm(page, title)
  await expectAllStepsSucceeded(page)
  // The last step succeeds a few writes before the film itself moves to awaiting_review ("Xong").
  await expect(filmStatus(page)).toHaveText('Xong', { timeout: STEP_TIMEOUT_MS })
  return url
}
