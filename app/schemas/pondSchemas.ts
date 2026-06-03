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
export const MAX_SPONSOR_LOGO_BYTES = 2 * 1024 * 1024
export const MAX_MAP_BACKGROUND_BYTES = 10 * 1024 * 1024
export const sponsorLogoPlacementRules = {
  footer: {
    label: 'footer',
    maxRatio: 5,
    minHeight: 96,
    minRatio: 0.75,
    minWidth: 240,
    ratioLabel: '3:4 až 5:1',
  },
  homepage: {
    label: 'homepage',
    maxRatio: 6,
    minHeight: 240,
    minRatio: 2,
    minWidth: 720,
    ratioLabel: '2:1 až 6:1',
  },
  scoreboard: {
    label: 'výsledkovku',
    maxRatio: 5,
    minHeight: 220,
    minRatio: 2,
    minWidth: 720,
    ratioLabel: '2:1 až 5:1',
  },
  sector: {
    label: 'sektor',
    maxRatio: 1.4,
    minHeight: 260,
    minRatio: 0.7,
    minWidth: 260,
    ratioLabel: '7:10 až 14:10',
  },
  sponsors: {
    label: 'stránku sponzorov',
    maxRatio: 4,
    minHeight: 140,
    minRatio: 0.75,
    minWidth: 320,
    ratioLabel: '3:4 až 4:1',
  },
  tournament: {
    label: 'súťaž',
    maxRatio: 5,
    minHeight: 180,
    minRatio: 1.5,
    minWidth: 480,
    ratioLabel: '3:2 až 5:1',
  },
} as const

export const sponsorLogoUploadSchema = z.object({
  dataUrl: z.string().startsWith('data:image/', 'Logo musí byť obrázok.'),
  fileName: z.string().trim().min(1, 'Logo nemá názov súboru.').max(120),
  height: z.coerce.number().int('Výška loga musí byť celé číslo.').min(1, 'Logo nemá zistenú výšku.').max(10000, 'Logo je príliš vysoké.'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp'], {
    message: 'Podporované sú iba JPG, PNG alebo WebP logá.',
  }),
  sizeBytes: z.coerce.number().int().min(1, 'Logo je prázdne.').max(
    MAX_SPONSOR_LOGO_BYTES,
    'Logo môže mať najviac 2 MB.',
  ),
  width: z.coerce.number().int('Šírka loga musí byť celé číslo.').min(1, 'Logo nemá zistenú šírku.').max(10000, 'Logo je príliš široké.'),
}).refine(
  (value) => value.dataUrl.startsWith(`data:${value.mimeType};base64,`),
  'Logo nemá platný dátový formát.',
)
export const mapBackgroundUploadSchema = z.object({
  dataUrl: z.string().startsWith('data:image/', 'Podklad mapy musí byť obrázok.'),
  fileName: z.string().trim().min(1, 'Podklad mapy nemá názov súboru.').max(120),
  lake: lakeSlugSchema,
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp'], {
    message: 'Podporované sú iba JPG, PNG alebo WebP podklady mapy.',
  }),
  sizeBytes: z.coerce.number().int().min(1, 'Podklad mapy je prázdny.').max(
    MAX_MAP_BACKGROUND_BYTES,
    'Podklad mapy môže mať najviac 10 MB.',
  ),
}).refine(
  (value) => value.dataUrl.startsWith(`data:${value.mimeType};base64,`),
  'Podklad mapy nemá platný dátový formát.',
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
  audienceRole: z.enum(['accountant', 'angler', 'manager', 'marshal', 'owner', 'tournament_organizer', 'tournament_team', 'worker']).optional(),
  deviceLabel: z.string().trim().max(80, 'Názov zariadenia môže mať najviac 80 znakov.').optional(),
  endpoint: z.string().trim().min(12, 'Chýba endpoint odberu notifikácií.'),
  marshalId: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().optional(),
  ),
  p256dh: z.string().trim().optional(),
  permission: z.enum(['denied', 'granted', 'unknown']).default('unknown'),
  sectorIds: z.array(z.string().trim().min(1)).default([]),
  topics: z.array(z.enum(['reservations', 'service', 'tournaments', 'weather'])).default(['weather', 'service']),
  tournamentIds: z.array(z.string().trim().min(1)).default([]),
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

