import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import type {
  ReservationDecisionSuccess,
  ReservationStateResponse,
  ReservationSubmissionSuccess,
} from '~/app/services/reservationApiService'
import adminReservationPostHandler from '~/server/api/admin/reservations.post'
import adminReservationDecisionHandler from '~/server/api/admin/reservations/[id]/decision.post'
import reservationsGetHandler from '~/server/api/reservations.get'
import reservationPostHandler from '~/server/api/reservations.post'
import { readLocalAuditLogState } from '~/server/utils/localAuditLogStore'
import { readLocalReservationState } from '~/server/utils/localReservationStore'

const MANAGER_COOKIE = 'rybolov_cetin_mock_session=manager'
const ACCOUNTANT_COOKIE = 'rybolov_cetin_mock_session=accountant'

const localEnvKeys = [
  'RYBOLOV_LOCAL_AUDIT_LOG_STORE',
  'RYBOLOV_LOCAL_CABIN_CATALOG_STORE',
  'RYBOLOV_LOCAL_CLOSURE_STORE',
  'RYBOLOV_LOCAL_MAP_STORE',
  'RYBOLOV_LOCAL_PAYMENT_METHOD_STORE',
  'RYBOLOV_LOCAL_RENTAL_CATALOG_STORE',
  'RYBOLOV_LOCAL_RESERVATION_STORE',
] as const

const validPayload = {
  cabinProductId: 'client-value-is-derived-again-on-server',
  contactName: '  Ján Route  ',
  contactPhone: '+421 900 123 999',
  dateFrom: '2026-06-10',
  dateTo: '2026-06-12',
  extraIds: ['wood-crate'],
  lake: 'velky-cetin',
  pegId: 'vc-03',
  permitId: 'permit-48h',
  rentalIds: ['landing-net-rental', 'fish-cradle-rental'],
}

const originalEnv = new Map<string, string | undefined>()
let tempDir: string | undefined

interface TestRouteServer {
  baseUrl: string
  close: () => Promise<void>
}

interface ValidationErrorResponse {
  data: {
    messages: string[]
  }
  statusMessage: string
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-reservation-routes-'))

  for (const key of localEnvKeys) {
    if (!originalEnv.has(key)) {
      originalEnv.set(key, process.env[key])
    }
  }

  const dataDir = join(tempDir, 'data')
  process.env.RYBOLOV_LOCAL_AUDIT_LOG_STORE = join(dataDir, 'audit-log.json')
  process.env.RYBOLOV_LOCAL_CABIN_CATALOG_STORE = join(dataDir, 'cabin-catalog.json')
  process.env.RYBOLOV_LOCAL_CLOSURE_STORE = join(dataDir, 'closure-state.json')
  process.env.RYBOLOV_LOCAL_MAP_STORE = join(dataDir, 'map-state.json')
  process.env.RYBOLOV_LOCAL_PAYMENT_METHOD_STORE = join(dataDir, 'payment-method-state.json')
  process.env.RYBOLOV_LOCAL_RENTAL_CATALOG_STORE = join(dataDir, 'rental-catalog.json')
  process.env.RYBOLOV_LOCAL_RESERVATION_STORE = join(dataDir, 'reservation-state.json')
})

afterEach(async () => {
  for (const key of localEnvKeys) {
    const original = originalEnv.get(key)

    if (original === undefined) {
      Reflect.deleteProperty(process.env, key)
    }
    else {
      process.env[key] = original
    }
  }

  if (tempDir) {
    await rm(tempDir, { force: true, recursive: true })
    tempDir = undefined
  }
})

function createReservationRouteServerApp() {
  const app = createApp()
  const router = createRouter()

  router.get('/api/reservations', reservationsGetHandler)
  router.post('/api/reservations', reservationPostHandler)
  router.post('/api/admin/reservations', adminReservationPostHandler)
  router.post('/api/admin/reservations/:id/decision', adminReservationDecisionHandler)
  app.use(router.handler)

  return app
}

async function startRouteServer(): Promise<TestRouteServer> {
  const server = createServer(toNodeListener(createReservationRouteServerApp()))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Testovací HTTP server nemá dostupný port.')
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  }
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function requestJson<T>(
  server: TestRouteServer,
  path: string,
  init: RequestInit & { cookie?: string | null } = {},
) {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  if (init.cookie !== null) {
    headers.set('cookie', init.cookie ?? MANAGER_COOKIE)
  }

  const response = await fetch(`${server.baseUrl}${path}`, {
    ...init,
    headers,
  })
  const raw = await response.text()
  const body = raw ? JSON.parse(raw) as T : null

  return {
    body,
    raw,
    response,
  }
}

