import { defineEventHandler, setResponseStatus } from 'h3'
import type { MapPublishSuccess } from '~/services/mapApiService'
import { getMapDraftChangeSummary } from '~/services/mapApiService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import {
  mapStateContentEquals,
  readLocalMapDraftState,
  readLocalMapState,
  writeLocalMapState,
} from '../../../utils/localMapStore'

export default defineEventHandler(async (event): Promise<MapPublishSuccess> => {
  requireAdminAccess(event, { moduleId: 'map', mode: 'full' })

  const previousPublishedState = await readLocalMapState()
  const draftState = await readLocalMapDraftState(undefined, previousPublishedState)
  const storedPublishedState = await writeLocalMapState({
    mapFacilities: draftState.mapFacilities,
    mapLayers: draftState.mapLayers,
    mapShapes: draftState.mapShapes,
    pegs: draftState.pegs,
  })

  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: 'map.published',
    area: 'map',
    details: {
      changed: !mapStateContentEquals(draftState, previousPublishedState),
      draftUpdatedAt: draftState.updatedAt,
      facilityCount: draftState.mapFacilities.length,
      layerCount: draftState.mapLayers.length,
      pegCount: draftState.pegs.length,
      previousPublishedAt: previousPublishedState.updatedAt,
      shapeCount: draftState.mapShapes.length,
    },
    entityId: 'map-state',
    entityLabel: 'Mapa revíru',
    entityType: 'map_state',
    summary: 'Admin publikoval rozpracovanú mapu revíru.',
  })

  setResponseStatus(event, 200)

  return {
    ok: true,
    draftChanges: getMapDraftChangeSummary(storedPublishedState, storedPublishedState),
    draftUpdatedAt: draftState.updatedAt,
    hasUnpublishedChanges: false,
    mapFacilities: storedPublishedState.mapFacilities,
    mapLayers: storedPublishedState.mapLayers,
    mapShapes: storedPublishedState.mapShapes,
    message: 'Draft mapy je publikovaný na verejnú mapu.',
    pegs: storedPublishedState.pegs,
    publishedAt: storedPublishedState.updatedAt,
    statusCode: 200,
    updatedAt: draftState.updatedAt,
  }
})
