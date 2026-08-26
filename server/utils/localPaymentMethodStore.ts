import { join } from 'node:path'
import type { PaymentMethod } from '~/data/pond'
import { paymentMethods } from '~/data/pond'
import {
  sortPaymentMethods,
  type PaymentMethodWorkflowState,
} from '~/services/paymentMethodService'
import {
  guardCorruptRuntimeState,
  readRuntimeDocument,
  writeRuntimeDocument,
} from './runtimeStateStore'

export interface LocalPaymentMethodState extends PaymentMethodWorkflowState {
  updatedAt: string
  version: 1
}

const STORE_KEY = 'payment-method-state'

export function resolveLocalPaymentMethodStorePath() {
  return process.env.RYBOLOV_LOCAL_PAYMENT_METHOD_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'payment-method-state.json')
}

export function createSeedPaymentMethodState(updatedAt = new Date(0).toISOString()): LocalPaymentMethodState {
  return {
    paymentMethods: sortPaymentMethods(paymentMethods.map((method) => ({ ...method }))),
    updatedAt,
    version: 1,
  }
}

function isPaymentMethodState(value: unknown): value is LocalPaymentMethodState {
  const candidate = value as Partial<LocalPaymentMethodState>

  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.paymentMethods)
  )
}

export async function readLocalPaymentMethodState(
  filePath = resolveLocalPaymentMethodStorePath(),
): Promise<LocalPaymentMethodState> {
  const document = await readRuntimeDocument(STORE_KEY, filePath)

  if (document.found) {
    const parsed = document.payload
    if (isPaymentMethodState(parsed)) {
      return {
        ...parsed,
        paymentMethods: sortPaymentMethods(parsed.paymentMethods),
      }
    }
    guardCorruptRuntimeState(STORE_KEY)
  }

  const seedState = createSeedPaymentMethodState()
  await writeLocalPaymentMethodState(seedState, filePath)

  return seedState
}

export async function writeLocalPaymentMethodState(
  state: PaymentMethodWorkflowState,
  filePath = resolveLocalPaymentMethodStorePath(),
): Promise<LocalPaymentMethodState> {
  const nextState: LocalPaymentMethodState = {
    paymentMethods: sortPaymentMethods(state.paymentMethods.map((method: PaymentMethod) => ({ ...method }))),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  await writeRuntimeDocument(STORE_KEY, filePath, nextState)

  return nextState
}
