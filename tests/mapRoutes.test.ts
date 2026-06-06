import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import type { MapLayer } from '~/app/data/pond'
import type { MapDraftChangeSummary, MapDraftDiscardSuccess, MapPublishSuccess, MapSaveSuccess, MapStateResponse } from '~/app/services/mapApiService'
import adminMapBackgroundHandler from '~/server/api/admin/map/background.post'
import adminMapDiscardDraftHandler from '~/server/api/admin/map/discard-draft.post'
import adminMapGetHandler from '~/server/api/admin/map.get'
import adminMapPublishHandler from '~/server/api/admin/map/publish.post'
import adminMapPutHandler from '~/server/api/admin/map.put'
import mapAssetHandler from '~/server/api/map-assets/[id].get'
import mapGetHandler from '~/server/api/map.get'
import { readLocalAuditLogState } from '~/server/utils/localAuditLogStore'
import { readLocalMapDraftState, readLocalMapState } from '~/server/utils/localMapStore'

const MANAGER_COOKIE = 'rybolov_cetin_mock_session=manager'
const MARSHAL_COOKIE = 'rybolov_cetin_mock_session=marshal'

const localEnvKeys = [
  'RYBOLOV_LOCAL_AUDIT_LOG_STORE',
  'RYBOLOV_LOCAL_MAP_ASSET_DIR',
  'RYBOLOV_LOCAL_MAP_DRAFT_STORE',
  'RYBOLOV_LOCAL_MAP_STORE',
] as const

const originalEnv = new Map<string, string | undefined>()
let tempDir: string | undefined

interface TestRouteServer {
  baseUrl: string
  close: () => Promise<void>
}

interface ValidationErrorResponse {
  data: {
    currentMode?: string | null
    messages?: string[]
    requiredMode?: string
    role?: string | null
  }
  statusMessage: string
}

interface MapBackgroundUploadSuccess {
  draftChanges?: MapDraftChangeSummary
  ok: true
  mapLayers: MapLayer[]
  message: string
  source: string
  statusCode: 200
  updatedAt: string
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-map-routes-'))

  for (const key of localEnvKeys) {
    if (!originalEnv.has(key)) {
      originalEnv.set(key, process.env[key])
    }
  }

  const dataDir = join(tempDir, 'data')
  process.env.RYBOLOV_LOCAL_AUDIT_LOG_STORE = join(dataDir, 'audit-log.json')
  process.env.RYBOLOV_LOCAL_MAP_ASSET_DIR = join(dataDir, 'map-assets')
  process.env.RYBOLOV_LOCAL_MAP_DRAFT_STORE = join(dataDir, 'map-draft-state.json')
  process.env.RYBOLOV_LOCAL_MAP_STORE = join(dataDir, 'map-state.json')
})

afterEach(async () => {
  for (const key of localEnvKeys) {
    const original = originalEnv.get(key)

    if (original === undefined) {
      Reflect.deleteProperty(process.env, key)
    }
    else {
      process.env[key] = original
    }
  }

  if (tempDir) {
    await rm(tempDir, { force: true, recursive: true })
    tempDir = undefined
  }
})

function createMapRouteServerApp() {
  const app = createApp()
  const router = createRouter()

  router.get('/api/map', mapGetHandler)
  router.get('/api/admin/map', adminMapGetHandler)
  router.put('/api/admin/map', adminMapPutHandler)
  router.post('/api/admin/map/discard-draft', adminMapDiscardDraftHandler)
  router.post('/api/admin/map/publish', adminMapPublishHandler)
  router.post('/api/admin/map/background', adminMapBackgroundHandler)
  router.get('/api/map-assets/:id', mapAssetHandler)
  app.use(router.handler)

  return app
}

async function startRouteServer(): Promise<TestRouteServer> {
  const server = createServer(toNodeListener(createMapRouteServerApp()))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Testovací HTTP server nemá dostupný port.')
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  }
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function requestJson<T>(
  server: TestRouteServer,
  path: string,
  init: RequestInit & { cookie?: string | null } = {},
) {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  if (init.cookie !== null) {
    headers.set('cookie', init.cookie ?? MANAGER_COOKIE)
  }

  const response = await fetch(`${server.baseUrl}${path}`, {
    ...init,
    headers,
  })
  const raw = await response.text()
  const body = raw ? JSON.parse(raw) as T : null

  return {
    body,
    raw,
    response,
  }
}

