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
  createMapLayerDraft,
  createMapShapePointLegendCsv,
  defaultMapLayerImageSettings,
  filterMapShapePointLegendRows,
  formatMapLayerContentSummary,
  getActiveMapLayerPresetId,
  getMapExportFrame,
  getMapExportFramePreset,
  getMapLayerContentSummary,
  getMapLayerKindForPegType,
  getMapLayerKindForShapeType,
  getMapLayerPresetLayerIds,
  getMissingMapLayerKinds,
  getMapPublishQualityIssues,
  getMapQualityIssues,
  getMapQualityIssueSummary,
  getMapShapePointLegendRows,
  getMapShapePointRoleSummary,
  mapExportFramePresets,
  mapFacilityTypeLabels,
  mapLayerKindLabels,
  mapLayerPresetOptions,
  mapStandardLayerKinds,
  mapShapePointRoleLabels,
  mapShapeToneLabels,
  mapShapeTypeLabels,
  mapShapeVisibilityLabels,
  normalizeMapLayerImageSettings,
  toSvgY,
  type MapExportFramePresetId,
  type MapLayerPreset,
  type MapQualityIssue,
  type MapQualityIssueSeverity,
  type MapShapePointLegendRow,
} from '~/utils/map'
import {
  alignTournamentSectorShapes,
  createMissingTournamentSectorShapeDrafts,
  createTournamentSectorShapeDraft,
  getTournamentSectorAlignmentReferenceShapes,
  getTournamentSectorMapRows,
  type TournamentSectorShapeAlignmentMode,
} from '~/utils/tournamentMap'
import type { StatusBadgeTone } from '~/utils/ui'

useHead({ title: 'Admin mapa' })

const route = useRoute()
const router = useRouter()

type MapEditorSelectionKind = 'facility' | 'peg' | 'shape'
type MapAdminView = 'export' | 'prvky' | 'publikovanie' | 'vrstvy'
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
type FacilityQuickAddOption = {
  icon: string
  label: string
  type: MapFacilityType
}
type LayerReadinessStatus = 'active' | 'disabled' | 'missing'

const mapAdminViewOptions: Array<{
  description: string
  icon: string
  id: MapAdminView
  label: string
}> = [
  {
    description: 'Pridávanie a úprava lovných miest, chát, servisných bodov a plôch.',
    icon: 'i-heroicons-cursor-arrow-rays',
    id: 'prvky',
    label: 'Prvky',
  },
  {
    description: 'Viditeľnosť vrstiev, pracovné režimy, podkladový obrázok a exportný výrez.',
    icon: 'i-heroicons-squares-2x2',
    id: 'vrstvy',
    label: 'Vrstvy',
  },
  {
    description: 'Uloženie draftu, kontrola konfliktov a zverejnenie mapy.',
    icon: 'i-heroicons-cloud-arrow-up',
    id: 'publikovanie',
    label: 'Publikovanie',
  },
  {
    description: 'Legenda označených vrcholov a prehľad pripravených dát.',
    icon: 'i-heroicons-arrow-down-tray',
    id: 'export',
    label: 'Export',
  },
]

const { cabinProducts: seedCabinProducts, getLakeName, lakes, mapFacilities, mapLayers, mapShapes, pegs, reservations, tournaments } = usePondData()
const { liveClosures } = await useClosureState({ admin: true, key: 'admin-map-closure-state' })

const getRouteQueryValue = (value: unknown) => {
  const singleValue = Array.isArray(value) ? value[0] : value

  return typeof singleValue === 'string' && singleValue.trim() ? singleValue : undefined
}

function normalizeMapAdminView(value: unknown): MapAdminView {
  const requestedView = getRouteQueryValue(value)

  return mapAdminViewOptions.some((option) => option.id === requestedView)
    ? requestedView as MapAdminView
    : 'prvky'
}

