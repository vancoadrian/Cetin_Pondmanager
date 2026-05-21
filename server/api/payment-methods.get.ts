import { defineEventHandler } from 'h3'
import type { PaymentMethodStateResponse } from '~/services/paymentMethodService'
import { readLocalPaymentMethodState } from '../utils/localPaymentMethodStore'

export default defineEventHandler(async (): Promise<PaymentMethodStateResponse> => {
  const state = await readLocalPaymentMethodState()

  return {
    ok: true,
    paymentMethods: state.paymentMethods,
    updatedAt: state.updatedAt,
  }
})
