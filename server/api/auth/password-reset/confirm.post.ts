import { createError, defineEventHandler, readBody } from 'h3'
import { getValidationMessages, passwordResetConfirmPayloadSchema } from '~/schemas/pondSchemas'
import type { PasswordResetConfirmResponse } from '~/services/accountPasswordResetService'
import { createPasswordHash } from '../../../utils/accountAuthentication'
import { clearSessionCookies } from '../../../utils/appSession'
import { hashPasswordResetToken } from '../../../utils/accountPasswordReset'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import { mockUsers } from '~/composables/useMockAuth'
import {
  completeLocalPasswordReset,
  findLocalRegisteredAccountById,
} from '../../../utils/localAccountStore'
import { destroyAllLocalSessionsForAccount } from '../../../utils/localSessionStore'
import {
  ensureAuthUserWithPassword,
  isSupabaseAuthEnabled,
} from '../../../utils/supabaseAuthIdentity'

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

  if (isSupabaseAuthEnabled()) {
    // Obnovené heslo musí platiť aj v GoTrue, ktoré je autoritou pre login.
    const mockUser = mockUsers.find((user) => user.id === completed.accountId)
    const registeredAccount = mockUser
      ? undefined
      : await findLocalRegisteredAccountById(completed.accountId)
    const identity = mockUser
      ? { accountId: mockUser.id, email: mockUser.email, role: mockUser.role }
      : registeredAccount
        ? { accountId: registeredAccount.id, email: registeredAccount.email, role: 'angler' }
        : undefined
    if (identity) {
      await ensureAuthUserWithPassword(identity, payload.data.password)
    }
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

  await destroyAllLocalSessionsForAccount(completed.accountId)
  clearSessionCookies(event)

  return {
    message: 'Heslo bolo obnovené. Prihláste sa novým heslom.',
    ok: true,
  }
})
