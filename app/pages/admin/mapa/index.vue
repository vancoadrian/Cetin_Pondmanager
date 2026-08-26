<script setup lang="ts">
import { formatMapLayerContentSummary, mapExportFramePresets, mapShapePointRoleLabels, mapShapeTypeLabels, mapShapeVisibilityLabels } from '~/utils/map'

useHead({ title: 'Admin mapa' })

const { getLakeName, lakes, reservations } = usePondData()
const { liveClosures } = await useClosureState({ admin: true, key: 'admin-map-closure-state' })
const { data: mapState, refresh: refreshMapState } = await useAdminMapState()
const { liveCabinProducts, refresh: refreshCabinCatalogState } = await useCabinCatalogState({
  admin: true,
  key: 'admin-map-cabin-catalog-state',
})

const showMapGrid = ref(true)
const snapToGrid = ref(false)
const snapSize = ref(5)
const snapSizeOptions = [
  { label: '1 %', value: 1 },
  { label: '2.5 %', value: 2.5 },
  { label: '5 %', value: 5 },
  { label: '10 %', value: 10 },
]

watch(snapToGrid, (enabled) => {
  if (enabled) showMapGrid.value = true
})

const mapEditor = useAdminMapEditorState({
  liveCabinProducts,
  mapState,
  refreshCabinCatalogState,
  refreshMapState,
})
const mapEditorNavigation = useAdminMapEditorNavigation(mapEditor)

const {
  activeBackgroundImage,
  activeLayerPresetId,
  activeLayerPresetLabel,
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
  changedCabinProducts,
  changedItemsCount,
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
  enabledLayers,
  facilityQuickAddOptions,
  facilityTypeOptions,
  filteredShapePointLegendRows,
  finishShapeDrawing,
  focusedTournament,
  formatDraftEntityChangeItems,
  formatDraftEntityChanges,
  getLayerReadinessIcon,
  getLayerReadinessTone,
  handleMapAdminTabsKeydown,
  hiddenContentLayerRows,
  hiddenContentLayerSummaryLabel,
  isDrawingShape,
  isEditingBackground,
  lakeFacilities,
  lakePegs,
  lakeShapes,
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
  mapPublishExtraIssues,
  mapPublishQualityIssues,
  mapPublishQualitySummary,
  mapPublishQualitySummaryLabel,
  mapPublishStateLabel,
  mapQualityFocusMessage,
  mapQualityIssues,
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
  pegReservationPresetOptions,
  pegStatusOptions,
  printShapePointLegend,
  publishMapChanges,
  publishMessage,
  publishStatus,
  removeSelectedItem,
  removeSelectedShapePoint,
  resetBackgroundImageSettings,
  resetSelectedItem,
  saveCabinProductLinks,
  saveMapChanges,
  saveMessage,
  saveStatus,
  sectorAlignmentReferenceShapes,
  selectFacility,
  selectMapAdminView,
  selectPeg,
  selectShape,
  selectShapePointLegendRow,
  selectedElementLayerReadiness,
  selectedFacility,
  selectedFacilityId,
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
  selectedShape,
  selectedShapeId,
  selectedShapeLayerName,
  selectedShapePreset,
  selectedShapeSectorOptions,
  selectedShapeVisibilityLabel,
  selectedValidationIsValid,
  selectedValidationMessages,
  shapePointLegendPrintGeneratedAt,
  shapePointLegendPrintMeta,
  shapePointLegendRoleFilter,
  shapePointLegendRows,
  shapePointLegendSummary,
  shapePointLegendVisibilityFilter,
  shapePointLegendVisibilityOptions,
  shapePointRoleOptions,
  shapePresetOptions,
  shapeToneOptions,
  shapeTypeCounts,
  shapeTypeOptions,
  showContentLayers,
  showSelectedElementLayer,
  startShapeDrawing,
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
} = mapEditor

