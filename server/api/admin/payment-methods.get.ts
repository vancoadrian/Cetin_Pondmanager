import { defineEventHandler } from 'h3'
import type { PaymentMethodStateResponse } from '~/services/paymentMethodService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { readLocalPaymentMethodState } from '../../utils/localPaymentMethodStore'

export default defineEventHandler(async (event): Promise<PaymentMethodStateResponse> => {
  requireAdminAccess(event, { moduleId: 'reservations' })

  const state = await readLocalPaymentMethodState()

  return {
    ok: true,
    paymentMethods: state.paymentMethods,
    updatedAt: state.updatedAt,
  }
})
