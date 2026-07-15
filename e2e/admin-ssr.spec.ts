import { expect, test } from '@playwright/test'

test('admin rezervácie a požičovňa preposielajú session pri SSR', async ({ context, page }) => {
  await page.goto('/')
  await context.addCookies([{
    name: 'rybolov_cetin_mock_session',
    url: new URL('/', page.url()).href,
    value: 'manager',
  }])

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
