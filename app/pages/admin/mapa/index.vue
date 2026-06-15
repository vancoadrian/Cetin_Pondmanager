<script setup lang="ts">
import type { CabinProduct, LakeSlug, MapCoordinate, MapFacility, MapFacilityType, MapLayer, MapLayerImageSettings, MapShape, Peg } from '~/data/pond'
import {
  MAX_MAP_BACKGROUND_BYTES,
  getValidationMessages,
  mapFacilityInputSchema,
  mapPegInputSchema,
  mapShapeInputSchema,
} from '~/schemas/pondSchemas'
import type { MapDraftChangeSummary, MapDraftDiscardSuccess, MapEntityChangeSummary, MapPublishSuccess, MapSaveSuccess, MapStateResponse } from '~/services/mapApiService'
import type { CabinCatalogMutationSuccess } from '~/services/cabinCatalogService'
import {
  clampMapPercent,
  defaultMapLayerImageSettings,
  mapFacilityTypeLabels,
  mapShapeToneLabels,
  mapShapeTypeLabels,
  normalizeMapLayerImageSettings,
} from '~/utils/map'
import {
  createMissingTournamentSectorShapeDrafts,
  createTournamentSectorShapeDraft,
  getTournamentSectorMapRows,
} from '~/utils/tournamentMap'

useHead({ title: 'Admin mapa' })

const route = useRoute()

type MapEditorSelectionKind = 'facility' | 'peg' | 'shape'
type MapBackgroundUploadSuccess = {
  draftChanges?: MapDraftChangeSummary
  draftUpdatedAt?: string
  hasUnpublishedChanges?: boolean
  ok: true
  mapLayers: MapLayer[]
  message: string
  publishedAt?: string
  source: string
  statusCode: 200
  updatedAt: string
}
type ShapePreset = {
  icon: string
  label: string
  type: MapShape['type']
}
type PegReservationPreset = {
  icon: string
  label: string
  requiresCabinReservation?: boolean
  status: Peg['status']
  type?: Peg['type']
}

const { cabinProducts: seedCabinProducts, getLakeName, lakes, mapFacilities, mapLayers, mapShapes, pegs, reservations, tournaments } = usePondData()
const { liveClosures } = await useClosureState({ admin: true, key: 'admin-map-closure-state' })

const getRouteQueryValue = (value: unknown) => {
  const singleValue = Array.isArray(value) ? value[0] : value

  return typeof singleValue === 'string' && singleValue.trim() ? singleValue : undefined
}

function emptyMapEntityChanges(): MapEntityChangeSummary {
  return {
    added: 0,
    addedItems: [],
    removed: 0,
    removedItems: [],
    updated: 0,
    updatedItems: [],
  }
}

function emptyMapDraftChanges(): MapDraftChangeSummary {
  return {
    mapFacilities: emptyMapEntityChanges(),
    mapLayers: emptyMapEntityChanges(),
    mapShapes: emptyMapEntityChanges(),
    pegs: emptyMapEntityChanges(),
    total: 0,
  }
}

const fallbackMapState = (): MapStateResponse => ({
  draftChanges: emptyMapDraftChanges(),
  draftUpdatedAt: 'seed',
  hasUnpublishedChanges: false,
  ok: true,
  mapFacilities,
  mapLayers,
  mapShapes,
  pegs,
  publishedAt: 'seed',
  updatedAt: 'seed',
})
const { data: mapState, refresh: refreshMapState } = await useAsyncData<MapStateResponse>(
  'admin-map-state',
  () => $fetch<MapStateResponse>('/api/admin/map'),
  {
    default: fallbackMapState,
  },
)
const { liveCabinProducts, refresh: refreshCabinCatalogState } = await useCabinCatalogState({
  admin: true,
  key: 'admin-map-cabin-catalog-state',
})
const {
  canManage: canManageMap,
  isReadOnly: mapReadOnly,
  label: mapAccessLabel,
  readOnlyMessage: mapReadOnlyMessage,
} = useAdminModuleAccess('map')

const selectedLake = ref<LakeSlug>('velky-cetin')
const selectedKind = ref<MapEditorSelectionKind>('peg')
const selectedPegId = ref('vc-03')
const selectedFacilityId = ref('')
const selectedShapeId = ref('')
const isDrawingShape = ref(false)
const isEditingBackground = ref(false)
const drawShapeType = ref<MapShape['type']>('zone')
const drawShapeLabel = ref('')
const draftShapePoints = ref<MapCoordinate[]>([])
const showMapGrid = ref(true)
const snapToGrid = ref(false)
const snapSize = ref(5)
const editorMapLayers = ref<MapLayer[]>(mapState.value.mapLayers.map(cloneMapLayer))
const editorPegs = ref<Peg[]>(mapState.value.pegs.map((peg) => ({ ...peg })))
const editorCabinProducts = ref<CabinProduct[]>(liveCabinProducts.value.map(cloneCabinProduct))
const editorFacilities = ref<MapFacility[]>(mapState.value.mapFacilities.map((facility) => ({ ...facility })))
const editorShapes = ref<MapShape[]>(mapState.value.mapShapes.map(cloneShape))
const enabledLayerIds = ref(
  mapState.value.mapLayers.filter((layer) => layer.enabled).map((layer) => layer.id),
)
const saveStatus = ref<'idle' | 'saving' | 'success' | 'error'>('idle')
const saveMessage = ref('')
const publishStatus = ref<'idle' | 'publishing' | 'success' | 'error'>('idle')
const publishMessage = ref('')
const discardStatus = ref<'idle' | 'discarding' | 'success' | 'error'>('idle')
const discardMessage = ref('')
const backgroundUploadStatus = ref<'idle' | 'uploading' | 'success' | 'error'>('idle')
const backgroundUploadMessage = ref('')
const cabinCatalogStatus = ref<'idle' | 'saving' | 'success' | 'error'>('idle')
const cabinCatalogMessage = ref('')
const routeFocusStatus = ref<'idle' | 'success' | 'warning'>('idle')
const routeFocusMessage = ref('')

const facilityTypeOptions = Object.entries(mapFacilityTypeLabels).map(([value, label]) => ({ label, value: value as MapFacilityType }))
const shapeTypeOptions = Object.entries(mapShapeTypeLabels).map(([value, label]) => ({ label, value: value as MapShape['type'] }))
const shapeToneOptions = Object.entries(mapShapeToneLabels).map(([value, label]) => ({ label, value: value as MapShape['tone'] }))
const shapePresetOptions: ShapePreset[] = [
  { icon: 'i-heroicons-sparkles', label: 'Vodná oblasť', type: 'shoreline' },
  { icon: 'i-heroicons-map', label: 'Ostrov / porast', type: 'island' },
  { icon: 'i-heroicons-no-symbol', label: 'Zákaz / režim', type: 'zone' },
  { icon: 'i-heroicons-flag', label: 'Súťažný sektor', type: 'sector' },
  { icon: 'i-heroicons-wrench-screwdriver', label: 'Servisná zóna', type: 'service' },
]
const snapSizeOptions = [
  { label: '1 %', value: 1 },
  { label: '2.5 %', value: 2.5 },
  { label: '5 %', value: 5 },
  { label: '10 %', value: 10 },
]
const backgroundFitOptions = [
  { label: 'Vyplniť', value: 'cover' },
  { label: 'Zobraziť celé', value: 'contain' },
  { label: 'Roztiahnuť', value: 'stretch' },
] as const
const visibilityOptions = [
  { label: 'verejné', value: 'public' },
  { label: 'interné', value: 'internal' },
  { label: 'súťažné', value: 'competition' },
] as const
const pegStatusOptions = [
  { label: 'voľné', value: 'free' },
  { label: 'rezervované', value: 'reserved' },
  { label: 'víkendovo voľné', value: 'weekend-free' },
  { label: 'údržba', value: 'maintenance' },
] as const
const pegReservationPresetOptions: PegReservationPreset[] = [
  { icon: 'i-heroicons-map-pin', label: 'Brehové miesto', status: 'free', type: 'shore' },
  { icon: 'i-heroicons-home-modern', label: 'Chata povinná', requiresCabinReservation: true, status: 'free', type: 'cabin' },
  { icon: 'i-heroicons-home', label: 'Chata voliteľná', requiresCabinReservation: false, status: 'free', type: 'cabin' },
  { icon: 'i-heroicons-clipboard-document-check', label: 'Termín potvrdiť', status: 'weekend-free' },
  { icon: 'i-heroicons-lock-closed', label: 'Rezervované ručne', status: 'reserved' },
  { icon: 'i-heroicons-wrench-screwdriver', label: 'Údržba / blok', status: 'maintenance' },
]

