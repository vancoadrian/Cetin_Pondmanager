import { expect, test } from '@playwright/test'
import { E2E_ACCOUNT_EMAILS, E2E_PASSWORD } from './helpers/auth'

test('admin rezervácie a požičovňa preposielajú session pri SSR', async ({ page }) => {
  await page.goto('/')
  const login = await page.request.post('/api/auth/login', {
    data: { email: E2E_ACCOUNT_EMAILS.manager, password: E2E_PASSWORD },
  })
  expect(login.ok()).toBe(true)

  const reservationResponse = await page.goto('/admin/rezervacie')
  expect(reservationResponse?.status()).toBe(200)
  expect(await reservationResponse?.text()).not.toContain('Admin login required')
  await expect(page.getByRole('heading', {
    name: 'Rezervácie a dostupnosť',
    exact: true,
  })).toBeVisible()

  const rentalResponse = await page.goto('/admin/pozicovna')
  expect(rentalResponse?.status()).toBe(200)
  expect(await rentalResponse?.text()).not.toContain('Admin login required')
  await expect(page.getByRole('heading', {
    name: 'Požičovňa a doplnky',
    exact: true,
  })).toBeVisible()
})