async function requestRaw(
  server: TestRouteServer,
  path: string,
  init: RequestInit & { cookie?: string | null } = {},
) {
  const headers = new Headers(init.headers)

  if (init.cookie !== null) {
    headers.set('cookie', init.cookie ?? MANAGER_COOKIE)
  }

  return fetch(`${server.baseUrl}${path}`, {
    ...init,
    headers,
  })
}

describe('map API routes', () => {
  it('keeps public map data free of internal facilities, shapes and layers', async () => {
    const server = await startRouteServer()

    try {
      const publicMap = await requestJson<MapStateResponse>(server, '/api/map', { cookie: null })

      expect(publicMap.response.status).toBe(200)
      expect(publicMap.body.ok).toBe(true)
      expect(publicMap.body.pegs.length).toBeGreaterThan(0)
      expect(publicMap.body.mapLayers.some((layer) => layer.visibility === 'internal')).toBe(false)
      expect(publicMap.body.mapFacilities.some((facility) => facility.visibility === 'internal')).toBe(false)
      expect(publicMap.body.mapShapes.some((shape) => shape.visibility === 'internal')).toBe(false)
      expect(publicMap.body.mapLayers.map((layer) => layer.id)).not.toContain('layer-vc-service')
      expect(publicMap.body.mapFacilities.map((facility) => facility.id)).not.toContain('facility-vc-storage')
      expect(publicMap.body.mapShapes.map((shape) => shape.id)).not.toContain('shape-vc-spawning-zone')
      expect(publicMap.body.mapShapes.map((shape) => shape.id)).toContain('shape-vc-sector-a1')
    }
    finally {
      await server.close()
    }
  })

  it('returns full map state only to roles with map read access', async () => {
    const server = await startRouteServer()

    try {
      const anonymous = await requestJson<ValidationErrorResponse>(server, '/api/admin/map', { cookie: null })
      expect(anonymous.response.status).toBe(401)
      expect(anonymous.body.statusMessage).toBe('Admin login required')

      const marshal = await requestJson<MapStateResponse>(server, '/api/admin/map', {
        cookie: MARSHAL_COOKIE,
      })
      expect(marshal.response.status).toBe(200)
      expect(marshal.body.mapLayers.map((layer) => layer.id)).toContain('layer-vc-service')
      expect(marshal.body.mapFacilities.map((facility) => facility.id)).toContain('facility-vc-storage')
      expect(marshal.body.mapShapes.map((shape) => shape.id)).toContain('shape-vc-spawning-zone')
    }
    finally {
      await server.close()
    }
  })

  it('saves admin map edits as draft and publishes them only on request', async () => {
    const server = await startRouteServer()

    try {
      const adminState = await requestJson<MapStateResponse>(server, '/api/admin/map')
      const payload = {
        enabledLayerIds: adminState.body.mapLayers
          .filter((layer) => layer.id !== 'layer-vc-service')
          .map((layer) => layer.id),
        mapFacilities: [
          ...adminState.body.mapFacilities,
          {
            id: 'facility-route-internal-storage',
            lake: 'velky-cetin',
            label: 'Interný route sklad',
            notes: 'Vidí ho iba správca mapy.',
            type: 'storage',
            visibility: 'internal',
            x: 12,
            y: 64,
          },
        ],
        mapLayers: adminState.body.mapLayers.map((layer) =>
          layer.id === 'layer-vc-background'
            ? {
                ...layer,
                imageSettings: {
                  fit: 'contain',
                  offsetX: 5,
                  offsetY: -3,
                  opacity: 0.8,
                  scale: 1.1,
                },
              }
            : layer,
        ),
        mapShapes: [
          ...adminState.body.mapShapes,
          {
            id: 'shape-route-public-water',
            lake: 'velky-cetin',
            label: 'Route vodná plocha',
            points: [
              { x: 12, y: 42 },
              { x: 22, y: 35 },
              { x: 28, y: 48 },
            ],
            tone: 'water',
            type: 'shoreline',
            visibility: 'public',
          },
        ],
        pegs: adminState.body.pegs.map((peg) =>
          peg.id === 'vc-03'
            ? {
                ...peg,
                label: 'Chata 3 route edit',
                x: 23.5,
                y: 62.5,
              }
            : peg,
        ),
      }

      const save = await requestJson<MapSaveSuccess>(server, '/api/admin/map', {
        body: JSON.stringify(payload),
        method: 'PUT',
      })
      expect(save.response.status).toBe(200)
      expect(save.body.draftChanges?.mapFacilities.added).toBe(1)
      expect(save.body.draftChanges?.mapFacilities.addedItems).toContainEqual({
        id: 'facility-route-internal-storage',
        label: 'Interný route sklad',
      })
      expect(save.body.draftChanges?.mapShapes.added).toBe(1)
      expect(save.body.draftChanges?.mapShapes.addedItems).toContainEqual({
        id: 'shape-route-public-water',
        label: 'Route vodná plocha',
      })
      expect(save.body.draftChanges?.pegs.updated).toBe(1)
      expect(save.body.draftChanges?.pegs.updatedItems).toContainEqual({
        id: 'vc-03',
        label: 'Chata 3 route edit',
      })
      expect(save.body.draftChanges?.total).toBeGreaterThanOrEqual(3)
      expect(save.body.hasUnpublishedChanges).toBe(true)
      expect(save.body.message).toContain('Draft mapy')
      expect(save.body.pegs.find((peg) => peg.id === 'vc-03')).toMatchObject({
        label: 'Chata 3 route edit',
        x: 23.5,
        y: 62.5,
      })
      expect(save.body.mapLayers.find((layer) => layer.id === 'layer-vc-background')?.imageSettings).toMatchObject({
        fit: 'contain',
        offsetX: 5,
      })

      const draftState = await readLocalMapDraftState(undefined, await readLocalMapState())
      expect(draftState.mapFacilities.map((facility) => facility.id)).toContain('facility-route-internal-storage')

      const publishedBeforePublish = await readLocalMapState()
      expect(publishedBeforePublish.mapFacilities.map((facility) => facility.id)).not.toContain('facility-route-internal-storage')

      const publicMap = await requestJson<MapStateResponse>(server, '/api/map', { cookie: null })
      expect(publicMap.body.mapFacilities.map((facility) => facility.id)).not.toContain('facility-route-internal-storage')
      expect(publicMap.body.mapShapes.map((shape) => shape.id)).not.toContain('shape-route-public-water')

      const adminMapAfterDraft = await requestJson<MapStateResponse>(server, '/api/admin/map')
      expect(adminMapAfterDraft.body.hasUnpublishedChanges).toBe(true)
      expect(adminMapAfterDraft.body.draftChanges?.total).toBe(save.body.draftChanges?.total)
      expect(adminMapAfterDraft.body.mapShapes.map((shape) => shape.id)).toContain('shape-route-public-water')

      const publish = await requestJson<MapPublishSuccess>(server, '/api/admin/map/publish', {
        method: 'POST',
      })
      expect(publish.response.status).toBe(200)
      expect(publish.body.draftChanges?.total).toBe(0)
      expect(publish.body.hasUnpublishedChanges).toBe(false)
      expect(publish.body.message).toContain('publikovaný')

      const publicAfterPublish = await requestJson<MapStateResponse>(server, '/api/map', { cookie: null })
      expect(publicAfterPublish.body.mapFacilities.map((facility) => facility.id)).not.toContain('facility-route-internal-storage')
      expect(publicAfterPublish.body.mapShapes.map((shape) => shape.id)).toContain('shape-route-public-water')

      const auditState = await readLocalAuditLogState()
      expect(auditState.events).toContainEqual(expect.objectContaining({
        action: 'map.draft_saved',
        area: 'map',
        entityId: 'map-draft-state',
      }))
      expect(auditState.events).toContainEqual(expect.objectContaining({
        action: 'map.published',
        area: 'map',
        entityId: 'map-state',
      }))
    }
    finally {
      await server.close()
    }
  })

  it('discards admin map draft without changing the published map', async () => {
    const server = await startRouteServer()

    try {
      const adminState = await requestJson<MapStateResponse>(server, '/api/admin/map')
      const publicBeforeDraft = await requestJson<MapStateResponse>(server, '/api/map', { cookie: null })
      const payload = {
        enabledLayerIds: adminState.body.mapLayers.map((layer) => layer.id),
        mapFacilities: adminState.body.mapFacilities,
        mapLayers: adminState.body.mapLayers,
        mapShapes: [
          ...adminState.body.mapShapes,
          {
            id: 'shape-route-discarded-draft',
            lake: 'velky-cetin',
            label: 'Draft na zahodenie',
            points: [
              { x: 31, y: 42 },
              { x: 38, y: 39 },
              { x: 40, y: 47 },
            ],
            tone: 'warning',
            type: 'zone',
            visibility: 'public',
          },
        ],
        pegs: adminState.body.pegs.map((peg) =>
          peg.id === 'vc-04'
            ? {
                ...peg,
                label: 'Miesto 4 draft na zahodenie',
                x: 42.5,
              }
            : peg,
        ),
      }

      const save = await requestJson<MapSaveSuccess>(server, '/api/admin/map', {
        body: JSON.stringify(payload),
        method: 'PUT',
      })
      expect(save.response.status).toBe(200)
      expect(save.body.draftChanges?.mapShapes.added).toBe(1)
      expect(save.body.draftChanges?.mapShapes.addedItems).toContainEqual({
        id: 'shape-route-discarded-draft',
        label: 'Draft na zahodenie',
      })
      expect(save.body.draftChanges?.pegs.updated).toBe(1)
      expect(save.body.draftChanges?.pegs.updatedItems).toContainEqual({
        id: 'vc-04',
        label: 'Miesto 4 draft na zahodenie',
      })
      expect(save.body.hasUnpublishedChanges).toBe(true)

      const draftBeforeDiscard = await readLocalMapDraftState(undefined, await readLocalMapState())
      expect(draftBeforeDiscard.mapShapes.map((shape) => shape.id)).toContain('shape-route-discarded-draft')

      const discard = await requestJson<MapDraftDiscardSuccess>(server, '/api/admin/map/discard-draft', {
        method: 'POST',
      })
      expect(discard.response.status).toBe(200)
      expect(discard.body.draftChanges?.total).toBe(0)
      expect(discard.body.hasUnpublishedChanges).toBe(false)
      expect(discard.body.message).toContain('zahodené')
      expect(discard.body.mapShapes.map((shape) => shape.id)).not.toContain('shape-route-discarded-draft')
      expect(discard.body.pegs.find((peg) => peg.id === 'vc-04')?.label).toBe(
        publicBeforeDraft.body.pegs.find((peg) => peg.id === 'vc-04')?.label,
      )

      const publicAfterDiscard = await requestJson<MapStateResponse>(server, '/api/map', { cookie: null })
      expect(publicAfterDiscard.body.mapShapes.map((shape) => shape.id)).toEqual(publicBeforeDraft.body.mapShapes.map((shape) => shape.id))
      expect(publicAfterDiscard.body.pegs.find((peg) => peg.id === 'vc-04')?.label).toBe(
        publicBeforeDraft.body.pegs.find((peg) => peg.id === 'vc-04')?.label,
      )

      const adminAfterDiscard = await requestJson<MapStateResponse>(server, '/api/admin/map')
      expect(adminAfterDiscard.body.hasUnpublishedChanges).toBe(false)
      expect(adminAfterDiscard.body.draftChanges?.total).toBe(0)
      expect(adminAfterDiscard.body.mapShapes.map((shape) => shape.id)).not.toContain('shape-route-discarded-draft')

      const auditState = await readLocalAuditLogState()
      expect(auditState.events).toContainEqual(expect.objectContaining({
        action: 'map.draft_discarded',
        area: 'map',
        entityId: 'map-draft-state',
      }))
    }
    finally {
      await server.close()
    }
  })

  it('blocks map mutations for read-only map roles and invalid payloads', async () => {
    const server = await startRouteServer()

    try {
      const state = await requestJson<MapStateResponse>(server, '/api/admin/map')
      const readOnlySave = await requestJson<ValidationErrorResponse>(server, '/api/admin/map', {
        body: JSON.stringify({
          enabledLayerIds: state.body.mapLayers.map((layer) => layer.id),
          mapFacilities: state.body.mapFacilities,
          mapLayers: state.body.mapLayers,
          mapShapes: state.body.mapShapes,
          pegs: state.body.pegs,
        }),
        cookie: MARSHAL_COOKIE,
        method: 'PUT',
      })
      expect(readOnlySave.response.status).toBe(403)
      expect(readOnlySave.body.data.role).toBe('marshal')
      expect(readOnlySave.body.data.requiredMode).toBe('full')

      const readOnlyDiscard = await requestJson<ValidationErrorResponse>(server, '/api/admin/map/discard-draft', {
        cookie: MARSHAL_COOKIE,
        method: 'POST',
      })
      expect(readOnlyDiscard.response.status).toBe(403)
      expect(readOnlyDiscard.body.data.role).toBe('marshal')
      expect(readOnlyDiscard.body.data.requiredMode).toBe('full')

      const invalidSave = await requestJson<ValidationErrorResponse>(server, '/api/admin/map', {
        body: JSON.stringify({
          enabledLayerIds: ['missing-layer'],
          mapFacilities: state.body.mapFacilities,
          mapLayers: state.body.mapLayers,
          mapShapes: state.body.mapShapes,
          pegs: [state.body.pegs[0], state.body.pegs[0]],
        }),
        method: 'PUT',
      })
      expect(invalidSave.response.status).toBe(422)
      expect(invalidSave.body.statusMessage).toBe('Map save validation failed')
      expect(invalidSave.body.data.messages).toContain('Neznáma vrstva mapy: missing-layer.')
      expect(invalidSave.body.data.messages).toContain(`Duplicitné lovné miesto na mape: ${state.body.pegs[0]!.id}.`)
    }
    finally {
      await server.close()
    }
  })

  it('uploads public map backgrounds and serves only known map assets', async () => {
    const server = await startRouteServer()

    try {
      const upload = await requestJson<MapBackgroundUploadSuccess>(server, '/api/admin/map/background', {
        body: JSON.stringify({
          dataUrl: 'data:image/png;base64,aGVsbG8=',
          fileName: 'mapa-route.png',
          lake: 'velky-cetin',
          mimeType: 'image/png',
          sizeBytes: 5,
        }),
        method: 'POST',
      })
      expect(upload.response.status).toBe(200)
      expect(upload.body.draftChanges?.mapLayers.updated).toBeGreaterThanOrEqual(1)
      expect(upload.body.draftChanges?.mapLayers.updatedItems.map((item) => item.id)).toContain('layer-vc-background')
      expect(upload.body.draftChanges?.total).toBeGreaterThanOrEqual(1)
      expect(upload.body.source).toMatch(/^\/api\/map-assets\/map-bg-velky-cetin-\d+\.png$/)
      expect(upload.body.mapLayers.find((layer) => layer.id === 'layer-vc-background')?.source).toBe(upload.body.source)

      const publicAssetBeforePublish = await requestRaw(server, upload.body.source, { cookie: null })
      expect(publicAssetBeforePublish.status).toBe(404)

      const publish = await requestJson<MapPublishSuccess>(server, '/api/admin/map/publish', {
        method: 'POST',
      })
      expect(publish.response.status).toBe(200)
      expect(publish.body.draftChanges?.total).toBe(0)

      const publicAsset = await requestRaw(server, upload.body.source, { cookie: null })
      expect(publicAsset.status).toBe(200)
      expect(publicAsset.headers.get('content-type')).toBe('image/png')
      expect(Buffer.from(await publicAsset.arrayBuffer()).toString('utf8')).toBe('hello')

      const invalidAsset = await requestRaw(server, '/api/map-assets/bad$name.png', { cookie: null })
      expect(invalidAsset.status).toBe(404)

      const unknownAsset = await requestRaw(server, '/api/map-assets/map-bg-velky-cetin-unknown.png', { cookie: null })
      expect(unknownAsset.status).toBe(404)

      const auditState = await readLocalAuditLogState()
      expect(auditState.events).toContainEqual(expect.objectContaining({
        action: 'map.background_uploaded',
        area: 'map',
        entityId: 'layer-vc-background',
      }))
    }
    finally {
      await server.close()
    }
  })

  it('rejects invalid background uploads', async () => {
    const server = await startRouteServer()

    try {
      const upload = await requestJson<ValidationErrorResponse>(server, '/api/admin/map/background', {
        body: JSON.stringify({
          dataUrl: 'data:image/jpeg;base64,aGVsbG8=',
          fileName: 'mapa-route.png',
          lake: 'velky-cetin',
          mimeType: 'image/png',
          sizeBytes: 5,
        }),
        method: 'POST',
      })
      expect(upload.response.status).toBe(422)
      expect(upload.body.statusMessage).toBe('Map background upload validation failed')
      expect(upload.body.data.messages).toContain('Podklad mapy nemá platný dátový formát.')
    }
    finally {
      await server.close()
    }
  })
})
