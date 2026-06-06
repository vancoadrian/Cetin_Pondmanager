import { defineEventHandler, setResponseStatus } from 'h3'
import type { MapDraftDiscardSuccess } from '~/services/mapApiService'
import { getMapDraftChangeSummary } from '~/services/mapApiService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import {
  mapStateContentEquals,
  readLocalMapDraftState,
  readLocalMapState,
  writeLocalMapDraftState,
} from '../../../utils/localMapStore'

export default defineEventHandler(async (event): Promise<MapDraftDiscardSuccess> => {
  requireAdminAccess(event, { moduleId: 'map', mode: 'full' })

  const publishedState = await readLocalMapState()
  const previousDraftState = await readLocalMapDraftState(undefined, publishedState)
  const restoredDraftState = await writeLocalMapDraftState({
    mapFacilities: publishedState.mapFacilities,
    mapLayers: publishedState.mapLayers,
    mapShapes: publishedState.mapShapes,
    pegs: publishedState.pegs,
  })

  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: 'map.draft_discarded',
    area: 'map',
    details: {
      changed: !mapStateContentEquals(previousDraftState, publishedState),
      draftUpdatedAt: previousDraftState.updatedAt,
      facilityCount: previousDraftState.mapFacilities.length,
      layerCount: previousDraftState.mapLayers.length,
      pegCount: previousDraftState.pegs.length,
      publishedAt: publishedState.updatedAt,
      shapeCount: previousDraftState.mapShapes.length,
    },
    entityId: 'map-draft-state',
    entityLabel: 'Draft mapy revíru',
    entityType: 'map_state',
    summary: 'Admin zahodil rozpracované zmeny mapy a obnovil draft z verejnej verzie.',
  })

  setResponseStatus(event, 200)

  return {
    ok: true,
    draftChanges: getMapDraftChangeSummary(restoredDraftState, publishedState),
    draftUpdatedAt: restoredDraftState.updatedAt,
    hasUnpublishedChanges: false,
    mapFacilities: restoredDraftState.mapFacilities,
    mapLayers: restoredDraftState.mapLayers,
    mapShapes: restoredDraftState.mapShapes,
    message: 'Rozpracované zmeny mapy boli zahodené. Editor je späť na verejnej verzii.',
    pegs: restoredDraftState.pegs,
    publishedAt: publishedState.updatedAt,
    statusCode: 200,
    updatedAt: restoredDraftState.updatedAt,
  }
})