export const cabinProductInputSchema = z.object({
  capacity: z.coerce.number().int('Kapacita chaty musí byť celé číslo.').min(1, 'Kapacita chaty musí byť aspoň 1.').max(12, 'Kapacita chaty môže byť najviac 12 osôb.'),
  equipment: z.array(z.string().trim().min(1, 'Výbava chaty nemôže byť prázdna.').max(80, 'Položka výbavy môže mať najviac 80 znakov.')).max(24, 'Chata môže mať najviac 24 položiek výbavy.').default([]),
  extraPersonFeeEur: z.coerce.number().min(0, 'Poplatok za ďalšiu osobu nemôže byť záporný.').max(1000, 'Poplatok za ďalšiu osobu je príliš vysoký.').optional(),
  id: z.string().trim().min(1, 'Chýba identifikátor chaty.'),
  label: z.string().trim().min(2, 'Názov chaty musí mať aspoň 2 znaky.').max(100, 'Názov chaty môže mať najviac 100 znakov.'),
  minimumHours: z.coerce.number().int('Minimum hodín musí byť celé číslo.').min(1, 'Minimum hodín musí byť aspoň 1.').max(720, 'Minimum hodín môže byť najviac 720.'),
  pegIds: z.array(z.string().trim().min(1, 'Chýba identifikátor lovného miesta.')).default([]),
  pricePer24hEur: z.coerce.number().min(0, 'Cena chaty nemôže byť záporná.').max(10000, 'Cena chaty je príliš vysoká.'),
  requiresPermitNote: z.string().trim().max(500, 'Poznámka k povolenkám môže mať najviac 500 znakov.').default(''),
})

export const cabinCatalogSettingsInputSchema = z.object({
  cabinProducts: z.array(cabinProductInputSchema).min(1, 'Upravte aspoň jednu chatu.'),
})

export const rentalCatalogSettingsInputSchema = z.object({
  removeRentalItemIds: z.array(z.string().trim().min(1, 'Chýba identifikátor odstraňovanej výbavy.')).default([]),
  removeReservationExtraIds: z.array(z.string().trim().min(1, 'Chýba identifikátor odstraňovaného doplnku.')).default([]),
  rentalItems: z.array(z.object({
    active: z.boolean(),
    category: z.enum(['fish-care', 'comfort', 'cabin']),
    description: z.string().trim().min(5, 'Doplňte popis výbavy aspoň 5 znakmi.').max(240, 'Popis výbavy môže mať najviac 240 znakov.'),
    id: z.string().trim().min(1, 'Chýba identifikátor výbavy.'),
    label: z.string().trim().min(2, 'Názov výbavy musí mať aspoň 2 znaky.').max(80, 'Názov výbavy môže mať najviac 80 znakov.'),
    priceLabel: z.string().trim().min(1, 'Doplňte cenníkový text výbavy.').max(120, 'Cenníkový text môže mať najviac 120 znakov.'),
    recommended: z.boolean(),
    stock: z.coerce.number().int('Sklad musí byť celé číslo.').min(0, 'Sklad nemôže byť záporný.').max(100, 'Sklad môže mať najviac 100 kusov.'),
  })).min(1, 'Upravte aspoň jednu položku výbavy.'),
  reservationExtras: z.array(z.object({
    active: z.boolean(),
    appliesTo: z.enum(['all', 'cabin']),
    description: z.string().trim().min(5, 'Doplňte popis doplnku aspoň 5 znakmi.').max(240, 'Popis doplnku môže mať najviac 240 znakov.'),
    id: z.string().trim().min(1, 'Chýba identifikátor doplnku.'),
    label: z.string().trim().min(2, 'Názov doplnku musí mať aspoň 2 znaky.').max(80, 'Názov doplnku môže mať najviac 80 znakov.'),
    lake: lakeSlugSchema.optional(),
    priceLabel: z.string().trim().min(1, 'Doplňte cenníkový text doplnku.').max(120, 'Cenníkový text môže mať najviac 120 znakov.'),
    source: z.enum(['web', 'proposal']),
  })).min(1, 'Upravte aspoň jeden doplnok k rezervácii.'),
})

