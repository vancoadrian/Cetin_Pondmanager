import { createError, defineEventHandler, readBody } from 'h3'
import { getValidationMessages, accountDeletionPayloadSchema } from '~/schemas/pondSchemas'
import {
  ANONYMIZED_ANGLER_LABEL,
  anonymizeAccountData,
  type AccountDeletionResponse,
} from '~/services/accountDeletionService'
import { requireMockAnglerAccount } from '../../utils/anglerSession'
import { verifyAppUserPassword } from '../../utils/accountAuthentication'
import { clearSessionCookies } from '../../utils/appSession'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import { markLocalAccountDeleted } from '../../utils/localAccountStore'
import { readLocalCatchState, writeLocalCatchState } from '../../utils/localCatchStore'
import { readLocalReservationState, writeLocalReservationState } from '../../utils/localReservationStore'
import { destroyAllLocalSessionsForAccount } from '../../utils/localSessionStore'
import {
  deleteAuthUserByEmail,
  isSupabaseAuthEnabled,
} from '../../utils/supabaseAuthIdentity'

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
  if (isSupabaseAuthEnabled()) {
    // Bez GoTrue účtu sa zmazaný e-mail nedá prihlásiť; zlyhanie mazania
    // nesmie zablokovať lokálnu anonymizáciu (login aj tak blokuje deleted flag).
    await deleteAuthUserByEmail(account.email).catch((error: Error) => {
      console.warn(`Supabase Auth účet sa nepodarilo zmazať: ${error.message}`)
    })
  }
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

  await destroyAllLocalSessionsForAccount(account.id)
  clearSessionCookies(event)

  return {
    deletedAt,
    message: 'Účet bol zmazaný. Osobné väzby v prevádzkových záznamoch boli anonymizované.',
    ok: true,
    summary: anonymized.summary,
  }
})