const {
  addMissingTournamentSectorShapeDrafts,
  alignFocusedTournamentSectorShapes,
  backgroundPanelRef,
  backgroundUploadRef,
  cabinCatalogPanelRef,
  canFocusMapQualityIssue,
  focusMapQualityIssue,
  getMapQualityIssueClasses,
  getMapQualityIssueFocusLabel,
  getMapQualityIssueIcon,
  highlightBackgroundUpload,
  highlightCabinCatalogPanel,
  highlightLayersPanel,
  layersPanelRef,
  routeFocusMessage,
  routeFocusStatus,
  sectorShapeAlignmentMode,
  sectorShapeAlignmentModeOptions,
  sectorShapeHeight,
  sectorShapeWidth,
} = mapEditorNavigation
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
          :class="selectedLake === lake.slug ? 'bg-surface text-primary-900 dark:text-primary-100 shadow-sm' : 'text-foreground-muted hover:text-foreground'"
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
            class="inline-flex shrink-0 items-center gap-1.5 text-left text-sm font-bold text-primary-800 dark:text-primary-200 hover:text-primary-950"
            @click="selectMapAdminView('publikovanie')"
          >
            <UIcon name="i-heroicons-arrow-right-circle" class="h-4 w-4" />
            {{ changedItemsCount > 0 ? 'Skontrolovať neuložené zmeny' : 'Skontrolovať uložený draft' }}
          </button>
        </div>
      </div>

      <div
        v-if="mapQualityFocusMessage"
        class="mb-5 flex items-start justify-between gap-3 rounded-md border border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/50 px-4 py-3 text-sm text-primary-950 dark:text-primary-100"
      >
        <div class="flex items-start gap-2">
          <UIcon name="i-heroicons-information-circle" class="mt-0.5 h-4 w-4 shrink-0" />
          <p class="font-semibold">{{ mapQualityFocusMessage }}</p>
        </div>
        <button
          type="button"
          class="shrink-0 text-primary-800 dark:text-primary-200 hover:text-primary-950"
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
              <UIcon name="i-heroicons-map-pin" class="text-primary-800 dark:text-primary-200 h-5 w-5" />
            </div>
            <div class="mt-4 grid gap-2 sm:grid-cols-2">
              <div
                v-for="row in addPanelLayerReadinessRows"
                :key="row.id"
                class="rounded-md border border-border bg-surface px-3 py-2"
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
                      ? 'border-warning-300 bg-surface text-warning-950'
                      : 'border-warning-200 bg-warning-50/50 text-foreground hover:bg-surface'
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
                    class="mt-1 h-9 w-full rounded-md border border-warning-200 bg-surface px-2 text-sm"
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
                    class="mt-1 h-9 w-full rounded-md border border-warning-200 bg-surface px-2 text-sm"
                  >
                </label>
              </div>
            </div>

            <div class="mt-5 border-t border-border pt-4">
              <div class="grid gap-3 sm:grid-cols-[1fr_1fr]">
                <label class="block">
                  <span class="text-sm font-semibold">Kreslená plocha</span>
                  <select v-model="drawShapeType" :disabled="!canManageMap || isDrawingShape" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm">
                    <option v-for="option in shapeTypeOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Názov</span>
                  <input v-model="drawShapeLabel" :readonly="!canManageMap || isDrawingShape" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm" placeholder="napr. Zákaz kŕmenia">
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
                  <select v-model.number="snapSize" class="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold">
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
              <UIcon name="i-heroicons-squares-2x2" class="text-primary-800 dark:text-primary-200 h-5 w-5" />
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
                      ? 'border-primary-300 bg-primary-50 dark:bg-primary-950/50 text-primary-950 dark:text-primary-100'
                      : preset.missingLayerLabels.length > 0
                        ? 'border-warning-200 bg-warning-50/70 text-warning-950 hover:bg-warning-50'
                      : 'border-border bg-surface text-foreground hover:bg-muted'
                  "
                  :disabled="!canManageMap"
                  :title="preset.missingLayerLabels.length > 0 ? `Kliknutie doplní vrstvy: ${preset.missingLayerLabels.join(', ')}.` : preset.description"
                  @click="applyLayerPreset(preset)"
                >
                  <span class="flex items-center justify-between gap-2">
                    <span class="flex min-w-0 items-center gap-2">
                      <UIcon :name="preset.icon" class="h-4 w-4 shrink-0 text-primary-800 dark:text-primary-200" />
                      <span class="truncate text-sm font-bold">{{ preset.label }}</span>
                    </span>
                    <span class="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-primary-900 dark:text-primary-100">
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
                    ? 'border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/50'
                    : row.hasHiddenContent
                      ? 'border-warning-200 bg-warning-50/80 hover:bg-warning-50'
                    : 'border-border bg-surface hover:bg-muted'
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
                    class="rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-primary-900 dark:text-primary-100"
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
                    <UIcon :name="preset.icon" class="h-4 w-4 shrink-0 text-primary-800 dark:text-primary-200" />
                    <span class="truncate font-semibold">{{ preset.label }}</span>
                  </span>
                  <span class="rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-primary-900 dark:text-primary-100">{{ preset.count }}</span>
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
              <UIcon name="i-heroicons-photo" class="text-primary-800 dark:text-primary-200 h-5 w-5" />
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
                <span class="shrink-0 rounded-full bg-primary-50 dark:bg-primary-950/50 px-2.5 py-1 text-xs font-bold text-primary-900 dark:text-primary-100">
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
                      ? 'border-primary-200 bg-primary-50 dark:bg-primary-950/50 text-primary-950 dark:border-primary-800 dark:bg-primary-950/60 dark:text-primary-100'
                      : 'border-border bg-surface text-foreground hover:bg-muted'
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

            <div v-if="currentBackgroundLayer?.source" class="mt-4 rounded-md border border-border bg-surface p-3">
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Napasovanie</span>
                  <select
                    :value="normalizedBackgroundImageSettings.fit"
                    :disabled="!canManageMap"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
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
              class="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-primary-300 bg-primary-50 dark:bg-primary-950/50 px-3 py-3 text-sm font-bold text-primary-900 dark:text-primary-100 transition-colors hover:bg-primary-100"
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
              <UIcon name="i-heroicons-cursor-arrow-rays" class="text-primary-800 dark:text-primary-200 h-5 w-5" />
            </div>

            <div class="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-muted p-1">
              <button
                type="button"
                class="rounded-md px-2 py-2 text-xs font-bold transition-colors"
                :class="selectedKind === 'peg' ? 'bg-surface text-primary-900 dark:text-primary-100 shadow-sm' : 'text-foreground-muted'"
                @click="selectedKind = 'peg'"
              >
                Miesto
              </button>
              <button
                type="button"
                class="rounded-md px-2 py-2 text-xs font-bold transition-colors"
                :class="selectedKind === 'facility' ? 'bg-surface text-primary-900 dark:text-primary-100 shadow-sm' : 'text-foreground-muted'"
                @click="selectedKind = 'facility'"
              >
                Bod
              </button>
              <button
                type="button"
                class="rounded-md px-2 py-2 text-xs font-bold transition-colors"
                :class="selectedKind === 'shape' ? 'bg-surface text-primary-900 dark:text-primary-100 shadow-sm' : 'text-foreground-muted'"
                @click="selectedKind = 'shape'"
              >
                Plocha
              </button>
            </div>

            <div
              v-if="selectedElementLayerReadiness"
              class="mt-4 rounded-md border border-border bg-surface p-3"
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
              <div class="rounded-md border border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/50 p-3">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-bold">Rezervačný režim</p>
                    <p class="text-foreground-muted mt-1 text-xs">{{ selectedPegReservationSummary }}</p>
                    <p v-if="selectedPeg.type === 'cabin'" class="mt-2 text-xs font-semibold text-primary-900 dark:text-primary-100">
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
                class="rounded-md border border-border bg-surface p-3 transition-shadow"
                :class="highlightCabinCatalogPanel ? 'ring-2 ring-warning-300 shadow-sm' : ''"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-bold">Cenníková chata</p>
                    <p class="text-foreground-muted mt-1 text-xs">
                      Naviazané miesta v katalógu: {{ linkedCabinPegIds.size }}.
                    </p>
                    <p class="mt-2 text-xs font-semibold text-primary-900 dark:text-primary-100">
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
                    class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
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
                <input v-model="selectedPeg.label" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm">
              </label>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">X pozícia</span>
                  <input v-model.number="selectedPeg.x" type="number" min="0" max="100" step="0.1" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm">
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Y pozícia</span>
                  <input v-model.number="selectedPeg.y" type="number" min="0" max="100" step="0.1" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm">
                </label>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Typ</span>
                  <select v-model="selectedPeg.type" :disabled="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm" @change="updateSelectedPegType">
                    <option value="shore">lovné miesto</option>
                    <option value="cabin">miesto s chatou</option>
                  </select>
                  <span class="text-foreground-muted mt-1 block text-xs">
                    {{ selectedPegLayerHint }}
                  </span>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Kapacita</span>
                  <input v-model.number="selectedPeg.capacity" type="number" min="1" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm">
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Stav</span>
                  <select v-model="selectedPeg.status" :disabled="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm">
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
                <textarea v-model="selectedPeg.notes" :readonly="!canManageMap" rows="3" class="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" />
              </label>
            </form>

            <form v-else-if="selectedKind === 'facility' && selectedFacility" class="mt-5 space-y-4">
              <label class="block">
                <span class="text-sm font-semibold">Názov bodu</span>
                <input v-model="selectedFacility.label" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm">
              </label>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Typ</span>
                  <select v-model="selectedFacility.type" :disabled="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm">
                    <option v-for="option in facilityTypeOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Viditeľnosť</span>
                  <select v-model="selectedFacility.visibility" :disabled="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm">
                    <option v-for="option in visibilityOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">X pozícia</span>
                  <input v-model.number="selectedFacility.x" type="number" min="0" max="100" step="0.1" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm">
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Y pozícia</span>
                  <input v-model.number="selectedFacility.y" type="number" min="0" max="100" step="0.1" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm">
                </label>
              </div>
              <label class="block">
                <span class="text-sm font-semibold">Poznámka</span>
                <textarea v-model="selectedFacility.notes" :readonly="!canManageMap" rows="3" class="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" />
              </label>
            </form>

            <form v-else-if="selectedKind === 'shape' && selectedShape" class="mt-5 space-y-4">
              <div class="rounded-md border border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/50 p-3">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-bold">{{ selectedShapePreset?.label ?? mapShapeTypeLabels[selectedShape.type] }}</p>
                    <p class="text-foreground-muted mt-1 text-xs">
                      {{ selectedShapeLayerName }} · {{ selectedShapeVisibilityLabel }}
                    </p>
                  </div>
                  <UIcon :name="selectedShapePreset?.icon ?? 'i-heroicons-squares-2x2'" class="h-5 w-5 text-primary-800 dark:text-primary-200" />
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
                <input v-model="selectedShape.label" :readonly="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm">
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
                      class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
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
                      class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
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
                  <select v-model="selectedShape.type" :disabled="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm" @change="updateSelectedShapeType">
                    <option v-for="option in shapeTypeOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Viditeľnosť</span>
                  <select v-model="selectedShape.visibility" :disabled="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm">
                    <option v-for="option in visibilityOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Farba vrstvy</span>
                  <select v-model="selectedShape.tone" :disabled="!canManageMap" class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm">
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
              <div class="max-h-72 space-y-2 overflow-auto rounded-md border border-border bg-surface p-3">
                <div
                  v-for="(point, pointIndex) in selectedShape.points"
                  :key="pointIndex"
                  class="rounded-md border border-border bg-muted/40 p-3 text-sm"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-bold text-primary-900 dark:text-primary-100">Vrchol {{ pointIndex + 1 }}</span>
                    <span class="text-foreground-muted text-xs">
                      {{ point.role ? mapShapePointRoleLabels[point.role] : 'bez typu' }}
                    </span>
                  </div>
                  <div class="mt-2 grid gap-2 sm:grid-cols-2">
                    <label class="block">
                      <span class="text-foreground-muted text-xs font-semibold">X</span>
                      <input v-model.number="point.x" type="number" min="0" max="100" step="0.1" :readonly="!canManageMap" class="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2">
                    </label>
                    <label class="block">
                      <span class="text-foreground-muted text-xs font-semibold">Y</span>
                      <input v-model.number="point.y" type="number" min="0" max="100" step="0.1" :readonly="!canManageMap" class="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2">
                    </label>
                    <label class="block">
                      <span class="text-foreground-muted text-xs font-semibold">Typ bodu</span>
                      <select v-model="point.role" :disabled="!canManageMap" class="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2">
                        <option value="">Bez typu</option>
                        <option v-for="option in shapePointRoleOptions" :key="option.value" :value="option.value">
                          {{ option.label }}
                        </option>
                      </select>
                    </label>
                    <label class="block">
                      <span class="text-foreground-muted text-xs font-semibold">Názov</span>
                      <input v-model="point.label" maxlength="40" :readonly="!canManageMap" class="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2" placeholder="napr. severný breh">
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
              <UIcon name="i-heroicons-cloud-arrow-up" class="h-5 w-5 shrink-0 text-primary-800 dark:text-primary-200" />
            </div>

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs font-semibold">Neuložené zmeny</p>
                <p class="mt-1 text-xl font-bold text-primary-950 dark:text-primary-100">{{ changedItemsCount }}</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs font-semibold">Uložený draft</p>
                <p class="mt-1 text-xl font-bold text-primary-950 dark:text-primary-100">{{ draftChangeTotal }}</p>
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
              <UIcon name="i-heroicons-book-open" class="h-5 w-5 text-primary-800 dark:text-primary-200" />
            </div>

            <div class="mt-4 grid gap-2 sm:grid-cols-2">
              <label class="block">
                <span class="text-xs font-semibold text-foreground-muted">Typ bodu</span>
                <select
                  v-model="shapePointLegendRoleFilter"
                  class="mt-1 h-10 w-full rounded-md border border-border bg-surface px-2 text-sm"
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
                  class="mt-1 h-10 w-full rounded-md border border-border bg-surface px-2 text-sm"
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
                class="rounded-full bg-primary-50 dark:bg-primary-950/50 px-2.5 py-1 text-xs font-bold text-primary-900 dark:text-primary-100"
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
                    ? 'border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/50'
                    : 'border-border bg-muted hover:bg-surface'
                "
                @click="selectShapePointLegendRow(row)"
              >
                <span class="flex items-start justify-between gap-3">
                  <span class="min-w-0">
                    <span class="block truncate font-bold text-primary-950 dark:text-primary-100">{{ row.label }}</span>
                    <span class="text-foreground-muted mt-0.5 block truncate text-xs">
                      {{ row.shapeLabel }} · vrchol {{ row.pointIndex + 1 }}
                    </span>
                  </span>
                  <span class="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-primary-900 dark:text-primary-100">
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
                <p class="mt-1 text-xl font-bold text-primary-950 dark:text-primary-100">{{ row.value }}</p>
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
