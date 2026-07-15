import { expect, test } from '@playwright/test'

test('service worker poskytne samostatný offline fallback', async ({ context, page }) => {
  await page.goto('/')
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false

    const registration = await navigator.serviceWorker.ready
    return registration.active?.state === 'activated' && Boolean(navigator.serviceWorker.controller)
  })

  const availabilityResponse = await page.request.get('/api/reservations')
  expect(availabilityResponse.headers()['cache-control']).toContain('no-store')
  const availabilityJson = JSON.stringify(await availabilityResponse.json())
  expect(availabilityJson).not.toContain('contactPhone')
  expect(availabilityJson).not.toContain('internalNote')

  await page.goto('/info')
  await expect(page).toHaveURL((url) => url.pathname === '/info')
  await expect(page.getByRole('heading', {
    name: 'Pravidlá, cenník a výbava',
    exact: true,
  })).toBeVisible()

  await context.setOffline(true)
  try {
    await page.goto('/e2e-offline-probe', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL((url) => url.pathname === '/e2e-offline-probe')
    await expect(page.getByRole('heading', { name: 'Ste offline', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Skúsiť znova', exact: true })).toBeVisible()
  }
  finally {
    await context.setOffline(false)
  }
})
