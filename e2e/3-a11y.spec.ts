import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import { STEP_TIMEOUT_MS, createDoneFilm, createFilm, expectAllStepsSucceeded, filmStatus, login } from './helpers.js'

const MAX_TABS = 40

async function expectNoViolations(page: Page, name: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) })), name).toEqual([])
}

test('no axe wcag2a/wcag2aa violations on login, overview, films, film detail (running, done, phone), cast and settings', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeVisible()
  await expectNoViolations(page, 'login')

  await login(page)
  await expectNoViolations(page, 'overview')

  // A fresh film, so film detail is checked with the studio floor running, then done, then on a phone.
  const filmUrl = await createFilm(page, 'Vì sao trời mưa?')
  await expect(page.locator('.studio-scene')).toBeVisible()
  await expectNoViolations(page, 'film detail (studio floor)')
  await expectAllStepsSucceeded(page)
  await expect(filmStatus(page)).toHaveText('Xong', { timeout: STEP_TIMEOUT_MS })
  await expect(page.getByRole('link', { name: 'Tải video MP4' })).toBeVisible()
  await expectNoViolations(page, 'film detail (done)')

  await page.goto('/')
  await expect(page.locator('.finished-card').first()).toBeVisible()
  await expectNoViolations(page, 'overview (finished films)')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(filmUrl)
  await expect(page.getByRole('link', { name: 'Tải về', exact: true })).toBeVisible()
  await expectNoViolations(page, 'film detail (phone)')
  await page.setViewportSize({ width: 1280, height: 720 })

  await page.goto('/films')
  await expect(page.locator('.film-card').first()).toBeVisible()
  await expectNoViolations(page, 'films')

  await page.goto('/cast')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectNoViolations(page, 'cast')

  await page.goto('/settings')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectNoViolations(page, 'settings')
})

test('the finished film actions are reachable by keyboard and show a focus ring', async ({ page }) => {
  await login(page)
  await createDoneFilm(page, 'Vì sao biển mặn?')
  await page.goto('/')
  const download = page.locator('.finished-card').filter({ hasText: 'Vì sao biển mặn?' }).getByRole('link', { name: 'Tải về' })
  await expect(download).toBeVisible()
  let tabs = 0
  while (tabs++ < MAX_TABS && !(await download.evaluate((el) => el === document.activeElement))) {
    await page.keyboard.press('Tab')
  }
  await expect(download).toBeFocused()
  const outline = await download.evaluate((el) => ({ style: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth }))
  expect(outline.style).toBe('solid')
  expect(outline.width).not.toBe('0px')
})
