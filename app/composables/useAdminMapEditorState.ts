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
} from '~/utils/map'
import {
  getTournamentSectorAlignmentReferenceShapes,
  getTournamentSectorMapRows,
} from '~/utils/tournamentMap'
import type { StatusBadgeTone } from '~/utils/ui'

export type MapEditorSelectionKind = 'facility' | 'peg' | 'shape'
export type MapAdminView = 'export' | 'prvky' | 'publikovanie' | 'vrstvy'
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
export type ShapePreset = {
  icon: string
  label: string
  type: MapShape['type']
}
export type PegReservationPreset = {
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

/**
 * Raw map-state fetch bootstrap, mirroring the useClosureState/useCabinCatalogState
 * convention: a small async composable with no watchers/lifecycle hooks inside it, so
 * it stays safe to `await` at the top of a page's <script setup>.
 */
export async function useAdminMapState() {
  const { mapFacilities, mapLayers, mapShapes, pegs } = usePondData()
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

  return useAsyncData<MapStateResponse>(
    'admin-map-state',
    () => requestFetch<MapStateResponse>('/api/admin/map'),
    {
      default: fallbackMapState,
    },
  )
}

type UseAdminMapStateReturn = Awaited<ReturnType<typeof useAdminMapState>>
type UseCabinCatalogStateReturn = Awaited<ReturnType<typeof useCabinCatalogState>>

interface UseAdminMapEditorStateParams {
  liveCabinProducts: UseCabinCatalogStateReturn['liveCabinProducts']
  mapState: UseAdminMapStateReturn['data']
  refreshCabinCatalogState: UseCabinCatalogStateReturn['refresh']
  refreshMapState: UseAdminMapStateReturn['refresh']
}

/**
 * Core reactive data model for the admin map editor: fetched map/cabin-catalog state,
 * the local editor copies of pegs/facilities/shapes/layers, every derived/computed view
 * over that data, and all mutation logic (create/select/edit/move/layer-visibility/
 * background-image/shape-drawing/tab-navigation plus save/publish/discard/upload
 * persistence). Extracted from app/pages/admin/mapa/index.vue — see useAdminMapEditorNavigation.ts
 * for the route/quality-issue driven focus & panel-scroll orchestration that sits on top of this.
 */
export function useAdminMapEditorState(params: UseAdminMapEditorStateParams) {
  const { liveCabinProducts, mapState, refreshCabinCatalogState, refreshMapState } = params

  const route = useRoute()
  const router = useRouter()
  const { cabinProducts: seedCabinProducts, getLakeName, lakes, tournaments } = usePondData()
  const {
    canManage: canManageMap,
    isReadOnly: mapReadOnly,
    label: mapAccessLabel,
    readOnlyMessage: mapReadOnlyMessage,
  } = useAdminModuleAccess('map')

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
  const mapQualityFocusMessage = ref('')
  const mapExportFramePresetId = ref<MapExportFramePresetId>('map-4-3')
  const shapePointLegendRoleFilter = ref<'all' | NonNullable<MapCoordinate['role']>>('all')
  const shapePointLegendVisibilityFilter = ref<'all' | MapShape['visibility']>('all')
  const shapePointLegendPrintGeneratedAt = ref('')

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
    resetBackgroundUploadFeedback()
    resetCabinCatalogFeedback()
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

  function selectShapePointLegendRow(row: { shapeId: string }) {
    const shape = editorShapes.value.find((item) => item.id === row.shapeId)
    if (!shape) return

    selectShape(shape)
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

  return {
    activeLayerPresetId,
    activeLayerPresetLabel,
    activeBackgroundImage,
    activeMapAdminView,
    activeMapAdminViewOption,
    addDraftShapePoint,
    addFacilityDraft,
    addMissingStandardLayers,
    addPanelLayerReadinessRows,
    addPegDraft,
    addSelectedShapePoint,
    addShapeDraft,
    applyLayerPreset,
    applySelectedPegReservationPreset,
    applySelectedShapePreset,
    backgroundFitOptions,
    backgroundUploadMessage,
    backgroundUploadStatus,
    cabinCatalogMessage,
    cabinCatalogStatus,
    cabinPegs,
    canFinishDraftShape,
    canManageMap,
    cancelShapeDrawing,
    centerActiveMapAdminTab,
    changedCabinProducts,
    changedFacilities,
    changedItemsCount,
    changedLayers,
    changedPegs,
    changedShapes,
    createUniqueId,
    currentBackgroundImageSettings,
    currentBackgroundLayer,
    currentLake,
    discardMapDraft,
    discardMessage,
    discardStatus,
    downloadShapePointLegendCsv,
    draftChangeRows,
    draftChangeTotal,
    draftShape,
    draftShapePoints,
    drawShapeLabel,
    drawShapeType,
    editorCabinProducts,
    editorFacilities,
    editorMapLayers,
    editorPegs,
    editorShapes,
    enabledLayerIds,
    enabledLayers,
    ensureLayerKindVisible,
    ensurePegLayerVisible,
    ensureShapeLayerVisible,
    exportModel,
    facilityQuickAddOptions,
    facilityTypeOptions,
    filteredShapePointLegendRows,
    finishShapeDrawing,
    focusedTournament,
    focusedTournamentSectorRows,
    formatDraftEntityChangeItems,
    formatDraftEntityChanges,
    formatPrintTimestamp,
    getLakePrefix,
    getLayerReadiness,
    getLayerReadinessIcon,
    getLayerReadinessTone,
    hiddenContentLayerRows,
    hiddenContentLayerSummaryLabel,
    isDrawingShape,
    isEditingBackground,
    lakeFacilities,
    lakeLayers,
    lakePegs,
    lakeShapes,
    layerContentKindRows,
    layerPresetRows,
    layerRows,
    linkedCabinPegIds,
    linkedTournamentSectorShapes,
    mapAccessLabel,
    mapAdminTabsRef,
    mapAdminViewOptions,
    mapExportFrame,
    mapExportFrameCoverage,
    mapExportFramePreset,
    mapExportFramePresetId,
    mapExportSummaryRows,
    mapPublishBlockingIssues,
    mapPublishExtraIssues,
    mapPublishQualityIssues,
    mapPublishQualitySummary,
    mapPublishQualitySummaryLabel,
    mapPublishStateLabel,
    mapQualityFocusMessage,
    mapQualityIssues,
    mapQualitySummary,
    mapQualitySummaryLabel,
    mapReadOnly,
    mapReadOnlyMessage,
    mappedFocusedTournamentSectorRows,
    missingFocusedTournamentSectorRows,
    missingStandardLayerKinds,
    missingStandardLayerLabels,
    moveBackgroundImage,
    moveFacility,
    movePoint,
    moveShape,
    moveShapePoint,
    normalizedBackgroundImageSettings,
    handleMapAdminTabsKeydown,
    pegReservationPresetOptions,
    pegStatusOptions,
    printShapePointLegend,
    publishMapChanges,
    publishMessage,
    publishStatus,
    removeSelectedItem,
    removeSelectedShapePoint,
    requestedSectorId,
    requestedTournament,
    requestedTournamentId,
    requestedTournamentSector,
    resetBackgroundImageSettings,
    resetSaveFeedback,
    resetSelectedItem,
    saveCabinProductLinks,
    saveMapChanges,
    saveMessage,
    saveStatus,
    sectorAlignmentReferenceShapes,
    selectedElementLayerReadiness,
    selectedFacility,
    selectedFacilityId,
    selectedFacilityValidationMessages,
    selectedKind,
    selectedLake,
    selectedLakeTournaments,
    selectedLayerSummary,
    selectedPeg,
    selectedPegCabinCatalogHint,
    selectedPegCabinProduct,
    selectedPegCabinProductId,
    selectedPegId,
    selectedPegLayerHint,
    selectedPegReservationSummary,
    selectedPegValidationMessages,
    selectedShape,
    selectedShapeId,
    selectedShapeLayerName,
    selectedShapePreset,
    selectedShapeSectorOptions,
    selectedShapeTournament,
    selectedShapeValidationMessages,
    selectedShapeVisibilityLabel,
    selectedValidationIsValid,
    selectedValidationMessages,
    selectFacility,
    selectMapAdminView,
    selectPeg,
    selectShape,
    selectShapePointLegendRow,
    setLakeEnabledLayerIds,
    setSelectedPegCabinProduct,
    shapePointLegendPrintGeneratedAt,
    shapePointLegendPrintMeta,
    shapePointLegendRoleFilter,
    shapePointLegendRoleFilterLabel,
    shapePointLegendRows,
    shapePointLegendSummary,
    shapePointLegendVisibilityFilter,
    shapePointLegendVisibilityFilterLabel,
    shapePointLegendVisibilityOptions,
    shapePointRoleOptions,
    shapePresetOptions,
    shapeToneOptions,
    shapeTypeCounts,
    shapeTypeOptions,
    showContentLayers,
    showSelectedElementLayer,
    startShapeDrawing,
    storedMapFacilities,
    storedMapShapes,
    syncSelectedShapeTournament,
    toggleBackgroundEditing,
    toggleLayer,
    undoDraftShapePoint,
    updateBackgroundImageFit,
    updateBackgroundImageNumber,
    updateSelectedPegCabinProduct,
    updateSelectedPegType,
    updateSelectedShapeType,
    uploadBackgroundImage,
    visibilityOptions,
    visibleFacilities,
    visiblePegs,
    visibleShapes,
  }
}
