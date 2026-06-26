import { describe, expect, it } from 'vitest'
import {
  cancelLargeFishAssistanceRequest,
  expireLargeFishAssistanceRequests,
  getLargeFishAssistanceRequest,
  respondToLargeFishAssistanceRequest,
  submitLargeFishAssistanceRequest,
  type LargeFishAssistanceState,
} from '~/app/services/largeFishAssistanceService'
import { createDefaultFishRegistrySettings } from '~/app/services/fishRegistryService'

const emptyState = (): LargeFishAssistanceState => ({ requests: [] })
const settingsWithPresence = () => {
  const settings = createDefaultFishRegistrySettings()
  settings.largeCatchRules = settings.largeCatchRules.map((rule) => ({
    ...rule,
    presenceOverride: {
      endsAt: '2026-06-22T15:00:00.000Z',
      setBy: 'Správca',
      startedAt: '2026-06-22T10:00:00.000Z',
    },
  }))
  return settings
}
const requestPayload = {
  anglerName: 'Marek H.',
  caughtAt: '2026-06-22T12:05:00.000Z',
  lake: 'velky-cetin',
  lengthCm: 101,
  note: '',
  pegId: 'vc-03',
  phone: '+421 900 111 222',
  species: 'Kapor',
  weightKg: 21.4,
}

describe('large fish assistance service', () => {
  it('creates a request only for an available manager and a fish over the lake threshold', () => {
    const created = submitLargeFishAssistanceRequest(
      requestPayload,
      emptyState(),
      settingsWithPresence(),
      'public-token',
      undefined,
      '2026-06-22T12:10:00.000Z',
    )

    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error('Request should be valid.')
    expect(created.request).toMatchObject({
      managerPhone: '0911 298 702',
      pegLabel: 'Chata 3',
      publicToken: 'public-token',
      status: 'waiting',
    })

    const belowThreshold = submitLargeFishAssistanceRequest(
      { ...requestPayload, weightKg: 17.9 },
      emptyState(),
      settingsWithPresence(),
      'other-token',
      undefined,
      '2026-06-22T12:10:00.000Z',
    )
    expect(belowThreshold.ok).toBe(false)
    if (belowThreshold.ok) throw new Error('Below-threshold request should fail.')
    expect(belowThreshold.messages[0]).toContain('od 18 kg')
  })

  it('lets the angler cancel an open request with the public token', () => {
    const created = submitLargeFishAssistanceRequest(
      requestPayload,
      emptyState(),
      settingsWithPresence(),
      'public-token',
      undefined,
      '2026-06-22T12:10:00.000Z',
    )
    if (!created.ok) throw new Error('Request should be valid.')

    const cancelled = cancelLargeFishAssistanceRequest(
      created.request.id,
      'public-token',
      created,
      '2026-06-22T12:13:00.000Z',
    )
    expect(cancelled.ok).toBe(true)
    if (!cancelled.ok) throw new Error('Cancellation should be valid.')
    expect(cancelled.request).toMatchObject({
      responseMessage: 'Rybár privolanie zrušil.',
      status: 'cancelled',
    })
  })

  it('expires stale waiting and overdue on-route requests', () => {
    const created = submitLargeFishAssistanceRequest(
      requestPayload,
      emptyState(),
      settingsWithPresence(),
      'public-token',
      undefined,
      '2026-06-22T12:10:00.000Z',
    )
    if (!created.ok) throw new Error('Request should be valid.')

    const expiredWaiting = expireLargeFishAssistanceRequests(
      created,
      '2026-06-22T12:41:00.000Z',
    )
    expect(expiredWaiting.requests[0]).toMatchObject({ status: 'expired' })

    const onRoute = respondToLargeFishAssistanceRequest(
      created.request.id,
      { action: 'on-route', etaMinutes: 15, responseMessage: '' },
      created,
      'Správca',
      '2026-06-22T12:12:00.000Z',
    )
    if (!onRoute.ok) throw new Error('Response should be valid.')
    const expiredOnRoute = expireLargeFishAssistanceRequests(
      onRoute,
      '2026-06-22T13:13:00.000Z',
    )
    expect(expiredOnRoute.requests[0]).toMatchObject({ status: 'expired' })
  })

  it('rejects a duplicate open request for the same place and phone', () => {
    const created = submitLargeFishAssistanceRequest(
      requestPayload,
      emptyState(),
      settingsWithPresence(),
      'public-token',
      undefined,
      '2026-06-22T12:10:00.000Z',
    )
    if (!created.ok) throw new Error('Request should be valid.')

    const duplicate = submitLargeFishAssistanceRequest(
      requestPayload,
      created,
      settingsWithPresence(),
      'second-token',
      undefined,
      '2026-06-22T12:11:00.000Z',
    )
    expect(duplicate.ok).toBe(false)
    if (duplicate.ok) throw new Error('Duplicate request should fail.')
    expect(duplicate.statusCode).toBe(409)
  })

  it('lets the manager answer with ETA and protects the public status by token', () => {
    const created = submitLargeFishAssistanceRequest(
      requestPayload,
      emptyState(),
      settingsWithPresence(),
      'public-token',
      undefined,
      '2026-06-22T12:10:00.000Z',
    )
    if (!created.ok) throw new Error('Request should be valid.')

    const response = respondToLargeFishAssistanceRequest(
      created.request.id,
      { action: 'on-route', etaMinutes: 15, responseMessage: '' },
      created,
      'Správca pri vode',
      '2026-06-22T12:12:00.000Z',
    )
    expect(response.ok).toBe(true)
    if (!response.ok) throw new Error('Response should be valid.')
    expect(response.request).toMatchObject({
      etaMinutes: 15,
      managerName: 'Správca pri vode',
      status: 'on-route',
    })
    expect(response.request.responseMessage).toContain('15 min')

    expect(getLargeFishAssistanceRequest(
      created.request.id,
      'wrong-token',
      response,
      '2026-06-22T12:13:00.000Z',
    ).ok).toBe(false)
    expect(getLargeFishAssistanceRequest(
      created.request.id,
      'public-token',
      response,
      '2026-06-22T12:13:00.000Z',
    )).toMatchObject({
      ok: true,
      request: { status: 'on-route' },
    })
  })
})
