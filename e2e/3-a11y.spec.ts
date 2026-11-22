import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import { createFilm, expectAllStepsSucceeded, login } from './helpers.js'

const MAX_TABS = 40

async function expectNoViolations(page: Page, name: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) })), name).toEqual([])
}

test('no axe wcag2a/wcag2aa violations on login, overview, films, film detail, review, cast and settings', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeVisible()
  await expectNoViolations(page, 'login')

  await login(page)
  await expectNoViolations(page, 'overview')

  // A fresh film, so film detail is checked with the studio floor running and /review with a card on it.
  await createFilm(page, 'Vì sao trời mưa?')
  await expect(page.locator('.studio-scene')).toBeVisible()
  await expectNoViolations(page, 'film detail (studio floor)')
  await expectAllStepsSucceeded(page)
  await expectNoViolations(page, 'film detail (done)')

  await page.goto('/films')
  await expect(page.locator('.film-card').first()).toBeVisible()
  await expectNoViolations(page, 'films')

  await page.goto('/review')
  await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toBeVisible()
  await expectNoViolations(page, 'review')

  await page.goto('/cast')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectNoViolations(page, 'cast')

  await page.goto('/settings')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectNoViolations(page, 'settings')
})

test('the review actions are reachable by keyboard and show a focus ring', async ({ page }) => {
  await login(page)
  await page.goto('/review')
  await expect(page.getByRole('button', { name: 'Làm lại', exact: true })).toBeVisible()
  let tabs = 0
  while (tabs++ < MAX_TABS && await page.evaluate(() => document.activeElement?.textContent?.trim()) !== 'Làm lại') {
    await page.keyboard.press('Tab')
  }
  const redo = page.getByRole('button', { name: 'Làm lại', exact: true })
  await expect(redo).toBeFocused()
  expect(await redo.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
})
