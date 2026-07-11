import { createError, defineEventHandler, deleteCookie, readBody } from 'h3'
import { AUTH_SESSION_COOKIE, AUTH_USER_COOKIE } from '~/composables/useMockAuth'
import { accountPasswordChangePayloadSchema, getValidationMessages } from '~/schemas/pondSchemas'
import type { AccountPasswordChangeResponse } from '~/services/accountSecurityService'
import { ANGLER_SESSION_COOKIE } from '~/services/anglerAccountService'
import { requireMockAnglerAccount } from '../../utils/anglerSession'
import {
  createPasswordHash,
  verifyAppUserPassword,
} from '../../utils/accountAuthentication'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import { updateLocalAccountPassword } from '../../utils/localAccountStore'

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

  deleteCookie(event, AUTH_SESSION_COOKIE, { path: '/' })
  deleteCookie(event, AUTH_USER_COOKIE, { path: '/' })
  deleteCookie(event, ANGLER_SESSION_COOKIE, { path: '/' })

  return {
    message: 'Heslo bolo zmenené. Prihláste sa novým heslom.',
    ok: true,
  }
})
