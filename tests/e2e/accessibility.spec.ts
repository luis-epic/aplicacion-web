import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { fieldUrl, loginField, loginPortal, portalUrl } from './helpers'

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const blocking = result.violations.filter((violation) => (
    violation.impact === 'critical' || violation.impact === 'serious'
  ))
  expect(blocking, blocking.map((item) => `${item.id}: ${item.help}`).join('\n')).toEqual([])
}

test('accessibility: portal before and after authentication', async ({ page }) => {
  await page.goto(portalUrl)
  await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible()
  await expectNoSeriousViolations(page)
  await loginPortal(page)
  await expectNoSeriousViolations(page)
})

test('accessibility: PWA before and after authentication', async ({ page }) => {
  await page.goto(`${fieldUrl}/#/actualidad`)
  await expect(page.getByRole('heading', { name: 'Actualidad corporativa' })).toBeVisible()
  await expectNoSeriousViolations(page)
  await loginField(page)
  await expectNoSeriousViolations(page)
})
