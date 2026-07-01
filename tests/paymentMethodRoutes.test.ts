import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import type { PaymentMethodStateResponse } from '~/app/services/paymentMethodService'
import adminPaymentMethodsGetHandler from '~/server/api/admin/payment-methods.get'
import publicPaymentMethodsGetHandler from '~/server/api/payment-methods.get'

const MANAGER_COOKIE = 'rybolov_cetin_mock_session=manager'

const localEnvKeys = [
  'RYBOLOV_LOCAL_PAYMENT_METHOD_STORE',
] as const

const originalEnv = new Map<string, string | undefined>()
let tempDir: string | undefined

interface TestRouteServer {
  baseUrl: string
  close: () => Promise<void>
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-payment-routes-'))

  for (const key of localEnvKeys) {
    if (!originalEnv.has(key)) {
      originalEnv.set(key, process.env[key])
    }
  }

  process.env.RYBOLOV_LOCAL_PAYMENT_METHOD_STORE = join(tempDir, 'payment-method-state.json')
})

afterEach(async () => {
  for (const key of localEnvKeys) {
    const original = originalEnv.get(key)

    if (original === undefined) {
      Reflect.deleteProperty(process.env, key)
    }
    else {
      process.env[key] = original
    }
  }

  if (tempDir) {
    await rm(tempDir, { force: true, recursive: true })
    tempDir = undefined
  }
})

function createPaymentMethodRouteServerApp() {
  const app = createApp()
  const router = createRouter()

  router.get('/api/payment-methods', publicPaymentMethodsGetHandler)
  router.get('/api/admin/payment-methods', adminPaymentMethodsGetHandler)
  app.use(router.handler)

  return app
}

async function startRouteServer(): Promise<TestRouteServer> {
  const server = createServer(toNodeListener(createPaymentMethodRouteServerApp()))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Testovací HTTP server nemá dostupný port.')
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  }
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function requestJson<T>(
  server: TestRouteServer,
  path: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')

  const response = await fetch(`${server.baseUrl}${path}`, {
    ...init,
    headers,
  })
  const raw = await response.text()
  const body = raw ? JSON.parse(raw) as T : null

  return {
    body,
    response,
  }
}

describe('payment method routes', () => {
  it('exposes only enabled payment methods publicly while admin sees the full list', async () => {
    const server = await startRouteServer()

    try {
      const publicResult = await requestJson<PaymentMethodStateResponse>(server, '/api/payment-methods')
      const adminResult = await requestJson<PaymentMethodStateResponse>(server, '/api/admin/payment-methods', {
        headers: {
          cookie: MANAGER_COOKIE,
        },
      })

      expect(publicResult.response.status).toBe(200)
      expect(publicResult.body?.paymentMethods.map((method) => method.id)).toEqual([
        'cash-on-site',
        'bank-transfer',
      ])
      expect(publicResult.body?.paymentMethods.some((method) => method.id === 'card-gateway')).toBe(false)

      expect(adminResult.response.status).toBe(200)
      expect(adminResult.body?.paymentMethods.map((method) => method.id)).toEqual([
        'cash-on-site',
        'bank-transfer',
        'card-gateway',
      ])
    }
    finally {
      await server.close()
    }
  })
})
