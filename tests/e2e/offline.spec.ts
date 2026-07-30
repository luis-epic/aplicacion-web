import { expect, test } from '@playwright/test'
import { fieldUrl, loginField } from './helpers'

test('PWA: authenticated shell survives reload offline and never caches API responses', async ({ context, page }) => {
  await page.goto(`${fieldUrl}/#/actualidad`)
  await loginField(page)
  await expect(page.getByRole('heading', { name: 'Boletín corporativo' })).toBeVisible()

  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Boletín corporativo' })).toBeVisible()
  }
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  const cachedUrls = await page.evaluate(async () => {
    const keys = await caches.keys()
    return (await Promise.all(keys.map(async (key) => {
      const cache = await caches.open(key)
      return (await cache.keys()).map((request) => request.url)
    }))).flat()
  })
  expect(cachedUrls.some((url) => new URL(url).pathname.includes('/api/'))).toBe(false)

  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Boletín corporativo' })).toBeVisible()
  await expect(page.getByText(/Modo offline|Sin red/).first()).toBeVisible()
})
