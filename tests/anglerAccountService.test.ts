import { describe, expect, it } from 'vitest'
import {
  findMockAnglerAccountByEmail,
  getMockAnglerAccountEmails,
  mockAnglerAccounts,
} from '~/app/services/anglerAccountService'

describe('angler account service', () => {
  it('resolves a mock angler account by primary email and verified aliases', () => {
    const marek = mockAnglerAccounts.find((account) => account.id === 'angler-marek')

    if (!marek) {
      throw new Error('Mock účet Marek H. chýba.')
    }

    expect(getMockAnglerAccountEmails(marek)).toContain('marek.h@example.com')
    expect(findMockAnglerAccountByEmail('  MAREK.H@EXAMPLE.COM  ')?.id).toBe('angler-marek')
    expect(findMockAnglerAccountByEmail('marek.horvath@example.test')?.id).toBe('angler-marek')
  })
})
