import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  alerts,
  cabinProducts,
  catchPhotos,
  catches,
  contactInfo,
  lakeClosures,
  lakes,
  mapFacilities,
  mapLayers,
  mapShapes,
  pegs,
  placeIssues,
  paymentMethods,
  permitProducts,
  rentalBookings,
  rentalItems,
  requiredEquipment,
  reservationExtras,
  reservations,
  sponsors,
  tournamentCatches,
  tournamentMarshals,
  tournamentPenalties,
  tournamentRequests,
  tournamentRuleChecks,
  tournaments,
  tripLogbookEntries,
  tripLogbooks,
} from '../app/data/pond.ts'
import {
  buildSupabaseSeedPayload,
  validateSupabaseSeedPayload,
} from '../app/services/supabaseSeedService.ts'

const outputPath = resolve('supabase', 'seed', 'rybolov-cetin.seed.json')
const generatedAt = process.env.SEED_GENERATED_AT ?? '2026-05-17T00:00:00.000Z'
const payload = buildSupabaseSeedPayload(
  {
    alerts,
    cabinProducts,
    catchPhotos,
    catches,
    contactInfo,
    lakeClosures,
    lakes,
    mapFacilities,
    mapLayers,
    mapShapes,
    pegs,
    placeIssues,
    paymentMethods,
    permitProducts,
    rentalBookings,
    rentalItems,
    requiredEquipment,
    reservationExtras,
    reservations,
    sponsors,
    tournamentCatches,
    tournamentMarshals,
    tournamentPenalties,
    tournamentRequests,
    tournamentRuleChecks,
    tournaments,
    tripLogbookEntries,
    tripLogbooks,
  },
  {
    baseDate: '2026-05-17',
    generatedAt,
  },
)
const validation = validateSupabaseSeedPayload(payload)

if (!validation.ok) {
  console.error('Seed export validation failed:')
  for (const message of validation.messages) {
    console.error(`- ${message}`)
  }
  process.exitCode = 1
}
else {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const totalRows = Object.values(payload.metadata.counts).reduce((sum, count) => sum + count, 0)
  console.log(`Supabase seed export written to ${outputPath}`)
  console.log(`Tables: ${Object.keys(payload.tables).length}, rows: ${totalRows}`)
}
