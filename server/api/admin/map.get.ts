import { defineEventHandler } from 'h3'
import type { MapStateResponse } from '~/services/mapApiService'
import { getMapDraftChangeSummary } from '~/services/mapApiService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import {
  mapStateContentEquals,
  readLocalMapDraftState,
  readLocalMapState,
} from '../../utils/localMapStore'

export default defineEventHandler(async (event): Promise<MapStateResponse> => {
  requireAdminAccess(event, { moduleId: 'map' })

  const publishedState = await readLocalMapState()
  const draftState = await readLocalMapDraftState(undefined, publishedState)

  return {
    ok: true,
    draftChanges: getMapDraftChangeSummary(draftState, publishedState),
    draftUpdatedAt: draftState.updatedAt,
    hasUnpublishedChanges: !mapStateContentEquals(draftState, publishedState),
    mapFacilities: draftState.mapFacilities,
    mapLayers: draftState.mapLayers,
    mapShapes: draftState.mapShapes,
    pegs: draftState.pegs,
    publishedAt: publishedState.updatedAt,
    updatedAt: draftState.updatedAt,
  }
})
