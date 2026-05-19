import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { saveMapState } from '~/services/mapApiService'
import { resolveAuditActor } from '../../utils/auditActor'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import { readLocalMapState, writeLocalMapState } from '../../utils/localMapStore'

export default defineEventHandler(async (event) => {
  const state = await readLocalMapState()
  const result = saveMapState(await readBody(event), {
    mapLayers: state.mapLayers,
    mapShapes: state.mapShapes,
    pegs: state.pegs,
  })

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Map save validation failed',
    })
  }

  const storedState = await writeLocalMapState({
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
    action: 'map.updated',
    area: 'map',
    details: {
      layerCount: result.mapLayers.length,
      pegCount: result.pegs.length,
      shapeCount: result.mapShapes.length,
    },
    entityId: 'map-state',
    entityLabel: 'Mapa revíru',
    entityType: 'map_state',
    summary: 'Admin uložil SVG model lovných miest, chát alebo vrstiev.',
  })

  setResponseStatus(event, result.statusCode)

  return {
    ...result,
    updatedAt: storedState.updatedAt,
  }
})