const currentLake = computed(() => lakes.find((lake) => lake.slug === selectedLake.value) ?? lakes[0]!)
const storedPegs = computed(() => mapState.value.pegs)
const storedMapFacilities = computed(() => mapState.value.mapFacilities)
const storedMapLayers = computed(() => editorMapLayers.value)
const storedMapShapes = computed(() => mapState.value.mapShapes)
const lakeLayers = computed(() => storedMapLayers.value.filter((layer) => layer.lake === selectedLake.value))
const enabledLayers = computed(() =>
  lakeLayers.value.filter((layer) => enabledLayerIds.value.includes(layer.id)),
)
const currentBackgroundLayer = computed(() =>
  enabledLayers.value.find((layer) => layer.kind === 'background')
  ?? lakeLayers.value.find((layer) => layer.kind === 'background'),
)
const activeBackgroundImage = computed(() =>
  currentBackgroundLayer.value && enabledLayerIds.value.includes(currentBackgroundLayer.value.id)
    ? currentBackgroundLayer.value.source ?? ''
    : '',
)
const currentBackgroundImageSettings = computed(() => currentBackgroundLayer.value?.imageSettings)
const normalizedBackgroundImageSettings = computed(() =>
  normalizeMapLayerImageSettings(currentBackgroundImageSettings.value),
)
const lakePegs = computed(() => editorPegs.value.filter((peg) => peg.lake === selectedLake.value))
const lakeFacilities = computed(() => editorFacilities.value.filter((facility) => facility.lake === selectedLake.value))
const lakeShapes = computed(() => editorShapes.value.filter((shape) => shape.lake === selectedLake.value))
const visiblePegs = computed(() =>
  lakePegs.value.filter((peg) => {
    if (peg.type === 'cabin') return enabledLayers.value.some((layer) => layer.kind === 'cabins')
    return enabledLayers.value.some((layer) => layer.kind === 'pegs')
  }),
)
const visibleFacilities = computed(() =>
  lakeFacilities.value.filter(() => enabledLayers.value.some((layer) => layer.kind === 'service')),
)
const visibleShapes = computed(() =>
  lakeShapes.value.filter((shape) => {
    return enabledLayers.value.some((layer) => layer.kind === getLayerKindForShape(shape))
  }),
)
const selectedPeg = computed(() => lakePegs.value.find((peg) => peg.id === selectedPegId.value) ?? lakePegs.value[0])
const selectedPegStatusLabel = computed(() =>
  pegStatusOptions.find((option) => option.value === selectedPeg.value?.status)?.label ?? '',
)
const selectedPegCabinProduct = computed(() =>
  selectedPeg.value?.type === 'cabin'
    ? editorCabinProducts.value.find((cabin) => cabin.pegIds.includes(selectedPeg.value?.id ?? ''))
    : undefined,
)
const selectedPegCabinProductId = computed(() => selectedPegCabinProduct.value?.id ?? '')
const selectedPegReservationSummary = computed(() => {
  const peg = selectedPeg.value
  if (!peg) return 'Vyber miesto v mape.'

  if (peg.status === 'maintenance') return 'Miesto je blokované pre údržbu alebo interný servis.'
  if (peg.status === 'reserved') return 'Miesto je ručne označené ako rezervované.'
  if (peg.status === 'weekend-free') return 'Miesto ostáva rezervovateľné, ale termín má potvrdiť správca.'
  if (peg.type === 'cabin' && peg.requiresCabinReservation) return 'Rezervácia tohto miesta je viazaná na chatu.'
  if (peg.type === 'cabin') return 'Miesto je vedené ako chata, ale chata nie je povinná.'

  return 'Samostatné lovné miesto bez povinnej chaty.'
})
const selectedFacility = computed(() =>
  lakeFacilities.value.find((facility) => facility.id === selectedFacilityId.value) ?? lakeFacilities.value[0],
)
const selectedShape = computed(() =>
  lakeShapes.value.find((shape) => shape.id === selectedShapeId.value) ?? lakeShapes.value[0],
)
const shapeTypeCounts = computed(() =>
  shapePresetOptions.map((preset) => ({
    ...preset,
    count: lakeShapes.value.filter((shape) => shape.type === preset.type).length,
  })),
)
const selectedShapeLayerName = computed(() => {
  if (!selectedShape.value) return ''

  const layerKind = getLayerKindForShape(selectedShape.value)
  return lakeLayers.value.find((layer) => layer.kind === layerKind)?.name ?? 'Vrstva mapy'
})
const selectedShapePreset = computed(() =>
  selectedShape.value
    ? shapePresetOptions.find((preset) => preset.type === selectedShape.value?.type)
    : undefined,
)
const selectedShapeVisibilityLabel = computed(() =>
  visibilityOptions.find((option) => option.value === selectedShape.value?.visibility)?.label ?? '',
)
const selectedLakeTournaments = computed(() =>
  tournaments.filter((tournament) => tournament.lake === selectedLake.value),
)
const requestedTournamentId = computed(() => getRouteQueryValue(route.query.turnaj))
const requestedSectorId = computed(() => getRouteQueryValue(route.query.sektor))
const requestedTournament = computed(() =>
  tournaments.find((tournament) => tournament.id === requestedTournamentId.value),
)
const requestedTournamentSector = computed(() =>
  requestedTournament.value?.sectors.find((sector) => sector.id === requestedSectorId.value),
)
const focusedTournament = computed(() =>
  requestedTournament.value?.lake === selectedLake.value
    ? requestedTournament.value
    : selectedLakeTournaments.value[0],
)
const focusedTournamentSectorRows = computed(() =>
  focusedTournament.value ? getTournamentSectorMapRows(focusedTournament.value, editorShapes.value) : [],
)
const missingFocusedTournamentSectorRows = computed(() =>
  focusedTournamentSectorRows.value.filter((row) => !row.mapped),
)
const selectedShapeTournament = computed(() =>
  selectedLakeTournaments.value.find((tournament) => tournament.id === selectedShape.value?.tournamentId)
  ?? selectedLakeTournaments.value[0],
)
const selectedShapeSectorOptions = computed(() => selectedShapeTournament.value?.sectors ?? [])
const cabinPegs = computed(() => lakePegs.value.filter((peg) => peg.type === 'cabin'))
const linkedTournamentSectorShapes = computed(() =>
  lakeShapes.value.filter((shape) => shape.type === 'sector' && Boolean(shape.tournamentId) && Boolean(shape.sectorId)),
)
const linkedCabinPegIds = computed(() =>
  new Set(editorCabinProducts.value.flatMap((cabin) => cabin.pegIds)),
)
const changedCabinProducts = computed(() =>
  editorCabinProducts.value.filter((cabin) => {
    const original = liveCabinProducts.value.find((item) => item.id === cabin.id)
      ?? seedCabinProducts.find((item) => item.id === cabin.id)

    return !original || JSON.stringify(original) !== JSON.stringify(cabin)
  }),
)
const changedPegs = computed(() =>
  editorPegs.value.filter((peg) => {
    const original = storedPegs.value.find((item) => item.id === peg.id)
    if (!original) return true
    return (
      original.capacity !== peg.capacity ||
      original.label !== peg.label ||
      original.notes !== peg.notes ||
      Boolean(original.requiresCabinReservation) !== Boolean(peg.requiresCabinReservation) ||
      original.status !== peg.status ||
      original.type !== peg.type ||
      original.x !== peg.x ||
      original.y !== peg.y
    )
  }),
)
const changedFacilities = computed(() =>
  editorFacilities.value.filter((facility) => {
    const original = storedMapFacilities.value.find((item) => item.id === facility.id)
    return !original || JSON.stringify(original) !== JSON.stringify(facility)
  }),
)
const changedShapes = computed(() =>
  editorShapes.value.filter((shape) => {
    const original = storedMapShapes.value.find((item) => item.id === shape.id)
    return !original || JSON.stringify(original) !== JSON.stringify(shape)
  }),
)
const changedLayers = computed(() =>
  editorMapLayers.value.filter((layer) => {
    const original = mapState.value.mapLayers.find((item) => item.id === layer.id)
    return !original || JSON.stringify(original) !== JSON.stringify(layer)
  }),
)
const selectedLayerSummary = computed(() =>
  enabledLayers.value.map((layer) => layer.name).join(', ') || 'žiadna aktívna vrstva',
)
const selectedPegValidation = computed(() =>
  selectedPeg.value ? mapPegInputSchema.safeParse(selectedPeg.value) : mapPegInputSchema.safeParse({}),
)
const selectedPegValidationMessages = computed(() => getValidationMessages(selectedPegValidation.value))
const selectedFacilityValidation = computed(() =>
  selectedFacility.value ? mapFacilityInputSchema.safeParse(selectedFacility.value) : mapFacilityInputSchema.safeParse({}),
)
const selectedFacilityValidationMessages = computed(() => getValidationMessages(selectedFacilityValidation.value))
const selectedShapeValidation = computed(() =>
  selectedShape.value ? mapShapeInputSchema.safeParse(selectedShape.value) : mapShapeInputSchema.safeParse({}),
)
const selectedShapeValidationMessages = computed(() => getValidationMessages(selectedShapeValidation.value))
const selectedValidationMessages = computed(() => {
  if (selectedKind.value === 'facility') return selectedFacilityValidationMessages.value
  if (selectedKind.value === 'shape') return selectedShapeValidationMessages.value

  return selectedPegValidationMessages.value
})
const selectedValidationIsValid = computed(() => {
  if (selectedKind.value === 'facility') return selectedFacilityValidation.value.success
  if (selectedKind.value === 'shape') return selectedShapeValidation.value.success

  return selectedPegValidation.value.success
})
const changedItemsCount = computed(() => changedPegs.value.length + changedFacilities.value.length + changedShapes.value.length + changedLayers.value.length)
const exportModel = computed(() => ({
  facilities: changedFacilities.value,
  layers: changedLayers.value,
  pegs: changedPegs.value.map((peg) => ({
    capacity: peg.capacity,
    id: peg.id,
    label: peg.label,
    requiresCabinReservation: peg.requiresCabinReservation,
    status: peg.status,
    type: peg.type,
    x: peg.x,
    y: peg.y,
  })),
  shapes: changedShapes.value,
}))
const draftShape = computed<MapShape | undefined>(() => {
  if (!isDrawingShape.value || draftShapePoints.value.length === 0) return undefined

  return {
    id: 'shape-draft',
    lake: selectedLake.value,
    label: drawShapeLabel.value.trim() || mapShapeTypeLabels[drawShapeType.value],
    points: draftShapePoints.value.map((point) => ({ ...point })),
    tone: getDefaultShapeTone(drawShapeType.value),
    type: drawShapeType.value,
    visibility: getDefaultShapeVisibility(drawShapeType.value),
  }
})
const canFinishDraftShape = computed(() => draftShapePoints.value.length >= 3)
const mapPublishStateLabel = computed(() =>
  mapState.value.hasUnpublishedChanges
    ? 'Draft čaká na publikovanie'
    : 'Verejná mapa je aktuálna',
)
const draftChangeTotal = computed(() => mapState.value.draftChanges?.total ?? 0)
const draftChangeRows = computed(() => {
  const changes = mapState.value.draftChanges ?? emptyMapDraftChanges()
  return [
    { label: 'Lovné miesta', summary: changes.pegs },
    { label: 'Servisné body', summary: changes.mapFacilities },
    { label: 'Plochy', summary: changes.mapShapes },
    { label: 'Vrstvy', summary: changes.mapLayers },
  ]
    .map((row) => ({
      ...row,
      total: row.summary.added + row.summary.updated + row.summary.removed,
    }))
    .filter((row) => row.total > 0)
})

function formatDraftEntityChanges(summary: MapEntityChangeSummary) {
  return [
    summary.added > 0 ? `+${summary.added} pridané` : '',
    summary.updated > 0 ? `${summary.updated} upravené` : '',
    summary.removed > 0 ? `-${summary.removed} odstránené` : '',
  ].filter(Boolean).join(' · ')
}

function formatDraftEntityChangeItems(summary: MapEntityChangeSummary) {
  const labels = [
    ...summary.addedItems.map((item) => `+ ${item.label}`),
    ...summary.updatedItems.map((item) => `~ ${item.label}`),
    ...summary.removedItems.map((item) => `- ${item.label}`),
  ]

  if (labels.length <= 4) return labels.join(', ')

  return `${labels.slice(0, 4).join(', ')} a ďalšie ${labels.length - 4}`
}

watch(
  mapState,
  (state) => {
    editorPegs.value = state.pegs.map((peg) => ({ ...peg }))
    editorMapLayers.value = state.mapLayers.map(cloneMapLayer)
    editorFacilities.value = state.mapFacilities.map((facility) => ({ ...facility }))
    editorShapes.value = state.mapShapes.map(cloneShape)
    enabledLayerIds.value = state.mapLayers.filter((layer) => layer.enabled).map((layer) => layer.id)
  },
  { immediate: true },
)

watch(
  liveCabinProducts,
  (products) => {
    editorCabinProducts.value = (products.length > 0 ? products : seedCabinProducts).map(cloneCabinProduct)
  },
  { immediate: true },
)

