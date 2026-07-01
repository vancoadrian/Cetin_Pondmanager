import type { RentalBooking, Reservation } from '~/data/pond'

export type ReservationDecisionMode = 'approve' | 'call' | 'reject'

export interface ReservationWorkflowState {
  rentalBookings: RentalBooking[]
  reservations: Reservation[]
}

export interface ReservationDecisionInput {
  decisionMode: ReservationDecisionMode
  note: string
  reservationId: string
}

export interface ReservationDecisionResult extends ReservationWorkflowState {
  communicationDraft?: ReservationCommunicationDraft
  communicationDelivery?: ReservationCommunicationDeliveryLog
  message: string
  rentalStatus: RentalBooking['status']
  reservationStatus: Reservation['status']
}

export interface ReservationCommunicationDraft {
  callScript: string
  channel: 'email' | 'phone'
  emailBody?: string
  emailSubject: string
  emailTo?: string
  recipientName: string
  recipientPhone: string
  smsBody: string
}

export type ReservationCommunicationDeliveryProvider = 'disabled' | 'mock' | 'resend'
export type ReservationCommunicationDeliveryStatus = 'failed' | 'prepared' | 'sent' | 'skipped'

export interface ReservationCommunicationProviderConfig {
  apiKey?: string
  endpoint: string
  from: string
  provider: ReservationCommunicationDeliveryProvider
  replyTo?: string
}

export interface ReservationCommunicationDeliveryLog {
  channel: ReservationCommunicationDraft['channel']
  deliveredAt: string
  externalId?: string
  message: string
  provider: ReservationCommunicationDeliveryProvider
  recipient: string
  reservationId: string
  status: ReservationCommunicationDeliveryStatus
  subject?: string
}

export const reservationCommunicationDeliveryProviderLabels: Record<ReservationCommunicationDeliveryProvider, string> = {
  disabled: 'vypnuté',
  mock: 'draft',
  resend: 'Resend',
}

export const reservationCommunicationDeliveryStatusLabels: Record<ReservationCommunicationDeliveryStatus, string> = {
  failed: 'zlyhalo',
  prepared: 'pripravené',
  sent: 'odoslané',
  skipped: 'preskočené',
}

export function cloneReservationWorkflowState(
  reservations: Reservation[],
  rentalBookings: RentalBooking[],
): ReservationWorkflowState {
  return {
    reservations: reservations.map((reservation) => ({
      ...reservation,
      extraIds: [...reservation.extraIds],
      rentalIds: [...reservation.rentalIds],
    })),
    rentalBookings: rentalBookings.map((booking) => ({ ...booking })),
  }
}

export function getDefaultDecisionMode(reservation?: Reservation): ReservationDecisionMode {
  return reservation?.status === 'pending' ? 'approve' : 'call'
}

function resolveDecisionStatuses(decisionMode: ReservationDecisionMode) {
  if (decisionMode === 'approve') {
    return {
      rentalStatus: 'reserved' as const,
      reservationStatus: 'confirmed' as const,
    }
  }

  if (decisionMode === 'reject') {
    return {
      rentalStatus: 'cancelled' as const,
      reservationStatus: 'blocked' as const,
    }
  }

  return {
    rentalStatus: 'requested' as const,
    reservationStatus: 'pending' as const,
  }
}

function buildDecisionMessage(decisionMode: ReservationDecisionMode) {
  if (decisionMode === 'approve') {
    return 'Rezervácia je potvrdená a výbava je blokovaná.'
  }

  if (decisionMode === 'reject') {
    return 'Rezervácia je zamietnutá a výbava sa uvoľnila späť do skladu.'
  }

  return 'Rezervácia zostáva čakajúca na telefonát alebo úpravu.'
}

function formatReservationRange(reservation: Reservation) {
  return reservation.from === reservation.to
    ? reservation.from
    : `${reservation.from} až ${reservation.to}`
}

