import { createMockPondRepository, type PondRepository } from '~/repositories/pondRepository'
import type { LakeSlug } from '~/data/pond'

export function createPondService(repository: PondRepository = createMockPondRepository()) {
  const snapshot = repository.getSnapshot()

  return {
    ...snapshot,
    getLakeName: repository.getLakeName,
    getPegLabel: repository.getPegLabel,
    getLakeBySlug: (slug: LakeSlug) => snapshot.lakes.find((lake) => lake.slug === slug),
    listPegsByLake: (slug: LakeSlug) => snapshot.pegs.filter((peg) => peg.lake === slug),
    listMapFacilitiesByLake: (slug: LakeSlug) => snapshot.mapFacilities.filter((facility) => facility.lake === slug),
    listMapLayersByLake: (slug: LakeSlug) => snapshot.mapLayers.filter((layer) => layer.lake === slug),
    listMapShapesByLake: (slug: LakeSlug) => snapshot.mapShapes.filter((shape) => shape.lake === slug),
    listReservationsByLake: (slug: LakeSlug) =>
      snapshot.reservations.filter((reservation) => reservation.lake === slug),
    listClosuresByLake: (slug: LakeSlug) =>
      snapshot.lakeClosures.filter((closure) => closure.lake === 'all' || closure.lake === slug),
  }
}

export const pondService = createPondService()

export type PondService = ReturnType<typeof createPondService>
