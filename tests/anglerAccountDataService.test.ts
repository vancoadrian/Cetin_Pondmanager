import { describe, expect, it } from 'vitest'
import {
  catches,
  catchPhotos,
  rentalBookings,
  reservations,
  tripLogbookEntries,
  tripLogbooks,
} from '~/app/data/pond'
import {
  createAccountDataExportFilename,
  createAnglerAccountDataExport,
} from '~/app/services/anglerAccountDataService'
import { mockAnglerAccounts } from '~/app/services/anglerAccountService'

describe('angler account data export', () => {
  it('exports only account-facing data and anonymizes other trip members', () => {
    const account = {
      ...mockAnglerAccounts[0]!,
      name: 'Marek Novák',
      nameAliases: ['Marek H.'],
      phone: '+421 900 123 456',
    }
    const payload = createAnglerAccountDataExport(
      account,
      { rentalBookings, reservations },
      { catches, catchPhotos, tripLogbookEntries, tripLogbooks },
      '2026-07-11T10:00:00.000Z',
    )

    expect(payload.account).toMatchObject({
      id: 'angler-marek',
      name: 'Marek Novák',
      nameAliases: ['Marek H.'],
      phone: '+421 900 123 456',
    })
    expect(payload.formatVersion).toBe(2)
    expect(payload.summary).toMatchObject({ logbooks: 1, reservations: 1 })
    expect(payload.reservations[0]).not.toHaveProperty('internalNote')
    expect(payload.tripLogbooks[0]).not.toHaveProperty('ownerUserId')
    expect(payload.tripLogbooks[0]?.members).toContainEqual(expect.objectContaining({
      isCurrentUser: true,
      name: 'Marek Novák',
    }))
    expect(payload.tripLogbooks[0]?.members).toContainEqual(expect.objectContaining({
      isCurrentUser: false,
      name: expect.stringMatching(/^Člen výpravy/),
    }))
    expect(payload.tripLogbookEntries.some((entry) => entry.angler === 'Člen výpravy')).toBe(true)

    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('Tomáš K.')
    expect(serialized).not.toContain('Lenka R.')
    expect(serialized).not.toContain('internalNote')
    expect(serialized).not.toContain('photoStoragePath')
    expect(serialized).not.toContain('reviewNote')
    expect(serialized).not.toContain('reviewedBy')
    expect(serialized).not.toContain('storagePath')
    expect(serialized).not.toContain('passwordHash')
    expect(serialized).not.toContain('tokenHash')
  })

  it('creates a predictable dated download filename', () => {
    expect(createAccountDataExportFilename('2026-07-11T10:00:00.000Z'))
      .toBe('rybolov-cetin-moje-udaje-2026-07-11.json')
  })
})
