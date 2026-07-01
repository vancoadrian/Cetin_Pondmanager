import { describe, expect, it } from 'vitest'
import type { RentalBooking, Reservation } from '~/app/data/pond'
import {
  applyReservationDecision,
  cloneReservationWorkflowState,
  deliverReservationCommunicationDraft,
  getDefaultDecisionMode,
  readReservationCommunicationProviderConfig,
} from '~/app/services/reservationWorkflowService'

const reservation = (overrides: Partial<Reservation> = {}): Reservation => ({
  id: 'reservation-1',
  lake: 'velky-cetin',
  pegId: 'peg-1',
  guest: 'Testovací hosť',
  contactEmail: 'host@example.com',
  contactPhone: '+421 900 000 000',
  from: '2026-06-10',
  to: '2026-06-12',
  type: 'weekend',
  status: 'pending',
  permitId: 'permit-48h',
  rentalIds: ['landing-net'],
  extraIds: ['wood-crate'],
  internalNote: 'Pôvodná poznámka.',
  source: 'web',
  ...overrides,
})

const rentalBooking = (overrides: Partial<RentalBooking> = {}): RentalBooking => ({
  id: 'rental-booking-1',
  reservationId: 'reservation-1',
  rentalItemId: 'landing-net',
  lake: 'velky-cetin',
  from: '2026-06-10',
  to: '2026-06-12',
  quantity: 1,
  status: 'requested',
  note: 'Pôvodná poznámka.',
  ...overrides,
})