const activeMapAdminView = ref<MapAdminView>(normalizeMapAdminView(route.query.sekcia))
const mapAdminTabsRef = ref<HTMLElement | null>(null)
const activeMapAdminViewOption = computed(() =>
  mapAdminViewOptions.find((option) => option.id === activeMapAdminView.value) ?? mapAdminViewOptions[0]!,
)

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
const requestFetch = useRequestFetch()
const { data: mapState, refresh: refreshMapState } = await useAsyncData<MapStateResponse>(
  'admin-map-state',
  () => requestFetch<MapStateResponse>('/api/admin/map'),
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
const backgroundPanelRef = ref<HTMLElement | null>(null)
const backgroundUploadRef = ref<HTMLElement | null>(null)
const highlightBackgroundUpload = ref(false)
const layersPanelRef = ref<HTMLElement | null>(null)
const highlightLayersPanel = ref(false)
const cabinCatalogPanelRef = ref<HTMLElement | null>(null)
const highlightCabinCatalogPanel = ref(false)
const cabinCatalogStatus = ref<'idle' | 'saving' | 'success' | 'error'>('idle')
const cabinCatalogMessage = ref('')
const mapQualityFocusMessage = ref('')
const routeFocusStatus = ref<'idle' | 'success' | 'warning'>('idle')
const routeFocusMessage = ref('')
const sectorShapeWidth = ref(14)
const sectorShapeHeight = ref(10)
const sectorShapeAlignmentMode = ref<TournamentSectorShapeAlignmentMode>('box')
const mapExportFramePresetId = ref<MapExportFramePresetId>('map-4-3')
const shapePointLegendRoleFilter = ref<'all' | NonNullable<MapCoordinate['role']>>('all')
const shapePointLegendVisibilityFilter = ref<'all' | MapShape['visibility']>('all')
const shapePointLegendPrintGeneratedAt = ref('')
let backgroundUploadHighlightTimeout: number | undefined
let layersPanelHighlightTimeout: number | undefined
let cabinCatalogHighlightTimeout: number | undefined

const facilityTypeOptions = Object.entries(mapFacilityTypeLabels).map(([value, label]) => ({ label, value: value as MapFacilityType }))
const shapeTypeOptions = Object.entries(mapShapeTypeLabels).map(([value, label]) => ({ label, value: value as MapShape['type'] }))
const shapeToneOptions = Object.entries(mapShapeToneLabels).map(([value, label]) => ({ label, value: value as MapShape['tone'] }))
const shapePointRoleOptions = Object.entries(mapShapePointRoleLabels).map(([value, label]) => ({ label, value: value as NonNullable<MapCoordinate['role']> }))
const facilityQuickAddOptions: FacilityQuickAddOption[] = [
  { icon: 'i-heroicons-wrench-screwdriver', label: 'WC', type: 'toilet' },
  { icon: 'i-heroicons-sparkles', label: 'Sprchy', type: 'shower' },
  { icon: 'i-heroicons-archive-box', label: 'Sklad', type: 'storage' },
  { icon: 'i-heroicons-fire', label: 'Drevo', type: 'wood' },
  { icon: 'i-heroicons-bolt', label: 'Rozvodňa', type: 'electricity' },
  { icon: 'i-heroicons-arrow-right-circle', label: 'Vjazd', type: 'entry' },
  { icon: 'i-heroicons-building-office', label: 'Recepcia', type: 'reception' },
  { icon: 'i-heroicons-truck', label: 'Parkovanie', type: 'parking' },
  { icon: 'i-heroicons-trash', label: 'Odpad', type: 'waste' },
  { icon: 'i-heroicons-plus-circle', label: 'Prvá pomoc', type: 'first-aid' },
]
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
const visibilityOptions = Object.entries(mapShapeVisibilityLabels).map(([value, label]) => ({
  label,
  value: value as MapShape['visibility'],
}))
const shapePointLegendVisibilityOptions = [
  { label: 'všetky viditeľnosti', value: 'all' },
  ...visibilityOptions,
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
const sectorShapeAlignmentModeOptions: Array<{
  description: string
  icon: string
  label: string
  value: TournamentSectorShapeAlignmentMode
}> = [
  {
    description: 'Rýchly čistý obdĺžnik okolo bodu sektora.',
    icon: 'i-heroicons-squares-2x2',
    label: 'Okolo bodu',
    value: 'box',
  },
  {
    description: 'Pás od najbližšej vodnej plochy alebo súťažnej línie smerom k sektoru.',
    icon: 'i-heroicons-arrows-right-left',
    label: 'Podľa brehu / línie',
    value: 'shoreline',
  },
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
const mapExportFramePreset = computed(() => getMapExportFramePreset(mapExportFramePresetId.value))
const mapExportFrame = computed(() => getMapExportFrame(mapExportFramePresetId.value))
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
    return enabledLayers.value.some((layer) => layer.kind === getMapLayerKindForShapeType(shape.type))
  }),
)
const selectedPeg = computed(() => lakePegs.value.find((peg) => peg.id === selectedPegId.value) ?? lakePegs.value[0])
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
const selectedPegLayerHint = computed(() => {
  const peg = selectedPeg.value
  if (!peg) return ''

  const readiness = getLayerReadiness(getMapLayerKindForPegType(peg.type))
  const typeLabel = peg.type === 'cabin' ? 'Miesto s chatou' : 'Brehové lovné miesto'

  if (readiness.status === 'active') {
    return `${typeLabel} je viditeľné vo vrstve ${readiness.label}.`
  }
  if (readiness.status === 'disabled') {
    return `${typeLabel} sa pri úprave zapne vo vrstve ${readiness.label}.`
  }

  return `${typeLabel} pri úprave vytvorí vrstvu ${readiness.label}.`
})
const selectedPegCabinCatalogHint = computed(() => {
  const peg = selectedPeg.value
  if (!peg || peg.type !== 'cabin') return ''

  if (selectedPegCabinProduct.value) {
    return `Rezervácia automaticky pridá položku ${selectedPegCabinProduct.value.label}.`
  }
  if (peg.requiresCabinReservation) {
    return 'Chata je povinná, ale miesto ešte nemá cenníkovú položku.'
  }

  return 'Chata je voliteľná a môže ostať bez povinnej cenníkovej väzby.'
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

  const layerKind = getMapLayerKindForShapeType(selectedShape.value.type)
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
const mappedFocusedTournamentSectorRows = computed(() =>
  focusedTournamentSectorRows.value.filter((row) => row.mapped),
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
const sectorAlignmentReferenceShapes = computed(() =>
  focusedTournament.value ? getTournamentSectorAlignmentReferenceShapes(focusedTournament.value, editorShapes.value) : [],
)
const shapePointLegendRows = computed(() => getMapShapePointLegendRows(lakeShapes.value))
const shapePointLegendSummary = computed(() => getMapShapePointRoleSummary(shapePointLegendRows.value))
const filteredShapePointLegendRows = computed(() =>
  filterMapShapePointLegendRows(shapePointLegendRows.value, {
    role: shapePointLegendRoleFilter.value,
    visibility: shapePointLegendVisibilityFilter.value,
  }),
)
const shapePointLegendRoleFilterLabel = computed(() =>
  shapePointLegendRoleFilter.value === 'all'
    ? 'všetky typy'
    : mapShapePointRoleLabels[shapePointLegendRoleFilter.value],
)
const shapePointLegendVisibilityFilterLabel = computed(() =>
  shapePointLegendVisibilityFilter.value === 'all'
    ? 'všetky viditeľnosti'
    : mapShapeVisibilityLabels[shapePointLegendVisibilityFilter.value],
)
const shapePointLegendPrintMeta = computed(() => [
  { label: 'Jazero', value: getLakeName(selectedLake.value) },
  { label: 'Typ bodu', value: shapePointLegendRoleFilterLabel.value },
  { label: 'Viditeľnosť', value: shapePointLegendVisibilityFilterLabel.value },
  { label: 'Počet bodov', value: `${filteredShapePointLegendRows.value.length}/${shapePointLegendRows.value.length}` },
])
const mapQualityIssues = computed(() =>
  getMapQualityIssues({
    cabinProducts: editorCabinProducts.value,
    enabledLayerIds: enabledLayerIds.value,
    focusedTournament: focusedTournament.value,
    lake: selectedLake.value,
    mapFacilities: editorFacilities.value,
    mapLayers: editorMapLayers.value,
    mapShapes: editorShapes.value,
    pegs: editorPegs.value,
  }),
)
const mapQualitySummary = computed(() => getMapQualityIssueSummary(mapQualityIssues.value))
const mapPublishQualityIssues = computed(() =>
  getMapPublishQualityIssues({
    cabinProducts: editorCabinProducts.value,
    enabledLayerIds: enabledLayerIds.value,
    mapFacilities: editorFacilities.value,
    mapLayers: editorMapLayers.value,
    mapShapes: editorShapes.value,
    pegs: editorPegs.value,
    tournaments,
  }),
)
const mapPublishQualitySummary = computed(() => getMapQualityIssueSummary(mapPublishQualityIssues.value))
const mapPublishBlockingIssues = computed(() =>
  mapPublishQualityIssues.value.filter((issue) => issue.severity === 'error'),
)
const mapPublishExtraIssues = computed(() => {
  const currentIssueIds = new Set(mapQualityIssues.value.map((issue) => issue.id))

  return mapPublishQualityIssues.value.filter((issue) => !currentIssueIds.has(issue.id))
})
const mapQualitySummaryLabel = computed(() => {
  if (mapQualityIssues.value.length === 0) return 'bez nálezov'

  return [
    mapQualitySummary.value.errorCount > 0 ? `${mapQualitySummary.value.errorCount} kritické` : '',
    mapQualitySummary.value.warningCount > 0 ? `${mapQualitySummary.value.warningCount} upozornenia` : '',
    mapQualitySummary.value.infoCount > 0 ? `${mapQualitySummary.value.infoCount} info` : '',
  ].filter(Boolean).join(' · ')
})
const mapPublishQualitySummaryLabel = computed(() => {
  if (mapPublishQualityIssues.value.length === 0) return 'bez nálezov'

  return [
    mapPublishQualitySummary.value.errorCount > 0 ? `${mapPublishQualitySummary.value.errorCount} kritické` : '',
    mapPublishQualitySummary.value.warningCount > 0 ? `${mapPublishQualitySummary.value.warningCount} upozornenia` : '',
    mapPublishQualitySummary.value.infoCount > 0 ? `${mapPublishQualitySummary.value.infoCount} info` : '',
  ].filter(Boolean).join(' · ')
})
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
const activeLayerPresetId = computed(() => getActiveMapLayerPresetId(lakeLayers.value, enabledLayerIds.value))
const activeLayerPresetLabel = computed(() =>
  activeLayerPresetId.value === 'manual'
    ? 'Ručný výber'
    : mapLayerPresetOptions.find((preset) => preset.id === activeLayerPresetId.value)?.label ?? 'Ručný výber',
)
const missingStandardLayerKinds = computed(() => getMissingMapLayerKinds(lakeLayers.value))
const missingStandardLayerLabels = computed(() =>
  missingStandardLayerKinds.value.map((kind) => mapLayerKindLabels[kind]),
)
const layerPresetRows = computed(() =>
  mapLayerPresetOptions.map((preset) => {
    const layerIds = getMapLayerPresetLayerIds(lakeLayers.value, preset.id)
    const missingKinds = getMissingMapLayerKinds(lakeLayers.value, preset.layerKinds)

    return {
      ...preset,
      expectedLayerCount: preset.layerKinds.length,
      layerCount: layerIds.length,
      missingLayerLabels: missingKinds.map((kind) => mapLayerKindLabels[kind]),
    }
  }),
)
const layerContentKindRows = computed(() =>
  mapStandardLayerKinds.map((kind) => {
    const contentSummary = getMapLayerContentSummary({
      kind,
      lake: selectedLake.value,
      mapFacilities: editorFacilities.value,
      mapShapes: editorShapes.value,
      pegs: editorPegs.value,
    })
    const layers = lakeLayers.value.filter((layer) => layer.kind === kind)
    const enabled = layers.some((layer) => enabledLayerIds.value.includes(layer.id))

    return {
      contentSummary,
      enabled,
      hasHiddenContent: contentSummary.totalCount > 0 && !enabled,
      kind,
      kindLabel: mapLayerKindLabels[kind],
      layers,
      missing: layers.length === 0,
    }
  }),
)
const hiddenContentLayerRows = computed(() =>
  layerContentKindRows.value.filter((row) => row.hasHiddenContent),
)
const hiddenContentLayerSummaryLabel = computed(() =>
  hiddenContentLayerRows.value.map((row) => row.kindLabel).join(', '),
)
function getLayerReadiness(kind: MapLayer['kind']) {
  const layers = lakeLayers.value.filter((layer) => layer.kind === kind)
  const enabled = layers.some((layer) => enabledLayerIds.value.includes(layer.id))
  const status: LayerReadinessStatus = enabled ? 'active' : layers.length > 0 ? 'disabled' : 'missing'

  return {
    kind,
    label: mapLayerKindLabels[kind],
    status,
    statusLabel: status === 'active' ? 'aktívna' : status === 'disabled' ? 'zapne sa' : 'vytvorí sa',
  }
}

function getLayerReadinessTone(status: LayerReadinessStatus): StatusBadgeTone {
  if (status === 'active') return 'success'
  if (status === 'disabled') return 'warning'

  return 'info'
}

function getLayerReadinessIcon(status: LayerReadinessStatus) {
  if (status === 'active') return 'i-heroicons-eye'
  if (status === 'disabled') return 'i-heroicons-eye-slash'

  return 'i-heroicons-plus-circle'
}

const addPanelLayerReadinessRows = computed(() => [
  {
    ...getLayerReadiness(getMapLayerKindForPegType('shore')),
    icon: 'i-heroicons-map-pin',
    id: 'shore-peg',
    title: 'Brehové miesto',
  },
  {
    ...getLayerReadiness(getMapLayerKindForPegType('cabin')),
    icon: 'i-heroicons-home-modern',
    id: 'cabin-peg',
    title: 'Miesto s chatou',
  },
  {
    ...getLayerReadiness('service'),
    icon: 'i-heroicons-wrench-screwdriver',
    id: 'facility',
    title: 'Servisný bod',
  },
  {
    ...getLayerReadiness(getMapLayerKindForShapeType(drawShapeType.value)),
    icon: 'i-heroicons-pencil-square',
    id: 'shape',
    title: mapShapeTypeLabels[drawShapeType.value],
  },
])
const selectedElementLayerReadiness = computed(() => {
  if (selectedKind.value === 'peg' && selectedPeg.value) {
    return {
      ...getLayerReadiness(getMapLayerKindForPegType(selectedPeg.value.type)),
      itemLabel: selectedPeg.value.label,
      title: 'Vrstva miesta',
    }
  }

  if (selectedKind.value === 'facility' && selectedFacility.value) {
    return {
      ...getLayerReadiness('service'),
      itemLabel: selectedFacility.value.label,
      title: 'Vrstva servisného bodu',
    }
  }

  if (selectedKind.value === 'shape' && selectedShape.value) {
    return {
      ...getLayerReadiness(getMapLayerKindForShapeType(selectedShape.value.type)),
      itemLabel: selectedShape.value.label,
      title: 'Vrstva plochy',
    }
  }

  return undefined
})
const layerRows = computed(() =>
  lakeLayers.value.map((layer) => {
    const kindRow = layerContentKindRows.value.find((row) => row.kind === layer.kind)
    const contentSummary = kindRow?.contentSummary ?? getMapLayerContentSummary({
      kind: layer.kind,
      lake: selectedLake.value,
      mapFacilities: editorFacilities.value,
      mapShapes: editorShapes.value,
      pegs: editorPegs.value,
    })
    const enabled = enabledLayerIds.value.includes(layer.id)

    return {
      contentSummary,
      enabled,
      hasHiddenContent: contentSummary.totalCount > 0 && !(kindRow?.enabled ?? enabled),
      layer,
    }
  }),
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
  exportFrame: mapExportFrame.value,
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
  shapePointLegend: filteredShapePointLegendRows.value,
}))
const mapExportSummaryRows = computed(() => [
  { label: 'Lovné miesta', value: exportModel.value.pegs.length },
  { label: 'Servisné body', value: exportModel.value.facilities.length },
  { label: 'Plochy a sektory', value: exportModel.value.shapes.length },
  { label: 'Vrstvy mapy', value: exportModel.value.layers.length },
  { label: 'Body v legende', value: exportModel.value.shapePointLegend.length },
])
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
const mapExportFrameCoverage = computed(() => {
  const frame = mapExportFrame.value
  const pointIsInsideFrame = (point: Pick<MapCoordinate, 'x' | 'y'>) => {
    const svgY = toSvgY(point.y)

    return (
      point.x >= frame.x
      && point.x <= frame.x + frame.width
      && svgY >= frame.y
      && svgY <= frame.y + frame.height
    )
  }
  const pegCount = lakePegs.value.filter(pointIsInsideFrame).length
  const facilityCount = lakeFacilities.value.filter(pointIsInsideFrame).length
  const shapePointCount = lakeShapes.value.flatMap((shape) => shape.points).filter(pointIsInsideFrame).length
  const totalShapePointCount = lakeShapes.value.reduce((sum, shape) => sum + shape.points.length, 0)

  return {
    facilities: `${facilityCount}/${lakeFacilities.value.length}`,
    pegs: `${pegCount}/${lakePegs.value.length}`,
    shapePoints: `${shapePointCount}/${totalShapePointCount}`,
  }
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

watch(
  () => route.query.sekcia,
  (view) => {
    activeMapAdminView.value = normalizeMapAdminView(view)
    void centerActiveMapAdminTab(false)
  },
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
  mapQualityFocusMessage.value = ''
  highlightBackgroundUpload.value = false
  highlightCabinCatalogPanel.value = false
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

function ensureLayerKindsExist(kinds: Array<MapLayer['kind']>) {
  const targetKinds = new Set(kinds)
  for (const kind of targetKinds) {
    const layerExists = editorMapLayers.value.some((layer) =>
      layer.lake === selectedLake.value && layer.kind === kind,
    )
    if (layerExists) continue

    editorMapLayers.value.push(createMapLayerDraft(
      selectedLake.value,
      kind,
      editorMapLayers.value.map((item) => item.id),
    ))
  }

  return editorMapLayers.value
    .filter((layer) => layer.lake === selectedLake.value && targetKinds.has(layer.kind))
    .map((layer) => layer.id)
}

function ensureLayerKindVisible(kind: MapLayer['kind']) {
  const targetLayerIds = ensureLayerKindsExist([kind])
  const missingLayerIds = targetLayerIds.filter((layerId) => !enabledLayerIds.value.includes(layerId))
  if (missingLayerIds.length > 0) {
    setLakeEnabledLayerIds([
      ...lakeLayers.value
        .filter((layer) => enabledLayerIds.value.includes(layer.id))
        .map((layer) => layer.id),
      ...missingLayerIds,
    ])
  }
}

function ensureShapeLayerVisible(type: MapShape['type']) {
  ensureLayerKindVisible(getMapLayerKindForShapeType(type))
}

function ensurePegLayerVisible(type: Peg['type']) {
  ensureLayerKindVisible(getMapLayerKindForPegType(type))
}

function showContentLayers() {
  if (!canManageMap.value || hiddenContentLayerRows.value.length === 0) return

  const targetKinds = hiddenContentLayerRows.value.map((row) => row.kind)
  const targetLabel = hiddenContentLayerSummaryLabel.value
  const targetLayerIds = ensureLayerKindsExist(targetKinds)
  setLakeEnabledLayerIds([
    ...lakeLayers.value
      .filter((layer) => enabledLayerIds.value.includes(layer.id))
      .map((layer) => layer.id),
    ...targetLayerIds,
  ])
  resetSaveFeedback()
  mapQualityFocusMessage.value = `Zapnuté vrstvy s obsahom: ${targetLabel}.`
}

function showSelectedElementLayer() {
  if (!canManageMap.value || !selectedElementLayerReadiness.value) return

  ensureLayerKindVisible(selectedElementLayerReadiness.value.kind)
  resetSaveFeedback()
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

async function focusBackgroundUploadPanel() {
  if (!import.meta.client) return

  await nextTick()
  const focusTarget = backgroundUploadRef.value ?? backgroundPanelRef.value
  focusTarget?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  highlightBackgroundUpload.value = true
  window.clearTimeout(backgroundUploadHighlightTimeout)
  backgroundUploadHighlightTimeout = window.setTimeout(() => {
    highlightBackgroundUpload.value = false
  }, 3600)
}

async function focusCabinCatalogPanel() {
  if (!import.meta.client) return

  await nextTick()
  cabinCatalogPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  highlightCabinCatalogPanel.value = true
  window.clearTimeout(cabinCatalogHighlightTimeout)
  cabinCatalogHighlightTimeout = window.setTimeout(() => {
    highlightCabinCatalogPanel.value = false
  }, 3600)
}

async function focusLayersPanel() {
  if (!import.meta.client) return

  await nextTick()
  layersPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  highlightLayersPanel.value = true
  window.clearTimeout(layersPanelHighlightTimeout)
  layersPanelHighlightTimeout = window.setTimeout(() => {
    highlightLayersPanel.value = false
  }, 3600)
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

async function centerActiveMapAdminTab(smooth = true) {
  if (!import.meta.client) return

  await nextTick()
  const container = mapAdminTabsRef.value
  const activeTab = container?.querySelector<HTMLElement>(`[data-map-admin-view="${activeMapAdminView.value}"]`)
  if (!container || !activeTab) return

  container.scrollTo({
    behavior: smooth ? 'smooth' : 'auto',
    left: activeTab.offsetLeft - (container.clientWidth / 2) + (activeTab.clientWidth / 2),
  })
}

async function selectMapAdminView(view: MapAdminView, options: { focusTab?: boolean, updateRoute?: boolean } = {}) {
  activeMapAdminView.value = view

  if (import.meta.client && options.updateRoute !== false) {
    const query = { ...route.query }
    const explicitView = getRouteQueryValue(route.query.sekcia)
    const shouldReplaceRoute = view === 'prvky'
      ? Boolean(explicitView)
      : normalizeMapAdminView(route.query.sekcia) !== view

    if (view === 'prvky') delete query.sekcia
    else query.sekcia = view

    if (shouldReplaceRoute) await router.replace({ query })
  }

  await centerActiveMapAdminTab()

  if (options.focusTab) {
    mapAdminTabsRef.value
      ?.querySelector<HTMLElement>(`[data-map-admin-view="${view}"]`)
      ?.focus()
  }
}

function handleMapAdminTabsKeydown(event: KeyboardEvent) {
  const currentIndex = mapAdminViewOptions.findIndex((option) => option.id === activeMapAdminView.value)
  let nextIndex = currentIndex

  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % mapAdminViewOptions.length
  else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + mapAdminViewOptions.length) % mapAdminViewOptions.length
  else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = mapAdminViewOptions.length - 1
  else return

  event.preventDefault()
  const nextView = mapAdminViewOptions[nextIndex]?.id
  if (nextView) void selectMapAdminView(nextView, { focusTab: true })
}

function selectPeg(peg: Peg) {
  selectedKind.value = 'peg'
  selectedPegId.value = peg.id
  resetSaveFeedback()
  void selectMapAdminView('prvky')
}

function selectFacility(facility: MapFacility) {
  selectedKind.value = 'facility'
  selectedFacilityId.value = facility.id
  resetSaveFeedback()
  void selectMapAdminView('prvky')
}

function selectShape(shape: MapShape) {
  selectedKind.value = 'shape'
  selectedShapeId.value = shape.id
  resetSaveFeedback()
  void selectMapAdminView('prvky')
}

function selectShapePointLegendRow(row: MapShapePointLegendRow) {
  const shape = editorShapes.value.find((item) => item.id === row.shapeId)
  if (!shape) return

  selectShape(shape)
}

function formatPrintTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat('sk-SK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function printShapePointLegend() {
  if (!import.meta.client || filteredShapePointLegendRows.value.length === 0) return

  shapePointLegendPrintGeneratedAt.value = formatPrintTimestamp()
  window.print()
}

function downloadShapePointLegendCsv() {
  if (!import.meta.client || filteredShapePointLegendRows.value.length === 0) return

  const csv = createMapShapePointLegendCsv(filteredShapePointLegendRows.value)
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `legenda-vrcholov-${selectedLake.value}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function setLakeEnabledLayerIds(layerIds: string[]) {
  const lakeLayerIds = new Set(lakeLayers.value.map((layer) => layer.id))
  const nextLakeLayerIds = new Set(layerIds)
  enabledLayerIds.value = [
    ...enabledLayerIds.value.filter((id) => !lakeLayerIds.has(id)),
    ...lakeLayers.value
      .filter((layer) => nextLakeLayerIds.has(layer.id))
      .map((layer) => layer.id),
  ]
  editorMapLayers.value = editorMapLayers.value.map((layer) =>
    lakeLayerIds.has(layer.id)
      ? { ...layer, enabled: nextLakeLayerIds.has(layer.id) }
      : layer,
  )
  resetSaveFeedback()
  resetBackgroundUploadFeedback()
}

function toggleLayer(layerId: string) {
  if (!canManageMap.value) return

  const currentLakeEnabledLayerIds = lakeLayers.value
    .filter((layer) => enabledLayerIds.value.includes(layer.id))
    .map((layer) => layer.id)
  const nextLayerIds = currentLakeEnabledLayerIds.includes(layerId)
    ? currentLakeEnabledLayerIds.filter((id) => id !== layerId)
    : [...currentLakeEnabledLayerIds, layerId]

  setLakeEnabledLayerIds(nextLayerIds)
}

function applyLayerPreset(preset: MapLayerPreset & { isAvailable?: boolean }) {
  if (!canManageMap.value) return

  const layerIds = ensureLayerKindsExist(preset.layerKinds)
  setLakeEnabledLayerIds(layerIds)
}

function addMissingStandardLayers() {
  if (!canManageMap.value || missingStandardLayerKinds.value.length === 0) return

  const layerIds = ensureLayerKindsExist(mapStandardLayerKinds)
  setLakeEnabledLayerIds(layerIds)
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

  ensureLayerKindVisible(getMapLayerKindForPegType(type))
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

  ensureLayerKindVisible('service')
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

  await selectMapAdminView('prvky')

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

function alignFocusedTournamentSectorShapes() {
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

  const result = alignTournamentSectorShapes(tournament, editorShapes.value, {
    heightPercent: sectorShapeHeight.value,
    mode: sectorShapeAlignmentMode.value,
    widthPercent: sectorShapeWidth.value,
  })

  if (result.updatedCount === 0) {
    routeFocusStatus.value = 'warning'
    routeFocusMessage.value = `Súťaž ${tournament.name} ešte nemá žiadne naviazané sektorové polygony na zarovnanie.`
    return
  }

  ensureShapeLayerVisible('sector')
  editorShapes.value = result.shapes
  cancelShapeDrawing()
  const firstUpdatedShape = editorShapes.value.find((shape) => shape.id === result.updatedShapeIds[0])
  if (firstUpdatedShape) selectShape(firstUpdatedShape)
  resetSaveFeedback()
  routeFocusStatus.value = 'success'
  routeFocusMessage.value = sectorShapeAlignmentMode.value === 'shoreline'
    ? `Zarovnané neuložené polygony pre ${result.updatedCount} sektorov súťaže ${tournament.name} podľa brehu alebo súťažnej línie.`
    : `Zarovnané neuložené polygony pre ${result.updatedCount} sektorov súťaže ${tournament.name}.`
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
  shapePointLegendPrintGeneratedAt.value = formatPrintTimestamp()
  void centerActiveMapAdminTab(false)
  void focusRequestedTournamentSector()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleDrawingShortcut)
  window.clearTimeout(backgroundUploadHighlightTimeout)
  window.clearTimeout(layersPanelHighlightTimeout)
  window.clearTimeout(cabinCatalogHighlightTimeout)
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
    ...point,
    x: clampMapPercent(point.x + dx),
    y: clampMapPercent(point.y + dy),
  }))
  selectShape(shape)
}

function moveShapePoint(payload: { id: string, pointIndex: number, x: number, y: number }) {
  if (!canManageMap.value) return

  const shape = editorShapes.value.find((item) => item.id === payload.id)
  if (!shape || !shape.points[payload.pointIndex]) return
  shape.points[payload.pointIndex] = { ...shape.points[payload.pointIndex], x: payload.x, y: payload.y }
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

  ensurePegLayerVisible(peg.type)

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
  ensurePegLayerVisible(peg.type)

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

  if (cabinProductId && peg.type !== 'cabin') {
    peg.type = 'cabin'
    peg.requiresCabinReservation = true
  }
  if (peg.type === 'cabin') {
    ensurePegLayerVisible('cabin')
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

function getMapQualityIssueIcon(severity: MapQualityIssueSeverity) {
  if (severity === 'error') return 'i-heroicons-exclamation-triangle'
  if (severity === 'warning') return 'i-heroicons-exclamation-circle'

  return 'i-heroicons-information-circle'
}

function getMapQualityIssueClasses(severity: MapQualityIssueSeverity) {
  if (severity === 'error') return 'border-error-500/25 bg-error-500/10 text-error-800'
  if (severity === 'warning') return 'border-warning-500/25 bg-warning-500/10 text-warning-800'

  return 'border-info-500/25 bg-info-500/10 text-info-800'
}

function canFocusMapQualityIssue(issue: MapQualityIssue) {
  return Boolean(issue.target?.lake)
}

function shouldFocusCabinCatalogPanel(issue: MapQualityIssue) {
  return [
    'cabin-peg-multiple-products-',
    'optional-cabin-without-product-',
    'required-cabin-without-product-',
  ].some((prefix) => issue.id.startsWith(prefix))
}

function getMapQualityIssueFocusLabel(issue: MapQualityIssue) {
  if (issue.target?.kind === 'peg' && shouldFocusCabinCatalogPanel(issue)) return 'Otvoriť väzbu chaty'
  if (issue.target?.kind === 'peg') return 'Otvoriť miesto'
  if (issue.target?.kind === 'facility') return 'Otvoriť servisný bod'
  if (issue.target?.kind === 'shape') return 'Otvoriť polygon'
  if (issue.target?.kind === 'tournamentSector') return canManageMap.value ? 'Doplniť polygon sektora' : 'Otvoriť sektor'
  if (issue.target?.action === 'createShoreline') return canManageMap.value ? 'Pripraviť vodnú oblasť' : 'Otvoriť jazero'
  if (issue.target?.action === 'openBackground') return 'Nahrať podklad'
  if (issue.target?.action === 'openLayers') return 'Otvoriť vrstvy'
  if (issue.target?.kind === 'layer') return canManageMap.value ? 'Zapnúť vrstvu' : 'Otvoriť vrstvu'
  if (issue.target?.kind === 'lake') return 'Prepnúť jazero'

  return 'Zobraziť v editore'
}

function createLakeShorelineShapeDraft(lake: LakeSlug): MapShape {
  return {
    id: createUniqueId(`shape-${getLakePrefix(lake)}-shoreline`, editorShapes.value.map((shape) => shape.id)),
    lake,
    label: 'Vodná oblasť',
    points: [
      { x: 12, y: 31 },
      { x: 25, y: 18 },
      { x: 51, y: 13 },
      { x: 77, y: 22 },
      { x: 89, y: 43 },
      { x: 81, y: 62 },
      { x: 51, y: 69 },
      { x: 20, y: 58 },
    ],
    tone: 'water',
    type: 'shoreline',
    visibility: 'public',
  }
}

async function focusMapQualityIssue(issue: MapQualityIssue) {
  const target = issue.target
  if (!target?.lake) return

  mapQualityFocusMessage.value = ''
  if (selectedLake.value !== target.lake) {
    selectedLake.value = target.lake
    await nextTick()
  }

  const targetView: MapAdminView = (
    target.action === 'openBackground'
    || target.action === 'openLayers'
    || target.kind === 'layer'
  )
    ? 'vrstvy'
    : 'prvky'
  await selectMapAdminView(targetView)

  if (target.kind === 'lake' && target.action === 'createShoreline') {
    ensureShapeLayerVisible('shoreline')
    selectedKind.value = 'shape'

    const existingShoreline = editorShapes.value.find((shape) =>
      shape.lake === target.lake
      && shape.type === 'shoreline',
    )

    if (existingShoreline) {
      cancelShapeDrawing()
      selectShape(existingShoreline)
      mapQualityFocusMessage.value = existingShoreline.visibility === 'public'
        ? 'Otvorená existujúca vodná oblasť.'
        : 'Otvorená existujúca vodná oblasť. Ak má ísť na verejnú mapu, nastav viditeľnosť na verejné.'
      return
    }

    if (!canManageMap.value) {
      mapQualityFocusMessage.value = 'Jazero je otvorené, ale vodnú oblasť vie založiť iba rola s plným prístupom k mape.'
      return
    }

    const shape = createLakeShorelineShapeDraft(target.lake)
    editorShapes.value.push(shape)
    cancelShapeDrawing()
    selectShape(shape)
    resetSaveFeedback()
    mapQualityFocusMessage.value = 'Pripravená nová neuložená vodná oblasť. Uprav vrcholy podľa brehu a ulož draft mapy.'
    return
  }

  if (target.kind === 'lake' && target.action === 'openBackground') {
    cancelShapeDrawing()
    isEditingBackground.value = Boolean(activeBackgroundImage.value)
    await focusBackgroundUploadPanel()
    mapQualityFocusMessage.value = activeBackgroundImage.value
      ? 'Otvorený podklad mapy. Skontroluj napasovanie alebo nahraj presnejší obrázok.'
      : 'Jazero je otvorené. V paneli podkladu nahraj JPG, PNG alebo WebP mapu.'
    return
  }

  if ((target.kind === 'lake' && target.action === 'openLayers') || target.kind === 'layer') {
    cancelShapeDrawing()

    const targetLayer = target.id
      ? lakeLayers.value.find((layer) => layer.id === target.id)
      : undefined

    if (targetLayer && canManageMap.value && !enabledLayerIds.value.includes(targetLayer.id)) {
      setLakeEnabledLayerIds([
        ...lakeLayers.value
          .filter((layer) => enabledLayerIds.value.includes(layer.id))
          .map((layer) => layer.id),
        targetLayer.id,
      ])
      resetSaveFeedback()
      mapQualityFocusMessage.value = `Vrstva ${targetLayer.name} je zapnutá v neuloženom drafte mapy.`
    }
    else {
      mapQualityFocusMessage.value = targetLayer
        ? `Otvorená vrstva ${targetLayer.name}.`
        : 'Otvorený panel vrstiev. Doplň chýbajúcu vrstvu alebo vyber pracovný režim.'
    }

    await focusLayersPanel()
    return
  }

  if (target.kind === 'peg' && target.id && editorPegs.value.some((peg) => peg.id === target.id)) {
    selectedKind.value = 'peg'
    selectedPegId.value = target.id
    if (shouldFocusCabinCatalogPanel(issue)) {
      await focusCabinCatalogPanel()
      mapQualityFocusMessage.value = 'Otvorená väzba cenníkovej chaty pre vybrané miesto.'
      return
    }
  }
  else if (target.kind === 'facility' && target.id && editorFacilities.value.some((facility) => facility.id === target.id)) {
    selectedKind.value = 'facility'
    selectedFacilityId.value = target.id
  }
  else if (target.kind === 'shape' && target.id && editorShapes.value.some((shape) => shape.id === target.id)) {
    selectedKind.value = 'shape'
    selectedShapeId.value = target.id
  }
  else if (target.kind === 'tournamentSector') {
    ensureShapeLayerVisible('sector')
    selectedKind.value = 'shape'

    const tournament = tournaments.find((item) => item.id === target.tournamentId && item.lake === target.lake)
    const sector = tournament?.sectors.find((item) => item.id === target.sectorId)
    if (!tournament || !sector) {
      mapQualityFocusMessage.value = 'Jazero súťaže je otvorené, ale turnaj alebo sektor už v dátach neexistuje.'
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
      mapQualityFocusMessage.value = `Otvorený polygon sektora ${sector.label}.`
      return
    }

    if (!canManageMap.value) {
      mapQualityFocusMessage.value = `Sektor ${sector.label} zatiaľ nemá polygon. Na vytvorenie treba plný prístup k mape.`
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
    mapQualityFocusMessage.value = `Pripravený nový neuložený polygon pre sektor ${sector.label}. Uprav vrcholy a ulož draft mapy.`
    return
  }

  mapQualityFocusMessage.value = `Otvorený nález: ${issue.title}.`
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

function validateMapBeforePublish() {
  if (!validateMapBeforeMutation()) {
    publishStatus.value = 'error'
    publishMessage.value = saveMessage.value
    return false
  }

  const blockingIssue = mapPublishBlockingIssues.value[0]
  if (blockingIssue) {
    publishStatus.value = 'error'
    publishMessage.value = `${blockingIssue.title}: ${blockingIssue.description}`
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
  if (!validateMapBeforePublish()) return

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
    <div class="screen-only">
      <PageHeader
        eyebrow="Admin"
        title="Mapa a editor miest"
        description="Editor lovných miest, chát, servisných bodov, obmedzení a súťažných vrstiev mapy."
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

      <div class="mb-6 border-y border-border py-3">
        <div
          ref="mapAdminTabsRef"
          class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          <div
            role="tablist"
            aria-label="Pracovná časť editora mapy"
            class="inline-flex min-w-max rounded-lg border border-border bg-surface p-1"
            @keydown="handleMapAdminTabsKeydown"
          >
            <button
              v-for="option in mapAdminViewOptions"
              :id="`map-admin-tab-${option.id}`"
              :key="option.id"
              type="button"
              role="tab"
              :aria-controls="`map-admin-panel-${option.id}`"
              :aria-selected="activeMapAdminView === option.id"
              :data-map-admin-view="option.id"
              :tabindex="activeMapAdminView === option.id ? 0 : -1"
              class="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors"
              :class="activeMapAdminView === option.id
                ? 'bg-primary-900 text-white shadow-sm'
                : 'text-foreground-muted hover:bg-muted hover:text-foreground'"
              @click="selectMapAdminView(option.id)"
            >
              <UIcon :name="option.icon" class="h-4 w-4 shrink-0" />
              <span>{{ option.label }}</span>
            </button>
          </div>
        </div>
        <div class="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-foreground-muted text-sm">{{ activeMapAdminViewOption.description }}</p>
          <button
            v-if="activeMapAdminView !== 'publikovanie' && (changedItemsCount > 0 || mapState.hasUnpublishedChanges)"
            type="button"
            class="inline-flex shrink-0 items-center gap-1.5 text-left text-sm font-bold text-primary-800 hover:text-primary-950"
            @click="selectMapAdminView('publikovanie')"
          >
            <UIcon name="i-heroicons-arrow-right-circle" class="h-4 w-4" />
            {{ changedItemsCount > 0 ? 'Skontrolovať neuložené zmeny' : 'Skontrolovať uložený draft' }}
          </button>
        </div>
      </div>

      <div
        v-if="mapQualityFocusMessage"
        class="mb-5 flex items-start justify-between gap-3 rounded-md border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-950"
      >
        <div class="flex items-start gap-2">
          <UIcon name="i-heroicons-information-circle" class="mt-0.5 h-4 w-4 shrink-0" />
          <p class="font-semibold">{{ mapQualityFocusMessage }}</p>
        </div>
        <button
          type="button"
          class="shrink-0 text-primary-800 hover:text-primary-950"
          aria-label="Zavrieť správu"
          @click="mapQualityFocusMessage = ''"
        >
          <UIcon name="i-heroicons-x-mark" class="h-5 w-5" />
        </button>
      </div>

      <div class="grid gap-6 lg:grid-cols-[1fr_0.82fr]">
        <div class="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <MapEditorCanvas
          :closures="liveClosures"
          :draft-shape="draftShape"
          :drawing-shape="isDrawingShape"
          :editing-background="isEditingBackground"
          :editable="canManageMap"
          :export-frame="mapExportFrame"
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
        </div>

        <aside
          :id="`map-admin-panel-${activeMapAdminView}`"
          role="tabpanel"
          :aria-labelledby="`map-admin-tab-${activeMapAdminView}`"
          class="min-w-0 space-y-6"
        >
          <div v-if="activeMapAdminView === 'prvky'" class="rounded-card border border-border bg-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Pridať do mapy</h2>
                <p class="text-foreground-muted mt-1 text-sm">Body, servisné miesta a kreslené plochy pre revír.</p>
              </div>
              <UIcon name="i-heroicons-map-pin" class="text-primary-800 h-5 w-5" />
            </div>
            <div class="mt-4 grid gap-2 sm:grid-cols-2">
              <div
                v-for="row in addPanelLayerReadinessRows"
                :key="row.id"
                class="rounded-md border border-border bg-white px-3 py-2"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="flex min-w-0 items-center gap-2">
                    <UIcon :name="row.icon" class="h-4 w-4 shrink-0" />
                    <span class="truncate text-xs font-bold">{{ row.title }}</span>
                  </span>
                  <StatusBadge
                    class="shrink-0"
                    :icon="getLayerReadinessIcon(row.status)"
                    :label="row.statusLabel"
                    size="xs"
                    :tone="getLayerReadinessTone(row.status)"
                  />
                </div>
                <p class="text-foreground-muted mt-1 truncate text-xs">{{ row.label }}</p>
              </div>
            </div>
            <div class="mt-4 space-y-4">
              <div>
                <p class="text-xs font-bold uppercase text-foreground-muted">Miesta</p>
                <div class="mt-2 grid gap-2 sm:grid-cols-2">
                  <UButton type="button" icon="i-heroicons-plus" variant="soft" :disabled="!canManageMap" @click="addPegDraft('shore')">
                    Lovné miesto
                  </UButton>
                  <UButton type="button" icon="i-heroicons-home-modern" variant="soft" :disabled="!canManageMap" @click="addPegDraft('cabin')">
                    Miesto s chatou
                  </UButton>
                </div>
              </div>

              <div>
                <p class="text-xs font-bold uppercase text-foreground-muted">Servisné body</p>
                <div class="mt-2 grid grid-cols-2 gap-2">
                  <UButton
                    v-for="option in facilityQuickAddOptions"
                    :key="option.type"
                    type="button"
                    :icon="option.icon"
                    variant="soft"
                    size="sm"
                    class="min-h-10 justify-start"
                    :disabled="!canManageMap"
                    @click="addFacilityDraft(option.type)"
                  >
                    {{ option.label }}
                  </UButton>
                </div>
              </div>

              <div>
                <p class="text-xs font-bold uppercase text-foreground-muted">Plochy</p>
                <div class="mt-2 grid grid-cols-2 gap-2">
                  <UButton
                    v-for="preset in shapePresetOptions"
                    :key="preset.type"
                    type="button"
                    :icon="preset.icon"
                    :color="preset.type === 'zone' || preset.type === 'sector' ? 'warning' : 'primary'"
                    variant="soft"
                    size="sm"
                    class="min-h-10 justify-start"
                    :disabled="!canManageMap"
                    @click="addShapeDraft(preset.type)"
                  >
                    {{ preset.label }}
                  </UButton>
                </div>
              </div>
            </div>

            <div
              v-if="focusedTournament"
              class="mt-4 rounded-md border border-warning-200 bg-warning-500/10 p-3"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p class="text-sm font-bold text-warning-900">Polygony sektorov</p>
                  <p class="text-foreground-muted mt-1 text-xs">
                    {{ focusedTournament.name }} · hotové {{ mappedFocusedTournamentSectorRows.length }}/{{ focusedTournament.sectors.length }} · chýba {{ missingFocusedTournamentSectorRows.length }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
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
                  <UButton
                    type="button"
                    icon="i-heroicons-arrows-pointing-out"
                    size="sm"
                    color="warning"
                    :disabled="!canManageMap || mappedFocusedTournamentSectorRows.length === 0"
                    @click="alignFocusedTournamentSectorShapes"
                  >
                    Zarovnať
                  </UButton>
                </div>
              </div>
              <div class="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  v-for="option in sectorShapeAlignmentModeOptions"
                  :key="option.value"
                  type="button"
                  class="rounded-md border px-3 py-2 text-left transition-colors"
                  :class="
                    sectorShapeAlignmentMode === option.value
                      ? 'border-warning-300 bg-white text-warning-950'
                      : 'border-warning-200 bg-warning-50/50 text-foreground hover:bg-white'
                  "
                  @click="sectorShapeAlignmentMode = option.value"
                >
                  <span class="flex items-center gap-2 text-sm font-bold">
                    <UIcon :name="option.icon" class="h-4 w-4 shrink-0 text-warning-800" />
                    {{ option.label }}
                  </span>
                  <span class="text-foreground-muted mt-1 block text-xs">{{ option.description }}</span>
                </button>
              </div>
              <p class="text-foreground-muted mt-2 text-xs">
                Referenčné línie pre brehový režim: {{ sectorAlignmentReferenceShapes.length }}.
                Použijú sa vodné plochy, ostrovy alebo všeobecná súťažná línia bez konkrétneho sektora; pri chýbajúcej línii sa použije bod sektora.
              </p>
              <div class="mt-3 grid gap-2 sm:grid-cols-2">
                <label class="block">
                  <span class="text-xs font-semibold text-warning-900">Šírka návrhu</span>
                  <input
                    v-model.number="sectorShapeWidth"
                    type="number"
                    min="4"
                    max="40"
                    step="1"
                    :readonly="!canManageMap"
                    class="mt-1 h-9 w-full rounded-md border border-warning-200 bg-white px-2 text-sm"
                  >
                </label>
                <label class="block">
                  <span class="text-xs font-semibold text-warning-900">Výška návrhu</span>
                  <input
                    v-model.number="sectorShapeHeight"
                    type="number"
                    min="4"
                    max="40"
                    step="1"
                    :readonly="!canManageMap"
                    class="mt-1 h-9 w-full rounded-md border border-warning-200 bg-white px-2 text-sm"
                  >
                </label>
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

          <div
            v-if="activeMapAdminView === 'vrstvy'"
            ref="layersPanelRef"
            class="rounded-card border border-border bg-surface p-5 transition-shadow"
            :class="highlightLayersPanel ? 'ring-2 ring-warning-300 shadow-sm' : ''"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Vrstvy mapy</h2>
                <p class="text-foreground-muted mt-1 text-sm">{{ activeLayerPresetLabel }} · {{ selectedLayerSummary }}</p>
              </div>
              <UIcon name="i-heroicons-squares-2x2" class="text-primary-800 h-5 w-5" />
            </div>
            <div class="mt-4">
              <p class="text-xs font-bold uppercase text-foreground-muted">Pracovný režim</p>
              <div class="mt-2 grid gap-2 sm:grid-cols-2">
                <button
                  v-for="preset in layerPresetRows"
                  :key="preset.id"
                  type="button"
                  class="min-h-16 rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  :class="
                    activeLayerPresetId === preset.id
                      ? 'border-primary-300 bg-primary-50 text-primary-950'
                      : preset.missingLayerLabels.length > 0
                        ? 'border-warning-200 bg-warning-50/70 text-warning-950 hover:bg-warning-50'
                      : 'border-border bg-white text-foreground hover:bg-muted'
                  "
                  :disabled="!canManageMap"
                  :title="preset.missingLayerLabels.length > 0 ? `Kliknutie doplní vrstvy: ${preset.missingLayerLabels.join(', ')}.` : preset.description"
                  @click="applyLayerPreset(preset)"
                >
                  <span class="flex items-center justify-between gap-2">
                    <span class="flex min-w-0 items-center gap-2">
                      <UIcon :name="preset.icon" class="h-4 w-4 shrink-0 text-primary-800" />
                      <span class="truncate text-sm font-bold">{{ preset.label }}</span>
                    </span>
                    <span class="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-primary-900">
                      {{ preset.layerCount }}/{{ preset.expectedLayerCount }}
                    </span>
                  </span>
                  <span class="text-foreground-muted mt-1 line-clamp-2 block text-xs">
                    {{ preset.missingLayerLabels.length > 0 ? `Doplní: ${preset.missingLayerLabels.join(', ')}` : preset.description }}
                  </span>
                </button>
              </div>
              <div
                v-if="missingStandardLayerKinds.length > 0"
                class="mt-3 rounded-md border border-warning-200 bg-warning-50/80 p-3"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p class="text-sm font-bold text-warning-950">Jazero nemá kompletnú sadu vrstiev</p>
                    <p class="text-foreground-muted mt-1 text-xs">
                      Chýba: {{ missingStandardLayerLabels.join(', ') }}.
                    </p>
                  </div>
                  <UButton
                    type="button"
                    icon="i-heroicons-squares-plus"
                    color="warning"
                    variant="soft"
                    size="sm"
                    :disabled="!canManageMap"
                    @click="addMissingStandardLayers"
                  >
                    Doplniť vrstvy
                  </UButton>
                </div>
              </div>
              <div
                v-if="hiddenContentLayerRows.length > 0"
                class="mt-3 rounded-md border border-warning-200 bg-warning-50/80 p-3"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p class="text-sm font-bold text-warning-950">Niektoré objekty sú mimo náhľadu</p>
                    <p class="text-foreground-muted mt-1 text-xs">
                      Zapnúť alebo doplniť: {{ hiddenContentLayerSummaryLabel }}.
                    </p>
                    <ul class="mt-2 space-y-1 text-xs text-warning-950">
                      <li
                        v-for="row in hiddenContentLayerRows"
                        :key="row.kind"
                        class="flex flex-wrap items-center gap-1.5"
                      >
                        <span class="font-bold">{{ row.kindLabel }}</span>
                        <span class="text-foreground-muted">
                          {{ row.missing ? 'chýba vrstva' : 'vrstva je vypnutá' }} ·
                          {{ formatMapLayerContentSummary(row.contentSummary) }}
                        </span>
                      </li>
                    </ul>
                  </div>
                  <UButton
                    type="button"
                    icon="i-heroicons-eye"
                    color="warning"
                    variant="soft"
                    size="sm"
                    :disabled="!canManageMap"
                    @click="showContentLayers"
                  >
                    Zobraziť objekty
                  </UButton>
                </div>
              </div>
            </div>
            <div class="mt-4 space-y-2">
              <button
                v-for="row in layerRows"
                :key="row.layer.id"
                type="button"
                class="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors"
                :class="
                  row.enabled
                    ? 'border-primary-200 bg-primary-50'
                    : row.hasHiddenContent
                      ? 'border-warning-200 bg-warning-50/80 hover:bg-warning-50'
                    : 'border-border bg-white hover:bg-muted'
                "
                @click="toggleLayer(row.layer.id)"
              >
                <span class="min-w-0">
                  <span class="block text-sm font-bold">{{ row.layer.name }}</span>
                  <span class="text-foreground-muted text-xs">
                    {{ row.layer.visibility }} · {{ row.layer.editable ? 'editovateľná' : 'fixná' }} ·
                    {{ formatMapLayerContentSummary(row.contentSummary) }}
                  </span>
                  <span v-if="row.hasHiddenContent" class="mt-1 block text-xs font-bold text-warning-900">
                    Skryté v náhľade mapy
                  </span>
                </span>
                <span class="flex shrink-0 items-center gap-2">
                  <span
                    v-if="row.contentSummary.totalCount > 0"
                    class="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-primary-900"
                  >
                    {{ row.contentSummary.totalCount }}
                  </span>
                  <UIcon
                    :name="row.enabled ? 'i-heroicons-eye' : 'i-heroicons-eye-slash'"
                    class="h-4 w-4"
                  />
                </span>
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

          <div
            v-if="activeMapAdminView === 'vrstvy'"
            ref="backgroundPanelRef"
            class="rounded-card border border-border bg-surface p-5"
          >
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

            <div class="mt-4 border-t border-border pt-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-bold">Exportný rám</p>
                  <p class="text-foreground-muted mt-1 text-xs">{{ mapExportFramePreset.description }}</p>
                </div>
                <span class="shrink-0 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-900">
                  {{ mapExportFrame.width }} × {{ mapExportFrame.height }}
                </span>
              </div>
              <div class="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  v-for="preset in mapExportFramePresets"
                  :key="preset.id"
                  type="button"
                  class="rounded-md border px-3 py-2 text-left text-sm transition-colors"
                  :class="
                    mapExportFramePresetId === preset.id
                      ? 'border-primary-200 bg-primary-50 text-primary-950'
                      : 'border-border bg-white text-foreground hover:bg-muted'
                  "
                  @click="mapExportFramePresetId = preset.id"
                >
                  <span class="block font-bold">{{ preset.label }}</span>
                  <span class="text-foreground-muted mt-0.5 block text-xs">
                    {{ preset.aspectRatio.toFixed(2) }}:1
                  </span>
                </button>
              </div>
              <dl class="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div class="bg-muted px-2 py-2">
                  <dt class="text-foreground-muted">Miesta</dt>
                  <dd class="font-bold">{{ mapExportFrameCoverage.pegs }}</dd>
                </div>
                <div class="bg-muted px-2 py-2">
                  <dt class="text-foreground-muted">Body</dt>
                  <dd class="font-bold">{{ mapExportFrameCoverage.facilities }}</dd>
                </div>
                <div class="bg-muted px-2 py-2">
                  <dt class="text-foreground-muted">Vrcholy</dt>
                  <dd class="font-bold">{{ mapExportFrameCoverage.shapePoints }}</dd>
                </div>
              </dl>
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
              ref="backgroundUploadRef"
              class="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-primary-300 bg-primary-50 px-3 py-3 text-sm font-bold text-primary-900 transition-colors hover:bg-primary-100"
              :class="[
                !canManageMap || backgroundUploadStatus === 'uploading' ? 'pointer-events-none opacity-60' : '',
                highlightBackgroundUpload ? 'ring-2 ring-warning-300 shadow-sm' : '',
              ]"
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
            <DataStatusNotice
              v-if="backgroundUploadMessage"
              class="mt-3"
              :description="backgroundUploadMessage"
              :title="backgroundUploadStatus === 'success' ? 'Podklad je nahratý' : 'Podklad sa nepodarilo nahrať'"
              :tone="backgroundUploadStatus === 'success' ? 'success' : 'error'"
            />
          </div>

          <div v-if="activeMapAdminView === 'prvky'" class="rounded-card border border-border bg-surface p-5">
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

            <div
              v-if="selectedElementLayerReadiness"
              class="mt-4 rounded-md border border-border bg-white p-3"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="text-sm font-bold">{{ selectedElementLayerReadiness.title }}</p>
                    <StatusBadge
                      :icon="getLayerReadinessIcon(selectedElementLayerReadiness.status)"
                      :label="selectedElementLayerReadiness.statusLabel"
                      size="xs"
                      :tone="getLayerReadinessTone(selectedElementLayerReadiness.status)"
                    />
                  </div>
                  <p class="text-foreground-muted mt-1 text-xs">
                    {{ selectedElementLayerReadiness.itemLabel }} · {{ selectedElementLayerReadiness.label }} ·
                    {{ selectedElementLayerReadiness.status === 'active' ? 'viditeľné v aktuálnom náhľade' : 'treba zapnúť alebo vytvoriť vrstvu' }}
                  </p>
                </div>
                <UButton
                  v-if="selectedElementLayerReadiness.status !== 'active'"
                  type="button"
                  icon="i-heroicons-eye"
                  size="sm"
                  variant="soft"
                  :disabled="!canManageMap"
                  @click="showSelectedElementLayer"
                >
                  Zobraziť vrstvu
                </UButton>
              </div>
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
                  <PegStatusBadge class="shrink-0" :status="selectedPeg.status" />
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
                ref="cabinCatalogPanelRef"
                class="rounded-md border border-border bg-white p-3 transition-shadow"
                :class="highlightCabinCatalogPanel ? 'ring-2 ring-warning-300 shadow-sm' : ''"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-bold">Cenníková chata</p>
                    <p class="text-foreground-muted mt-1 text-xs">
                      Naviazané miesta v katalógu: {{ linkedCabinPegIds.size }}.
                    </p>
                    <p class="mt-2 text-xs font-semibold text-primary-900">
                      {{ selectedPegCabinCatalogHint }}
                    </p>
                  </div>
                  <StatusBadge
                    class="shrink-0"
                    :icon="selectedPegCabinProduct ? 'i-heroicons-link' : 'i-heroicons-link-slash'"
                    :label="selectedPegCabinProduct ? 'naviazané' : 'bez väzby'"
                    size="xs"
                    :tone="selectedPegCabinProduct ? 'success' : 'warning'"
                  />
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
                    {{ changedCabinProducts.length > 0 ? `${changedCabinProducts.length} zmena čaká na uloženie` : 'Väzby sú bez zmien' }}
                  </span>
                </div>
                <DataStatusNotice
                  v-if="cabinCatalogMessage"
                  class="mt-3"
                  :description="cabinCatalogMessage"
                  :title="cabinCatalogStatus === 'success' ? 'Väzba chaty je uložená' : 'Väzbu chaty sa nepodarilo uložiť'"
                  :tone="cabinCatalogStatus === 'success' ? 'success' : 'error'"
                />
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
                  <span class="text-foreground-muted mt-1 block text-xs">
                    {{ selectedPegLayerHint }}
                  </span>
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
              <div class="max-h-72 space-y-2 overflow-auto rounded-md border border-border bg-white p-3">
                <div
                  v-for="(point, pointIndex) in selectedShape.points"
                  :key="pointIndex"
                  class="rounded-md border border-border bg-muted/40 p-3 text-sm"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-bold text-primary-900">Vrchol {{ pointIndex + 1 }}</span>
                    <span class="text-foreground-muted text-xs">
                      {{ point.role ? mapShapePointRoleLabels[point.role] : 'bez typu' }}
                    </span>
                  </div>
                  <div class="mt-2 grid gap-2 sm:grid-cols-2">
                    <label class="block">
                      <span class="text-foreground-muted text-xs font-semibold">X</span>
                      <input v-model.number="point.x" type="number" min="0" max="100" step="0.1" :readonly="!canManageMap" class="mt-1 h-9 w-full rounded-md border border-border bg-white px-2">
                    </label>
                    <label class="block">
                      <span class="text-foreground-muted text-xs font-semibold">Y</span>
                      <input v-model.number="point.y" type="number" min="0" max="100" step="0.1" :readonly="!canManageMap" class="mt-1 h-9 w-full rounded-md border border-border bg-white px-2">
                    </label>
                    <label class="block">
                      <span class="text-foreground-muted text-xs font-semibold">Typ bodu</span>
                      <select v-model="point.role" :disabled="!canManageMap" class="mt-1 h-9 w-full rounded-md border border-border bg-white px-2">
                        <option value="">Bez typu</option>
                        <option v-for="option in shapePointRoleOptions" :key="option.value" :value="option.value">
                          {{ option.label }}
                        </option>
                      </select>
                    </label>
                    <label class="block">
                      <span class="text-foreground-muted text-xs font-semibold">Názov</span>
                      <input v-model="point.label" maxlength="40" :readonly="!canManageMap" class="mt-1 h-9 w-full rounded-md border border-border bg-white px-2" placeholder="napr. severný breh">
                    </label>
                  </div>
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

            <div class="mt-4 grid gap-2 sm:grid-cols-2">
              <UButton type="button" icon="i-heroicons-arrow-path" variant="soft" :disabled="!canManageMap" @click="resetSelectedItem">
                Vrátiť
              </UButton>
              <UButton type="button" icon="i-heroicons-trash" variant="soft" color="error" :disabled="!canManageMap" @click="removeSelectedItem">
                Odstrániť
              </UButton>
            </div>
          </div>

          <div v-if="activeMapAdminView === 'publikovanie'" class="rounded-card border border-border bg-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Draft a publikovanie</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Najprv ulož pracovnú verziu, potom ju po kontrole zverejni návštevníkom.
                </p>
              </div>
              <UIcon name="i-heroicons-cloud-arrow-up" class="h-5 w-5 shrink-0 text-primary-800" />
            </div>

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs font-semibold">Neuložené zmeny</p>
                <p class="mt-1 text-xl font-bold text-primary-950">{{ changedItemsCount }}</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs font-semibold">Uložený draft</p>
                <p class="mt-1 text-xl font-bold text-primary-950">{{ draftChangeTotal }}</p>
              </div>
            </div>

            <div class="mt-4 grid gap-2 sm:grid-cols-3">
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
                :disabled="!canManageMap || !selectedValidationIsValid || mapPublishQualitySummary.blockingCount > 0 || saveStatus === 'saving' || publishStatus === 'publishing' || discardStatus === 'discarding'"
                :loading="publishStatus === 'publishing'"
                @click="publishMapChanges"
              >
                Publikovať
              </UButton>
            </div>
            <DataStatusNotice
              v-if="saveMessage"
              class="mt-4"
              :description="saveMessage"
              :title="saveStatus === 'success' ? 'Draft mapy je uložený' : 'Draft mapy sa nepodarilo uložiť'"
              :tone="saveStatus === 'success' ? 'success' : 'error'"
            />
            <DataStatusNotice
              v-if="publishMessage"
              class="mt-4"
              :description="publishMessage"
              :title="publishStatus === 'success' ? 'Mapa je publikovaná' : 'Mapu sa nepodarilo publikovať'"
              :tone="publishStatus === 'success' ? 'success' : 'error'"
            />
            <DataStatusNotice
              v-if="discardMessage"
              class="mt-4"
              :description="discardMessage"
              :title="discardStatus === 'success' ? 'Draft mapy je zahodený' : 'Draft mapy sa nepodarilo zahodiť'"
              :tone="discardStatus === 'success' ? 'success' : 'error'"
            />
          </div>

          <div v-if="activeMapAdminView === 'publikovanie'" class="rounded-card border border-border bg-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Kontrola pred publikovaním</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Chytá konflikty medzi lovnými miestami, chatami, vrstvami a súťažnými sektormi pred serverovým publishom.
                </p>
              </div>
              <UIcon
                :name="mapPublishQualitySummary.blockingCount > 0 ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-shield-check'"
                class="h-5 w-5 shrink-0"
                :class="mapPublishQualitySummary.blockingCount > 0 ? 'text-error-700' : 'text-success-700'"
              />
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <StatusBadge
                icon="i-heroicons-exclamation-triangle"
                :label="`${mapPublishQualitySummary.errorCount} kritické celkom`"
                tone="error"
              />
              <StatusBadge
                icon="i-heroicons-exclamation-circle"
                :label="`${mapPublishQualitySummary.warningCount} upozornenia celkom`"
                tone="warning"
              />
              <StatusBadge
                icon="i-heroicons-information-circle"
                :label="`${mapPublishQualitySummary.infoCount} info celkom`"
                tone="info"
              />
            </div>

            <div
              v-if="mapPublishQualityIssues.length === 0"
              class="mt-4 rounded-md border border-success-500/25 bg-success-500/10 p-3 text-sm text-success-700"
            >
              <div class="flex items-start gap-2">
                <UIcon name="i-heroicons-check-circle" class="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p class="font-bold">Mapa je pripravená na publikovanie</p>
                  <p class="mt-1">V celom drafte nie sú otvorené žiadne nálezy.</p>
                </div>
              </div>
            </div>

            <div v-else class="mt-4 space-y-4">
              <div>
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-bold">Aktuálne jazero</p>
                  <span class="text-foreground-muted text-xs">{{ mapQualitySummaryLabel }}</span>
                </div>
                <div
                  v-if="mapQualityIssues.length === 0"
                  class="mt-2 rounded-md border border-success-500/25 bg-success-500/10 p-3 text-sm text-success-700"
                >
                  Pre aktuálne jazero nie sú otvorené žiadne nálezy.
                </div>
                <ul v-else class="mt-2 space-y-2">
                  <li
                    v-for="issue in mapQualityIssues"
                    :key="issue.id"
                    class="rounded-md border p-3 text-sm"
                    :class="getMapQualityIssueClasses(issue.severity)"
                  >
                    <div class="flex items-start gap-3">
                      <UIcon :name="getMapQualityIssueIcon(issue.severity)" class="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <div class="flex flex-wrap items-center gap-2">
                          <p class="font-bold">{{ issue.title }}</p>
                          <span v-if="issue.entityLabel" class="rounded-full bg-white/60 px-2 py-0.5 text-xs font-semibold">
                            {{ issue.entityLabel }}
                          </span>
                        </div>
                        <p class="mt-1">{{ issue.description }}</p>
                        <p v-if="issue.actionLabel" class="mt-2 text-xs font-bold">
                          {{ issue.actionLabel }}
                        </p>
                        <UButton
                          v-if="canFocusMapQualityIssue(issue)"
                          type="button"
                          size="xs"
                          variant="soft"
                          icon="i-heroicons-arrow-right-circle"
                          class="mt-3"
                          @click="focusMapQualityIssue(issue)"
                        >
                          {{ getMapQualityIssueFocusLabel(issue) }}
                        </UButton>
                      </div>
                    </div>
                  </li>
                </ul>
              </div>

              <div v-if="mapPublishExtraIssues.length > 0" class="border-t border-border pt-4">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-bold">Mimo aktuálneho výberu</p>
                  <span class="text-foreground-muted text-xs">{{ mapPublishExtraIssues.length }} nálezov</span>
                </div>
                <ul class="mt-2 space-y-2">
                  <li
                    v-for="issue in mapPublishExtraIssues"
                    :key="issue.id"
                    class="rounded-md border p-3 text-sm"
                    :class="getMapQualityIssueClasses(issue.severity)"
                  >
                    <div class="flex items-start gap-3">
                      <UIcon :name="getMapQualityIssueIcon(issue.severity)" class="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <div class="flex flex-wrap items-center gap-2">
                          <p class="font-bold">{{ issue.title }}</p>
                          <span v-if="issue.entityLabel" class="rounded-full bg-white/60 px-2 py-0.5 text-xs font-semibold">
                            {{ issue.entityLabel }}
                          </span>
                        </div>
                        <p class="mt-1">{{ issue.description }}</p>
                        <p v-if="issue.actionLabel" class="mt-2 text-xs font-bold">
                          {{ issue.actionLabel }}
                        </p>
                        <UButton
                          v-if="canFocusMapQualityIssue(issue)"
                          type="button"
                          size="xs"
                          variant="soft"
                          icon="i-heroicons-arrow-right-circle"
                          class="mt-3"
                          @click="focusMapQualityIssue(issue)"
                        >
                          {{ getMapQualityIssueFocusLabel(issue) }}
                        </UButton>
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </div>

            <p class="text-foreground-muted mt-4 text-xs">
              Stav publikácie: {{ mapPublishQualitySummaryLabel }}. Upozornenia neblokujú draft, kritické nálezy blokujú iba publikovanie.
            </p>
          </div>

          <div v-if="activeMapAdminView === 'publikovanie'" class="rounded-card border border-border bg-surface p-5">
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

          <div v-if="activeMapAdminView === 'export'" class="rounded-card border border-border bg-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Legenda vrcholov</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ filteredShapePointLegendRows.length }}/{{ shapePointLegendRows.length }} označených bodov podľa filtrov.
                </p>
              </div>
              <UIcon name="i-heroicons-book-open" class="h-5 w-5 text-primary-800" />
            </div>

            <div class="mt-4 grid gap-2 sm:grid-cols-2">
              <label class="block">
                <span class="text-xs font-semibold text-foreground-muted">Typ bodu</span>
                <select
                  v-model="shapePointLegendRoleFilter"
                  class="mt-1 h-10 w-full rounded-md border border-border bg-white px-2 text-sm"
                >
                  <option value="all">Všetky typy</option>
                  <option v-for="option in shapePointRoleOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </label>
              <label class="block">
                <span class="text-xs font-semibold text-foreground-muted">Viditeľnosť plochy</span>
                <select
                  v-model="shapePointLegendVisibilityFilter"
                  class="mt-1 h-10 w-full rounded-md border border-border bg-white px-2 text-sm"
                >
                  <option
                    v-for="option in shapePointLegendVisibilityOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>
            </div>

            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <UButton
                type="button"
                icon="i-heroicons-printer"
                variant="soft"
                :disabled="filteredShapePointLegendRows.length === 0"
                @click="printShapePointLegend"
              >
                Tlačiť legendu
              </UButton>
              <UButton
                type="button"
                icon="i-heroicons-arrow-down-tray"
                variant="soft"
                :disabled="filteredShapePointLegendRows.length === 0"
                @click="downloadShapePointLegendCsv"
              >
                Stiahnuť tabuľku
              </UButton>
            </div>

            <div v-if="shapePointLegendSummary.length > 0" class="mt-4 flex flex-wrap gap-2">
              <span
                v-for="row in shapePointLegendSummary"
                :key="row.role"
                class="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-900"
              >
                {{ row.label }} · {{ row.count }}
              </span>
            </div>

            <div v-if="filteredShapePointLegendRows.length > 0" class="mt-4 max-h-72 space-y-2 overflow-auto">
              <button
                v-for="row in filteredShapePointLegendRows"
                :key="row.id"
                type="button"
                class="w-full rounded-md border px-3 py-2 text-left text-sm transition-colors"
                :class="
                  selectedKind === 'shape' && selectedShapeId === row.shapeId
                    ? 'border-primary-200 bg-primary-50'
                    : 'border-border bg-muted hover:bg-white'
                "
                @click="selectShapePointLegendRow(row)"
              >
                <span class="flex items-start justify-between gap-3">
                  <span class="min-w-0">
                    <span class="block truncate font-bold text-primary-950">{{ row.label }}</span>
                    <span class="text-foreground-muted mt-0.5 block truncate text-xs">
                      {{ row.shapeLabel }} · vrchol {{ row.pointIndex + 1 }}
                    </span>
                  </span>
                  <span class="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-primary-900">
                    {{ row.roleLabel }}
                  </span>
                </span>
                <span class="text-foreground-muted mt-2 block text-xs">
                  X {{ row.x }} · Y {{ row.y }} · {{ mapShapeTypeLabels[row.shapeType] }} · {{ mapShapeVisibilityLabels[row.visibility] }}
                </span>
              </button>
            </div>

            <div v-else-if="shapePointLegendRows.length === 0" class="mt-4 rounded-md bg-muted p-4 text-sm text-foreground-muted">
              Označ typ alebo názov vrcholu pri vybranom polygone a objaví sa v tejto legende.
            </div>

            <div v-else class="mt-4 rounded-md bg-muted p-4 text-sm text-foreground-muted">
              Pre zvolený typ bodu a viditeľnosť tu zatiaľ nie je žiadny označený vrchol.
            </div>
          </div>

          <div v-if="activeMapAdminView === 'export'" class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Prehľad pripravených dát</h2>
            <p class="text-foreground-muted mt-2 text-sm">
              Pred uložením vidíš, koľko prvkov sa z pracovnej mapy premietne do návrhu.
              Verejná mapa sa zmení až po publikovaní.
            </p>
            <div class="mt-4 grid gap-2 sm:grid-cols-2">
              <div
                v-for="row in mapExportSummaryRows"
                :key="row.label"
                class="rounded-md border border-border bg-muted px-3 py-2"
              >
                <p class="text-foreground-muted text-xs font-semibold uppercase tracking-wide">{{ row.label }}</p>
                <p class="mt-1 text-xl font-bold text-primary-950">{{ row.value }}</p>
              </div>
            </div>
            <p class="text-foreground-muted mt-4 text-sm">
              V návrhu je pripravených {{ changedItemsCount }} upravených položiek.
            </p>
          </div>
        </aside>
      </div>
      </section>
    </div>

    <section class="print-only map-legend-print">
      <header class="map-legend-print__header">
        <div>
          <p>Rybolov Cetín · mapa revíru</p>
          <h1>Legenda vrcholov</h1>
          <span>{{ getLakeName(selectedLake) }}</span>
        </div>
        <div>
          <p>Vygenerované</p>
          <strong>{{ shapePointLegendPrintGeneratedAt || 'pred tlačou' }}</strong>
        </div>
      </header>

      <dl class="map-legend-print__meta">
        <div
          v-for="item in shapePointLegendPrintMeta"
          :key="item.label"
        >
          <dt>{{ item.label }}</dt>
          <dd>{{ item.value }}</dd>
        </div>
      </dl>

      <div v-if="shapePointLegendSummary.length > 0" class="map-legend-print__summary">
        <span
          v-for="row in shapePointLegendSummary"
          :key="row.role"
        >
          {{ row.label }}: {{ row.count }}
        </span>
      </div>

      <table v-if="filteredShapePointLegendRows.length > 0" class="map-legend-print__table">
        <thead>
          <tr>
            <th>Bod</th>
            <th>Typ</th>
            <th>Plocha</th>
            <th>Vrchol</th>
            <th>Súradnice</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in filteredShapePointLegendRows"
            :key="`print-${row.id}`"
          >
            <td>
              <strong>{{ row.label }}</strong>
              <span>{{ row.id }}</span>
            </td>
            <td>{{ row.roleLabel }}</td>
            <td>
              <strong>{{ row.shapeLabel }}</strong>
              <span>{{ mapShapeTypeLabels[row.shapeType] }} · {{ mapShapeVisibilityLabels[row.visibility] }}</span>
            </td>
            <td>{{ row.pointIndex + 1 }}</td>
            <td>X {{ row.x }} · Y {{ row.y }}</td>
          </tr>
        </tbody>
      </table>

      <p v-else class="map-legend-print__empty">
        Pre zvolený filter nie sú označené žiadne vrcholy.
      </p>
    </section>
  </div>
</template>

<style scoped>
.print-only {
  display: none;
}

@page {
  margin: 12mm;
  size: A4;
}

@media print {
  .screen-only {
    display: none !important;
  }

  .print-only {
    display: block;
  }

  .map-legend-print {
    background: #ffffff;
    color: #062523;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 0;
  }

  .map-legend-print__header {
    align-items: flex-start;
    border-bottom: 2px solid #155c55;
    display: flex;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: 12px;
  }

  .map-legend-print__header p {
    color: #4f6560;
    font-size: 11px;
    font-weight: 800;
    margin: 0 0 4px;
    text-transform: uppercase;
  }

  .map-legend-print__header h1 {
    color: #062523;
    font-size: 28px;
    font-weight: 900;
    line-height: 1.1;
    margin: 0;
  }

  .map-legend-print__header span,
  .map-legend-print__header strong {
    color: #16483f;
    display: block;
    font-size: 13px;
    font-weight: 800;
    margin-top: 4px;
  }

  .map-legend-print__meta {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(4, 1fr);
    margin: 14px 0;
  }

  .map-legend-print__meta div {
    border: 1px solid #d8e1de;
    padding: 8px;
  }

  .map-legend-print__meta dt {
    color: #60716d;
    font-size: 10px;
    font-weight: 800;
    margin: 0 0 3px;
    text-transform: uppercase;
  }

  .map-legend-print__meta dd {
    color: #062523;
    font-size: 13px;
    font-weight: 800;
    margin: 0;
  }

  .map-legend-print__summary {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 14px;
  }

  .map-legend-print__summary span {
    border: 1px solid #d8e1de;
    color: #16483f;
    font-size: 11px;
    font-weight: 800;
    padding: 4px 6px;
  }

  .map-legend-print__table {
    border-collapse: collapse;
    font-size: 11px;
    width: 100%;
  }

  .map-legend-print__table th,
  .map-legend-print__table td {
    border: 1px solid #d8e1de;
    padding: 7px 8px;
    text-align: left;
    vertical-align: top;
  }

  .map-legend-print__table th {
    background: #e7f4ee;
    color: #16483f;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .map-legend-print__table strong {
    display: block;
    font-weight: 900;
  }

  .map-legend-print__table span {
    color: #60716d;
    display: block;
    font-size: 10px;
    font-weight: 700;
    margin-top: 2px;
  }

  .map-legend-print__empty {
    border: 1px solid #d8e1de;
    color: #60716d;
    font-size: 13px;
    font-weight: 700;
    margin: 0;
    padding: 14px;
  }
}
</style>
