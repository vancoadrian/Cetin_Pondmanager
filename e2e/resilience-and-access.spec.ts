import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test'

const AVAILABLE_DATE_FROM = '2030-09-10'
const AVAILABLE_DATE_TO = '2030-09-11'
const RESERVATION_API_PATTERN = '**/api/reservations'

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

async function openReadyReservationForm(page: Page, contactName: string) {
  await page.goto(
    `/rezervacie?jazero=velky-cetin&miesto=vc-02&od=${AVAILABLE_DATE_FROM}&do=${AVAILABLE_DATE_TO}`,
  )
  await expect(page.getByRole('heading', { name: 'Žiadosť o rezerváciu', exact: true })).toBeVisible()
  await expect(page).toHaveURL((url) => url.searchParams.get('miesto') === 'vc-02')
  await expect(page.getByTestId('reservation-continue')).toBeVisible()

  await page.getByLabel('Meno', { exact: true }).fill(contactName)
  await page.getByLabel('E-mail', { exact: true }).fill('e2e.reservation@example.test')
  await page.getByLabel('Telefón', { exact: true }).fill('+421 900 555 123')
  await page.getByTestId('payment-method-cash-on-site').check()

  const submitButton = page.getByRole('button', { name: 'Odoslať žiadosť', exact: true })
  await expect(submitButton).toBeEnabled()

  return submitButton
}

async function getReservationQueueCount(page: Page) {
  return page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('rybolov-cetin-offline', 5)

    request.addEventListener('error', () => reject(request.error))
    request.addEventListener('upgradeneeded', () => {
      const database = request.result
      if (!database.objectStoreNames.contains('reservation-requests')) {
        database.createObjectStore('reservation-requests', { keyPath: 'id' })
      }
    })
    request.addEventListener('success', () => {
      const database = request.result
      const transaction = database.transaction('reservation-requests', 'readonly')
      const countRequest = transaction.objectStore('reservation-requests').count()

      countRequest.addEventListener('error', () => {
        database.close()
        reject(countRequest.error)
      })
      countRequest.addEventListener('success', () => {
        database.close()
        resolve(countRequest.result)
      })
    })
  }))
}

function reservationSuccessResponse() {
  return {
    message: 'Žiadosť je prijatá a čaká na potvrdenie správcom.',
    ok: true,
    rentalBookings: [],
    reservation: {
      contactEmail: 'e2e.reservation@example.test',
      contactPhone: '+421 900 555 123',
      extraIds: [],
      from: AVAILABLE_DATE_FROM,
      guest: 'E2E Offline Retry',
      id: 'e2e-offline-retry',
      internalNote: 'Synthetic Playwright response; it is never persisted.',
      lake: 'velky-cetin',
      paymentMethodId: 'cash-on-site',
      paymentStatus: 'unpaid',
      pegId: 'vc-02',
      permitId: 'permit-48h',
      rentalIds: [],
      source: 'web',
      status: 'pending',
      to: AVAILABLE_DATE_TO,
      type: 'weekend',
    },
    statusCode: 201,
  }
}

async function setSessionRole(context: BrowserContext, page: Page, role: string | null) {
  const origin = new URL(page.url()).origin

  // Dispose the current Nuxt app before changing cookies. Its useCookie refs can
  // otherwise race an externally injected cookie during fast role switches.
  await page.goto('about:blank')
  await context.clearCookies()
  if (!role) return

  await context.addCookies([{
    name: 'rybolov_cetin_mock_session',
    url: `${origin}/`,
    value: role,
  }])
}

function getAdminReservationsAs(page: Page, role?: string) {
  return page.request.get('/api/admin/reservations', {
    headers: role
      ? { cookie: `rybolov_cetin_mock_session=${role}` }
      : undefined,
  })
}

test('konflikt rezervácie zostane serverovou chybou a nevytvorí offline kópiu', async ({ page }) => {
  let submittedPayload: Record<string, unknown> | undefined

  await page.route(RESERVATION_API_PATTERN, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()

    submittedPayload = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      body: JSON.stringify({
        data: {
          messages: ['Vybrané miesto nie je v zvolenom termíne rezervovateľné.'],
        },
        statusCode: 422,
        statusMessage: 'Reservation request validation failed',
      }),
      contentType: 'application/json',
      status: 422,
    })
  })

  const submitButton = await openReadyReservationForm(page, 'E2E Konflikt')
  await submitButton.click()

  await expect(page.getByText('Žiadosť sa nepodarilo odoslať', { exact: true })).toBeVisible()
  await expect(page.getByText(
    'Vybrané miesto nie je v zvolenom termíne rezervovateľné.',
    { exact: true },
  )).toBeVisible()
  expect(submittedPayload).toMatchObject({
    dateFrom: AVAILABLE_DATE_FROM,
    dateTo: AVAILABLE_DATE_TO,
    lake: 'velky-cetin',
    pegId: 'vc-02',
  })
  await expect.poll(() => getReservationQueueCount(page)).toBe(0)
})