watch(selectedLake, () => {
  selectedPegId.value = lakePegs.value[0]?.id ?? ''
  selectedFacilityId.value = lakeFacilities.value[0]?.id ?? ''
  selectedShapeId.value = lakeShapes.value[0]?.id ?? ''
  selectedKind.value = 'peg'
  cancelShapeDrawing()
  isEditingBackground.value = false
  saveStatus.value = 'idle'
  saveMessage.value = ''
  publishStatus.value = 'idle'
  publishMessage.value = ''
  discardStatus.value = 'idle'
  discardMessage.value = ''
  resetBackgroundUploadFeedback()
  resetCabinCatalogFeedback()
})

watch(snapToGrid, (enabled) => {
  if (enabled) showMapGrid.value = true
})

function cloneShape(shape: MapShape): MapShape {
  return {
    ...shape,
    points: shape.points.map((point) => ({ ...point })),
  }
}

function cloneMapLayer(layer: MapLayer): MapLayer {
  return {
    ...layer,
    imageSettings: layer.imageSettings ? { ...layer.imageSettings } : undefined,
  }
}

function cloneCabinProduct(cabin: CabinProduct): CabinProduct {
  return {
    ...cabin,
    equipment: [...cabin.equipment],
    pegIds: [...cabin.pegIds],
  }
}

function getLayerKindForShape(shape: Pick<MapShape, 'type'>) {
  if (shape.type === 'sector') return 'sectors'
  if (shape.type === 'service') return 'service'

  return 'background'
}

function getDefaultShapeTone(type: MapShape['type']): MapShape['tone'] {
  if (type === 'sector') return 'sector'
  if (type === 'service') return 'service'
  if (type === 'island') return 'reed'
  if (type === 'shoreline') return 'water'

  return 'warning'
}

function getDefaultShapeVisibility(type: MapShape['type']): MapShape['visibility'] {
  if (type === 'shoreline' || type === 'island') return 'public'
  if (type === 'sector') return 'competition'

  return 'internal'
}

function applyShapeTypeDefaults(shape: MapShape, type: MapShape['type']) {
  shape.type = type
  shape.tone = getDefaultShapeTone(type)
  shape.visibility = getDefaultShapeVisibility(type)
  if (type === 'sector') {
    applyShapeTournamentDefaults(shape)
  }
  else {
    shape.sectorId = undefined
    shape.tournamentId = undefined
  }
  ensureShapeLayerVisible(type)
  resetSaveFeedback()
}

function getDefaultTournamentForSelectedLake() {
  return tournaments.find((tournament) => tournament.lake === selectedLake.value)
}

function getNextUnlinkedSectorId(tournamentId: string, currentShapeId?: string) {
  const tournament = tournaments.find((item) => item.id === tournamentId)
  if (!tournament) return undefined

  const linkedSectorIds = new Set(
    editorShapes.value
      .filter((shape) => shape.id !== currentShapeId && shape.type === 'sector' && shape.tournamentId === tournamentId)
      .map((shape) => shape.sectorId)
      .filter((sectorId): sectorId is string => Boolean(sectorId)),
  )

  return tournament.sectors.find((sector) => !linkedSectorIds.has(sector.id))?.id
    ?? tournament.sectors[0]?.id
}

function applyShapeTournamentDefaults(shape: MapShape) {
  const tournament = shape.tournamentId
    ? tournaments.find((item) => item.id === shape.tournamentId)
    : getDefaultTournamentForSelectedLake()

  shape.tournamentId = tournament?.id
  shape.sectorId = tournament && tournament.sectors.some((sector) => sector.id === shape.sectorId)
    ? shape.sectorId
    : tournament ? getNextUnlinkedSectorId(tournament.id, shape.id) : undefined
}

function ensureShapeLayerVisible(type: MapShape['type']) {
  const draftLayerKind = getLayerKindForShape({ type })
  const layerIds = lakeLayers.value
    .filter((layer) => layer.kind === draftLayerKind)
    .map((layer) => layer.id)
  const missingLayerIds = layerIds.filter((layerId) => !enabledLayerIds.value.includes(layerId))
  if (missingLayerIds.length > 0) {
    enabledLayerIds.value = [...enabledLayerIds.value, ...missingLayerIds]
  }
}

function getLakePrefix(lake: LakeSlug) {
  return lake === 'velky-cetin' ? 'vc' : 'sk'
}

function createUniqueId(prefix: string, existingIds: string[]) {
  const existing = new Set(existingIds)
  let index = existing.size + 1
  let candidate = `${prefix}-${index}`

  while (existing.has(candidate)) {
    index += 1
    candidate = `${prefix}-${index}`
  }

  return candidate
}

function resetSaveFeedback() {
  saveStatus.value = 'idle'
  saveMessage.value = ''
}

function resetBackgroundUploadFeedback() {
  backgroundUploadStatus.value = 'idle'
  backgroundUploadMessage.value = ''
}

function resetCabinCatalogFeedback() {
  cabinCatalogStatus.value = 'idle'
  cabinCatalogMessage.value = ''
}

function getEditableBackgroundLayer() {
  const layer = editorMapLayers.value.find((item) => item.lake === selectedLake.value && item.kind === 'background')
  if (!layer) return undefined

  layer.imageSettings = normalizeMapLayerImageSettings(layer.imageSettings ?? defaultMapLayerImageSettings)

  return layer
}

function updateBackgroundImageSetting<Key extends keyof MapLayerImageSettings>(
  key: Key,
  value: MapLayerImageSettings[Key],
) {
  if (!canManageMap.value) return

  const layer = getEditableBackgroundLayer()
  if (!layer?.imageSettings) return

  layer.imageSettings = normalizeMapLayerImageSettings({
    ...layer.imageSettings,
    [key]: value,
  })
  saveStatus.value = 'idle'
  saveMessage.value = ''
  resetBackgroundUploadFeedback()
}

function updateBackgroundImageFit(event: Event) {
  const target = event.target as HTMLSelectElement
  updateBackgroundImageSetting('fit', target.value as MapLayerImageSettings['fit'])
}

function updateBackgroundImageNumber(key: 'offsetX' | 'offsetY' | 'opacity' | 'scale', event: Event) {
  const target = event.target as HTMLInputElement
  updateBackgroundImageSetting(key, Number(target.value))
}

function moveBackgroundImage(settings: MapLayerImageSettings) {
  if (!canManageMap.value) return

  const layer = getEditableBackgroundLayer()
  if (!layer) return

  layer.imageSettings = normalizeMapLayerImageSettings(settings)
  saveStatus.value = 'idle'
  saveMessage.value = ''
  resetBackgroundUploadFeedback()
}

function toggleBackgroundEditing() {
  if (!canManageMap.value || !activeBackgroundImage.value) return

  if (!isEditingBackground.value) {
    cancelShapeDrawing()
  }

  isEditingBackground.value = !isEditingBackground.value
}

function resetBackgroundImageSettings() {
  if (!canManageMap.value) return

  const layer = getEditableBackgroundLayer()
  if (!layer) return

  layer.imageSettings = { ...defaultMapLayerImageSettings }
  saveStatus.value = 'idle'
  saveMessage.value = ''
  resetBackgroundUploadFeedback()
}

function selectPeg(peg: Peg) {
  selectedKind.value = 'peg'
  selectedPegId.value = peg.id
  resetSaveFeedback()
}

function selectFacility(facility: MapFacility) {
  selectedKind.value = 'facility'
  selectedFacilityId.value = facility.id
  resetSaveFeedback()
}

function selectShape(shape: MapShape) {
  selectedKind.value = 'shape'
  selectedShapeId.value = shape.id
  resetSaveFeedback()
}

function toggleLayer(layerId: string) {
  if (enabledLayerIds.value.includes(layerId)) {
    enabledLayerIds.value = enabledLayerIds.value.filter((id) => id !== layerId)
    return
  }

  enabledLayerIds.value = [...enabledLayerIds.value, layerId]
  saveStatus.value = 'idle'
  saveMessage.value = ''
  resetBackgroundUploadFeedback()
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('Nepodarilo sa načítať obrázok.'))
    })
    reader.addEventListener('error', () => reject(new Error('Nepodarilo sa načítať obrázok.')))
    reader.readAsDataURL(file)
  })
}

function getUploadErrorMessage(error: unknown) {
  const fetchError = error as {
    data?: {
      data?: {
        messages?: string[]
      }
      message?: string
      statusMessage?: string
    }
    message?: string
  }

  return (
    fetchError.data?.data?.messages?.join(' ') ??
    fetchError.data?.message ??
    fetchError.data?.statusMessage ??
    fetchError.message ??
    'Podkladový obrázok sa nepodarilo nahrať.'
  )
}

async function uploadBackgroundImage(event: Event) {
  if (!canManageMap.value) {
    backgroundUploadStatus.value = 'error'
    backgroundUploadMessage.value = mapReadOnlyMessage.value
    return
  }

  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    backgroundUploadStatus.value = 'error'
    backgroundUploadMessage.value = 'Podporované sú iba JPG, PNG alebo WebP podklady mapy.'
    return
  }

  if (file.size > MAX_MAP_BACKGROUND_BYTES) {
    backgroundUploadStatus.value = 'error'
    backgroundUploadMessage.value = 'Podklad mapy môže mať najviac 10 MB.'
    return
  }

  backgroundUploadStatus.value = 'uploading'
  backgroundUploadMessage.value = ''

  try {
    const result = await $fetch<MapBackgroundUploadSuccess>('/api/admin/map/background', {
      body: {
        dataUrl: await fileToDataUrl(file),
        fileName: file.name,
        lake: selectedLake.value,
        mimeType: file.type,
        sizeBytes: file.size,
      },
      method: 'POST',
    })

    mapState.value = {
      ...mapState.value,
      draftUpdatedAt: result.draftUpdatedAt ?? result.updatedAt,
      draftChanges: result.draftChanges ?? mapState.value.draftChanges ?? emptyMapDraftChanges(),
      hasUnpublishedChanges: Boolean(result.hasUnpublishedChanges),
      mapLayers: result.mapLayers,
      publishedAt: result.publishedAt ?? mapState.value.publishedAt,
      updatedAt: result.updatedAt,
    }
    editorMapLayers.value = result.mapLayers.map(cloneMapLayer)
    await refreshMapState()
    backgroundUploadStatus.value = 'success'
    backgroundUploadMessage.value = result.message
  }
  catch (error) {
    backgroundUploadStatus.value = 'error'
    backgroundUploadMessage.value = getUploadErrorMessage(error)
  }
}

