import { describe, expect, it } from 'vitest'
import {
  catchCorrectionInputSchema,
  catchModerationInputSchema,
  catchRecordInputSchema,
  getValidationMessages,
  mapBackgroundUploadSchema,
  mapFacilityInputSchema,
  mapLayerImageSettingsSchema,
  mapPointDraftSchema,
  mapShapeInputSchema,
  reservationRequestSchema,
  sponsorSettingsInputSchema,
  tournamentPenaltyInputSchema,
  tournamentRequestInputSchema,
  tournamentRuleCheckInputSchema,
  tournamentSectorSettingsInputSchema,
  tournamentTeamRegistrationDecisionInputSchema,
  tournamentTeamRegistrationInputSchema,
  tripLogbookInputSchema,
} from '~/app/schemas/pondSchemas'

const validReservationRequest = {
  cabinProductId: 'small-cabin',
  contactEmail: '  jan.rybar@example.com  ',
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
    expect(result.data.contactEmail).toBe('jan.rybar@example.com')
    expect(result.data.contactPhone).toBe('+421 900 111 222')
  })

  it('allows reservation requests without email contact', () => {
    const result = reservationRequestSchema.safeParse({
      ...validReservationRequest,
      contactEmail: '',
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Reservation request without email should be valid.')

    expect(result.data.contactEmail).toBeUndefined()
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

describe('sponsorSettingsInputSchema', () => {
  const validSponsor = {
    active: true,
    description: 'Partner revíru a súťažných cien.',
    id: 'sponsor-test',
    logoText: 'ST',
    name: 'Sponsor Test',
    placement: 'stránka sponzorov',
    tier: 'partner',
  }

  it('accepts a supported sponsor logo upload', () => {
    const result = sponsorSettingsInputSchema.safeParse({
      sponsors: [{
        ...validSponsor,
        logoUpload: {
          dataUrl: 'data:image/webp;base64,aGVsbG8=',
          fileName: 'logo.webp',
          height: 180,
          mimeType: 'image/webp',
          sizeBytes: 5,
          width: 400,
        },
      }],
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Sponsor settings should be valid.')

    expect(result.data.sponsors[0]?.logoUpload?.fileName).toBe('logo.webp')
  })

  it('accepts a reusable variant source logo without placement ratio validation', () => {
    const result = sponsorSettingsInputSchema.safeParse({
      sponsors: [{
        ...validSponsor,
        logoVariantSourceUpload: {
          dataUrl: 'data:image/png;base64,aGVsbG8=',
          fileName: 'source-square.png',
          height: 500,
          mimeType: 'image/png',
          sizeBytes: 5,
          width: 500,
        },
        placementType: 'scoreboard',
        tournamentId: 'eccj-2026',
      }],
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Sponsor source logo should be valid.')

    expect(result.data.sponsors[0]?.logoVariantSourceUpload?.fileName).toBe('source-square.png')
  })

  it('rejects unsupported sponsor logo uploads', () => {
    const result = sponsorSettingsInputSchema.safeParse({
      sponsors: [{
        ...validSponsor,
        logoUpload: {
          dataUrl: 'data:image/gif;base64,aGVsbG8=',
          fileName: 'logo.gif',
          height: 180,
          mimeType: 'image/gif',
          sizeBytes: 5,
          width: 400,
        },
      }],
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('GIF sponsor logo should be invalid.')

    expect(getValidationMessages(result)).toContain('Podporované sú iba JPG, PNG alebo WebP logá.')
  })

  it('rejects sponsor logos that are too narrow for scoreboard placement', () => {
    const result = sponsorSettingsInputSchema.safeParse({
      sponsors: [{
        ...validSponsor,
        logoUpload: {
          dataUrl: 'data:image/png;base64,aGVsbG8=',
          fileName: 'scoreboard.png',
          height: 260,
          mimeType: 'image/png',
          sizeBytes: 5,
          width: 300,
        },
        placementType: 'scoreboard',
        tournamentId: 'eccj-2026',
      }],
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Scoreboard logo should be invalid.')

    const messages = getValidationMessages(result)
    expect(messages).toContain('Logo pre výsledkovku musí mať aspoň 720 x 220 px.')
    expect(messages).toContain('Logo pre výsledkovku musí mať pomer strán 2:1 až 5:1.')
  })

  it('validates placement-specific sponsor logo variants', () => {
    const result = sponsorSettingsInputSchema.safeParse({
      sponsors: [{
        ...validSponsor,
        logoVariants: [{
          cropPreset: {
            focusXPercent: 40,
            focusYPercent: 60,
            mode: 'cover',
            paddingPercent: 8,
            sourceFileName: 'homepage-source.png',
            sourceHeight: 400,
            sourceWidth: 1200,
          },
          logoUpload: {
            dataUrl: 'data:image/png;base64,aGVsbG8=',
            fileName: 'homepage.png',
            height: 300,
            mimeType: 'image/png',
            sizeBytes: 5,
            width: 900,
          },
          placementType: 'homepage',
        }],
      }],
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Sponsor logo variant should be valid.')

    expect(result.data.sponsors[0]?.logoVariants[0]?.placementType).toBe('homepage')
    expect(result.data.sponsors[0]?.logoVariants[0]?.cropPreset?.focusXPercent).toBe(40)
  })

  it('rejects duplicate sponsor logo variant targets', () => {
    const result = sponsorSettingsInputSchema.safeParse({
      sponsors: [{
        ...validSponsor,
        logoVariants: [
          { placementType: 'footer' },
          { placementType: 'footer' },
        ],
      }],
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Duplicate logo variants should be invalid.')

    expect(getValidationMessages(result)).toContain('Variant loga je v požiadavke duplicitný: footer.')
  })

  it('rejects invalid sponsor logo crop preset coordinates', () => {
    const result = sponsorSettingsInputSchema.safeParse({
      sponsors: [{
        ...validSponsor,
        logoVariants: [{
          cropPreset: {
            focusXPercent: 120,
            focusYPercent: 50,
            mode: 'cover',
            paddingPercent: 8,
          },
          placementType: 'homepage',
        }],
      }],
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Crop preset should be invalid.')

    expect(getValidationMessages(result)).toContain('Ohnisko X môže byť najviac 100 %.')
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

describe('tournamentTeamRegistrationInputSchema', () => {
  it('trims contact data and coerces member count', () => {
    const result = tournamentTeamRegistrationInputSchema.safeParse({
      city: '  Nitra  ',
      contactEmail: 'team@example.com',
      contactName: '  Martin Kontakt  ',
      contactPhone: '+421 900 123 456',
      memberCount: '3',
      note: '',
      preferredSectorId: '',
      teamName: '  Junior Carp  ',
      tournamentId: 'eccj-2026',
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Team registration should be valid.')

    expect(result.data).toMatchObject({
      city: 'Nitra',
      contactName: 'Martin Kontakt',
      memberCount: 3,
      preferredSectorId: undefined,
      teamName: 'Junior Carp',
    })
  })

  it('rejects malformed team contact fields', () => {
    const result = tournamentTeamRegistrationInputSchema.safeParse({
      contactEmail: 'nie je email',
      contactName: 'AB',
      contactPhone: 'volaj vecer',
      memberCount: 0,
      note: '',
      teamName: 'T',
      tournamentId: 'eccj-2026',
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Team registration should be invalid.')

    const messages = getValidationMessages(result)
    expect(messages).toContain('E-mail nemá platný formát.')
    expect(messages).toContain('Kontaktné meno musí mať aspoň 3 znaky.')
    expect(messages).toContain('Telefón môže obsahovať iba čísla, medzery a znak +.')
    expect(messages).toContain('Tím musí mať aspoň jedného člena.')
  })
})

describe('tournamentTeamRegistrationDecisionInputSchema', () => {
  it('requires a sector when approving a team registration', () => {
    const result = tournamentTeamRegistrationDecisionInputSchema.safeParse({
      action: 'approve',
      registrationId: 'ttr-1',
      reviewNote: '',
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Team registration decision should be invalid.')

    expect(getValidationMessages(result)).toContain('Pri schválení tímu vyberte sektor.')
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

describe('tournamentSectorSettingsInputSchema', () => {
  it('normalizes empty team names and coerces numeric map values', () => {
    const result = tournamentSectorSettingsInputSchema.safeParse({
      sectors: [
        {
          id: 'a1',
          label: 'A1',
          team: '',
          weightKg: '12.5',
          x: '77.2',
          y: '64.1',
        },
      ],
      tournamentId: 'eccj-2026',
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Tournament sector settings should be valid.')

    expect(result.data.sectors[0]).toMatchObject({
      team: undefined,
      weightKg: 12.5,
      x: 77.2,
      y: 64.1,
    })
  })

  it('rejects overlong labels and map coordinates outside percent bounds', () => {
    const result = tournamentSectorSettingsInputSchema.safeParse({
      sectors: [
        {
          id: 'a1',
          label: 'Sektor mimo limitu',
          team: 'Junior Team A',
          weightKg: 0,
          x: 101,
          y: -1,
        },
      ],
      tournamentId: 'eccj-2026',
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Tournament sector settings should be invalid.')

    const messages = getValidationMessages(result)
    expect(messages).toContain('Označenie sektora môže mať najviac 16 znakov.')
    expect(messages).toContain('X sektora musí byť v rozsahu 0 až 100.')
    expect(messages).toContain('Y sektora musí byť v rozsahu 0 až 100.')
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

describe('mapBackgroundUploadSchema', () => {
  it('accepts a supported map background upload', () => {
    const result = mapBackgroundUploadSchema.safeParse({
      dataUrl: 'data:image/webp;base64,aGVsbG8=',
      fileName: 'map.webp',
      lake: 'velky-cetin',
      mimeType: 'image/webp',
      sizeBytes: 5,
    })

    expect(result.success).toBe(true)
  })

  it('rejects mismatched upload data urls', () => {
    const result = mapBackgroundUploadSchema.safeParse({
      dataUrl: 'data:image/png;base64,aGVsbG8=',
      fileName: 'map.jpg',
      lake: 'velky-cetin',
      mimeType: 'image/jpeg',
      sizeBytes: 5,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Map background upload should be invalid.')

    expect(getValidationMessages(result)).toContain('Podklad mapy nemá platný dátový formát.')
  })
})

describe('mapLayerImageSettingsSchema', () => {
  it('accepts background image fitting settings', () => {
    const result = mapLayerImageSettingsSchema.safeParse({
      fit: 'contain',
      offsetX: 12,
      offsetY: -6,
      opacity: 0.65,
      scale: 1.4,
    })

    expect(result.success).toBe(true)
  })

  it('rejects background image settings outside editor limits', () => {
    const result = mapLayerImageSettingsSchema.safeParse({
      fit: 'cover',
      offsetX: 60,
      offsetY: 0,
      opacity: 1.4,
      scale: 3,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Map background image settings should be invalid.')

    const messages = getValidationMessages(result)
    expect(messages).toContain('Posun X podkladu môže byť najviac -50 až 50.')
    expect(messages).toContain('Priehľadnosť podkladu môže byť najviac 100 %.')
    expect(messages).toContain('Mierka podkladu môže byť najviac 250 %.')
  })
})

describe('mapFacilityInputSchema', () => {
  it('accepts service points placed on the map', () => {
    const result = mapFacilityInputSchema.safeParse({
      id: 'facility-vc-shower',
      lake: 'velky-cetin',
      label: 'Sprchy',
      notes: 'Verejne dostupné sprchy.',
      type: 'shower',
      visibility: 'public',
      x: '18.5',
      y: '71.2',
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Map facility should be valid.')

    expect(result.data.x).toBe(18.5)
  })
})

describe('mapShapeInputSchema', () => {
  it('accepts editable polygon areas with at least three points', () => {
    const result = mapShapeInputSchema.safeParse({
      id: 'shape-vc-ban',
      lake: 'velky-cetin',
      label: 'Dočasný zákaz',
      points: [
        { label: 'Severný breh', role: 'shore', x: 20, y: 20 },
        { role: 'boundary', x: 32, y: 20 },
        { x: 32, y: 33 },
      ],
      tone: 'warning',
      type: 'zone',
      visibility: 'internal',
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Map shape should be valid.')

    expect(result.data.points[0]).toMatchObject({
      label: 'Severný breh',
      role: 'shore',
    })
  })

  it('accepts optional tournament sector links on competition polygons', () => {
    const result = mapShapeInputSchema.safeParse({
      id: 'shape-vc-sector-a1',
      lake: 'velky-cetin',
      label: 'Sektor A1',
      points: [
        { x: 72, y: 58 },
        { x: 84, y: 58 },
        { x: 84, y: 70 },
      ],
      sectorId: 'a1',
      tone: 'sector',
      tournamentId: 'eccj-2026',
      type: 'sector',
      visibility: 'competition',
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Competition sector shape should be valid.')

    expect(result.data).toMatchObject({
      sectorId: 'a1',
      tournamentId: 'eccj-2026',
    })
  })

  it('rejects invalid polygon point metadata', () => {
    const result = mapShapeInputSchema.safeParse({
      id: 'shape-vc-invalid-point',
      lake: 'velky-cetin',
      label: 'Neplatný vrchol',
      points: [
        { label: 'A'.repeat(41), role: 'shore', x: 72, y: 58 },
        { role: 'unknown', x: 84, y: 58 },
        { x: 84, y: 70 },
      ],
      tone: 'warning',
      type: 'zone',
      visibility: 'internal',
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Polygon point metadata should be invalid.')

    expect(getValidationMessages(result)).toContain('Názov vrcholu môže mať najviac 40 znakov.')
  })
})
