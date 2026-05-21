import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PaymentMethod } from '~/data/pond'
import { paymentMethods } from '~/data/pond'
import {
  sortPaymentMethods,
  type PaymentMethodWorkflowState,
} from '~/services/paymentMethodService'

export interface LocalPaymentMethodState extends PaymentMethodWorkflowState {
  updatedAt: string
  version: 1
}

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
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (isPaymentMethodState(parsed)) {
      return {
        ...parsed,
        paymentMethods: sortPaymentMethods(parsed.paymentMethods),
      }
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálny stav platieb: ${maybeNodeError.message}`)
    }
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

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')

  return nextState
}
