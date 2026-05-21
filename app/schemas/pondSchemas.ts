import { z } from 'zod'

const lakeSlugSchema = z.enum(['velky-cetin', 'strkovisko-kocka'])
const lakeScopeSchema = z.union([lakeSlugSchema, z.literal('all')])
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dátum musí byť vo formáte RRRR-MM-DD.')
export const MAX_CATCH_PHOTO_BYTES = 6 * 1024 * 1024
export const catchPhotoUploadSchema = z.object({
  dataUrl: z.string().startsWith('data:image/', 'Fotka musí byť obrázok.'),
  fileName: z.string().trim().min(1, 'Fotka nemá názov súboru.').max(120),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp'], {
    message: 'Podporované sú iba JPG, PNG alebo WebP fotky.',
  }),
  sizeBytes: z.coerce.number().int().min(1, 'Fotka je prázdna.').max(
    MAX_CATCH_PHOTO_BYTES,
    'Fotka môže mať najviac 6 MB.',
  ),
}).refine(
  (value) => value.dataUrl.startsWith(`data:${value.mimeType};base64,`),
  'Fotka nemá platný dátový formát.',
)
const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Telefón musí mať aspoň 7 znakov.')
  .regex(/^\+?[0-9\s./-]+$/, 'Telefón môže obsahovať iba čísla, medzery a znak +.')

export const reservationRequestPayloadSchema = z.object({
  cabinProductId: z.string().optional(),
  contactName: z.string().trim().min(2, 'Doplňte meno rezervujúceho.'),
  contactPhone: phoneSchema,
  dateFrom: isoDateSchema,
  dateTo: isoDateSchema,
  extraIds: z.array(z.string()),
  lake: lakeSlugSchema,
  pegId: z.string().min(1, 'Vyberte lovné miesto.'),
  permitId: z.string().min(1, 'Vyberte povolenku.'),
  rentalIds: z.array(z.string()),
})

export const adminReservationRequestPayloadSchema = reservationRequestPayloadSchema.extend({
  internalNote: z.string().trim().max(700, 'Interná poznámka môže mať najviac 700 znakov.').optional(),
  paymentMethodId: z.string().trim().optional(),
  source: z.enum(['phone', 'admin']).default('phone'),
  status: z.enum(['pending', 'confirmed']).default('pending'),
})