function addPegDraft(type: Peg['type']) {
  if (!canManageMap.value) return

  const id = createUniqueId(`peg-${getLakePrefix(selectedLake.value)}-${type}`, editorPegs.value.map((peg) => peg.id))
  const peg: Peg = {
    capacity: 2,
    id,
    lake: selectedLake.value,
    label: type === 'cabin' ? `Nové miesto s chatou ${lakePegs.value.length + 1}` : `Nové lovné miesto ${lakePegs.value.length + 1}`,
    notes: 'Doplňte poznámku pre rybárov a správcu.',
    requiresCabinReservation: type === 'cabin' ? true : undefined,
    status: 'free',
    type,
    x: 50,
    y: 50,
  }

  editorPegs.value.push(peg)
  selectPeg(peg)
}

function addFacilityDraft(type: MapFacilityType) {
  if (!canManageMap.value) return

  const id = createUniqueId(`facility-${getLakePrefix(selectedLake.value)}-${type}`, editorFacilities.value.map((facility) => facility.id))
  const facility: MapFacility = {
    id,
    lake: selectedLake.value,
    label: mapFacilityTypeLabels[type],
    notes: 'Doplňte prevádzkovú poznámku alebo pravidlo dostupnosti.',
    type,
    visibility: type === 'wood' || type === 'storage' || type === 'electricity' ? 'internal' : 'public',
    x: 50,
    y: 50,
  }

  editorFacilities.value.push(facility)
  selectFacility(facility)
}

function addShapeDraft(type: MapShape['type']) {
  if (!canManageMap.value) return

  cancelShapeDrawing()
  ensureShapeLayerVisible(type)
  const id = createUniqueId(`shape-${getLakePrefix(selectedLake.value)}-${type}`, editorShapes.value.map((shape) => shape.id))
  const baseX = 34 + ((lakeShapes.value.length % 3) * 5)
  const baseY = 30 + ((lakeShapes.value.length % 2) * 6)
  const shape: MapShape = {
    id,
    lake: selectedLake.value,
    label: mapShapeTypeLabels[type],
    points: [
      { x: baseX, y: baseY },
      { x: baseX + 18, y: baseY + 2 },
      { x: baseX + 16, y: baseY + 14 },
      { x: baseX + 2, y: baseY + 16 },
    ],
    tone: getDefaultShapeTone(type),
    type,
    visibility: getDefaultShapeVisibility(type),
  }
  if (type === 'sector') applyShapeTournamentDefaults(shape)

  editorShapes.value.push(shape)
  selectShape(shape)
}

function startShapeDrawing(type = drawShapeType.value) {
  if (!canManageMap.value) return

  drawShapeType.value = type
  drawShapeLabel.value = drawShapeLabel.value.trim() || mapShapeTypeLabels[type]
  draftShapePoints.value = []
  isDrawingShape.value = true
  isEditingBackground.value = false
  selectedKind.value = 'shape'
  selectedShapeId.value = ''
  ensureShapeLayerVisible(type)
  saveStatus.value = 'idle'
  saveMessage.value = ''
}

function addDraftShapePoint(point: MapCoordinate) {
  if (!canManageMap.value || !isDrawingShape.value) return
  draftShapePoints.value = [...draftShapePoints.value, { ...point }]
  saveStatus.value = 'idle'
  saveMessage.value = ''
}

function undoDraftShapePoint() {
  if (!canManageMap.value || draftShapePoints.value.length === 0) return
  draftShapePoints.value = draftShapePoints.value.slice(0, -1)
}

function cancelShapeDrawing() {
  isDrawingShape.value = false
  draftShapePoints.value = []
}

function finishShapeDrawing() {
  if (!canManageMap.value || !canFinishDraftShape.value) return

  const type = drawShapeType.value
  const id = createUniqueId(`shape-${getLakePrefix(selectedLake.value)}-${type}`, editorShapes.value.map((shape) => shape.id))
  const shape: MapShape = {
    id,
    lake: selectedLake.value,
    label: drawShapeLabel.value.trim() || mapShapeTypeLabels[type],
    points: draftShapePoints.value.map((point) => ({ ...point })),
    tone: getDefaultShapeTone(type),
    type,
    visibility: getDefaultShapeVisibility(type),
  }
  if (type === 'sector') applyShapeTournamentDefaults(shape)

  editorShapes.value.push(shape)
  cancelShapeDrawing()
  selectShape(shape)
}

async function focusRequestedTournamentSector() {
  const tournamentId = requestedTournamentId.value
  const sectorId = requestedSectorId.value

  if (!tournamentId && !sectorId) return

  const tournament = requestedTournament.value
  if (!tournament) {
    routeFocusStatus.value = 'warning'
    routeFocusMessage.value = `Súťaž ${tournamentId ?? ''} sa v mapovom editore nenašla.`
    return
  }

  selectedLake.value = tournament.lake
  await nextTick()
  ensureShapeLayerVisible('sector')

  if (!sectorId) {
    routeFocusStatus.value = 'success'
    routeFocusMessage.value = `Mapa je prepnutá na jazero ${getLakeName(tournament.lake)} pre súťaž ${tournament.name}.`
    return
  }

  const sector = requestedTournamentSector.value
  if (!sector) {
    routeFocusStatus.value = 'warning'
    routeFocusMessage.value = `Sektor ${sectorId} nepatrí k súťaži ${tournament.name}.`
    return
  }

  const existingShape = editorShapes.value.find((shape) =>
    shape.lake === tournament.lake
    && shape.type === 'sector'
    && shape.tournamentId === tournament.id
    && shape.sectorId === sector.id,
  )

  if (existingShape) {
    cancelShapeDrawing()
    selectShape(existingShape)
    routeFocusStatus.value = 'success'
    routeFocusMessage.value = `Otvorený existujúci polygon pre sektor ${sector.label}.`
    return
  }

  if (!canManageMap.value) {
    selectedKind.value = 'shape'
    routeFocusStatus.value = 'warning'
    routeFocusMessage.value = `Sektor ${sector.label} zatiaľ nemá polygon. Na jeho vytvorenie potrebuješ plný prístup k mape.`
    return
  }

  const shape = createTournamentSectorShapeDraft(
    tournament,
    sector,
    editorShapes.value.map((item) => item.id),
  )

  editorShapes.value.push(shape)
  cancelShapeDrawing()
  selectShape(shape)
  resetSaveFeedback()
  routeFocusStatus.value = 'success'
  routeFocusMessage.value = `Pripravený nový neuložený polygon pre sektor ${sector.label}. Uprav vrcholy a ulož draft mapy.`
}

function addMissingTournamentSectorShapeDrafts() {
  const tournament = focusedTournament.value
  if (!tournament) {
    routeFocusStatus.value = 'warning'
    routeFocusMessage.value = 'Pre vybrané jazero nie je pripravená žiadna súťaž.'
    return
  }

  if (!canManageMap.value) {
    routeFocusStatus.value = 'warning'
    routeFocusMessage.value = mapReadOnlyMessage.value
    return
  }

  const drafts = createMissingTournamentSectorShapeDrafts(tournament, editorShapes.value)
  if (drafts.length === 0) {
    routeFocusStatus.value = 'success'
    routeFocusMessage.value = `Všetky sektory súťaže ${tournament.name} už majú polygon v aktuálnom editore.`
    return
  }

  ensureShapeLayerVisible('sector')
  editorShapes.value.push(...drafts)
  cancelShapeDrawing()
  selectShape(drafts[0]!)
  resetSaveFeedback()
  routeFocusStatus.value = 'success'
  routeFocusMessage.value = `Doplnené neuložené polygony pre ${drafts.length} sektorov súťaže ${tournament.name}.`
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element) return false

  return element.isContentEditable || ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)
}

function handleDrawingShortcut(event: KeyboardEvent) {
  if (!isDrawingShape.value || isTypingTarget(event.target)) return

  if (event.key === 'Escape') {
    event.preventDefault()
    cancelShapeDrawing()
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    finishShapeDrawing()
    return
  }

  if (event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault()
    undoDraftShapePoint()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleDrawingShortcut)
  void focusRequestedTournamentSector()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleDrawingShortcut)
})

watch([requestedTournamentId, requestedSectorId], () => {
  void focusRequestedTournamentSector()
})

function movePoint(payload: { id: string, x: number, y: number }) {
  if (!canManageMap.value) return

  const peg = editorPegs.value.find((item) => item.id === payload.id)
  if (!peg) return
  peg.x = payload.x
  peg.y = payload.y
  selectedPegId.value = payload.id
  saveStatus.value = 'idle'
  saveMessage.value = ''
}

function moveFacility(payload: { id: string, x: number, y: number }) {
  if (!canManageMap.value) return

  const facility = editorFacilities.value.find((item) => item.id === payload.id)
  if (!facility) return
  facility.x = payload.x
  facility.y = payload.y
  selectFacility(facility)
}

function moveShape(payload: { id: string, dx: number, dy: number }) {
  if (!canManageMap.value) return

  const shape = editorShapes.value.find((item) => item.id === payload.id)
  if (!shape) return

  const minX = Math.min(...shape.points.map((point) => point.x))
  const maxX = Math.max(...shape.points.map((point) => point.x))
  const minY = Math.min(...shape.points.map((point) => point.y))
  const maxY = Math.max(...shape.points.map((point) => point.y))
  const dx = Math.min(100 - maxX, Math.max(-minX, payload.dx))
  const dy = Math.min(100 - maxY, Math.max(-minY, payload.dy))

  shape.points = shape.points.map((point) => ({
    x: clampMapPercent(point.x + dx),
    y: clampMapPercent(point.y + dy),
  }))
  selectShape(shape)
}

function moveShapePoint(payload: { id: string, pointIndex: number, x: number, y: number }) {
  if (!canManageMap.value) return

  const shape = editorShapes.value.find((item) => item.id === payload.id)
  if (!shape || !shape.points[payload.pointIndex]) return
  shape.points[payload.pointIndex] = { x: payload.x, y: payload.y }
  selectShape(shape)
}

function removePegFromCabinProducts(pegId: string) {
  editorCabinProducts.value = editorCabinProducts.value.map((cabin) => ({
    ...cabin,
    pegIds: cabin.pegIds.filter((id) => id !== pegId),
  }))
}

function updateSelectedPegType() {
  const peg = selectedPeg.value
  if (!canManageMap.value || !peg) return

  if (peg.type === 'shore') {
    peg.requiresCabinReservation = undefined
    removePegFromCabinProducts(peg.id)
  }
  else if (peg.requiresCabinReservation === undefined) {
    peg.requiresCabinReservation = true
  }

  resetSaveFeedback()
}

function applySelectedPegReservationPreset(preset: PegReservationPreset) {
  const peg = selectedPeg.value
  if (!canManageMap.value || !peg) return

  if (preset.type) {
    peg.type = preset.type
  }
  peg.status = preset.status

  if (peg.type === 'shore') {
    peg.requiresCabinReservation = undefined
    removePegFromCabinProducts(peg.id)
  }
  else if (preset.requiresCabinReservation !== undefined) {
    peg.requiresCabinReservation = preset.requiresCabinReservation
  }
  else if (peg.requiresCabinReservation === undefined) {
    peg.requiresCabinReservation = true
  }

  resetSaveFeedback()
}

