import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  updatePaymentMethodSettings,
  type PaymentMethodMutationSuccess,
} from '~/services/paymentMethodService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../utils/auditActor'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import {
  readLocalPaymentMethodState,
  writeLocalPaymentMethodState,
} from '../../utils/localPaymentMethodStore'

export default defineEventHandler(async (event): Promise<PaymentMethodMutationSuccess> => {
  requireAdminAccess(event, { moduleId: 'reservations', mode: 'operate' })

  const state = await readLocalPaymentMethodState()
  const result = updatePaymentMethodSettings(await readBody(event), state)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Payment method validation failed',
    })
  }

  const storedState = await writeLocalPaymentMethodState({
    paymentMethods: result.paymentMethods,
  })
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: 'payment_methods.updated',
    area: 'reservations',
    details: {
      disabledIds: storedState.paymentMethods.filter((method) => !method.enabled).map((method) => method.id),
      enabledIds: storedState.paymentMethods.filter((method) => method.enabled).map((method) => method.id),
    },
    entityId: 'payment-methods',
    entityLabel: 'Platobné metódy',
    entityType: 'payment_method_settings',
    severity: 'info',
    summary: 'Správca upravil zapnuté platobné metódy pre rezervácie.',
  })
  setResponseStatus(event, result.statusCode)

  return {
    ...result,
    paymentMethods: storedState.paymentMethods,
  }
})
