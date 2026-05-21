import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readLocalPaymentMethodState,
  writeLocalPaymentMethodState,
} from '~/server/utils/localPaymentMethodStore'

const tempDirs: string[] = []

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-payment-store-'))
  tempDirs.push(dir)

  return join(dir, 'payment-method-state.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localPaymentMethodStore', () => {
  it('creates a seed payment method state when the local JSON file does not exist yet', async () => {
    const filePath = await createStorePath()
    const state = await readLocalPaymentMethodState(filePath)
    const raw = await readFile(filePath, 'utf8')

    expect(state.version).toBe(1)
    expect(state.paymentMethods.length).toBeGreaterThan(0)
    expect(JSON.parse(raw)).toMatchObject({
      version: 1,
    })
  })

  it('persists enabled payment method updates', async () => {
    const filePath = await createStorePath()
    const seed = await readLocalPaymentMethodState(filePath)
    const updated = await writeLocalPaymentMethodState(
      {
        paymentMethods: seed.paymentMethods.map((method) =>
          method.id === 'card-gateway' ? { ...method, enabled: true } : method,
        ),
      },
      filePath,
    )
    const reread = await readLocalPaymentMethodState(filePath)

    expect(updated.paymentMethods.find((method) => method.id === 'card-gateway')?.enabled).toBe(true)
    expect(reread.paymentMethods.find((method) => method.id === 'card-gateway')?.enabled).toBe(true)
  })
})
