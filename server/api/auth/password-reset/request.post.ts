import { createError, defineEventHandler, getRequestURL, readBody } from 'h3'
import { findMockUserByEmail } from '~/composables/useMockAuth'
import { getValidationMessages, passwordResetRequestPayloadSchema } from '~/schemas/pondSchemas'
import {
  PASSWORD_RESET_REQUEST_MESSAGE,
  type PasswordResetRequestResponse,
} from '~/services/accountPasswordResetService'
import {
  createPasswordResetToken,
  createPasswordResetUrl,
  deliverPasswordResetEmail,
  readPasswordResetProviderConfig,
} from '../../../utils/accountPasswordReset'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import {
  discardLocalPasswordReset,
  findLocalRegisteredAccountByEmail,
  hasRecentLocalPasswordReset,
  saveLocalPasswordReset,
} from '../../../utils/localAccountStore'

const genericResponse: PasswordResetRequestResponse = {
  message: PASSWORD_RESET_REQUEST_MESSAGE,
  ok: true,
}

export default defineEventHandler(async (event): Promise<PasswordResetRequestResponse> => {
  const payload = passwordResetRequestPayloadSchema.safeParse(await readBody(event))
  if (!payload.success) {
    throw createError({
      data: { messages: getValidationMessages(payload) },
      statusCode: 422,
      statusMessage: 'Password reset request validation failed',
    })
  }

  const registeredAccount = await findLocalRegisteredAccountByEmail(payload.data.email)
  const mockUser = registeredAccount ? undefined : findMockUserByEmail(payload.data.email)
  const account = registeredAccount ?? (mockUser?.role === 'angler' ? mockUser : undefined)
  if (!account || await hasRecentLocalPasswordReset(account.id)) return genericResponse

  const providerConfig = readPasswordResetProviderConfig()
  const { reset, token } = createPasswordResetToken(account.id)
  const configuredSiteUrl = process.env.NUXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '')
  const siteUrl = configuredSiteUrl || getRequestURL(event).origin
  const resetUrl = createPasswordResetUrl(siteUrl, token)

  if (providerConfig.provider === 'resend') {
    await saveLocalPasswordReset(reset)
  }
  const delivery = await deliverPasswordResetEmail(account, resetUrl, reset.id, providerConfig)
  if (providerConfig.provider === 'resend' && delivery.status !== 'sent') {
    await discardLocalPasswordReset(reset.id)
  }

  await appendLocalAuditEvent({
    action: 'account.password_reset.requested',
    actorId: account.id,
    actorLabel: 'Rybársky účet',
    actorRole: 'angler',
    area: 'accounts',
    details: {
      deliveryProvider: delivery.provider,
      deliveryStatus: delivery.status,
    },
    entityId: account.id,
    entityLabel: 'Rybársky účet',
    entityType: 'user_account',
    severity: delivery.status === 'failed' ? 'warning' : 'info',
    summary: 'Používateľ požiadal o obnovu hesla.',
  })

  return genericResponse
})
