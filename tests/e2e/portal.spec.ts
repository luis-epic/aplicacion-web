import { expect, test } from '@playwright/test'
import { loginPortal, portalUrl } from './helpers'

test('portal: login and authorized editorial/work navigation', async ({ page }) => {
  await page.goto(portalUrl)
  await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible()
  await loginPortal(page)

  await page.getByRole('button', { name: 'Actualidad', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Actualidad', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Áreas administrativas' })).toBeVisible()

  await page.getByRole('button', { name: 'Centro de trabajo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Centro de trabajo', exact: true })).toBeVisible()
})
