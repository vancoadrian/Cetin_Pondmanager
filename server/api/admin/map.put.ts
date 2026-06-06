import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { getMapDraftChangeSummary, saveMapState } from '~/services/mapApiService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../utils/auditActor'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import {
  mapStateContentEquals,
  readLocalMapDraftState,
  readLocalMapState,
  writeLocalMapDraftState,
} from '../../utils/localMapStore'

export default defineEventHandler(async (event) => {
  requireAdminAccess(event, { moduleId: 'map', mode: 'full' })

  const publishedState = await readLocalMapState()
  const draftState = await readLocalMapDraftState(undefined, publishedState)
  const result = saveMapState(await readBody(event), {
    mapFacilities: draftState.mapFacilities,
    mapLayers: draftState.mapLayers,
    mapShapes: draftState.mapShapes,
    pegs: draftState.pegs,
  })

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Map save validation failed',
    })
  }

  const storedDraftState = await writeLocalMapDraftState({
    mapFacilities: result.mapFacilities,
    mapLayers: result.mapLayers,
    mapShapes: result.mapShapes,
    pegs: result.pegs,
  })
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: 'map.draft_saved',
    area: 'map',
    details: {
      layerCount: result.mapLayers.length,
      facilityCount: result.mapFacilities.length,
      pegCount: result.pegs.length,
      shapeCount: result.mapShapes.length,
      publishedAt: publishedState.updatedAt,
    },
    entityId: 'map-draft-state',
    entityLabel: 'Rozpracovaná mapa revíru',
    entityType: 'map_draft_state',
    summary: 'Admin uložil rozpracovaný SVG model mapy.',
  })

  setResponseStatus(event, result.statusCode)

  return {
    ...result,
    draftChanges: getMapDraftChangeSummary(storedDraftState, publishedState),
    draftUpdatedAt: storedDraftState.updatedAt,
    hasUnpublishedChanges: !mapStateContentEquals(storedDraftState, publishedState),
    message: 'Draft mapy je uložený. Verejná mapa sa zmení až po publikovaní.',
    publishedAt: publishedState.updatedAt,
    updatedAt: storedDraftState.updatedAt,
  }
})
