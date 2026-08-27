import { createError, defineEventHandler, readBody } from 'h3'
import { accountPasswordChangePayloadSchema, getValidationMessages } from '~/schemas/pondSchemas'
import type { AccountPasswordChangeResponse } from '~/services/accountSecurityService'
import { requireMockAnglerAccount } from '../../utils/anglerSession'
import {
  createPasswordHash,
  verifyAppUserPassword,
} from '../../utils/accountAuthentication'
import { clearSessionCookies } from '../../utils/appSession'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import { updateLocalAccountPassword } from '../../utils/localAccountStore'
import { destroyAllLocalSessionsForAccount } from '../../utils/localSessionStore'
import {
  ensureAuthUserWithPassword,
  isSupabaseAuthEnabled,
} from '../../utils/supabaseAuthIdentity'

export default defineEventHandler(async (event): Promise<AccountPasswordChangeResponse> => {
  const account = await requireMockAnglerAccount(event)
  const payload = accountPasswordChangePayloadSchema.safeParse(await readBody(event))
  if (!payload.success) {
    throw createError({
      data: { messages: getValidationMessages(payload) },
      statusCode: 422,
      statusMessage: 'Account password change validation failed',
    })
  }

  if (!await verifyAppUserPassword(account.id, account.email, payload.data.currentPassword)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Aktuálne heslo nie je správne.',
    })
  }

  const passwordHash = await createPasswordHash(payload.data.password)
  await updateLocalAccountPassword(account.id, passwordHash)
  if (isSupabaseAuthEnabled()) {
    // GoTrue je autorita pre prihlásenie — nové heslo musí platiť aj tam.
    await ensureAuthUserWithPassword(
      { accountId: account.id, email: account.email, role: 'angler' },
      payload.data.password,
    )
  }
  await appendLocalAuditEvent({
    action: 'account.password_changed',
    actorId: account.id,
    actorLabel: 'Rybársky účet',
    actorRole: 'angler',
    area: 'accounts',
    entityId: account.id,
    entityLabel: 'Rybársky účet',
    entityType: 'user_account',
    severity: 'info',
    summary: 'Používateľ zmenil heslo svojho účtu.',
  })

  await destroyAllLocalSessionsForAccount(account.id)
  clearSessionCookies(event)

  return {
    message: 'Heslo bolo zmenené. Prihláste sa novým heslom.',
    ok: true,
  }
})
