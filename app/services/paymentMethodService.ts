import type { PaymentMethod } from '~/data/pond'
import {
  getValidationMessages,
  paymentMethodSettingsInputSchema,
} from '~/schemas/pondSchemas'

export interface PaymentMethodValidationFailure {
  ok: false
  messages: string[]
  statusCode: 400 | 404 | 422
}

export interface PaymentMethodStateResponse {
  ok: true
  paymentMethods: PaymentMethod[]
  updatedAt: string
}

export interface PaymentMethodMutationSuccess {
  message: string
  ok: true
  paymentMethods: PaymentMethod[]
  statusCode: 200
}

export interface PaymentMethodWorkflowState {
  paymentMethods: PaymentMethod[]
}

export type PaymentMethodMutationResult = PaymentMethodValidationFailure | PaymentMethodMutationSuccess

function unique(values: string[]) {
  return [...new Set(values)]
}

function validationFailure(
  messages: string[],
  statusCode: PaymentMethodValidationFailure['statusCode'] = 422,
): PaymentMethodValidationFailure {
  return {
    ok: false,
    messages: unique(messages),
    statusCode,
  }
}

export function sortPaymentMethods(methods: PaymentMethod[]) {
  return [...methods].sort((first, second) => first.sortOrder - second.sortOrder)
}

export function updatePaymentMethodSettings(
  rawInput: unknown,
  state: PaymentMethodWorkflowState,
): PaymentMethodMutationResult {
  const payloadResult = paymentMethodSettingsInputSchema.safeParse(rawInput)
  if (!payloadResult.success) {
    return validationFailure(getValidationMessages(payloadResult))
  }

  const payload = payloadResult.data
  const seenIds = new Set<string>()
  const duplicateIds = payload.methods
    .map((method) => method.id)
    .filter((id) => {
      if (seenIds.has(id)) return true
      seenIds.add(id)
      return false
    })
  if (duplicateIds.length > 0) {
    return validationFailure(duplicateIds.map((id) => `Platobná metóda je v požiadavke duplicitne: ${id}.`))
  }

  const methodMap = new Map(state.paymentMethods.map((method) => [method.id, method]))
  const missingIds = payload.methods.filter((method) => !methodMap.has(method.id)).map((method) => method.id)
  if (missingIds.length > 0) {
    return validationFailure(missingIds.map((id) => `Platobná metóda neexistuje: ${id}.`), 404)
  }

  const updates = new Map(payload.methods.map((method) => [method.id, method.enabled]))
  const paymentMethods = sortPaymentMethods(
    state.paymentMethods.map((method) => ({
      ...method,
      enabled: updates.get(method.id) ?? method.enabled,
    })),
  )
  if (!paymentMethods.some((method) => method.enabled)) {
    return validationFailure(['Zapnite aspoň jednu platobnú metódu pre rezervácie.'])
  }

  return {
    message: 'Platobné metódy boli uložené do lokálneho stavu.',
    ok: true,
    paymentMethods,
    statusCode: 200,
  }
}