function buildGuestDecisionCopy(decisionMode: ReservationDecisionMode, reservation: Reservation) {
  const range = formatReservationRange(reservation)
  const location = `${reservation.lake}, miesto ${reservation.pegId}`

  if (decisionMode === 'approve') {
    return {
      lead: `vaša rezervácia na ${range} je potvrdená.`,
      subject: `Potvrdenie rezervácie ${range}`,
      text: `Dobrý deň, ${reservation.guest},\n\nvaša rezervácia v Rybolov Cetín je potvrdená.\nTermín: ${range}\nMiesto: ${location}\n\nPri príchode sa riaďte pokynmi správcu a zvoleným spôsobom platby.\n\nRybolov Cetín`,
    }
  }

  if (decisionMode === 'reject') {
    return {
      lead: `rezerváciu na ${range} v tomto termíne nevieme potvrdiť.`,
      subject: `Rezervácia ${range}`,
      text: `Dobrý deň, ${reservation.guest},\n\nrezerváciu v Rybolov Cetín na ${range} v tomto termíne nevieme potvrdiť.\nMiesto: ${location}\n\nSprávca vám môže ponúknuť najbližší vhodný termín alebo iné miesto.\n\nRybolov Cetín`,
    }
  }

  return {
    lead: `k rezervácii na ${range} potrebujeme doplniť detaily.`,
    subject: `Doplnenie rezervácie ${range}`,
    text: `Dobrý deň, ${reservation.guest},\n\nk rezervácii v Rybolov Cetín potrebujeme doplniť detaily.\nTermín: ${range}\nMiesto: ${location}\n\nSprávca vás bude kontaktovať telefonicky.\n\nRybolov Cetín`,
  }
}

export function buildReservationCommunicationDraft(
  reservation: Reservation,
  decisionMode: ReservationDecisionMode,
): ReservationCommunicationDraft {
  const copy = buildGuestDecisionCopy(decisionMode, reservation)
  const range = formatReservationRange(reservation)
  const smsBody = `Dobrý deň, ${reservation.guest}, ${copy.lead} Rybolov Cetín`

  return {
    callScript: `Zavolať ${reservation.guest} na ${reservation.contactPhone}. Overiť termín ${range}, miesto ${reservation.pegId}, povolenku ${reservation.permitId}, výbavu a doplnky. Výsledok: ${copy.lead}`,
    channel: reservation.contactEmail ? 'email' : 'phone',
    emailBody: reservation.contactEmail ? copy.text : undefined,
    emailSubject: `Rybolov Cetín: ${copy.subject}`,
    emailTo: reservation.contactEmail,
    recipientName: reservation.guest,
    recipientPhone: reservation.contactPhone,
    smsBody,
  }
}

function envValue(env: Record<string, string | undefined>, key: string) {
  return env[key]?.trim() || undefined
}

export function readReservationCommunicationProviderConfig(
  env: Record<string, string | undefined> = process.env,
): ReservationCommunicationProviderConfig {
  const provider = envValue(env, 'RYBOLOV_RESERVATION_DELIVERY_PROVIDER')
  const normalizedProvider: ReservationCommunicationDeliveryProvider =
    provider === 'disabled' || provider === 'resend' || provider === 'mock'
      ? provider
      : 'mock'

  return {
    apiKey: envValue(env, 'RYBOLOV_RESEND_API_KEY'),
    endpoint: envValue(env, 'RYBOLOV_RESEND_API_ENDPOINT') ?? 'https://api.resend.com/emails',
    from: envValue(env, 'RYBOLOV_RESERVATION_EMAIL_FROM') ?? 'Rybolov Cetín <rezervacie@rybolov-cetin.local>',
    provider: normalizedProvider,
    replyTo: envValue(env, 'RYBOLOV_RESERVATION_EMAIL_REPLY_TO'),
  }
}

function htmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#039;')
}

function emailBodyToHtml(bodyText: string) {
  return `<pre style="font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; white-space: pre-wrap;">${htmlEscape(bodyText)}</pre>`
}

function resendTagValue(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 256)
}

