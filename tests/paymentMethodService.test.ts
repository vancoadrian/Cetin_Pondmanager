import { describe, expect, it } from 'vitest'
import { paymentMethods } from '~/app/data/pond'
import { updatePaymentMethodSettings } from '~/app/services/paymentMethodService'

describe('updatePaymentMethodSettings', () => {
  it('updates enabled payment methods while preserving method metadata', () => {
    const result = updatePaymentMethodSettings(
      {
        methods: [
          { enabled: false, id: 'cash-on-site' },
          { enabled: true, id: 'card-gateway' },
        ],
      },
      { paymentMethods },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Payment method update should be valid.')

    expect(result.statusCode).toBe(200)
    expect(result.paymentMethods.find((method) => method.id === 'cash-on-site')?.enabled).toBe(false)
    expect(result.paymentMethods.find((method) => method.id === 'card-gateway')?.enabled).toBe(true)
    expect(result.paymentMethods.find((method) => method.id === 'card-gateway')?.kind).toBe('card-gateway')
  })

  it('rejects disabling all payment methods', () => {
    const result = updatePaymentMethodSettings(
      {
        methods: paymentMethods.map((method) => ({ enabled: false, id: method.id })),
      },
      { paymentMethods },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('All payment methods disabled should be invalid.')

    expect(result.messages).toContain('Zapnite aspoň jednu platobnú metódu pre rezervácie.')
  })

  it('rejects unknown payment methods', () => {
    const result = updatePaymentMethodSettings(
      {
        methods: [{ enabled: true, id: 'unknown-method' }],
      },
      { paymentMethods },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Unknown payment method should be invalid.')

    expect(result.statusCode).toBe(404)
    expect(result.messages).toContain('Platobná metóda neexistuje: unknown-method.')
  })
})
