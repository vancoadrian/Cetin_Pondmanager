import { describe, expect, it } from 'vitest'
import { catches, tripLogbookEntries, tripLogbooks } from '~/app/data/pond'
import {
  submitCatchRecord,
  submitTripLogbook,
  type CatchWorkflowState,
} from '~/app/services/catchApiService'

const createState = (): CatchWorkflowState => ({
  catchPhotos: [],
  catches: catches.map((catchItem) => ({ ...catchItem })),
  tripLogbookEntries: tripLogbookEntries.map((entry) => ({ ...entry })),
  tripLogbooks: tripLogbooks.map((logbook) => ({
    ...logbook,
    members: logbook.members.map((member) => ({ ...member })),
    pegIds: [...logbook.pegIds],
  })),
})

describe('catchApiService', () => {
  it('creates a local group logbook with share code and members', () => {
    const result = submitTripLogbook(
      {
        lake: 'velky-cetin',
        memberNames: ['Marek H.', 'Tomáš K.'],
        mode: 'group',
        pegIds: ['vc-03'],
        title: 'Chata 3 test',
      },
      createState(),
      undefined,
      '2026-05-17T10:00:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Logbook should be valid.')

    expect(result.logbook.status).toBe('active')
    expect(result.logbook.owner).toBe('Marek H.')
    expect(result.logbook.members).toHaveLength(2)
    expect(result.logbook.members[0]?.role).toBe('owner')
    expect(result.logbook.shareCode).toMatch(/^CETIN-CHAT-[2-9A-HJ-NP-Z]{6}$/)
  })

  it('retries share code generation when a random suffix collides', () => {
    const state = createState()
    state.tripLogbooks.push({
      ...state.tripLogbooks[0]!,
      id: 'logbook-random-collision',
      shareCode: 'CETIN-CHAT-ABC123',
      title: 'Chata collision',
    })
    const randomParts = ['abc-123', 'def456']
    const result = submitTripLogbook(
      {
        lake: 'velky-cetin',
        memberNames: ['Marek H.', 'Tomáš K.'],
        mode: 'group',
        pegIds: ['vc-03'],
        title: 'Chata 3 test',
      },
      state,
      undefined,
      '2026-05-17T10:00:00.000Z',
      () => randomParts.shift() ?? 'zzz999',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Logbook should be valid.')

    expect(result.logbook.shareCode).toBe('CETIN-CHAT-DEF456')
  })

  it('stores a catch and links it to a compatible active logbook', () => {
    const result = submitCatchRecord(
      {
        angler: 'Tomáš K.',
        bait: 'krill dumbell',
        caughtAt: '2026-05-17T18:30',
        lake: 'velky-cetin',
        lengthCm: 84,
        logbookId: 'logbook-cabin-3-may',
        pegId: 'vc-03',
        released: true,
        species: 'Kapor',
        weightKg: 12.6,
      },
      createState(),
      undefined,
      '2026-05-17T18:35:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Catch should be valid.')

    expect(result.catch.id).toBe('catch-20260517-vc-03-tomas-k')
    expect(result.catch.photoLabel).toBe('bez fotky')
    expect(result.catch.status).toBe('pending')
    expect(result.catch.weather).toMatchObject({
      source: 'mock',
      windDirection: expect.any(String),
    })
    expect(result.message).toContain('čaká na schválenie')
    expect(result.logbookEntry).toMatchObject({
      catchId: result.catch.id,
      logbookId: 'logbook-cabin-3-may',
      photoStatus: 'missing',
      verified: false,
    })
  })

  it('creates photo metadata without persisting the base64 payload in the catch record', () => {
    const result = submitCatchRecord(
      {
        angler: 'Tomáš K.',
        bait: 'krill dumbell',
        caughtAt: '2026-05-17T18:30',
        lake: 'velky-cetin',
        lengthCm: 84,
        logbookId: 'logbook-cabin-3-may',
        pegId: 'vc-03',
        photo: {
          dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
          fileName: 'kapor.png',
          mimeType: 'image/png',
          sizeBytes: 16,
        },
        released: true,
        species: 'Kapor',
        weightKg: 12.6,
      },
      createState(),
      undefined,
      '2026-05-17T18:35:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Catch with photo should be valid.')

    expect(result.catch.photoLabel).toBe('kapor.png')
    expect(result.catch.photoUrl).toBe(`/api/catch-photos/${result.catchPhoto?.id}`)
    expect(result.catch).not.toHaveProperty('photo')
    expect(result.catchPhoto).toMatchObject({
      aiStatus: 'queued',
      fileName: 'kapor.png',
      mimeType: 'image/png',
      status: 'uploaded',
    })
    expect(result.catchPhoto?.storagePath).toBe(`catch-photos/${result.catchPhoto?.id}.png`)
    expect(result.logbookEntry?.photoStatus).toBe('uploaded')
    expect(result.photoUpload?.dataUrl).toContain('base64')
  })

  it('rejects catches that do not belong to the selected logbook peg', () => {
    const result = submitCatchRecord(
      {
        angler: 'Tomáš K.',
        bait: 'krill dumbell',
        caughtAt: '2026-05-17T18:30',
        lake: 'velky-cetin',
        lengthCm: 84,
        logbookId: 'logbook-cabin-3-may',
        pegId: 'vc-09',
        released: true,
        species: 'Kapor',
        weightKg: 12.6,
      },
      createState(),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Wrong logbook peg should be invalid.')

    expect(result.messages).toContain('Úlovok nepatrí do jazera alebo miesta vybraného zápisníka.')
  })
})
