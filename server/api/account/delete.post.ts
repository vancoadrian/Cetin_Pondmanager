import { createError, defineEventHandler, deleteCookie, readBody } from 'h3'
import { AUTH_SESSION_COOKIE, AUTH_USER_COOKIE } from '~/composables/useMockAuth'
import { getValidationMessages, accountDeletionPayloadSchema } from '~/schemas/pondSchemas'
import {
  ANONYMIZED_ANGLER_LABEL,
  anonymizeAccountData,
  type AccountDeletionResponse,
} from '~/services/accountDeletionService'
import { ANGLER_SESSION_COOKIE } from '~/services/anglerAccountService'
import { requireMockAnglerAccount } from '../../utils/anglerSession'
import { verifyAppUserPassword } from '../../utils/accountAuthentication'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import { markLocalAccountDeleted } from '../../utils/localAccountStore'
import { readLocalCatchState, writeLocalCatchState } from '../../utils/localCatchStore'
import { readLocalReservationState, writeLocalReservationState } from '../../utils/localReservationStore'

export default defineEventHandler(async (event): Promise<AccountDeletionResponse> => {
  const account = await requireMockAnglerAccount(event)
  const payload = accountDeletionPayloadSchema.safeParse(await readBody(event))
  if (!payload.success) {
    throw createError({
      data: { messages: getValidationMessages(payload) },
      statusCode: 422,
      statusMessage: 'Account deletion validation failed',
    })
  }

  if (!await verifyAppUserPassword(account.id, account.email, payload.data.password)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Aktuálne heslo nie je správne.',
    })
  }

  const [reservationState, catchState] = await Promise.all([
    readLocalReservationState(),
    readLocalCatchState(),
  ])
  const anonymized = anonymizeAccountData(account, reservationState, catchState)
  const deletedAt = new Date().toISOString()

  await writeLocalReservationState(anonymized.reservationState)
  await writeLocalCatchState(anonymized.catchState)
  await markLocalAccountDeleted({
    accountId: account.id,
    deletedAt,
    summary: anonymized.summary,
  })
  await appendLocalAuditEvent({
    action: 'account.deleted',
    actorId: account.id,
    actorLabel: ANONYMIZED_ANGLER_LABEL,
    actorRole: 'angler',
    area: 'accounts',
    details: { ...anonymized.summary },
    entityId: account.id,
    entityLabel: ANONYMIZED_ANGLER_LABEL,
    entityType: 'user_account',
    severity: 'warning',
    summary: 'Rybársky účet bol zmazaný a jeho prevádzkové záznamy anonymizované.',
  })

  deleteCookie(event, AUTH_SESSION_COOKIE, { path: '/' })
  deleteCookie(event, AUTH_USER_COOKIE, { path: '/' })
  deleteCookie(event, ANGLER_SESSION_COOKIE, { path: '/' })

  return {
    deletedAt,
    message: 'Účet bol zmazaný. Osobné väzby v prevádzkových záznamoch boli anonymizované.',
    ok: true,
    summary: anonymized.summary,
  }
})