describe('reservation API routes', () => {
  it('returns the local reservation state from seed data', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<ReservationStateResponse>(server, '/api/reservations', {
        cookie: null,
      })

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.reservations.some((reservation) => reservation.id === 'r-1003')).toBe(true)
      expect(body.rentalBookings.some((booking) => booking.reservationId === 'r-1003')).toBe(true)
    }
    finally {
      await server.close()
    }
  })

  it('creates a public pending reservation, derives cabin data on server and writes an audit event', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<ReservationSubmissionSuccess>(server, '/api/reservations', {
        body: JSON.stringify(validPayload),
        cookie: null,
        method: 'POST',
      })

      expect(response.status).toBe(201)
      expect(body.ok).toBe(true)
      expect(body.reservation.status).toBe('pending')
      expect(body.reservation.source).toBe('web')
      expect(body.reservation.guest).toBe('Ján Route')
      expect(body.reservation.cabinProductId).toBe('large-cabin')
      expect(body.rentalBookings).toHaveLength(2)
      expect(body.rentalBookings.every((booking) => booking.status === 'requested')).toBe(true)

      const state = await readLocalReservationState()
      expect(state.reservations.find((reservation) => reservation.id === body.reservation.id)?.guest).toBe('Ján Route')
      expect(
        state.rentalBookings.filter((booking) => booking.reservationId === body.reservation.id),
      ).toHaveLength(2)

      const auditState = await readLocalAuditLogState()
      const event = auditState.events.find((item) => item.entityId === body.reservation.id)
      expect(event?.action).toBe('reservation.request.created')
      expect(event?.actorRole).toBe('angler')
      expect(event?.area).toBe('reservations')
    }
    finally {
      await server.close()
    }
  })

  it('rejects public reservations when the selected peg is unavailable', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<ValidationErrorResponse>(server, '/api/reservations', {
        body: JSON.stringify({
          ...validPayload,
          dateFrom: '2026-05-16',
          dateTo: '2026-05-18',
          pegId: 'vc-01',
        }),
        cookie: null,
        method: 'POST',
      })

      expect(response.status).toBe(422)
      expect(body.statusMessage).toBe('Reservation request validation failed')
      expect(body.data.messages).toContain('Vybrané miesto nie je v zvolenom termíne rezervovateľné.')
    }
    finally {
      await server.close()
    }
  })

  it('blocks admin reservation mutations for read-only reservation roles', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<{ data: { requiredMode: string, role: string } }>(
        server,
        '/api/admin/reservations',
        {
          body: JSON.stringify(validPayload),
          cookie: ACCOUNTANT_COOKIE,
          method: 'POST',
        },
      )

      expect(response.status).toBe(403)
      expect(body.data.role).toBe('accountant')
      expect(body.data.requiredMode).toBe('operate')
    }
    finally {
      await server.close()
    }
  })

  it('creates a confirmed phone reservation from admin and audits the manager action', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<ReservationSubmissionSuccess>(server, '/api/admin/reservations', {
        body: JSON.stringify({
          ...validPayload,
          contactName: 'Telefonická rezervácia',
          contactPhone: '+421 905 444 111',
          internalNote: 'Hosť volal správcovi a termín je potvrdený.',
          paymentMethodId: 'cash-on-site',
          source: 'phone',
          status: 'confirmed',
        }),
        method: 'POST',
      })

      expect(response.status).toBe(201)
      expect(body.ok).toBe(true)
      expect(body.reservation.status).toBe('confirmed')
      expect(body.reservation.source).toBe('phone')
      expect(body.reservation.paymentMethodId).toBe('cash-on-site')
      expect(body.reservation.paymentStatus).toBe('pending')
      expect(body.rentalBookings.every((booking) => booking.status === 'reserved')).toBe(true)

      const auditState = await readLocalAuditLogState()
      const event = auditState.events.find((item) => item.entityId === body.reservation.id)
      expect(event?.action).toBe('reservation.admin.created_confirmed')
      expect(event?.actorId).toBe('manager')
      expect(event?.severity).toBe('info')
    }
    finally {
      await server.close()
    }
  })

  it('approves a pending reservation through the admin decision route', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<ReservationDecisionSuccess>(
        server,
        '/api/admin/reservations/r-1003/decision',
        {
          body: JSON.stringify({
            decisionMode: 'approve',
            note: 'Potvrdené cez route test.',
          }),
          method: 'POST',
        },
      )

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.reservation.status).toBe('confirmed')
      expect(body.reservation.internalNote).toBe('Potvrdené cez route test.')
      expect(
        body.rentalBookings.find((booking) => booking.reservationId === 'r-1003')?.status,
      ).toBe('reserved')

      const state = await readLocalReservationState()
      expect(state.reservations.find((reservation) => reservation.id === 'r-1003')?.status).toBe('confirmed')

      const auditState = await readLocalAuditLogState()
      const event = auditState.events.find((item) => item.entityId === 'r-1003')
      expect(event?.action).toBe('reservation.decision.confirmed')
      expect(event?.actorId).toBe('manager')
    }
    finally {
      await server.close()
    }
  })

  it('returns a 404 validation response when deciding a missing reservation', async () => {
    const server = await startRouteServer()

    try {
      const { body, response } = await requestJson<ValidationErrorResponse>(
        server,
        '/api/admin/reservations/missing/decision',
        {
          body: JSON.stringify({
            decisionMode: 'approve',
            note: 'Test.',
          }),
          method: 'POST',
        },
      )

      expect(response.status).toBe(404)
      expect(body.statusMessage).toBe('Reservation decision validation failed')
      expect(body.data.messages).toContain('Rezervácia sa nenašla v lokálnom mock stave.')
    }
    finally {
      await server.close()
    }
  })
})
