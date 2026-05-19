import { describe, expect, it } from 'vitest'
import {
  catchCorrectionInputSchema,
  catchModerationInputSchema,
  catchRecordInputSchema,
  getValidationMessages,
  mapPointDraftSchema,
  reservationRequestSchema,
  tournamentPenaltyInputSchema,
  tournamentRequestInputSchema,
  tournamentRuleCheckInputSchema,
  tripLogbookInputSchema,
} from '~/app/schemas/pondSchemas'

const validReservationRequest = {
  cabinProductId: 'small-cabin',
  contactName: '  Ján Rybár  ',
  contactPhone: '+421 900 111 222',
  dateFrom: '2026-06-10',
  dateTo: '2026-06-12',
  extraIds: ['wood-crate'],
  lake: 'velky-cetin',
  pegId: 'vc-03',
  permitId: 'permit-48h',
  rentalIds: ['landing-net-rental'],
  requiresCabinReservation: true,
  reservable: true,
  unavailableRentalLabels: [],
}

describe('reservationRequestSchema', () => {
  it('accepts a complete reservation request and trims contact fields', () => {
    const result = reservationRequestSchema.safeParse(validReservationRequest)

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Reservation request should be valid.')

    expect(result.data.contactName).toBe('Ján Rybár')
    expect(result.data.contactPhone).toBe('+421 900 111 222')
  })

  it('rejects date, availability, cabin and rental conflicts together', () => {
    const result = reservationRequestSchema.safeParse({
      ...validReservationRequest,
      cabinProductId: undefined,
      dateFrom: '2026-06-12',
      dateTo: '2026-06-10',
      requiresCabinReservation: true,
      reservable: false,
      unavailableRentalLabels: ['Podberák', 'Vážiaci sak'],
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Reservation request should be invalid.')

    const messages = getValidationMessages(result)
    expect(messages).toContain('Dátum odchodu musí byť rovnaký alebo neskorší ako dátum príchodu.')
    expect(messages).toContain('Vybrané miesto nie je v zvolenom termíne rezervovateľné.')
    expect(messages).toContain('Toto miesto je viazané na chatu, ale chata sa nenašla v cenníku.')
    expect(messages).toContain('Vybraná výbava nie je v termíne dostupná: Podberák, Vážiaci sak.')
  })

  it('rejects malformed phone numbers before the request reaches admin', () => {
    const result = reservationRequestSchema.safeParse({
      ...validReservationRequest,
      contactPhone: 'volaj mi vecer',
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Reservation request should be invalid.')

    expect(getValidationMessages(result)).toContain('Telefón môže obsahovať iba čísla, medzery a znak +.')
  })
})

describe('catchRecordInputSchema', () => {
  it('coerces numeric catch measurements from form strings', () => {
    const result = catchRecordInputSchema.safeParse({
      angler: 'Lenka',
      bait: 'krill boilies',
      caughtAt: '2026-06-10T05:30',
      lake: 'velky-cetin',
      lengthCm: '92',
      pegId: 'vc-05',
      photo: {
        dataUrl: 'data:image/jpeg;base64,aGVsbG8=',
        fileName: 'kapor.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: '5',
      },
      released: true,
      species: 'Kapor',
      weightKg: '18.6',
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Catch record should be valid.')

    expect(result.data.lengthCm).toBe(92)
    expect(result.data.photo?.fileName).toBe('kapor.jpg')
    expect(result.data.weightKg).toBe(18.6)
  })

  it('rejects impossible catch measurements', () => {
    const result = catchRecordInputSchema.safeParse({
      angler: 'A',
      bait: '',
      caughtAt: '2026-06-10T05:30',
      lake: 'velky-cetin',
      lengthCm: '0',
      pegId: '',
      released: true,
      species: '',
      weightKg: '0',
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Catch record should be invalid.')

    const messages = getValidationMessages(result)
    expect(messages).toContain('Doplňte meno rybára.')
    expect(messages).toContain('Doplňte použitú nástrahu.')
    expect(messages).toContain('Miera musí byť väčšia ako 0 cm.')
    expect(messages).toContain('Váha musí byť väčšia ako 0 kg.')
  })

  it('rejects unsupported catch photo uploads', () => {
    const result = catchRecordInputSchema.safeParse({
      angler: 'Lenka',
      bait: 'krill boilies',
      caughtAt: '2026-06-10T05:30',
      lake: 'velky-cetin',
      lengthCm: '92',
      pegId: 'vc-05',
      photo: {
        dataUrl: 'data:image/gif;base64,aGVsbG8=',
        fileName: 'kapor.gif',
        mimeType: 'image/gif',
        sizeBytes: 5,
      },
      released: true,
      species: 'Kapor',
      weightKg: '18.6',
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('GIF catch photo should be invalid.')

    expect(getValidationMessages(result)).toContain('Podporované sú iba JPG, PNG alebo WebP fotky.')
  })
})

describe('catchModerationInputSchema', () => {
  it('accepts admin moderation decisions and trims review notes', () => {
    const result = catchModerationInputSchema.safeParse({
      catchId: 'c-2401',
      decisionMode: 'approve',
      note: '  Fotka a miera sedia.  ',
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Catch moderation input should be valid.')

    expect(result.data.note).toBe('Fotka a miera sedia.')
  })

  it('rejects missing catch ids and long review notes', () => {
    const result = catchModerationInputSchema.safeParse({
      catchId: '',
      decisionMode: 'reject',
      note: 'a'.repeat(501),
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Catch moderation input should be invalid.')

    const messages = getValidationMessages(result)
    expect(messages).toContain('Chýba identifikátor úlovku.')
    expect(messages).toContain('Poznámka ku schváleniu môže mať najviac 500 znakov.')
  })
})

describe('catchCorrectionInputSchema', () => {
  it('accepts corrected admin catch data and trims text fields', () => {
    const result = catchCorrectionInputSchema.safeParse({
      angler: '  Marek H.  ',
      bait: '  scopex boilies 20 mm  ',
      catchId: 'c-2401',
      caughtAt: '2026-05-16T05:45',
      lake: 'velky-cetin',
      lengthCm: '93',
      notes: '  Opravené podľa fotky.  ',
      pegId: 'vc-05',
      released: true,
      species: 'Kapor',
      weightKg: '18.7',
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Catch correction input should be valid.')

    expect(result.data.angler).toBe('Marek H.')
    expect(result.data.logbookLinkMode).toBe('keep')
    expect(result.data.notes).toBe('Opravené podľa fotky.')
    expect(result.data.weightKg).toBe(18.7)
  })

  it('rejects missing correction ids and impossible measurements', () => {
    const result = catchCorrectionInputSchema.safeParse({
      angler: 'M',
      bait: '',
      catchId: '',
      caughtAt: '2026-05-16T05:45',
      lake: 'velky-cetin',
      lengthCm: 0,
      logbookLinkMode: 'move',
      notes: '',
      pegId: '',
      released: true,
      species: '',
      targetLogbookId: '',
      weightKg: 0,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Catch correction input should be invalid.')

    const messages = getValidationMessages(result)
    expect(messages).toContain('Chýba identifikátor úlovku.')
    expect(messages).toContain('Doplňte použitú nástrahu.')
    expect(messages).toContain('Vyberte cieľový zápisník pre presun úlovku.')
    expect(messages).toContain('Váha musí byť väčšia ako 0 kg.')
  })
})

describe('tripLogbookInputSchema', () => {
  it('requires at least one member and one peg for a shared trip table', () => {
    const result = tripLogbookInputSchema.safeParse({
      lake: 'strkovisko-kocka',
      memberNames: [],
      mode: 'group',
      pegIds: [],
      title: 'Partia',
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Trip logbook should be invalid.')

    const messages = getValidationMessages(result)
    expect(messages).toContain('Doplňte aspoň jedného rybára.')
    expect(messages).toContain('Vyberte aspoň jedno lovné miesto.')
  })
})

describe('tournamentRequestInputSchema', () => {
  it('allows catch measurement requests without a long description', () => {
    const result = tournamentRequestInputSchema.safeParse({
      description: '',
      sectorId: 'sector-a1',
      tournamentId: 'tournament-1',
      type: 'catch-measurement',
    })

    expect(result.success).toBe(true)
  })

  it('requires a useful description for rule reports and technical requests', () => {
    const result = tournamentRequestInputSchema.safeParse({
      description: 'Krátke',
      sectorId: 'sector-a1',
      tournamentId: 'tournament-1',
      type: 'rule-report',
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Tournament request should be invalid.')

    expect(getValidationMessages(result)).toContain(
      'Pri hlásení porušenia, technickej pomoci alebo inom hlásení doplňte stručný popis.',
    )
  })
})

describe('tournamentPenaltyInputSchema', () => {
  it('requires duration and rod count for rod-reduction penalties', () => {
    const result = tournamentPenaltyInputSchema.safeParse({
      marshalId: 'marshal-2',
      reason: 'Tím lovil s väčším počtom prútov mimo povolený limit.',
      sectorId: 'b4',
      tournamentId: 'eccj-2026',
      type: 'rod-reduction',
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Penalty should be invalid.')

    const messages = getValidationMessages(result)
    expect(messages).toContain('Pri časovom treste doplňte trvanie v hodinách.')
    expect(messages).toContain('Pri treste o prút menej doplňte počet prútov.')
  })

  it('accepts warning penalties without duration', () => {
    const result = tournamentPenaltyInputSchema.safeParse({
      marshalId: 'marshal-3',
      reason: 'Neúplne pripravená podložka pri manipulácii s rybou.',
      sectorId: 'c2',
      tournamentId: 'eccj-2026',
      type: 'warning',
    })

    expect(result.success).toBe(true)
  })
})

describe('tournamentRuleCheckInputSchema', () => {
  it('requires a useful check note', () => {
    const result = tournamentRuleCheckInputSchema.safeParse({
      marshalId: 'marshal-1',
      note: 'OK',
      result: 'ok',
      sectorId: 'a1',
      tournamentId: 'eccj-2026',
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Rule check should be invalid.')

    expect(getValidationMessages(result)).toContain('Doplňte poznámku ku kontrole aspoň 8 znakmi.')
  })
})

describe('mapPointDraftSchema', () => {
  it('accepts cabin points that require cabin reservation', () => {
    const result = mapPointDraftSchema.safeParse({
      capacity: '4',
      id: 'vc-06',
      label: 'Chata 6',
      requiresCabinReservation: true,
      type: 'cabin',
      x: '37',
      y: '36',
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Map point should be valid.')

    expect(result.data.capacity).toBe(4)
    expect(result.data.x).toBe(37)
  })

  it('rejects shore points marked as cabin-only and coordinates outside the map', () => {
    const result = mapPointDraftSchema.safeParse({
      capacity: 2,
      id: 'vc-04',
      label: 'M',
      requiresCabinReservation: true,
      type: 'shore',
      x: 120,
      y: -1,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Map point should be invalid.')

    const messages = getValidationMessages(result)
    expect(messages).toContain('Názov miesta musí mať aspoň 2 znaky.')
    expect(messages).toContain('X musí byť v rozsahu 0 až 100.')
    expect(messages).toContain('Y musí byť v rozsahu 0 až 100.')
    expect(messages).toContain('Brehové miesto nemôže vyžadovať rezerváciu chaty.')
  })
})