const sponsorPlacementTypeSchema = z.enum(['homepage', 'footer', 'sponsors', 'tournament', 'sector', 'scoreboard'])
const sponsorLogoVariantCropPresetSchema = z.object({
  focusXPercent: z.coerce.number().int('Ohnisko X musí byť celé percento.').min(0, 'Ohnisko X nemôže byť záporné.').max(100, 'Ohnisko X môže byť najviac 100 %.'),
  focusYPercent: z.coerce.number().int('Ohnisko Y musí byť celé percento.').min(0, 'Ohnisko Y nemôže byť záporné.').max(100, 'Ohnisko Y môže byť najviac 100 %.'),
  mode: z.enum(['contain', 'cover']).default('contain'),
  paddingPercent: z.coerce.number().int('Odsadenie musí byť celé percento.').min(0, 'Odsadenie nemôže byť záporné.').max(30, 'Odsadenie môže byť najviac 30 %.'),
  sourceFileName: z.string().trim().min(1).max(120).optional(),
  sourceHeight: z.coerce.number().int().min(1).max(10000).optional(),
  sourceWidth: z.coerce.number().int().min(1).max(10000).optional(),
})
const sponsorLogoVariantInputSchema = z.object({
  cropPreset: sponsorLogoVariantCropPresetSchema.optional(),
  logoUpload: sponsorLogoUploadSchema.optional(),
  placementType: sponsorPlacementTypeSchema,
  removeLogo: z.boolean().default(false),
})
const sponsorInputSchema = z.object({
  active: z.boolean(),
  description: z.string().trim().min(8, 'Popis sponzora musí mať aspoň 8 znakov.').max(240, 'Popis sponzora môže mať najviac 240 znakov.'),
  id: z.string().trim().min(1, 'Chýba identifikátor sponzora.'),
  logoVariantSourceUpload: sponsorLogoUploadSchema.optional(),
  logoUpload: sponsorLogoUploadSchema.optional(),
  logoVariants: z.array(sponsorLogoVariantInputSchema).default([]),
  logoText: z.string().trim().min(1, 'Doplňte skratku alebo text loga.').max(6, 'Text loga môže mať najviac 6 znakov.'),
  name: z.string().trim().min(2, 'Názov sponzora musí mať aspoň 2 znaky.').max(100, 'Názov sponzora môže mať najviac 100 znakov.'),
  placement: z.string().trim().min(3, 'Umiestnenie musí mať aspoň 3 znaky.').max(140, 'Umiestnenie môže mať najviac 140 znakov.'),
  placementType: sponsorPlacementTypeSchema.default('sponsors'),
  removeLogoVariantSource: z.boolean().default(false),
  removeLogo: z.boolean().default(false),
  sectorId: z.string().trim().optional(),
  sortOrder: z.coerce.number().int('Poradie musí byť celé číslo.').min(1, 'Poradie musí byť aspoň 1.').max(999, 'Poradie môže byť najviac 999.').default(100),
  tier: z.enum(['main', 'partner', 'sector', 'tournament']),
  tournamentId: z.string().trim().optional(),
  validFrom: z.union([isoDateSchema, z.literal('')]).optional(),
  validTo: z.union([isoDateSchema, z.literal('')]).optional(),
  website: z.union([
    z.string().trim().url('Web sponzora musí byť platná URL adresa.'),
    z.literal(''),
  ]).optional(),
}).superRefine((value, ctx) => {
  if ((value.placementType === 'tournament' || value.placementType === 'scoreboard') && !value.tournamentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pri súťažnom umiestnení vyberte súťaž.',
      path: ['tournamentId'],
    })
  }

  if (value.placementType === 'sector' && !value.sectorId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pri sektorovom umiestnení vyberte sektor.',
      path: ['sectorId'],
    })
  }

  if (value.validFrom && value.validTo && value.validTo < value.validFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Platnosť kampane musí končiť rovnaký deň alebo neskôr ako začína.',
      path: ['validTo'],
    })
  }

  if (value.logoUpload) {
    const logoRule = sponsorLogoPlacementRules[value.placementType]
    const logoRatio = value.logoUpload.width / value.logoUpload.height

    if (value.logoUpload.width < logoRule.minWidth || value.logoUpload.height < logoRule.minHeight) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Logo pre ${logoRule.label} musí mať aspoň ${logoRule.minWidth} x ${logoRule.minHeight} px.`,
        path: ['logoUpload'],
      })
    }

    if (logoRatio < logoRule.minRatio || logoRatio > logoRule.maxRatio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Logo pre ${logoRule.label} musí mať pomer strán ${logoRule.ratioLabel}.`,
        path: ['logoUpload'],
      })
    }
  }

  const duplicateVariantTypes = value.logoVariants
    .map((variant) => variant.placementType)
    .filter((placementType, index, list) => list.indexOf(placementType) !== index)
  for (const placementType of [...new Set(duplicateVariantTypes)]) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Variant loga je v požiadavke duplicitný: ${sponsorLogoPlacementRules[placementType].label}.`,
      path: ['logoVariants'],
    })
  }

  for (const variant of value.logoVariants) {
    if (!variant.logoUpload) continue

    const logoRule = sponsorLogoPlacementRules[variant.placementType]
    const logoRatio = variant.logoUpload.width / variant.logoUpload.height

    if (variant.logoUpload.width < logoRule.minWidth || variant.logoUpload.height < logoRule.minHeight) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Variant loga pre ${logoRule.label} musí mať aspoň ${logoRule.minWidth} x ${logoRule.minHeight} px.`,
        path: ['logoVariants'],
      })
    }

    if (logoRatio < logoRule.minRatio || logoRatio > logoRule.maxRatio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Variant loga pre ${logoRule.label} musí mať pomer strán ${logoRule.ratioLabel}.`,
        path: ['logoVariants'],
      })
    }
  }
})

export const sponsorSettingsInputSchema = z.object({
  sponsors: z.array(sponsorInputSchema).min(1, 'Upravte aspoň jedného sponzora.'),
})

export const notificationBroadcastInputSchema = z.object({
  body: z.string().trim().min(10, 'Text notifikácie musí mať aspoň 10 znakov.').max(280, 'Text notifikácie môže mať najviac 280 znakov.'),
  severity: z.enum(['storm', 'info', 'service', 'water']),
  targetAudience: z.object({
    marshalIds: z.array(z.string().trim().min(1)).default([]),
    reason: z.string().trim().max(160).optional(),
    requestId: z.string().trim().optional(),
    roles: z.array(z.enum(['accountant', 'angler', 'manager', 'marshal', 'owner', 'tournament_organizer', 'tournament_team', 'worker'])).default([]),
    sectorIds: z.array(z.string().trim().min(1)).default([]),
    tournamentId: z.string().trim().optional(),
  }).optional(),
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

export const tournamentTeamRegistrationInputSchema = z.object({
  city: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().max(80, 'Mesto môže mať najviac 80 znakov.').optional(),
  ),
  contactEmail: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().email('E-mail nemá platný formát.').max(120, 'E-mail môže mať najviac 120 znakov.').optional(),
  ),
  contactName: z.string().trim().min(3, 'Kontaktné meno musí mať aspoň 3 znaky.').max(100, 'Kontaktné meno môže mať najviac 100 znakov.'),
  contactPhone: z.string().trim().min(7, 'Telefón musí mať aspoň 7 znakov.').max(32, 'Telefón môže mať najviac 32 znakov.').regex(/^[+\d\s]+$/, 'Telefón môže obsahovať iba čísla, medzery a znak +.'),
  memberCount: z.coerce.number().int('Počet členov musí byť celé číslo.').min(1, 'Tím musí mať aspoň jedného člena.').max(8, 'Tím môže mať najviac 8 členov.'),
  note: z.string().trim().max(500, 'Poznámka môže mať najviac 500 znakov.'),
  preferredSectorId: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().optional(),
  ),
  teamName: z.string().trim().min(3, 'Názov tímu musí mať aspoň 3 znaky.').max(120, 'Názov tímu môže mať najviac 120 znakov.'),
  tournamentId: z.string().trim().min(1, 'Chýba identifikátor súťaže.'),
})

export const tournamentTeamRegistrationDecisionInputSchema = z.object({
  action: z.enum(['approve', 'reject', 'waitlist']),
  assignedSectorId: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().optional(),
  ),
  registrationId: z.string().trim().min(1, 'Chýba ID prihlášky.'),
  reviewNote: z.string().trim().max(500, 'Poznámka môže mať najviac 500 znakov.'),
}).superRefine((value, ctx) => {
  if (value.action === 'approve' && !value.assignedSectorId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pri schválení tímu vyberte sektor.',
      path: ['assignedSectorId'],
    })
  }
})

export const tournamentSectorSettingsInputSchema = z.object({
  sectors: z.array(
    z.object({
      id: z.string().trim().min(1, 'Chýba ID sektora.'),
      label: z.string().trim().min(1, 'Sektor musí mať označenie.').max(16, 'Označenie sektora môže mať najviac 16 znakov.'),
      team: z.preprocess(
        (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
        z.string().trim().max(120, 'Názov tímu môže mať najviac 120 znakov.').optional(),
      ),
      weightKg: z.coerce.number().min(0, 'Váha sektora nemôže byť záporná.').max(9999, 'Váha sektora je príliš vysoká.'),
      x: z.coerce.number().min(0, 'X sektora musí byť v rozsahu 0 až 100.').max(100, 'X sektora musí byť v rozsahu 0 až 100.'),
      y: z.coerce.number().min(0, 'Y sektora musí byť v rozsahu 0 až 100.').max(100, 'Y sektora musí byť v rozsahu 0 až 100.'),
    }),
  ).min(1, 'Doplňte aspoň jeden sektor súťaže.'),
  tournamentId: z.string().trim().min(1, 'Chýba identifikátor súťaže.'),
})

export const tournamentPenaltyInputSchema = z
  .object({
    clientMutationId: z.preprocess(
      (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
      z.string().trim().min(1, 'Chýba ID offline úkonu.').max(160, 'ID offline úkonu je príliš dlhé.').optional(),
    ),
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
  clientMutationId: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(1, 'Chýba ID offline úkonu.').max(160, 'ID offline úkonu je príliš dlhé.').optional(),
  ),
  marshalId: z.string().min(1, 'Vyberte kontrolóra.'),
  note: z.string().trim().min(8, 'Doplňte poznámku ku kontrole aspoň 8 znakmi.').max(500, 'Poznámka môže mať najviac 500 znakov.'),
  result: z.enum(['ok', 'warning', 'penalty']),
  sectorId: z.string().min(1, 'Vyberte sektor.'),
  tournamentId: z.string().min(1, 'Chýba identifikátor súťaže.'),
})

export const mapLayerImageSettingsSchema = z.object({
  fit: z.enum(['contain', 'cover', 'stretch']).default('cover'),
  offsetX: z.coerce.number().min(-50, 'Posun X podkladu môže byť najviac -50 až 50.').max(50, 'Posun X podkladu môže byť najviac -50 až 50.').default(0),
  offsetY: z.coerce.number().min(-50, 'Posun Y podkladu môže byť najviac -50 až 50.').max(50, 'Posun Y podkladu môže byť najviac -50 až 50.').default(0),
  opacity: z.coerce.number().min(0.2, 'Priehľadnosť podkladu musí byť aspoň 20 %.').max(1, 'Priehľadnosť podkladu môže byť najviac 100 %.').default(0.9),
  scale: z.coerce.number().min(0.5, 'Mierka podkladu musí byť aspoň 50 %.').max(2.5, 'Mierka podkladu môže byť najviac 250 %.').default(1),
})

export const mapLayerInputSchema = z.object({
  editable: z.boolean(),
  enabled: z.boolean(),
  id: z.string().trim().min(1, 'Chýba ID vrstvy mapy.'),
  imageSettings: mapLayerImageSettingsSchema.optional(),
  kind: z.enum(['background', 'pegs', 'cabins', 'sectors', 'service']),
  lake: lakeSlugSchema,
  name: z.string().trim().min(2, 'Názov vrstvy musí mať aspoň 2 znaky.').max(90),
  source: z.string().trim().optional(),
  visibility: z.enum(['public', 'internal', 'competition']),
})

const mapPointBaseSchema = z.object({
    capacity: z.coerce.number().int('Kapacita musí byť celé číslo.').min(1, 'Kapacita musí byť aspoň 1.').max(12),
    id: z.string().min(1, 'Chýba ID bodu mapy.'),
    label: z.string().trim().min(2, 'Názov miesta musí mať aspoň 2 znaky.'),
    requiresCabinReservation: z.boolean().optional(),
    type: z.enum(['shore', 'cabin']),
    x: z.coerce.number().min(0, 'X musí byť v rozsahu 0 až 100.').max(100, 'X musí byť v rozsahu 0 až 100.'),
    y: z.coerce.number().min(0, 'Y musí byť v rozsahu 0 až 100.').max(100, 'Y musí byť v rozsahu 0 až 100.'),
  })

export const mapPointDraftSchema = mapPointBaseSchema
  .superRefine((value, ctx) => {
    if (value.type === 'shore' && value.requiresCabinReservation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Brehové miesto nemôže vyžadovať rezerváciu chaty.',
        path: ['requiresCabinReservation'],
      })
    }
  })

export const mapPegInputSchema = mapPointBaseSchema.extend({
  lake: lakeSlugSchema,
  notes: z.string().trim().max(500, 'Poznámka k bodu mapy môže mať najviac 500 znakov.').default(''),
  status: z.enum(['free', 'reserved', 'weekend-free', 'maintenance']).default('free'),
}).superRefine((value, ctx) => {
  if (value.type === 'shore' && value.requiresCabinReservation) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Brehové miesto nemôže vyžadovať rezerváciu chaty.',
      path: ['requiresCabinReservation'],
    })
  }
})

export const mapFacilityInputSchema = z.object({
  id: z.string().trim().min(1, 'Chýba ID servisného bodu.'),
  label: z.string().trim().min(2, 'Názov servisného bodu musí mať aspoň 2 znaky.').max(80),
  lake: lakeSlugSchema,
  notes: z.string().trim().max(500, 'Poznámka k servisnému bodu môže mať najviac 500 znakov.').default(''),
  type: z.enum(['electricity', 'entry', 'first-aid', 'other', 'parking', 'reception', 'shower', 'storage', 'toilet', 'waste', 'wood']),
  visibility: z.enum(['public', 'internal', 'competition']).default('internal'),
  x: z.coerce.number().min(0, 'X musí byť v rozsahu 0 až 100.').max(100, 'X musí byť v rozsahu 0 až 100.'),
  y: z.coerce.number().min(0, 'Y musí byť v rozsahu 0 až 100.').max(100, 'Y musí byť v rozsahu 0 až 100.'),
})

const mapShapePointSchema = z.object({
  x: z.coerce.number().min(0, 'X bodu zóny musí byť v rozsahu 0 až 100.').max(100, 'X bodu zóny musí byť v rozsahu 0 až 100.'),
  y: z.coerce.number().min(0, 'Y bodu zóny musí byť v rozsahu 0 až 100.').max(100, 'Y bodu zóny musí byť v rozsahu 0 až 100.'),
})

export const mapShapeInputSchema = z.object({
  id: z.string().trim().min(1, 'Chýba ID zóny mapy.'),
  label: z.string().trim().min(2, 'Názov zóny musí mať aspoň 2 znaky.').max(120),
  lake: lakeSlugSchema,
  points: z.array(mapShapePointSchema).min(3, 'Zóna musí mať aspoň 3 body.').max(24, 'Zóna môže mať najviac 24 bodov.'),
  sectorId: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(1).optional(),
  ),
  tone: z.enum(['water', 'reed', 'warning', 'service', 'sector']),
  tournamentId: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(1).optional(),
  ),
  type: z.enum(['shoreline', 'island', 'zone', 'sector', 'service']),
  visibility: z.enum(['public', 'internal', 'competition']),
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
