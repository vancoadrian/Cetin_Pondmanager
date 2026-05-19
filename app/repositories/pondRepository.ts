import {
  alerts,
  cabinProducts,
  catches,
  catchPhotos,
  contactInfo,
  getLakeName,
  getPegLabel,
  infoSections,
  lakeClosures,
  lakes,
  mapLayers,
  mapShapes,
  occupancyLegend,
  pegs,
  paymentMethods,
  permitProducts,
  rentalBookings,
  rentalItems,
  requiredEquipment,
  reservationExtras,
  reservations,
  sponsors,
  tournamentCatches,
  tournamentMarshalStatusLabels,
  tournamentMarshals,
  tournamentPenalties,
  tournamentPenaltyTypeLabels,
  tournamentRequests,
  tournamentRequestStatusLabels,
  tournamentRequestTypeLabels,
  tournamentRuleChecks,
  tournaments,
  tripLogbookEntries,
  tripLogbookModeLabels,
  tripLogbooks,
  tripLogbookStatusLabels,
  type LakeSlug,
} from '~/data/pond'

export interface PondRepository {
  getSnapshot: () => PondSnapshot
  getLakeName: (slug: LakeSlug) => string
  getPegLabel: (id: string) => string
}

const pondSeedSnapshot = {
  alerts,
  cabinProducts,
  catches,
  catchPhotos,
  contactInfo,
  infoSections,
  lakeClosures,
  lakes,
  mapLayers,
  mapShapes,
  occupancyLegend,
  pegs,
  paymentMethods,
  permitProducts,
  rentalBookings,
  rentalItems,
  requiredEquipment,
  reservationExtras,
  reservations,
  sponsors,
  tournamentCatches,
  tournamentMarshalStatusLabels,
  tournamentMarshals,
  tournamentPenalties,
  tournamentPenaltyTypeLabels,
  tournamentRequests,
  tournamentRequestStatusLabels,
  tournamentRequestTypeLabels,
  tournamentRuleChecks,
  tournaments,
  tripLogbookEntries,
  tripLogbookModeLabels,
  tripLogbooks,
  tripLogbookStatusLabels,
}

export type PondSnapshot = typeof pondSeedSnapshot

export function createPondSnapshot(overrides: Partial<PondSnapshot> = {}): PondSnapshot {
  return {
    ...pondSeedSnapshot,
    ...overrides,
  }
}

export function createMockPondRepository(snapshot: PondSnapshot = pondSeedSnapshot): PondRepository {
  return {
    getSnapshot: () => snapshot,
    getLakeName,
    getPegLabel,
  }
}
