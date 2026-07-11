import { createError, defineEventHandler, deleteCookie, readBody } from 'h3'
import { AUTH_SESSION_COOKIE, AUTH_USER_COOKIE } from '~/composables/useMockAuth'
import { getValidationMessages, passwordResetConfirmPayloadSchema } from '~/schemas/pondSchemas'
import type { PasswordResetConfirmResponse } from '~/services/accountPasswordResetService'
import { ANGLER_SESSION_COOKIE } from '~/services/anglerAccountService'
import { createPasswordHash } from '../../../utils/accountAuthentication'
import { hashPasswordResetToken } from '../../../utils/accountPasswordReset'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import { completeLocalPasswordReset } from '../../../utils/localAccountStore'

export default defineEventHandler(async (event): Promise<PasswordResetConfirmResponse> => {
  const payload = passwordResetConfirmPayloadSchema.safeParse(await readBody(event))
  if (!payload.success) {
    throw createError({
      data: { messages: getValidationMessages(payload) },
      statusCode: 422,
      statusMessage: 'Password reset confirmation validation failed',
    })
  }

  const passwordHash = await createPasswordHash(payload.data.password)
  const completed = await completeLocalPasswordReset(
    hashPasswordResetToken(payload.data.token),
    passwordHash,
  )
  if (!completed) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Odkaz na obnovu hesla nie je platný alebo už vypršal.',
    })
  }

  await appendLocalAuditEvent({
    action: 'account.password_reset.completed',
    actorId: completed.accountId,
    actorLabel: 'Rybársky účet',
    actorRole: 'angler',
    area: 'accounts',
    entityId: completed.accountId,
    entityLabel: 'Rybársky účet',
    entityType: 'user_account',
    severity: 'info',
    summary: 'Používateľ úspešne obnovil heslo.',
  })

  deleteCookie(event, AUTH_SESSION_COOKIE, { path: '/' })
  deleteCookie(event, AUTH_USER_COOKIE, { path: '/' })
  deleteCookie(event, ANGLER_SESSION_COOKIE, { path: '/' })

  return {
    message: 'Heslo bolo obnovené. Prihláste sa novým heslom.',
    ok: true,
  }
})
