import { describe, expect, it } from 'vitest'
import { catches, tripLogbookEntries, tripLogbooks } from '~/app/data/pond'
import type { CatchWorkflowState } from '~/app/services/catchApiService'
import { submitCatchCorrection } from '~/app/services/catchCorrectionService'
import { resolveCatchWeatherSnapshot } from '~/app/services/catchWeatherService'

function createState(): CatchWorkflowState {
  const linkedCatch = catches.find((catchItem) => catchItem.id === 'c-2403')!
  const linkedEntry = {
    ...tripLogbookEntries[0]!,
    bait: linkedCatch.bait,
    catchId: linkedCatch.id,
    caughtAt: linkedCatch.caughtAt,
    lake: linkedCatch.lake,
    lengthCm: linkedCatch.lengthCm,
    pegId: linkedCatch.pegId,
    released: linkedCatch.released,
    species: linkedCatch.species,
    weightKg: linkedCatch.weightKg,
  }

  return {
    catchPhotos: [],
    catches: catches.map((catchItem) => ({ ...catchItem })),
    tripLogbookEntries: [
      linkedEntry,
      ...tripLogbookEntries.slice(1).map((entry) => ({ ...entry })),
    ],
    tripLogbooks: tripLogbooks.map((logbook) => ({
      ...logbook,
      members: logbook.members.map((member) => ({ ...member })),
      pegIds: [...logbook.pegIds],
    })),
  }
}

describe('catchCorrectionService', () => {
  it('updates catch fields and mirrors the linked logbook entry', () => {
    const result = submitCatchCorrection(
      {
        angler: 'Tím Junior A',
        bait: 'cesnak boilies 18 mm',
        catchId: 'c-2403',
        caughtAt: '2026-05-15T00:10',
        lake: 'velky-cetin',
        lengthCm: 76,
        notes: 'Správca opravil čas a nástrahu podľa fotky.',
        pegId: 'vc-04',
        released: true,
        species: 'Kapor',
        weightKg: 9.8,
      },
      createState(),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Catch correction should be valid.')

    expect(result.catch).toMatchObject({
      bait: 'cesnak boilies 18 mm',
      caughtAt: '2026-05-15T00:10',
      lengthCm: 76,
      notes: 'Správca opravil čas a nástrahu podľa fotky.',
      pegId: 'vc-04',
      weightKg: 9.8,
    })
    expect(result.catch.weather).toEqual(resolveCatchWeatherSnapshot({
      caughtAt: '2026-05-15T00:10',
      lake: 'velky-cetin',
      pegId: 'vc-04',
    }))
    expect(result.logbookEntry).toMatchObject({
      bait: 'cesnak boilies 18 mm',
      catchId: 'c-2403',
      lengthCm: 76,
      pegId: 'vc-04',
      weightKg: 9.8,
    })
  })

  it('rejects corrections that would move a linked catch outside its logbook', () => {
    const result = submitCatchCorrection(
      {
        angler: 'Tím Junior A',
        bait: 'krill dumbell',
        catchId: 'c-2403',
        caughtAt: '2026-05-14T23:25',
        lake: 'strkovisko-kocka',
        lengthCm: 74,
        notes: 'Pokús o presun mimo zápisníka.',
        pegId: 'sk-03',
        released: true,
        species: 'Kapor',
        weightKg: 9.4,
      },
      createState(),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Incompatible logbook correction should be invalid.')

    expect(result.messages[0]).toContain('pôvodného zápisníka')
  })

  it('moves a linked catch to another compatible logbook when requested', () => {
    const result = submitCatchCorrection(
      {
        angler: 'Tím Junior A',
        bait: 'kukurica + plávajúca pena',
        catchId: 'c-2403',
        caughtAt: '2026-05-15T19:20',
        lake: 'strkovisko-kocka',
        lengthCm: 86,
        logbookLinkMode: 'move',
        notes: 'Správca spojil úlovok so zápisníkom Kocka po práci.',
        pegId: 'sk-03',
        released: true,
        species: 'Amur',
        targetLogbookId: 'logbook-kocka-evening',
        weightKg: 12.1,
      },
      createState(),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Catch correction move should be valid.')

    expect(result.logbookEntry).toMatchObject({
      catchId: 'c-2403',
      lake: 'strkovisko-kocka',
      logbookId: 'logbook-kocka-evening',
      pegId: 'sk-03',
    })
    expect(result.tripLogbookEntries.filter((entry) => entry.catchId === 'c-2403')).toHaveLength(1)
    expect(result.message).toContain('KOCKA-1717')
  })

  it('detaches a linked catch from trip logbooks', () => {
    const result = submitCatchCorrection(
      {
        angler: 'Tím Junior A',
        bait: 'krill dumbell',
        catchId: 'c-2403',
        caughtAt: '2026-05-14T23:25',
        lake: 'velky-cetin',
        lengthCm: 74,
        logbookLinkMode: 'detach',
        notes: 'Úlovok nechávame ako samostatný verejný zápis.',
        pegId: 'vc-03',
        released: true,
        species: 'Kapor',
        weightKg: 9.4,
      },
      createState(),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Catch correction detach should be valid.')

    expect(result.logbookEntry).toBeUndefined()
    expect(result.tripLogbookEntries.some((entry) => entry.catchId === 'c-2403')).toBe(false)
    expect(result.message).toContain('odpojený')
  })

  it('returns a not found validation failure for unknown catches', () => {
    const result = submitCatchCorrection(
      {
        angler: 'Rybár',
        bait: 'boilies',
        catchId: 'missing-catch',
        caughtAt: '2026-05-14T23:25',
        lake: 'velky-cetin',
        lengthCm: 74,
        notes: '',
        pegId: 'vc-03',
        released: true,
        species: 'Kapor',
        weightKg: 9.4,
      },
      createState(),
    )

    expect(result).toEqual({
      messages: ['Úlovok sa nenašiel.'],
      ok: false,
      statusCode: 404,
    })
  })
})
