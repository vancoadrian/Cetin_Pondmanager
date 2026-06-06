import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { getValidationMessages, mapBackgroundUploadSchema } from '~/schemas/pondSchemas'
import { getMapDraftChangeSummary } from '~/services/mapApiService'
import { defaultMapLayerImageSettings } from '~/utils/map'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import {
  extensionForMapBackgroundMimeType,
  writeLocalMapAssetFile,
} from '../../../utils/localMapAssetStore'
import {
  mapStateContentEquals,
  readLocalMapDraftState,
  readLocalMapState,
  writeLocalMapDraftState,
} from '../../../utils/localMapStore'

function createMapAssetId(lake: string, mimeType: 'image/jpeg' | 'image/png' | 'image/webp') {
  const extension = extensionForMapBackgroundMimeType(mimeType)

  return `map-bg-${lake}-${Date.now()}.${extension}`
}

export default defineEventHandler(async (event) => {
  requireAdminAccess(event, { moduleId: 'map', mode: 'full' })

  const parsed = mapBackgroundUploadSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      data: { messages: getValidationMessages(parsed) },
      statusCode: 422,
      statusMessage: 'Map background upload validation failed',
    })
  }

  const publishedState = await readLocalMapState()
  const state = await readLocalMapDraftState(undefined, publishedState)
  const upload = parsed.data
  const backgroundLayer = state.mapLayers.find((layer) => layer.lake === upload.lake && layer.kind === 'background')
  if (!backgroundLayer) {
    throw createError({
      data: { messages: ['Jazero nemá mapovú vrstvu pre podkladový obrázok.'] },
      statusCode: 422,
      statusMessage: 'Map background layer not found',
    })
  }

  const assetId = createMapAssetId(upload.lake, upload.mimeType)
  const source = `/api/map-assets/${assetId}`
  await writeLocalMapAssetFile(assetId, upload)

  const storedState = await writeLocalMapDraftState({
    mapFacilities: state.mapFacilities,
    mapLayers: state.mapLayers.map((layer) =>
      layer.id === backgroundLayer.id
        ? {
            ...layer,
            enabled: true,
            imageSettings: layer.imageSettings ?? defaultMapLayerImageSettings,
            source,
          }
        : layer,
    ),
    mapShapes: state.mapShapes,
    pegs: state.pegs,
  })

  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: 'map.background_uploaded',
    area: 'map',
    details: {
      fileName: upload.fileName,
      lake: upload.lake,
      mimeType: upload.mimeType,
      publishedAt: publishedState.updatedAt,
      sizeBytes: upload.sizeBytes,
      source,
    },
    entityId: backgroundLayer.id,
    entityLabel: backgroundLayer.name,
    entityType: 'map_layer',
    summary: 'Admin nahral nový podkladový obrázok mapy.',
  })

  setResponseStatus(event, 200)

  return {
    ok: true,
    draftChanges: getMapDraftChangeSummary(storedState, publishedState),
    draftUpdatedAt: storedState.updatedAt,
    hasUnpublishedChanges: !mapStateContentEquals(storedState, publishedState),
    mapLayers: storedState.mapLayers,
    message: 'Podkladový obrázok je uložený v drafte mapy. Verejná mapa sa zmení až po publikovaní.',
    publishedAt: publishedState.updatedAt,
    source,
    statusCode: 200,
    updatedAt: storedState.updatedAt,
  }
})