test('sieťová chyba uloží rezerváciu a manuálny retry vyprázdni offline frontu', async ({ page }) => {
  let postAttempt = 0

  await page.route(RESERVATION_API_PATTERN, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.continue()

    postAttempt += 1
    if (postAttempt === 1) return route.abort('failed')

    await route.fulfill({
      body: JSON.stringify(reservationSuccessResponse()),
      contentType: 'application/json',
      status: 201,
    })
  })

  const submitButton = await openReadyReservationForm(page, 'E2E Offline Retry')
  await submitButton.click()

  await expect(page.getByText('Žiadosť je uložená v zariadení', { exact: true })).toBeVisible()
  await expect(page.getByText(/Slabý signál: žiadosť je uložená/)).toBeVisible()
  await expect.poll(() => getReservationQueueCount(page)).toBe(1)

  await page.getByRole('button', { name: 'Odoslať ostatné', exact: true }).click()

  await expect(page.getByText('1 rezervácia bolo odoslaných správcovi.', { exact: true })).toBeVisible()
  await expect.poll(() => getReservationQueueCount(page)).toBe(0)
  expect(postAttempt).toBe(2)
})

test('zmena termínu okamžite prepočíta dostupnosť a zablokuje uzavretý termín', async ({ page }) => {
  await page.goto('/rezervacie?jazero=velky-cetin&miesto=vc-02&od=2026-08-10&do=2026-08-11')

  const dateFromInput = page.getByLabel('Od', { exact: true })
  const dateToInput = page.getByLabel('Do', { exact: true })
  await expect(page).toHaveURL((url) => url.searchParams.get('miesto') === 'vc-02')
  await expect(page.getByTestId('reservation-continue')).toBeVisible()

  await dateFromInput.fill('2026-08-21')
  await dateToInput.fill('2026-08-22')

  await expect(page.getByText('Vybrané miesto nie je voľné', { exact: true })).toBeVisible()
  await expect(page.getByText(/European Carp Cup Junior/).first()).toBeVisible()
  await expect(page.getByTestId('reservation-continue')).toHaveCount(0)

  await dateFromInput.fill('2026-08-26')
  await dateToInput.fill('2026-08-27')

  await expect(page.getByText('Vybrané miesto nie je voľné', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('reservation-continue')).toBeVisible()
})

test('route a API guardy presmerujú neprihláseného a obmedzia roly na ich pracoviská', async ({ context, page }) => {
  await page.goto('/')

  const unauthenticatedApi = await getAdminReservationsAs(page)
  expect(unauthenticatedApi.status()).toBe(401)
  await page.goto('/admin/rezervacie')
  await expect(page).toHaveURL((url) =>
    url.pathname === '/login' && url.searchParams.get('redirect') === '/admin/rezervacie',
  )

  await setSessionRole(context, page, 'angler-marek')
  const anglerApi = await getAdminReservationsAs(page, 'angler-marek')
  expect(anglerApi.status()).toBe(401)
  await page.goto('/admin/rezervacie')
  await expect(page).toHaveURL((url) => url.pathname === '/konto')

  await setSessionRole(context, page, 'team')
  await page.goto('/admin/sutaze')
  await expect(page).toHaveURL((url) => url.pathname === '/sutaze/tim')

  await setSessionRole(context, page, 'marshal')
  const marshalReservationApi = await getAdminReservationsAs(page, 'marshal')
  expect(marshalReservationApi.status()).toBe(403)
  await page.goto('/admin/rezervacie')
  await expect(page).toHaveURL((url) =>
    url.pathname === '/admin/sutaze/kontrolor' && url.searchParams.get('denied') === 'Rezervácie',
  )
  await expect(page.getByRole('heading', { name: /Panel kontrolóra/ })).toBeVisible()

  await setSessionRole(context, page, 'manager')
  const managerApi = await getAdminReservationsAs(page, 'manager')
  expect(managerApi.status()).toBe(200)
  await page.goto('/admin/rezervacie')
  await expect(page.getByRole('heading', { name: 'Rezervácie a dostupnosť', exact: true })).toBeVisible()
})