function setSelectedPegCabinProduct(cabinProductId: string) {
  const peg = selectedPeg.value
  if (!canManageMap.value || !peg) return

  if (peg.type !== 'cabin') {
    peg.type = 'cabin'
    peg.requiresCabinReservation = true
  }

  editorCabinProducts.value = editorCabinProducts.value.map((cabin) => {
    const nextPegIds = cabin.pegIds.filter((id) => id !== peg.id)

    return {
      ...cabin,
      pegIds: cabin.id === cabinProductId ? [...nextPegIds, peg.id] : nextPegIds,
    }
  })
  resetCabinCatalogFeedback()
  resetSaveFeedback()
}

function updateSelectedPegCabinProduct(event: Event) {
  const target = event.target as HTMLSelectElement
  setSelectedPegCabinProduct(target.value)
}

function getCabinCatalogErrorMessage(error: unknown) {
  const fetchError = error as {
    data?: {
      data?: {
        messages?: string[]
      }
      message?: string
      statusMessage?: string
    }
    message?: string
  }

  return (
    fetchError.data?.data?.messages?.join(' ') ??
    fetchError.data?.message ??
    fetchError.data?.statusMessage ??
    fetchError.message ??
    'Väzby chát sa nepodarilo uložiť.'
  )
}

async function saveCabinProductLinks() {
  if (!canManageMap.value) {
    cabinCatalogStatus.value = 'error'
    cabinCatalogMessage.value = mapReadOnlyMessage.value
    return
  }

  cabinCatalogStatus.value = 'saving'
  cabinCatalogMessage.value = ''

  try {
    const result = await $fetch<CabinCatalogMutationSuccess>('/api/admin/cabin-products', {
      body: {
        cabinProducts: editorCabinProducts.value,
      },
      method: 'PUT',
    })

    editorCabinProducts.value = result.cabinProducts.map(cloneCabinProduct)
    await refreshCabinCatalogState()
    cabinCatalogStatus.value = 'success'
    cabinCatalogMessage.value = result.message
  }
  catch (error) {
    cabinCatalogStatus.value = 'error'
    cabinCatalogMessage.value = getCabinCatalogErrorMessage(error)
  }
}

function updateSelectedShapeType() {
  const shape = selectedShape.value
  if (!shape) return

  applyShapeTypeDefaults(shape, shape.type)
}

function syncSelectedShapeTournament() {
  const shape = selectedShape.value
  if (!shape || shape.type !== 'sector') return

  if (!shape.tournamentId) {
    shape.sectorId = undefined
    resetSaveFeedback()
    return
  }

  const tournament = tournaments.find((item) => item.id === shape.tournamentId)
  if (!tournament?.sectors.some((sector) => sector.id === shape.sectorId)) {
    shape.sectorId = getNextUnlinkedSectorId(shape.tournamentId, shape.id)
  }
  resetSaveFeedback()
}

function applySelectedShapePreset(type: MapShape['type']) {
  if (!canManageMap.value || !selectedShape.value) return

  applyShapeTypeDefaults(selectedShape.value, type)
}

function addSelectedShapePoint() {
  if (!canManageMap.value || !selectedShape.value) return

  const shape = selectedShape.value
  const lastPoint = shape.points.at(-1) ?? { x: 50, y: 50 }
  shape.points.push({
    x: clampMapPercent(lastPoint.x + 4),
    y: clampMapPercent(lastPoint.y + 4),
  })
}

function removeSelectedShapePoint() {
  if (!canManageMap.value || !selectedShape.value || selectedShape.value.points.length <= 3) return
  selectedShape.value.points.pop()
}

function removeSelectedItem() {
  if (!canManageMap.value) return

  if (selectedKind.value === 'facility' && selectedFacility.value) {
    editorFacilities.value = editorFacilities.value.filter((facility) => facility.id !== selectedFacility.value?.id)
    selectedFacilityId.value = lakeFacilities.value[0]?.id ?? ''
    return
  }

  if (selectedKind.value === 'shape' && selectedShape.value) {
    editorShapes.value = editorShapes.value.filter((shape) => shape.id !== selectedShape.value?.id)
    selectedShapeId.value = lakeShapes.value[0]?.id ?? ''
    return
  }

  if (selectedPeg.value) {
    editorPegs.value = editorPegs.value.filter((peg) => peg.id !== selectedPeg.value?.id)
    selectedPegId.value = lakePegs.value[0]?.id ?? ''
  }
}

function resetSelectedItem() {
  if (!canManageMap.value) {
    saveStatus.value = 'error'
    saveMessage.value = mapReadOnlyMessage.value
    return
  }

  if (selectedKind.value === 'facility') {
    const facility = selectedFacility.value
    const original = facility ? storedMapFacilities.value.find((item) => item.id === facility.id) : undefined
    if (!facility || !original) return
    Object.assign(facility, { ...original })
    return
  }

  if (selectedKind.value === 'shape') {
    const shape = selectedShape.value
    const original = shape ? storedMapShapes.value.find((item) => item.id === shape.id) : undefined
    if (!shape || !original) return
    Object.assign(shape, cloneShape(original))
    return
  }

  const peg = selectedPeg.value
  const original = peg ? storedPegs.value.find((item) => item.id === peg.id) : undefined
  if (!peg || !original) return

  Object.assign(peg, { ...original })
}

function getApiErrorMessage(error: unknown) {
  const fetchError = error as {
    data?: {
      data?: {
        messages?: string[]
      }
      message?: string
      statusMessage?: string
    }
  }

  return (
    fetchError.data?.data?.messages?.join(' ') ??
    fetchError.data?.message ??
    fetchError.data?.statusMessage ??
    'Mapu sa nepodarilo uložiť.'
  )
}

function validateEditorState() {
  const messages: string[] = []

  for (const peg of editorPegs.value) {
    const result = mapPegInputSchema.safeParse(peg)
    if (!result.success) messages.push(...getValidationMessages(result))
  }

  for (const facility of editorFacilities.value) {
    const result = mapFacilityInputSchema.safeParse(facility)
    if (!result.success) messages.push(...getValidationMessages(result))
  }

  for (const shape of editorShapes.value) {
    const result = mapShapeInputSchema.safeParse(shape)
    if (!result.success) messages.push(...getValidationMessages(result))
  }

  return [...new Set(messages)]
}

function buildMapSavePayload() {
  return {
    enabledLayerIds: enabledLayerIds.value,
    mapFacilities: editorFacilities.value,
    mapLayers: editorMapLayers.value,
    mapShapes: editorShapes.value,
    pegs: editorPegs.value,
  }
}

function mergeMapResponse<T extends MapStateResponse>(result: T, fallback: MapStateResponse = mapState.value): MapStateResponse {
  return {
    draftChanges: result.draftChanges ?? fallback.draftChanges ?? emptyMapDraftChanges(),
    draftUpdatedAt: result.draftUpdatedAt ?? result.updatedAt,
    hasUnpublishedChanges: Boolean(result.hasUnpublishedChanges),
    ok: true,
    mapFacilities: result.mapFacilities,
    mapLayers: result.mapLayers,
    mapShapes: result.mapShapes,
    pegs: result.pegs,
    publishedAt: result.publishedAt ?? fallback.publishedAt,
    updatedAt: result.updatedAt,
  }
}

function validateMapBeforeMutation() {
  if (!canManageMap.value) {
    saveStatus.value = 'error'
    saveMessage.value = mapReadOnlyMessage.value
    return false
  }

  const validationMessages = validateEditorState()
  if (validationMessages.length > 0) {
    saveStatus.value = 'error'
    saveMessage.value = validationMessages[0] ?? 'Skontrolujte editor mapy.'
    return false
  }

  return true
}

async function saveMapChanges() {
  if (!validateMapBeforeMutation()) return

  saveStatus.value = 'saving'
  saveMessage.value = ''
  discardMessage.value = ''

  try {
    const result = await $fetch<MapSaveSuccess>('/api/admin/map', {
      body: buildMapSavePayload(),
      method: 'PUT',
    })

    mapState.value = mergeMapResponse(result)
    editorMapLayers.value = result.mapLayers.map(cloneMapLayer)
    await refreshMapState()
    saveStatus.value = 'success'
    saveMessage.value = result.message
  }
  catch (error) {
    saveStatus.value = 'error'
    saveMessage.value = getApiErrorMessage(error)
  }
}

async function publishMapChanges() {
  if (!validateMapBeforeMutation()) {
    publishStatus.value = 'error'
    publishMessage.value = saveMessage.value
    return
  }

  publishStatus.value = 'publishing'
  publishMessage.value = ''
  saveMessage.value = ''
  discardMessage.value = ''

  try {
    await $fetch<MapSaveSuccess>('/api/admin/map', {
      body: buildMapSavePayload(),
      method: 'PUT',
    })

    const result = await $fetch<MapPublishSuccess>('/api/admin/map/publish', {
      method: 'POST',
    })

    mapState.value = mergeMapResponse(result)
    editorMapLayers.value = result.mapLayers.map(cloneMapLayer)
    await refreshMapState()
    publishStatus.value = 'success'
    publishMessage.value = result.message
  }
  catch (error) {
    publishStatus.value = 'error'
    publishMessage.value = getApiErrorMessage(error)
  }
}