async function sendReservationViaResend(
  draft: ReservationCommunicationDraft,
  input: {
    decisionMode: ReservationDecisionMode
    reservationId: string
  },
  providerConfig: ReservationCommunicationProviderConfig,
  fetcher: typeof fetch,
) {
  if (!providerConfig.apiKey) {
    return {
      externalId: undefined,
      message: 'Chýba RYBOLOV_RESEND_API_KEY, potvrdenie rezervácie nebolo odoslané.',
      status: 'failed' as const,
    }
  }

  if (!draft.emailTo || !draft.emailBody) {
    return {
      externalId: undefined,
      message: 'Rezervácia nemá e-mail príjemcu, potvrdenie nebolo odoslané.',
      status: 'failed' as const,
    }
  }

  try {
    const response = await fetcher(providerConfig.endpoint, {
      body: JSON.stringify({
        from: providerConfig.from,
        html: emailBodyToHtml(draft.emailBody),
        reply_to: providerConfig.replyTo,
        subject: draft.emailSubject,
        tags: [
          {
            name: 'category',
            value: 'reservation_decision',
          },
          {
            name: 'reservation_id',
            value: resendTagValue(input.reservationId),
          },
          {
            name: 'decision_mode',
            value: input.decisionMode,
          },
        ],
        text: draft.emailBody,
        to: [draft.emailTo],
      }),
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `reservation-${input.reservationId}-${input.decisionMode}`,
      },
      method: 'POST',
    })
    const payload = await response.json().catch(() => undefined) as { id?: string, message?: string } | undefined

    if (!response.ok) {
      return {
        externalId: payload?.id,
        message: payload?.message ?? `Resend vrátil HTTP ${response.status}.`,
        status: 'failed' as const,
      }
    }

    return {
      externalId: payload?.id,
      message: 'Potvrdenie rezervácie bolo odoslané cez Resend.',
      status: 'sent' as const,
    }
  }
  catch (error) {
    return {
      externalId: undefined,
      message: error instanceof Error
        ? `Resend požiadavka zlyhala: ${error.message}`
        : 'Resend požiadavka zlyhala.',
      status: 'failed' as const,
    }
  }
}

export async function deliverReservationCommunicationDraft(
  draft: ReservationCommunicationDraft | undefined,
  input: {
    decisionMode: ReservationDecisionMode
    reservationId: string
  },
  providerConfig = readReservationCommunicationProviderConfig(),
  fetcher: typeof fetch = fetch,
  now = new Date().toISOString(),
): Promise<ReservationCommunicationDeliveryLog | undefined> {
  if (!draft) return undefined

  const baseLog = {
    channel: draft.channel,
    deliveredAt: now,
    provider: providerConfig.provider,
    recipient: draft.emailTo ?? draft.recipientPhone,
    reservationId: input.reservationId,
    subject: draft.emailTo ? draft.emailSubject : undefined,
  }

  if (!draft.emailTo || !draft.emailBody) {
    return {
      ...baseLog,
      message: 'Rezervácia nemá e-mail, pripravený je SMS alebo telefonický kontakt.',
      status: 'skipped',
    }
  }

  if (providerConfig.provider === 'disabled') {
    return {
      ...baseLog,
      message: 'Doručovanie potvrdení rezervácií je vypnuté, e-mail ostal iba ako draft.',
      status: 'skipped',
    }
  }

  if (providerConfig.provider === 'mock') {
    return {
      ...baseLog,
      message: 'Potvrdenie rezervácie je pripravené ako e-mailový draft.',
      status: 'prepared',
    }
  }

  const deliveryResult = await sendReservationViaResend(draft, input, providerConfig, fetcher)

  return {
    ...baseLog,
    externalId: deliveryResult.externalId,
    message: deliveryResult.message,
    status: deliveryResult.status,
  }
}

export function applyReservationDecision(
  state: ReservationWorkflowState,
  input: ReservationDecisionInput,
): ReservationDecisionResult {
  const reservation = state.reservations.find((item) => item.id === input.reservationId)
  const { rentalStatus, reservationStatus } = resolveDecisionStatuses(input.decisionMode)

  if (!reservation) {
    return {
      ...state,
      message: 'Rezervácia sa nenašla.',
      rentalStatus,
      reservationStatus,
    }
  }

  const note = input.note.trim() || reservation.internalNote
  const updatedReservation: Reservation = {
    ...reservation,
    internalNote: note,
    status: reservationStatus,
  }

  return {
    reservations: state.reservations.map((item) =>
      item.id === input.reservationId
        ? updatedReservation
        : item,
    ),
    rentalBookings: state.rentalBookings.map((booking) =>
      booking.reservationId === input.reservationId
        ? {
            ...booking,
            note,
            status: rentalStatus,
          }
        : booking,
    ),
    communicationDraft: buildReservationCommunicationDraft(updatedReservation, input.decisionMode),
    message: buildDecisionMessage(input.decisionMode),
    rentalStatus,
    reservationStatus,
  }
}