describe('reservationWorkflowService', () => {
  it('uses approve as the default only for pending reservations', () => {
    expect(getDefaultDecisionMode(reservation({ status: 'pending' }))).toBe('approve')
    expect(getDefaultDecisionMode(reservation({ status: 'confirmed' }))).toBe('call')
    expect(getDefaultDecisionMode()).toBe('call')
  })

  it('clones mutable reservation arrays before admin workflow edits', () => {
    const sourceReservation = reservation()
    const state = cloneReservationWorkflowState([sourceReservation], [rentalBooking()])

    state.reservations[0]!.rentalIds.push('fish-cradle')
    state.reservations[0]!.extraIds.push('grill')

    expect(sourceReservation.rentalIds).toEqual(['landing-net'])
    expect(sourceReservation.extraIds).toEqual(['wood-crate'])
  })

  it('approves reservations and reserves requested rental equipment', () => {
    const result = applyReservationDecision(
      {
        reservations: [reservation()],
        rentalBookings: [rentalBooking()],
      },
      {
        reservationId: 'reservation-1',
        decisionMode: 'approve',
        note: '  Potvrdené telefonicky.  ',
      },
    )

    expect(result.reservationStatus).toBe('confirmed')
    expect(result.rentalStatus).toBe('reserved')
    expect(result.reservations[0]?.status).toBe('confirmed')
    expect(result.reservations[0]?.internalNote).toBe('Potvrdené telefonicky.')
    expect(result.rentalBookings[0]?.status).toBe('reserved')
    expect(result.rentalBookings[0]?.note).toBe('Potvrdené telefonicky.')
    expect(result.communicationDraft).toMatchObject({
      channel: 'email',
      emailSubject: 'Rybolov Cetín: Potvrdenie rezervácie 2026-06-10 až 2026-06-12',
      emailTo: 'host@example.com',
      recipientPhone: '+421 900 000 000',
    })
    expect(result.communicationDraft?.smsBody).toContain('je potvrdená')
  })

  it('rejects reservations and releases rental equipment', () => {
    const result = applyReservationDecision(
      {
        reservations: [reservation()],
        rentalBookings: [rentalBooking()],
      },
      {
        reservationId: 'reservation-1',
        decisionMode: 'reject',
        note: 'Kapacita je blokovaná pre servis.',
      },
    )

    expect(result.reservations[0]?.status).toBe('blocked')
    expect(result.rentalBookings[0]?.status).toBe('cancelled')
    expect(result.communicationDraft?.smsBody).toContain('nevieme potvrdiť')
    expect(result.message).toContain('zamietnutá')
  })

  it('keeps call decisions pending and preserves old notes when the input note is empty', () => {
    const result = applyReservationDecision(
      {
        reservations: [reservation()],
        rentalBookings: [rentalBooking()],
      },
      {
        reservationId: 'reservation-1',
        decisionMode: 'call',
        note: '   ',
      },
    )

    expect(result.reservations[0]?.status).toBe('pending')
    expect(result.reservations[0]?.internalNote).toBe('Pôvodná poznámka.')
    expect(result.rentalBookings[0]?.status).toBe('requested')
    expect(result.rentalBookings[0]?.note).toBe('Pôvodná poznámka.')
    expect(result.communicationDraft?.smsBody).toContain('potrebujeme doplniť detaily')
  })

  it('falls back to phone communication when reservation email is missing', () => {
    const result = applyReservationDecision(
      {
        reservations: [reservation({ contactEmail: undefined })],
        rentalBookings: [rentalBooking()],
      },
      {
        reservationId: 'reservation-1',
        decisionMode: 'approve',
        note: 'Potvrdené.',
      },
    )

    expect(result.communicationDraft).toMatchObject({
      channel: 'phone',
      emailTo: undefined,
      recipientPhone: '+421 900 000 000',
    })
  })

  it('parses reservation communication provider configuration from env', () => {
    expect(readReservationCommunicationProviderConfig({
      RYBOLOV_RESEND_API_ENDPOINT: 'https://api.resend.test/emails',
      RYBOLOV_RESEND_API_KEY: 're_reservation',
      RYBOLOV_RESERVATION_DELIVERY_PROVIDER: 'resend',
      RYBOLOV_RESERVATION_EMAIL_FROM: 'Rybolov <rezervacie@example.test>',
      RYBOLOV_RESERVATION_EMAIL_REPLY_TO: 'spravca@example.test',
    })).toEqual({
      apiKey: 're_reservation',
      endpoint: 'https://api.resend.test/emails',
      from: 'Rybolov <rezervacie@example.test>',
      provider: 'resend',
      replyTo: 'spravca@example.test',
    })

    expect(readReservationCommunicationProviderConfig({
      RYBOLOV_RESERVATION_DELIVERY_PROVIDER: 'unknown',
    }).provider).toBe('mock')
  })

  it('prepares a mock delivery log for reservation e-mail drafts', async () => {
    const decision = applyReservationDecision(
      {
        reservations: [reservation()],
        rentalBookings: [rentalBooking()],
      },
      {
        reservationId: 'reservation-1',
        decisionMode: 'approve',
        note: 'Potvrdené.',
      },
    )
    const delivery = await deliverReservationCommunicationDraft(decision.communicationDraft, {
      decisionMode: 'approve',
      reservationId: 'reservation-1',
    }, {
      endpoint: 'https://api.resend.test/emails',
      from: 'Rybolov <rezervacie@example.test>',
      provider: 'mock',
    }, fetch, '2026-06-01T10:00:00.000Z')

    expect(delivery).toMatchObject({
      deliveredAt: '2026-06-01T10:00:00.000Z',
      message: 'Potvrdenie rezervácie je pripravené ako e-mailový draft.',
      provider: 'mock',
      recipient: 'host@example.com',
      status: 'prepared',
    })
  })

  it('skips delivery when reservation e-mail is missing', async () => {
    const decision = applyReservationDecision(
      {
        reservations: [reservation({ contactEmail: undefined })],
        rentalBookings: [rentalBooking()],
      },
      {
        reservationId: 'reservation-1',
        decisionMode: 'approve',
        note: 'Potvrdené.',
      },
    )
    const delivery = await deliverReservationCommunicationDraft(decision.communicationDraft, {
      decisionMode: 'approve',
      reservationId: 'reservation-1',
    }, {
      endpoint: 'https://api.resend.test/emails',
      from: 'Rybolov <rezervacie@example.test>',
      provider: 'resend',
    }, fetch, '2026-06-01T10:00:00.000Z')

    expect(delivery).toMatchObject({
      channel: 'phone',
      message: 'Rezervácia nemá e-mail, pripravený je SMS alebo telefonický kontakt.',
      recipient: '+421 900 000 000',
      status: 'skipped',
    })
  })

  it('sends reservation decision e-mail through Resend when configured', async () => {
    const decision = applyReservationDecision(
      {
        reservations: [reservation()],
        rentalBookings: [rentalBooking()],
      },
      {
        reservationId: 'reservation-1',
        decisionMode: 'approve',
        note: 'Potvrdené.',
      },
    )
    const requests: Array<{ headers: Headers, payload: Record<string, unknown>, url: string }> = []
    const fakeFetch: typeof fetch = async (input, init) => {
      requests.push({
        headers: new Headers(init?.headers),
        payload: JSON.parse(String(init?.body)) as Record<string, unknown>,
        url: String(input),
      })

      return new Response(JSON.stringify({ id: 'reservation-resend-id' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }
    const delivery = await deliverReservationCommunicationDraft(decision.communicationDraft, {
      decisionMode: 'approve',
      reservationId: 'reservation-1',
    }, {
      apiKey: 're_reservation',
      endpoint: 'https://api.resend.test/emails',
      from: 'Rybolov <rezervacie@example.test>',
      provider: 'resend',
      replyTo: 'spravca@example.test',
    }, fakeFetch, '2026-06-01T10:00:00.000Z')

    expect(delivery).toMatchObject({
      externalId: 'reservation-resend-id',
      message: 'Potvrdenie rezervácie bolo odoslané cez Resend.',
      provider: 'resend',
      status: 'sent',
    })
    expect(requests[0]?.url).toBe('https://api.resend.test/emails')
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer re_reservation')
    expect(requests[0]?.headers.get('Idempotency-Key')).toBe('reservation-reservation-1-approve')
    expect(requests[0]?.payload).toMatchObject({
      from: 'Rybolov <rezervacie@example.test>',
      reply_to: 'spravca@example.test',
      subject: 'Rybolov Cetín: Potvrdenie rezervácie 2026-06-10 až 2026-06-12',
      text: expect.stringContaining('vaša rezervácia v Rybolov Cetín je potvrdená'),
      to: ['host@example.com'],
    })
  })

  it('records a failed reservation delivery when Resend key is missing', async () => {
    const decision = applyReservationDecision(
      {
        reservations: [reservation()],
        rentalBookings: [rentalBooking()],
      },
      {
        reservationId: 'reservation-1',
        decisionMode: 'approve',
        note: 'Potvrdené.',
      },
    )
    const delivery = await deliverReservationCommunicationDraft(decision.communicationDraft, {
      decisionMode: 'approve',
      reservationId: 'reservation-1',
    }, {
      endpoint: 'https://api.resend.test/emails',
      from: 'Rybolov <rezervacie@example.test>',
      provider: 'resend',
    }, fetch, '2026-06-01T10:00:00.000Z')

    expect(delivery).toMatchObject({
      message: 'Chýba RYBOLOV_RESEND_API_KEY, potvrdenie rezervácie nebolo odoslané.',
      provider: 'resend',
      status: 'failed',
    })
  })

  it('returns a friendly message when the reservation does not exist', () => {
    const state = {
      reservations: [reservation()],
      rentalBookings: [rentalBooking()],
    }
    const result = applyReservationDecision(state, {
      reservationId: 'missing-reservation',
      decisionMode: 'approve',
      note: 'Test.',
    })

    expect(result.message).toContain('nenašla')
    expect(result.reservations).toBe(state.reservations)
    expect(result.rentalBookings).toBe(state.rentalBookings)
  })
})
