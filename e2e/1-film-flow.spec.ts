import { expect, test } from '@playwright/test'
import { STEP_TIMEOUT_MS, createDoneFilm, createFilm, expectAllStepsSucceeded, filmStatus, login } from './helpers.js'

const SCREENSHOT = 'test-results/studio-floor.png'
const DARK_PIXELS_MIN = 100

test('owner makes a film from the overview, watches its steps go live, downloads it on a phone, redoes it with a note, then a bad screenplay edit shows the issue', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  const filmUrl = await createFilm(page, 'Phân số là gì?')

  // Records any step row that turns "running", so the live (SSE) updates are proven without a reload.
  await page.evaluate(() => {
    const w = window as unknown as { sawRunning: boolean }
    w.sawRunning = !!document.querySelector('[data-step][data-status="running"]')
    new MutationObserver(() => {
      if (document.querySelector('[data-step][data-status="running"]')) w.sawRunning = true
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-status'] })
  })

  await expect(page.locator('.studio-floor')).toBeVisible()
  await expect(page.locator('.studio-scene')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /Bước \d trên 8/ })).toBeVisible()
  await page.screenshot({ path: SCREENSHOT })

  await expectAllStepsSucceeded(page)
  await expect(filmStatus(page)).toHaveText('Xong')
  expect(await page.evaluate(() => (window as unknown as { sawRunning: boolean }).sawRunning)).toBe(true)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(filmUrl)
  await expect(page.locator('video')).toHaveAttribute('src', /\/v1\/assets\//)
  const download = page.getByRole('link', { name: 'Tải về', exact: true })
  await expect(download).toBeInViewport({ ratio: 1 })
  expect((await download.boundingBox())!.height).toBeGreaterThanOrEqual(48)
  await expect(download).toHaveAttribute('href', /^\/v1\/assets\/[^/]+\/content\?exp=\d+&sig=[0-9a-f]{64}$/)
  await expect(download).toHaveAttribute('download', '')

  await page.getByRole('button', { name: 'Làm lại', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('textbox', { name: 'Góp ý' }).fill('Lan nói chậm hơn')
  await sheet.getByRole('button', { name: 'Làm lại', exact: true }).click()
  await expect(sheet).toBeHidden() // closes once the redo is accepted

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(filmUrl)
  await page.getByRole('tab', { name: 'Các bản (2)' }).click({ timeout: STEP_TIMEOUT_MS })
  await expect(page.getByText('Lan nói chậm hơn')).toBeVisible()
  await expect(filmStatus(page)).toHaveText('Xong', { timeout: STEP_TIMEOUT_MS })

  await page.getByRole('tab', { name: 'Kịch bản' }).click()
  await page.getByRole('button', { name: 'Sửa', exact: true }).click()
  await page.getByRole('button', { name: 'Sửa JSON' }).click()
  const json = page.getByLabel('Kịch bản (JSON)')
  const text = await json.inputValue()
  expect(text).toMatch(/"action": "[^"]*"/)
  await json.fill(text.replace(/"action": "[^"]*"/, '"action": "fly_to_moon"'))
  await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'unknown_action' })).toBeVisible()
  await expect(filmStatus(page)).toHaveText('Xong')
})

test('a film card draws ink on its canvas in a real browser', async ({ page }) => {
  const title = 'Vì sao lá rụng?'
  await login(page)
  await createDoneFilm(page, title)
  await page.goto('/films')
  const card = page.locator('.film-card').filter({ hasText: title })
  const canvas = card.locator('canvas')
  await expect(canvas).toBeVisible()
  await card.hover()
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => {
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
    let dark = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! > 0 && data[i]! < 0x80 && data[i + 1]! < 0x80 && data[i + 2]! < 0x80) dark++
    }
    return dark
  }), { timeout: 15_000 }).toBeGreaterThan(DARK_PIXELS_MIN)
})