export const reservationRequestSchema = reservationRequestPayloadSchema
  .extend({
    requiresCabinReservation: z.boolean(),
    reservable: z.boolean(),
    unavailableRentalLabels: z.array(z.string()),
  })
  .superRefine((value, ctx) => {
    if (value.dateTo < value.dateFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Dátum odchodu musí byť rovnaký alebo neskorší ako dátum príchodu.',
        path: ['dateTo'],
      })
    }

    if (!value.reservable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Vybrané miesto nie je v zvolenom termíne rezervovateľné.',
        path: ['pegId'],
      })
    }

    if (value.requiresCabinReservation && !value.cabinProductId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Toto miesto je viazané na chatu, ale chata sa nenašla v cenníku.',
        path: ['cabinProductId'],
      })
    }

    if (value.unavailableRentalLabels.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Vybraná výbava nie je v termíne dostupná: ${value.unavailableRentalLabels.join(', ')}.`,
        path: ['rentalIds'],
      })
    }
  })

export const catchRecordInputSchema = z.object({
  angler: z.string().trim().min(2, 'Doplňte meno rybára.'),
  bait: z.string().trim().min(2, 'Doplňte použitú nástrahu.'),
  caughtAt: z.string().min(10, 'Doplňte čas úlovku.'),
  lake: lakeSlugSchema,
  lengthCm: z.coerce.number().int('Miera musí byť celé číslo.').min(1, 'Miera musí byť väčšia ako 0 cm.').max(250),
  pegId: z.string().min(1, 'Vyberte lovné miesto.'),
  released: z.boolean(),
  species: z.string().trim().min(2, 'Doplňte druh ryby.'),
  weightKg: z.coerce.number().min(0.1, 'Váha musí byť väčšia ako 0 kg.').max(80),
  photo: catchPhotoUploadSchema.optional(),
})

export const catchModerationInputSchema = z.object({
  catchId: z.string().min(1, 'Chýba identifikátor úlovku.'),
  decisionMode: z.enum(['approve', 'pending', 'reject']),
  note: z.string().trim().max(500, 'Poznámka ku schváleniu môže mať najviac 500 znakov.'),
})

export const catchCorrectionInputSchema = z.object({
  angler: z.string().trim().min(2, 'Doplňte meno rybára.'),
  bait: z.string().trim().min(2, 'Doplňte použitú nástrahu.'),
  catchId: z.string().min(1, 'Chýba identifikátor úlovku.'),
  caughtAt: z.string().min(10, 'Doplňte čas úlovku.'),
  lake: lakeSlugSchema,
  lengthCm: z.coerce.number().int('Miera musí byť celé číslo.').min(1, 'Miera musí byť väčšia ako 0 cm.').max(250),
  logbookLinkMode: z.enum(['keep', 'move', 'detach']).default('keep'),
  notes: z.string().trim().max(700, 'Poznámka môže mať najviac 700 znakov.'),
  pegId: z.string().min(1, 'Vyberte lovné miesto.'),
  released: z.boolean(),
  species: z.string().trim().min(2, 'Doplňte druh ryby.'),
  targetLogbookId: z.string().trim().optional(),
  weightKg: z.coerce.number().min(0.1, 'Váha musí byť väčšia ako 0 kg.').max(80),
}).superRefine((value, ctx) => {
  if (value.logbookLinkMode === 'move' && !value.targetLogbookId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Vyberte cieľový zápisník pre presun úlovku.',
      path: ['targetLogbookId'],
    })
  }
})

const catchSavedReportFilterSchema = z.object({
  dateFrom: z.union([isoDateSchema, z.literal('')]).optional(),
  dateTo: z.union([isoDateSchema, z.literal('')]).optional(),
  lake: lakeScopeSchema.default('all'),
  seasonWindowId: z.string().trim().min(1).default('custom'),
  species: z.string().trim().optional(),
}).superRefine((value, ctx) => {
  if (value.dateFrom && value.dateTo && value.dateTo < value.dateFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Dátum do musí byť rovnaký alebo neskorší ako dátum od.',
      path: ['dateTo'],
    })
  }
})

export const catchSavedReportInputSchema = z.object({
  audience: z.enum(['accountant', 'manager', 'owner']),
  cadence: z.enum(['manual', 'monthly', 'weekly']),
  delivery: z.enum(['email-ready', 'in-app']),
  description: z.string().trim().max(240, 'Popis reportu môže mať najviac 240 znakov.').optional(),
  enabled: z.boolean().default(true),
  filter: catchSavedReportFilterSchema,
  id: z.string().trim().optional(),
  includeRawCsv: z.boolean().default(true),
  includeTrendSignals: z.boolean().default(true),
  recipients: z.union([z.string(), z.array(z.string())]).optional(),
  title: z.string().trim().min(3, 'Názov reportu musí mať aspoň 3 znaky.').max(80, 'Názov reportu môže mať najviac 80 znakov.'),
}).superRefine((value, ctx) => {
  if (!value.includeRawCsv && !value.includeTrendSignals) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Report musí obsahovať aspoň CSV úlovkov alebo trendové signály.',
      path: ['includeRawCsv'],
    })
  }
})

export const pushSubscriptionInputSchema = z.object({
  auth: z.string().trim().optional(),
  deviceLabel: z.string().trim().max(80, 'Názov zariadenia môže mať najviac 80 znakov.').optional(),
  endpoint: z.string().trim().min(12, 'Chýba endpoint odberu notifikácií.'),
  p256dh: z.string().trim().optional(),
  permission: z.enum(['denied', 'granted', 'unknown']).default('unknown'),
  topics: z.array(z.enum(['reservations', 'service', 'tournaments', 'weather'])).default(['weather', 'service']),
  userAgent: z.string().trim().max(240).optional(),
})

export const pushUnsubscribeInputSchema = z.object({
  endpoint: z.string().trim().min(12, 'Chýba endpoint odberu notifikácií.'),
})

export const paymentMethodSettingsInputSchema = z.object({
  methods: z.array(z.object({
    enabled: z.boolean(),
    id: z.string().trim().min(1, 'Chýba identifikátor platobnej metódy.'),
  })).min(1, 'Upravte aspoň jednu platobnú metódu.'),
})

export const rentalCatalogSettingsInputSchema = z.object({
  rentalItems: z.array(z.object({
    active: z.boolean(),
    id: z.string().trim().min(1, 'Chýba identifikátor výbavy.'),
    priceLabel: z.string().trim().min(1, 'Doplňte cenníkový text výbavy.').max(120, 'Cenníkový text môže mať najviac 120 znakov.'),
    recommended: z.boolean(),
    stock: z.coerce.number().int('Sklad musí byť celé číslo.').min(0, 'Sklad nemôže byť záporný.').max(100, 'Sklad môže mať najviac 100 kusov.'),
  })).min(1, 'Upravte aspoň jednu položku výbavy.'),
  reservationExtras: z.array(z.object({
    active: z.boolean(),
    id: z.string().trim().min(1, 'Chýba identifikátor doplnku.'),
    priceLabel: z.string().trim().min(1, 'Doplňte cenníkový text doplnku.').max(120, 'Cenníkový text môže mať najviac 120 znakov.'),
    source: z.enum(['web', 'proposal']),
  })).min(1, 'Upravte aspoň jeden doplnok k rezervácii.'),
})

export const notificationBroadcastInputSchema = z.object({
  body: z.string().trim().min(10, 'Text notifikácie musí mať aspoň 10 znakov.').max(280, 'Text notifikácie môže mať najviac 280 znakov.'),
  severity: z.enum(['storm', 'info', 'service', 'water']),
  targetTopics: z.array(z.enum(['reservations', 'service', 'tournaments', 'weather'])).min(1, 'Vyberte aspoň jeden okruh notifikácie.'),
  title: z.string().trim().min(3, 'Nadpis musí mať aspoň 3 znaky.').max(80, 'Nadpis môže mať najviac 80 znakov.'),
  validUntil: z.string().trim().min(3, 'Doplňte platnosť výstrahy.').max(60, 'Platnosť môže mať najviac 60 znakov.'),
})

export const lakeClosureInputSchema = z.object({
  affectsReservations: z.boolean().default(true),
  from: isoDateSchema,
  id: z.string().trim().optional(),
  lake: lakeScopeSchema,
  notes: z.string().trim().min(8, 'Doplňte poznámku k uzávierke aspoň 8 znakmi.').max(500, 'Poznámka môže mať najviac 500 znakov.'),
  organization: z.string().trim().max(120, 'Organizácia môže mať najviac 120 znakov.').optional(),
  pegIds: z.array(z.string()).default([]),
  reason: z.enum(['maintenance', 'season', 'spawning', 'tournament', 'emergency', 'pandemic']),
  title: z.string().trim().min(3, 'Názov uzávierky musí mať aspoň 3 znaky.').max(100, 'Názov uzávierky môže mať najviac 100 znakov.'),
  to: isoDateSchema,
  visibility: z.enum(['public', 'internal']),
}).superRefine((value, ctx) => {
  if (value.to < value.from) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Dátum konca uzávierky musí byť rovnaký alebo neskorší ako začiatok.',
      path: ['to'],
    })
  }
})

export const tripLogbookInputSchema = z.object({
  lake: lakeSlugSchema,
  memberNames: z.array(z.string().trim().min(2)).min(1, 'Doplňte aspoň jedného rybára.'),
  mode: z.enum(['personal', 'group', 'competition']),
  pegIds: z.array(z.string()).min(1, 'Vyberte aspoň jedno lovné miesto.'),
  title: z.string().trim().min(3, 'Názov výpravy musí mať aspoň 3 znaky.'),
})

export const tournamentRequestInputSchema = z
  .object({
    description: z.string().trim().max(240, 'Poznámka môže mať najviac 240 znakov.'),
    sectorId: z.string().min(1, 'Vyberte sektor.'),
    tournamentId: z.string().min(1, 'Chýba identifikátor súťaže.'),
    type: z.enum(['catch-measurement', 'rule-report', 'technical-help', 'other']),
  })
  .superRefine((value, ctx) => {
    if (value.type !== 'catch-measurement' && value.description.trim().length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pri hlásení porušenia, technickej pomoci alebo inom hlásení doplňte stručný popis.',
        path: ['description'],
      })
    }
  })

export const tournamentPenaltyInputSchema = z
  .object({
    durationHours: z.coerce.number().int('Trvanie musí byť celé číslo.').min(1, 'Trvanie musí byť aspoň 1 hodina.').max(24, 'Trvanie môže byť najviac 24 hodín.').optional(),
    marshalId: z.string().min(1, 'Vyberte kontrolóra.'),
    reason: z.string().trim().min(10, 'Doplňte dôvod trestu aspoň 10 znakmi.').max(500, 'Dôvod trestu môže mať najviac 500 znakov.'),
    rodsLess: z.coerce.number().int('Počet prútov musí byť celé číslo.').min(1, 'Zníženie musí byť aspoň o 1 prút.').max(4, 'Zníženie môže byť najviac o 4 prúty.').optional(),
    sectorId: z.string().min(1, 'Vyberte sektor.'),
    tournamentId: z.string().min(1, 'Chýba identifikátor súťaže.'),
    type: z.enum(['warning', 'fishing-pause', 'rod-reduction', 'review']),
  })
  .superRefine((value, ctx) => {
    if ((value.type === 'fishing-pause' || value.type === 'rod-reduction') && !value.durationHours) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pri časovom treste doplňte trvanie v hodinách.',
        path: ['durationHours'],
      })
    }

    if (value.type === 'rod-reduction' && !value.rodsLess) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pri treste o prút menej doplňte počet prútov.',
        path: ['rodsLess'],
      })
    }
  })

export const tournamentRuleCheckInputSchema = z.object({
  marshalId: z.string().min(1, 'Vyberte kontrolóra.'),
  note: z.string().trim().min(8, 'Doplňte poznámku ku kontrole aspoň 8 znakmi.').max(500, 'Poznámka môže mať najviac 500 znakov.'),
  result: z.enum(['ok', 'warning', 'penalty']),
  sectorId: z.string().min(1, 'Vyberte sektor.'),
  tournamentId: z.string().min(1, 'Chýba identifikátor súťaže.'),
})

export const mapPointDraftSchema = z
  .object({
    capacity: z.coerce.number().int('Kapacita musí byť celé číslo.').min(1, 'Kapacita musí byť aspoň 1.').max(12),
    id: z.string().min(1, 'Chýba ID bodu mapy.'),
    label: z.string().trim().min(2, 'Názov miesta musí mať aspoň 2 znaky.'),
    requiresCabinReservation: z.boolean().optional(),
    type: z.enum(['shore', 'cabin']),
    x: z.coerce.number().min(0, 'X musí byť v rozsahu 0 až 100.').max(100, 'X musí byť v rozsahu 0 až 100.'),
    y: z.coerce.number().min(0, 'Y musí byť v rozsahu 0 až 100.').max(100, 'Y musí byť v rozsahu 0 až 100.'),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'shore' && value.requiresCabinReservation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Brehové miesto nemôže vyžadovať rezerváciu chaty.',
        path: ['requiresCabinReservation'],
      })
    }
  })

export const reservationDecisionInputSchema = z.object({
  decisionMode: z.enum(['approve', 'call', 'reject']),
  note: z.string().trim().max(500, 'Interná poznámka môže mať najviac 500 znakov.'),
  reservationId: z.string().min(1, 'Chýba identifikátor rezervácie.'),
})

export function getValidationMessages(result: z.SafeParseReturnType<unknown, unknown>) {
  if (result.success) return []
  return result.error.issues.map((issue) => issue.message)
}