async function discardMapDraft() {
  if (!canManageMap.value) {
    discardStatus.value = 'error'
    discardMessage.value = mapReadOnlyMessage.value
    return
  }

  const hasLocalOrPublishedDraft = mapState.value.hasUnpublishedChanges || changedItemsCount.value > 0
  if (
    hasLocalOrPublishedDraft &&
    import.meta.client &&
    !window.confirm('Zahodiť rozpracované zmeny mapy a načítať poslednú verejnú verziu?')
  ) {
    return
  }

  discardStatus.value = 'discarding'
  discardMessage.value = ''
  saveMessage.value = ''
  publishMessage.value = ''

  try {
    const result = await $fetch<MapDraftDiscardSuccess>('/api/admin/map/discard-draft', {
      method: 'POST',
    })

    mapState.value = mergeMapResponse(result)
    editorMapLayers.value = result.mapLayers.map(cloneMapLayer)
    await refreshMapState()
    discardStatus.value = 'success'
    discardMessage.value = result.message
  }
  catch (error) {
    discardStatus.value = 'error'
    discardMessage.value = getApiErrorMessage(error)
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Mapa a editor miest"
      description="Mock admin editor lovných miest, chát, servisných zón a súťažných vrstiev. Body sú už vedené ako SVG model s lokálnou drag úpravou."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div
        v-if="mapReadOnly"
        class="mb-5 rounded-card border border-info-500/25 bg-info-500/10 p-4 text-info-700"
      >
        <p class="text-sm font-bold">Režim prístupu: {{ mapAccessLabel }}</p>
        <p class="mt-1 text-sm">{{ mapReadOnlyMessage }}</p>
      </div>

      <div
        v-if="routeFocusMessage"
        class="mb-5 rounded-card border p-4"
        :class="routeFocusStatus === 'warning'
          ? 'border-warning-200 bg-warning-500/10 text-warning-900'
          : 'border-success-500/25 bg-success-500/10 text-success-700'"
      >
        <div class="flex items-start gap-3">
          <UIcon
            :name="routeFocusStatus === 'warning' ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-map'"
            class="mt-0.5 h-5 w-5 shrink-0"
          />
          <div>
            <p class="text-sm font-bold">Kontext zo súťaže</p>
            <p class="mt-1 text-sm">{{ routeFocusMessage }}</p>
          </div>
        </div>
      </div>

      <div class="mb-5 inline-flex rounded-lg bg-muted p-1">
        <button
          v-for="lake in lakes"
          :key="lake.slug"
          type="button"
          class="rounded-md px-4 py-2 text-sm font-semibold transition-colors"
          :class="selectedLake === lake.slug ? 'bg-white text-primary-900 shadow-sm' : 'text-foreground-muted hover:text-foreground'"
          @click="selectedLake = lake.slug"
        >
          {{ lake.name }}
        </button>
      </div>

      <div class="grid gap-6 lg:grid-cols-[1fr_0.82fr]">
        <MapEditorCanvas
          :closures="liveClosures"
          :draft-shape="draftShape"
          :drawing-shape="isDrawingShape"
          :editing-background="isEditingBackground"
          :editable="canManageMap"
          :facilities="visibleFacilities"
          :title="`${currentLake.name} · SVG editor`"
          :image="activeBackgroundImage"
          :image-settings="currentBackgroundImageSettings"
          :points="visiblePegs"
          :reservations="reservations"
          :shapes="visibleShapes"
          :selected-facility-id="selectedKind === 'facility' ? selectedFacilityId : ''"
          :selected-id="selectedPegId"
          :selected-shape-id="selectedKind === 'shape' ? selectedShapeId : ''"
          :show-grid="showMapGrid"
          :snap-size="snapSize"
          :snap-to-grid="snapToGrid"
          @select="selectPeg"
          @select-facility="selectFacility"
          @select-shape="selectShape"
          @draw-shape-point="addDraftShapePoint"
          @finish-draft-shape="finishShapeDrawing"
          @move-background="moveBackgroundImage"
          @move-facility="moveFacility"
          @move-point="movePoint"
          @move-shape="moveShape"
          @move-shape-point="moveShapePoint"
        />

        <aside class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Pridať do mapy</h2>
                <p class="text-foreground-muted mt-1 text-sm">Body, servisné miesta a kreslené plochy pre revír.</p>
              </div>
              <UIcon name="i-heroicons-map-pin" class="text-primary-800 h-5 w-5" />
            </div>
            <div class="mt-4 grid gap-2 sm:grid-cols-2">
              <UButton type="button" icon="i-heroicons-plus" variant="soft" :disabled="!canManageMap" @click="addPegDraft('shore')">
                Lovné miesto
              </UButton>
              <UButton type="button" icon="i-heroicons-home-modern" variant="soft" :disabled="!canManageMap" @click="addPegDraft('cabin')">
                Miesto s chatou
              </UButton>
              <UButton type="button" icon="i-heroicons-wrench-screwdriver" variant="soft" :disabled="!canManageMap" @click="addFacilityDraft('toilet')">
                WC / bod
              </UButton>
              <UButton type="button" icon="i-heroicons-bolt" variant="soft" :disabled="!canManageMap" @click="addFacilityDraft('electricity')">
                Rozvodňa
              </UButton>
              <UButton type="button" icon="i-heroicons-no-symbol" color="warning" variant="soft" :disabled="!canManageMap" @click="addShapeDraft('zone')">
                Zákaz / režim
              </UButton>
              <UButton type="button" icon="i-heroicons-flag" color="warning" variant="soft" :disabled="!canManageMap" @click="addShapeDraft('sector')">
                Súťažný sektor
              </UButton>
            </div>

            <div
              v-if="focusedTournament"
              class="mt-4 rounded-md border border-warning-200 bg-warning-500/10 p-3"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p class="text-sm font-bold text-warning-900">Polygony sektorov</p>
                  <p class="text-foreground-muted mt-1 text-xs">
                    {{ focusedTournament.name }} · chýba {{ missingFocusedTournamentSectorRows.length }}/{{ focusedTournament.sectors.length }}
                  </p>
                </div>
                <UButton
                  type="button"
                  icon="i-heroicons-squares-plus"
                  size="sm"
                  color="warning"
                  variant="soft"
                  :disabled="!canManageMap || missingFocusedTournamentSectorRows.length === 0"
                  @click="addMissingTournamentSectorShapeDrafts"
                >
                  Doplniť
                </UButton>
              </div>
            </div>

            <div class="mt-5 border-t border-border pt-4">
              <div class="grid gap-3 sm:grid-cols-[1fr_1fr]">
                <label class="block">
                  <span class="text-sm font-semibold">Kreslená plocha</span>
                  <select v-model="drawShapeType" :disabled="!canManageMap || isDrawingShape" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                    <option v-for="option in shapeTypeOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Názov</span>
                  <input v-model="drawShapeLabel" :readonly="!canManageMap || isDrawingShape" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm" placeholder="napr. Zákaz kŕmenia">
                </label>
              </div>
              <p class="text-foreground-muted mt-2 text-xs">
                {{ isDrawingShape ? `Klikaj do mapy. Vrcholy: ${draftShapePoints.length}` : 'Zapni kreslenie a klikmi do mapy vytvor vlastný polygon.' }}
              </p>
              <div class="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_0.85fr]">
                <label class="flex h-11 items-center gap-2 rounded-md bg-muted px-3 text-sm font-semibold">
                  <input
                    v-model="showMapGrid"
                    type="checkbox"
                    class="h-4 w-4 accent-primary-700"
                  >
                  Mriežka
                </label>
                <label class="flex h-11 items-center gap-2 rounded-md bg-muted px-3 text-sm font-semibold">
                  <input
                    v-model="snapToGrid"
                    type="checkbox"
                    class="h-4 w-4 accent-primary-700"
                  >
                  Prichytiť body
                </label>
                <label class="block">
                  <span class="sr-only">Krok mriežky</span>
                  <select v-model.number="snapSize" class="h-11 w-full rounded-md border border-border bg-white px-3 text-sm font-semibold">
                    <option v-for="option in snapSizeOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
              </div>
              <div class="mt-3 grid gap-2 sm:grid-cols-2">
                <UButton
                  v-if="!isDrawingShape"
                  type="button"
                  icon="i-heroicons-pencil-square"
                  color="warning"
                  variant="soft"
                  :disabled="!canManageMap"
                  @click="startShapeDrawing()"
                >
                  Kresliť klikmi
                </UButton>
                <UButton
                  v-else
                  type="button"
                  icon="i-heroicons-check"
                  color="warning"
                  :disabled="!canManageMap || !canFinishDraftShape"
                  @click="finishShapeDrawing"
                >
                  Dokončiť plochu
                </UButton>
                <UButton
                  v-if="isDrawingShape"
                  type="button"
                  icon="i-heroicons-arrow-uturn-left"
                  variant="soft"
                  :disabled="!canManageMap || draftShapePoints.length === 0"
                  @click="undoDraftShapePoint"
                >
                  Späť bod
                </UButton>
                <UButton
                  v-if="isDrawingShape"
                  type="button"
                  icon="i-heroicons-x-mark"
                  variant="soft"
                  color="error"
                  :disabled="!canManageMap"
                  @click="cancelShapeDrawing"
                >
                  Zrušiť
                </UButton>
              </div>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Vrstvy mapy</h2>
                <p class="text-foreground-muted mt-1 text-sm">{{ selectedLayerSummary }}</p>
              </div>
              <UIcon name="i-heroicons-squares-2x2" class="text-primary-800 h-5 w-5" />
            </div>
            <div class="mt-4 space-y-2">
              <button
                v-for="layer in lakeLayers"
                :key="layer.id"
                type="button"
                class="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors"
                :class="
                  enabledLayerIds.includes(layer.id)
                    ? 'border-primary-200 bg-primary-50'
                    : 'border-border bg-white hover:bg-muted'
                "
                @click="toggleLayer(layer.id)"
              >
                <span>
                  <span class="block text-sm font-bold">{{ layer.name }}</span>
                  <span class="text-foreground-muted text-xs">
                    {{ layer.visibility }} · {{ layer.editable ? 'editovateľná' : 'fixná' }}
                  </span>
                </span>
                <UIcon
                  :name="enabledLayerIds.includes(layer.id) ? 'i-heroicons-eye' : 'i-heroicons-eye-slash'"
                  class="h-4 w-4"
                />
              </button>
            </div>
            <div class="mt-4 border-t border-border pt-4">
              <p class="text-sm font-bold">Plochy v jazere</p>
              <div class="mt-2 grid gap-2 sm:grid-cols-2">
                <div
                  v-for="preset in shapeTypeCounts"
                  :key="preset.type"
                  class="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm"
                >
                  <span class="flex min-w-0 items-center gap-2">
                    <UIcon :name="preset.icon" class="h-4 w-4 shrink-0 text-primary-800" />
                    <span class="truncate font-semibold">{{ preset.label }}</span>
                  </span>
                  <span class="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-primary-900">{{ preset.count }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Podklad mapy</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ currentBackgroundLayer?.source ? 'Aktívny obrázkový podklad' : 'Generovaný SVG podklad' }}
                </p>
              </div>
              <UIcon name="i-heroicons-photo" class="text-primary-800 h-5 w-5" />
            </div>

            <div class="mt-4 overflow-hidden rounded-md border border-border bg-muted">
              <div class="relative aspect-[4/3]">
                <img
                  v-if="currentBackgroundLayer?.source"
                  :src="currentBackgroundLayer.source"
                  :alt="`Podklad mapy ${currentLake.name}`"
                  class="h-full w-full"
                  :style="{
                    objectFit: normalizedBackgroundImageSettings.fit === 'stretch' ? 'fill' : normalizedBackgroundImageSettings.fit,
                    opacity: normalizedBackgroundImageSettings.opacity,
                    transform: `translate(${normalizedBackgroundImageSettings.offsetX}%, ${normalizedBackgroundImageSettings.offsetY}%) scale(${normalizedBackgroundImageSettings.scale})`,
                  }"
                >
                <div v-else class="flex h-full items-center justify-center text-sm font-semibold text-foreground-muted">
                  Bez nahratého obrázka
                </div>
              </div>
            </div>

            <div v-if="currentBackgroundLayer?.source" class="mt-4 rounded-md border border-border bg-white p-3">
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Napasovanie</span>
                  <select
                    :value="normalizedBackgroundImageSettings.fit"
                    :disabled="!canManageMap"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    @change="updateBackgroundImageFit"
                  >
                    <option v-for="option in backgroundFitOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Mierka {{ Math.round(normalizedBackgroundImageSettings.scale * 100) }} %</span>
                  <input
                    :value="normalizedBackgroundImageSettings.scale"
                    type="range"
                    min="0.5"
                    max="2.5"
                    step="0.05"
                    :disabled="!canManageMap"
                    class="mt-3 w-full accent-primary-700"
                    @input="updateBackgroundImageNumber('scale', $event)"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Posun X {{ normalizedBackgroundImageSettings.offsetX }}</span>
                  <input
                    :value="normalizedBackgroundImageSettings.offsetX"
                    type="range"
                    min="-50"
                    max="50"
                    step="0.5"
                    :disabled="!canManageMap"
                    class="mt-3 w-full accent-primary-700"
                    @input="updateBackgroundImageNumber('offsetX', $event)"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Posun Y {{ normalizedBackgroundImageSettings.offsetY }}</span>
                  <input
                    :value="normalizedBackgroundImageSettings.offsetY"
                    type="range"
                    min="-50"
                    max="50"
                    step="0.5"
                    :disabled="!canManageMap"
                    class="mt-3 w-full accent-primary-700"
                    @input="updateBackgroundImageNumber('offsetY', $event)"
                  >
                </label>
                <label class="block sm:col-span-2">
                  <span class="text-sm font-semibold">Priehľadnosť {{ Math.round(normalizedBackgroundImageSettings.opacity * 100) }} %</span>
                  <input
                    :value="normalizedBackgroundImageSettings.opacity"
                    type="range"
                    min="0.2"
                    max="1"
                    step="0.05"
                    :disabled="!canManageMap"
                    class="mt-3 w-full accent-primary-700"
                    @input="updateBackgroundImageNumber('opacity', $event)"
                  >
                </label>
              </div>
              <UButton
                type="button"
                :icon="isEditingBackground ? 'i-heroicons-check' : 'i-heroicons-arrows-pointing-out'"
                variant="soft"
                size="sm"
                class="mt-3"
                :color="isEditingBackground ? 'success' : 'primary'"
                :disabled="!canManageMap || !activeBackgroundImage"
                @click="toggleBackgroundEditing"
              >
                {{ isEditingBackground ? 'Hotovo s posunom' : 'Posúvať priamo v mape' }}
              </UButton>
              <UButton
                type="button"
                icon="i-heroicons-arrow-path"
                variant="soft"
                size="sm"
                class="mt-3 ml-2"
                :disabled="!canManageMap"
                @click="resetBackgroundImageSettings"
              >
                Reset napasovania
              </UButton>
            </div>

            <label
              class="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-primary-300 bg-primary-50 px-3 py-3 text-sm font-bold text-primary-900 transition-colors hover:bg-primary-100"
              :class="!canManageMap || backgroundUploadStatus === 'uploading' ? 'pointer-events-none opacity-60' : ''"
            >
              <UIcon
                :name="backgroundUploadStatus === 'uploading' ? 'i-heroicons-arrow-path' : 'i-heroicons-arrow-up-tray'"
                class="h-4 w-4"
                :class="backgroundUploadStatus === 'uploading' ? 'animate-spin' : ''"
              />
              Nahrať JPG / PNG / WebP
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                class="sr-only"
                :disabled="!canManageMap || backgroundUploadStatus === 'uploading'"
                @change="uploadBackgroundImage"
              >
            </label>
            <p class="text-foreground-muted mt-2 text-xs">Maximálna veľkosť 10 MB. Obrázok sa použije na aktuálne vybranom jazere.</p>
            <p
              v-if="backgroundUploadMessage"
              class="mt-3 rounded-md px-3 py-2 text-sm font-semibold"
              :class="
                backgroundUploadStatus === 'success'
                  ? 'bg-success-500/10 text-success-700'
                  : 'bg-error-500/10 text-error-700'
              "
            >
              {{ backgroundUploadMessage }}
            </p>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Vybraný prvok</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Prepni typ alebo klikni priamo do SVG mapy.
                </p>
              </div>
              <UIcon name="i-heroicons-cursor-arrow-rays" class="text-primary-800 h-5 w-5" />
            </div>

            <div class="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-muted p-1">
              <button
                type="button"
                class="rounded-md px-2 py-2 text-xs font-bold transition-colors"
                :class="selectedKind === 'peg' ? 'bg-white text-primary-900 shadow-sm' : 'text-foreground-muted'"
                @click="selectedKind = 'peg'"
              >
                Miesto
              </button>
              <button
                type="button"
                class="rounded-md px-2 py-2 text-xs font-bold transition-colors"
                :class="selectedKind === 'facility' ? 'bg-white text-primary-900 shadow-sm' : 'text-foreground-muted'"
                @click="selectedKind = 'facility'"
              >
                Bod
              </button>
              <button
                type="button"
                class="rounded-md px-2 py-2 text-xs font-bold transition-colors"
                :class="selectedKind === 'shape' ? 'bg-white text-primary-900 shadow-sm' : 'text-foreground-muted'"
                @click="selectedKind = 'shape'"
              >
                Plocha
              </button>
            </div>

            <form v-if="selectedKind === 'peg' && selectedPeg" class="mt-5 space-y-4">
              <div class="rounded-md border border-primary-200 bg-primary-50 p-3">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-bold">Rezervačný režim</p>
                    <p class="text-foreground-muted mt-1 text-xs">{{ selectedPegReservationSummary }}</p>
                    <p v-if="selectedPeg.type === 'cabin'" class="mt-2 text-xs font-semibold text-primary-900">
                      {{ selectedPegCabinProduct ? selectedPegCabinProduct.label : 'Chata zatiaľ nie je naviazaná v cenníku.' }}
                    </p>
                  </div>
                  <span class="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-bold text-primary-900">
                    {{ selectedPegStatusLabel }}
                  </span>
                </div>
              </div>
              <div class="grid gap-2 sm:grid-cols-2">
                <UButton
                  v-for="preset in pegReservationPresetOptions"
                  :key="preset.label"
                  type="button"
                  :icon="preset.icon"
                  size="sm"
                  variant="soft"
                  :disabled="!canManageMap"
                  @click="applySelectedPegReservationPreset(preset)"
                >
                  {{ preset.label }}
                </UButton>
              </div>
              <div
                v-if="selectedPeg.type === 'cabin'"
                class="rounded-md border border-border bg-white p-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-bold">Cenníková chata</p>
                    <p class="text-foreground-muted mt-1 text-xs">
                      Naviazané miesta v katalógu: {{ linkedCabinPegIds.size }}.
                    </p>
                  </div>
                  <span
                    class="rounded-full px-2 py-1 text-xs font-bold"
                    :class="selectedPegCabinProduct ? 'bg-success-500/10 text-success-700' : 'bg-warning-500/10 text-warning-800'"
                  >
                    {{ selectedPegCabinProduct ? 'naviazané' : 'bez väzby' }}
                  </span>
                </div>
                <label class="mt-3 block">
                  <span class="text-sm font-semibold">Priradiť k položke</span>
                  <select
                    :value="selectedPegCabinProductId"
                    :disabled="!canManageMap"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                    @change="updateSelectedPegCabinProduct"
                  >
                    <option value="">Bez naviazanej chaty</option>
                    <option
                      v-for="cabin in editorCabinProducts"
                      :key="cabin.id"
                      :value="cabin.id"
                    >
                      {{ cabin.label }} · {{ cabin.pricePer24hEur }} € / 24 h
                    </option>
                  </select>
                </label>
                <p v-if="selectedPegCabinProduct" class="text-foreground-muted mt-2 text-xs">
                  {{ selectedPegCabinProduct.minimumHours }} h minimum · kapacita
                  {{ selectedPegCabinProduct.capacity }} ·
                  {{ selectedPegCabinProduct.equipment.slice(0, 3).join(', ') }}
                </p>
                <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <UButton
                    type="button"
                    icon="i-heroicons-link"
                    size="sm"
                    :disabled="!canManageMap || changedCabinProducts.length === 0 || cabinCatalogStatus === 'saving'"
                    :loading="cabinCatalogStatus === 'saving'"
                    @click="saveCabinProductLinks"
                  >
                    Uložiť väzbu chaty
                  </UButton>
                  <span class="text-foreground-muted text-xs">
                    {{ changedCabinProducts.length > 0 ? `${changedCabinProducts.length} zmena čaká na uloženie` : 'Väzby sú bez lokálnej zmeny' }}
                  </span>
                </div>
                <p
                  v-if="cabinCatalogMessage"
                  class="mt-3 rounded-md px-3 py-2 text-sm font-semibold"
                  :class="
                    cabinCatalogStatus === 'success'
                      ? 'bg-success-500/10 text-success-700'
                      : 'bg-error-500/10 text-error-700'
                  "
                >
                  {{ cabinCatalogMessage }}
                </p>
              </div>
              <label class="block">
                <span class="text-sm font-semibold">Názov</span>
                <input v-model="selectedPeg.label" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
              </label>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">X pozícia</span>
                  <input v-model.number="selectedPeg.x" type="number" min="0" max="100" step="0.1" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Y pozícia</span>
                  <input v-model.number="selectedPeg.y" type="number" min="0" max="100" step="0.1" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                </label>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Typ</span>
                  <select v-model="selectedPeg.type" :disabled="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm" @change="updateSelectedPegType">
                    <option value="shore">lovné miesto</option>
                    <option value="cabin">miesto s chatou</option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Kapacita</span>
                  <input v-model.number="selectedPeg.capacity" type="number" min="1" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Stav</span>
                  <select v-model="selectedPeg.status" :disabled="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                    <option v-for="option in pegStatusOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
              </div>
              <label class="flex items-center gap-2 rounded-md bg-muted p-3 text-sm font-semibold">
                <input
                  v-model="selectedPeg.requiresCabinReservation"
                  type="checkbox"
                  :disabled="!canManageMap || selectedPeg.type !== 'cabin'"
                  class="h-4 w-4 accent-primary-700 disabled:opacity-50"
                >
                Pri rezervácii vyžadovať aj chatu
              </label>
              <label class="block">
                <span class="text-sm font-semibold">Poznámka</span>
                <textarea v-model="selectedPeg.notes" :readonly="!canManageMap" rows="3" class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm" />
              </label>
            </form>

            <form v-else-if="selectedKind === 'facility' && selectedFacility" class="mt-5 space-y-4">
              <label class="block">
                <span class="text-sm font-semibold">Názov bodu</span>
                <input v-model="selectedFacility.label" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
              </label>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Typ</span>
                  <select v-model="selectedFacility.type" :disabled="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                    <option v-for="option in facilityTypeOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Viditeľnosť</span>
                  <select v-model="selectedFacility.visibility" :disabled="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                    <option v-for="option in visibilityOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">X pozícia</span>
                  <input v-model.number="selectedFacility.x" type="number" min="0" max="100" step="0.1" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Y pozícia</span>
                  <input v-model.number="selectedFacility.y" type="number" min="0" max="100" step="0.1" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                </label>
              </div>
              <label class="block">
                <span class="text-sm font-semibold">Poznámka</span>
                <textarea v-model="selectedFacility.notes" :readonly="!canManageMap" rows="3" class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm" />
              </label>
            </form>

            <form v-else-if="selectedKind === 'shape' && selectedShape" class="mt-5 space-y-4">
              <div class="rounded-md border border-primary-200 bg-primary-50 p-3">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-bold">{{ selectedShapePreset?.label ?? mapShapeTypeLabels[selectedShape.type] }}</p>
                    <p class="text-foreground-muted mt-1 text-xs">
                      {{ selectedShapeLayerName }} · {{ selectedShapeVisibilityLabel }}
                    </p>
                  </div>
                  <UIcon :name="selectedShapePreset?.icon ?? 'i-heroicons-squares-2x2'" class="h-5 w-5 text-primary-800" />
                </div>
              </div>
              <div class="grid gap-2 sm:grid-cols-2">
                <UButton
                  v-for="preset in shapePresetOptions"
                  :key="preset.type"
                  type="button"
                  :icon="preset.icon"
                  size="sm"
                  :variant="selectedShape.type === preset.type ? 'solid' : 'soft'"
                  :disabled="!canManageMap"
                  @click="applySelectedShapePreset(preset.type)"
                >
                  {{ preset.label }}
                </UButton>
              </div>
              <label class="block">
                <span class="text-sm font-semibold">Názov plochy</span>
                <input v-model="selectedShape.label" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
              </label>
              <div
                v-if="selectedShape.type === 'sector'"
                class="rounded-md border border-warning-200 bg-warning-500/10 p-3"
              >
                <div class="flex items-start gap-2">
                  <UIcon name="i-heroicons-flag" class="mt-0.5 h-5 w-5 text-warning-800" />
                  <div>
                    <p class="text-sm font-bold text-warning-900">Väzba na súťažný sektor</p>
                    <p class="text-foreground-muted mt-1 text-xs">
                      Tento polygon sa použije vo verejnej súťažnej mape a v dispečingu.
                    </p>
                  </div>
                </div>
                <div class="mt-3 grid gap-3 sm:grid-cols-2">
                  <label class="block">
                    <span class="text-sm font-semibold">Súťaž</span>
                    <select
                      v-model="selectedShape.tournamentId"
                      :disabled="!canManageMap || selectedLakeTournaments.length === 0"
                      class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                      @change="syncSelectedShapeTournament"
                    >
                      <option value="">Bez súťaže</option>
                      <option v-for="tournament in selectedLakeTournaments" :key="tournament.id" :value="tournament.id">
                        {{ tournament.name }}
                      </option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Sektor</span>
                    <select
                      v-model="selectedShape.sectorId"
                      :disabled="!canManageMap || !selectedShape.tournamentId || selectedShapeSectorOptions.length === 0"
                      class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                      <option value="">Bez sektora</option>
                      <option v-for="sector in selectedShapeSectorOptions" :key="sector.id" :value="sector.id">
                        {{ sector.label }} · {{ sector.team ?? 'bez tímu' }}
                      </option>
                    </select>
                  </label>
                </div>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Typ</span>
                  <select v-model="selectedShape.type" :disabled="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm" @change="updateSelectedShapeType">
                    <option v-for="option in shapeTypeOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Viditeľnosť</span>
                  <select v-model="selectedShape.visibility" :disabled="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                    <option v-for="option in visibilityOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Farba vrstvy</span>
                  <select v-model="selectedShape.tone" :disabled="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                    <option v-for="option in shapeToneOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <div class="rounded-md bg-muted p-3">
                  <p class="text-foreground-muted text-xs">Body polygonu</p>
                  <p class="font-semibold">{{ selectedShape.points.length }}</p>
                </div>
              </div>
              <div class="max-h-48 space-y-2 overflow-auto rounded-md border border-border bg-white p-3">
                <div
                  v-for="(point, pointIndex) in selectedShape.points"
                  :key="pointIndex"
                  class="grid grid-cols-[auto_1fr_1fr] items-center gap-2 text-sm"
                >
                  <span class="text-foreground-muted text-xs font-bold">{{ pointIndex + 1 }}</span>
                  <input v-model.number="point.x" type="number" min="0" max="100" step="0.1" :readonly="!canManageMap" class="h-9 rounded-md border border-border px-2">
                  <input v-model.number="point.y" type="number" min="0" max="100" step="0.1" :readonly="!canManageMap" class="h-9 rounded-md border border-border px-2">
                </div>
              </div>
              <div class="grid gap-2 sm:grid-cols-2">
                <UButton type="button" icon="i-heroicons-plus" variant="soft" :disabled="!canManageMap || selectedShape.points.length >= 24" @click="addSelectedShapePoint">
                  Pridať vrchol
                </UButton>
                <UButton type="button" icon="i-heroicons-minus" variant="soft" color="warning" :disabled="!canManageMap || selectedShape.points.length <= 3" @click="removeSelectedShapePoint">
                  Odobrať vrchol
                </UButton>
              </div>
            </form>

            <div v-else class="mt-5 rounded-md bg-muted p-4 text-sm text-foreground-muted">
              Na tejto vrstve zatiaľ nie je vybraný prvok.
            </div>

            <ValidationSummary
              class="mt-4"
              :messages="selectedValidationMessages"
              valid-title="Prvok mapy je validný"
              valid-description="Názov, súradnice a typ sú pripravené na uloženie."
            />

            <div class="mt-4 grid gap-2 sm:grid-cols-5">
              <UButton type="button" icon="i-heroicons-arrow-path" variant="soft" :disabled="!canManageMap" @click="resetSelectedItem">
                Vrátiť
              </UButton>
              <UButton type="button" icon="i-heroicons-trash" variant="soft" color="error" :disabled="!canManageMap" @click="removeSelectedItem">
                Odstrániť
              </UButton>
              <UButton
                type="button"
                icon="i-heroicons-check"
                :disabled="!canManageMap || !selectedValidationIsValid || saveStatus === 'saving' || discardStatus === 'discarding'"
                :loading="saveStatus === 'saving'"
                @click="saveMapChanges"
              >
                Uložiť draft
              </UButton>
              <UButton
                type="button"
                icon="i-heroicons-arrow-uturn-left"
                variant="soft"
                color="warning"
                :disabled="!canManageMap || (!mapState.hasUnpublishedChanges && changedItemsCount === 0) || saveStatus === 'saving' || publishStatus === 'publishing' || discardStatus === 'discarding'"
                :loading="discardStatus === 'discarding'"
                @click="discardMapDraft"
              >
                Zahodiť draft
              </UButton>
              <UButton
                type="button"
                icon="i-heroicons-cloud-arrow-up"
                color="warning"
                :disabled="!canManageMap || !selectedValidationIsValid || saveStatus === 'saving' || publishStatus === 'publishing' || discardStatus === 'discarding'"
                :loading="publishStatus === 'publishing'"
                @click="publishMapChanges"
              >
                Publikovať
              </UButton>
            </div>
            <p
              v-if="saveMessage"
              class="mt-4 rounded-md px-3 py-2 text-sm font-semibold"
              :class="
                saveStatus === 'success'
                  ? 'bg-success-500/10 text-success-700'
                  : 'bg-error-500/10 text-error-700'
              "
            >
              {{ saveMessage }}
            </p>
            <p
              v-if="publishMessage"
              class="mt-4 rounded-md px-3 py-2 text-sm font-semibold"
              :class="
                publishStatus === 'success'
                  ? 'bg-success-500/10 text-success-700'
                  : 'bg-error-500/10 text-error-700'
              "
            >
              {{ publishMessage }}
            </p>
            <p
              v-if="discardMessage"
              class="mt-4 rounded-md px-3 py-2 text-sm font-semibold"
              :class="
                discardStatus === 'success'
                  ? 'bg-success-500/10 text-success-700'
                  : 'bg-error-500/10 text-error-700'
              "
            >
              {{ discardMessage }}
            </p>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Súhrn mapy</h2>
            <p class="text-foreground-muted mt-1 text-sm">{{ mapPublishStateLabel }}</p>
            <dl class="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div class="rounded-md bg-muted p-3">
                <dt class="text-foreground-muted text-xs">Jazero</dt>
                <dd class="font-semibold">{{ getLakeName(selectedLake) }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-foreground-muted text-xs">Miest</dt>
                <dd class="font-semibold">{{ lakePegs.length }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-foreground-muted text-xs">Chaty</dt>
                <dd class="font-semibold">{{ cabinPegs.length }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-foreground-muted text-xs">Servisné body</dt>
                <dd class="font-semibold">{{ lakeFacilities.length }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-foreground-muted text-xs">Plochy</dt>
                <dd class="font-semibold">{{ lakeShapes.length }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-foreground-muted text-xs">Sektory z mapy</dt>
                <dd class="font-semibold">{{ linkedTournamentSectorShapes.length }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-foreground-muted text-xs">Podklad</dt>
                <dd class="font-semibold">{{ activeBackgroundImage ? 'obrázok' : 'generovaný SVG' }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-foreground-muted text-xs">Vrstvy</dt>
                <dd class="font-semibold">{{ enabledLayers.length }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-foreground-muted text-xs">Lokálne zmeny</dt>
                <dd class="font-semibold">{{ changedItemsCount }}</dd>
              </div>
            </dl>
            <div v-if="draftChangeTotal > 0" class="mt-5 border-t border-border pt-4">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-semibold">Zmeny oproti verejnej mape</p>
                <span class="text-foreground-muted text-sm">{{ draftChangeTotal }} položiek</span>
              </div>
              <ul class="mt-3 space-y-2 text-sm">
                <li
                  v-for="row in draftChangeRows"
                  :key="row.label"
                  class="rounded-md bg-muted px-3 py-2"
                >
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-foreground-muted">{{ row.label }}</span>
                    <span class="font-semibold">{{ formatDraftEntityChanges(row.summary) }}</span>
                  </div>
                  <p class="text-foreground-muted mt-1 text-xs">
                    {{ formatDraftEntityChangeItems(row.summary) }}
                  </p>
                </li>
              </ul>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Export modelu</h2>
            <p class="text-foreground-muted mt-2 text-sm">
              Lokálna úprava sa ukladá do JSON store. Produkčne sa rovnaký kontrakt nahradí
              tabuľkami `map_points`, `map_facilities`, `map_shapes` a `map_layers`.
            </p>
            <div class="mt-4 max-h-44 overflow-auto rounded-md bg-muted p-3 text-xs">
              <pre>{{ JSON.stringify(exportModel, null, 2) }}</pre>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
