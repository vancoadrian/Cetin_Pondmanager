import { expect, test, type Page } from '@playwright/test'

const AVAILABLE_DATE_FROM = '2030-07-15'
const AVAILABLE_DATE_TO = '2030-07-16'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('rybolov-cetin-install-dismissed-at', String(Date.now()))
    }
    catch {
      // The first about:blank document has no storage access; the app origin does.
    }
  })
})

async function selectStableAvailabilityRange(page: Page) {
  const dateFromInput = page.getByLabel('Od', { exact: true })
  const dateToInput = page.getByLabel('Do', { exact: true })
  await page.waitForLoadState('networkidle')

  const mobileChangeButton = page.getByRole('button', { name: 'Zmeniť', exact: true })
  if (await mobileChangeButton.isVisible()) {
    await expect(async () => {
      if (!await dateFromInput.isVisible()) {
        await mobileChangeButton.click()
      }
      await expect(dateFromInput).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 10_000 })
  }

  await expect(dateFromInput).toBeVisible()
  await expect(dateToInput).toBeVisible()
  await dateFromInput.fill(AVAILABLE_DATE_FROM)
  await dateToInput.fill(AVAILABLE_DATE_TO)

  await expect.poll(() => new URL(page.url()).searchParams.get('od')).toBe(AVAILABLE_DATE_FROM)
  await expect.poll(() => new URL(page.url()).searchParams.get('do')).toBe(AVAILABLE_DATE_TO)
}

test('výber jazera vedie cez mapu k predvyplnenej rezervácii', async ({ page }) => {
  await page.goto('/reviry')

  const lakeCard = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Štrkovisko Kocka', exact: true }),
  })
  await lakeCard.getByRole('link', { name: 'Mapa', exact: true }).click()

  await expect(page).toHaveURL((url) =>
    url.pathname === '/mapa' && url.searchParams.get('jazero') === 'strkovisko-kocka',
  )
  await selectStableAvailabilityRange(page)

  const firstFreeButton = page.getByRole('button', { name: 'Vybrať prvé voľné', exact: true })
  await expect(firstFreeButton).toBeVisible()
  await firstFreeButton.click()

  const reservationLink = page.getByRole('link', {
    name: 'Rezervovať vybrané miesto',
    exact: true,
  }).first()
  await expect(reservationLink).toBeVisible()
  await reservationLink.click()

  await expect(page).toHaveURL((url) =>
    url.pathname === '/rezervacie'
    && url.searchParams.get('jazero') === 'strkovisko-kocka'
    && Boolean(url.searchParams.get('miesto'))
    && url.searchParams.get('od') === AVAILABLE_DATE_FROM
    && url.searchParams.get('do') === AVAILABLE_DATE_TO,
  )
  await expect(page.getByRole('heading', { name: 'Žiadosť o rezerváciu', exact: true })).toBeVisible()
  await expect(page.getByText('Vyberte miesto', { exact: true })).toHaveCount(0)
})

test('priama rezervácia nemá tiché predvoľby miesta, výbavy ani platby', async ({ page }) => {
  await page.goto('/rezervacie')
  await expect(page.getByRole('heading', { name: 'Žiadosť o rezerváciu', exact: true })).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('jazero')).toBe('velky-cetin')

  const url = new URL(page.url())
  for (const key of ['miesto', 'vybava', 'doplnok', 'chata', 'typ']) {
    expect(url.searchParams.get(key), `${key} nemá byť predvolené`).toBeNull()
  }

  await expect(page.getByText('Vyberte miesto', { exact: true }).first()).toBeVisible()
  await expect(page.locator('input[name="payment-method"]:checked')).toHaveCount(0)
  await expect(page.locator('input[name="payment-method"]').first()).toHaveAttribute('required', '')
  await expect(page.locator('input[type="checkbox"][value]:checked')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Odoslať žiadosť', exact: true })).toBeDisabled()
})

test('rybár sa prihlási e-mailom a heslom', async ({ page }) => {
  await page.goto('/login')

  await page.getByLabel('E-mail', { exact: true }).fill('marek.horvath@example.test')
  await page.getByLabel('Heslo', { exact: true }).fill('Cetin2026!')
  await page.getByRole('button', { name: 'Prihlásiť sa', exact: true }).click()

  await expect(page).toHaveURL((url) => url.pathname === '/konto')
  await expect(page.getByRole('heading', { name: 'Môj účet', exact: true })).toBeVisible()
})

test('zápisník sa otvorí cez zdieľaný kód', async ({ page }) => {
  await page.goto('/ulovky')

  const codeInput = page.getByPlaceholder('CETIN-...', { exact: true })
  await codeInput.fill('CETIN-3MAY')
  await codeInput.locator('..').getByRole('button', { name: 'Otvoriť', exact: true }).click()

  await expect(page.getByRole('heading', {
    name: 'Chata 3 - májová výprava',
    exact: true,
  })).toBeVisible()
  await expect(page.getByText('CETIN-3MAY', { exact: true }).first()).toBeVisible()
})
