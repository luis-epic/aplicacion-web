import { expect, type Page } from '@playwright/test'

export const portalUrl = process.env.PORTAL_BASE_URL ?? 'http://localhost:3300'
export const fieldUrl = process.env.FIELD_BASE_URL ?? 'http://localhost:5273'

function credentials(): { email: string; password: string } {
  const email = process.env.E2E_ADMIN_EMAIL
  const password = process.env.E2E_ADMIN_PASSWORD
  if (!email || !password) throw new Error('Faltan credenciales E2E sintéticas.')
  return { email, password }
}

export async function loginPortal(page: Page): Promise<void> {
  const { email, password } = credentials()
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Entrar al portal' }).click()
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible()
}

export async function loginField(page: Page): Promise<void> {
  const { email, password } = credentials()
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByText('Sesión conectada')).toBeVisible()
}
