import type { PaymentMethodStateResponse } from '~/services/paymentMethodService'
import { sortPaymentMethods } from '~/services/paymentMethodService'

interface UsePaymentMethodStateOptions {
  admin?: boolean
  key?: string
}

export async function usePaymentMethodState(options: UsePaymentMethodStateOptions = {}) {
  const { paymentMethods } = usePondData()
  const requestFetch = useRequestFetch()
  const endpoint = options.admin ? '/api/admin/payment-methods' : '/api/payment-methods'
  const fallbackPaymentMethodState = (): PaymentMethodStateResponse => ({
    ok: true,
    paymentMethods: sortPaymentMethods(paymentMethods),
    updatedAt: 'seed',
  })
  const asyncData = await useAsyncData<PaymentMethodStateResponse>(
    options.key ?? `${options.admin ? 'admin' : 'public'}-payment-method-state`,
    () => requestFetch<PaymentMethodStateResponse>(endpoint),
    {
      default: fallbackPaymentMethodState,
    },
  )
  const livePaymentMethods = computed(() =>
    sortPaymentMethods(asyncData.data.value?.paymentMethods ?? paymentMethods),
  )
  const enabledPaymentMethods = computed(() => livePaymentMethods.value.filter((method) => method.enabled))

  return {
    ...asyncData,
    enabledPaymentMethods,
    livePaymentMethods,
  }
}
