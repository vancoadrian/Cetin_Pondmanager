import type { LakeSlug, MapShape } from '~/data/pond'
import type { MapQualityIssue, MapQualityIssueSeverity } from '~/utils/map'
import {
  alignTournamentSectorShapes,
  createMissingTournamentSectorShapeDrafts,
  createTournamentSectorShapeDraft,
  type TournamentSectorShapeAlignmentMode,
} from '~/utils/tournamentMap'
import type { MapAdminView, useAdminMapEditorState } from './useAdminMapEditorState'

type MapEditorState = ReturnType<typeof useAdminMapEditorState>

/**
 * Route/quality-issue driven navigation glue for the admin map editor: jumping to the
 * right tab + scrolling/highlighting the right panel when a quality-issue "Otvoriť ..."
 * button or a `?turnaj=&sektor=` deep link is used, plus the shape-drawing keyboard
 * shortcuts and their mount/unmount lifecycle. Sits on top of useAdminMapEditorState.ts,
 * which owns the actual map data and element-editing logic this orchestrates.
 */
export function useAdminMapEditorNavigation(state: MapEditorState) {
  const { getLakeName, tournaments } = usePondData()

  const backgroundPanelRef = ref<HTMLElement | null>(null)
  const backgroundUploadRef = ref<HTMLElement | null>(null)
  const highlightBackgroundUpload = ref(false)
  const layersPanelRef = ref<HTMLElement | null>(null)
  const highlightLayersPanel = ref(false)
  const cabinCatalogPanelRef = ref<HTMLElement | null>(null)
  const highlightCabinCatalogPanel = ref(false)
  const routeFocusStatus = ref<'idle' | 'success' | 'warning'>('idle')
  const routeFocusMessage = ref('')
  const sectorShapeWidth = ref(14)
  const sectorShapeHeight = ref(10)
  const sectorShapeAlignmentMode = ref<TournamentSectorShapeAlignmentMode>('box')
  let backgroundUploadHighlightTimeout: number | undefined
  let layersPanelHighlightTimeout: number | undefined
  let cabinCatalogHighlightTimeout: number | undefined

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
    if (issue.target?.kind === 'tournamentSector') return state.canManageMap.value ? 'Doplniť polygon sektora' : 'Otvoriť sektor'
    if (issue.target?.action === 'createShoreline') return state.canManageMap.value ? 'Pripraviť vodnú oblasť' : 'Otvoriť jazero'
    if (issue.target?.action === 'openBackground') return 'Nahrať podklad'
    if (issue.target?.action === 'openLayers') return 'Otvoriť vrstvy'
    if (issue.target?.kind === 'layer') return state.canManageMap.value ? 'Zapnúť vrstvu' : 'Otvoriť vrstvu'
    if (issue.target?.kind === 'lake') return 'Prepnúť jazero'

    return 'Zobraziť v editore'
  }

  function createLakeShorelineShapeDraft(lake: LakeSlug): MapShape {
    return {
      id: state.createUniqueId(`shape-${state.getLakePrefix(lake)}-shoreline`, state.editorShapes.value.map((shape) => shape.id)),
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

    state.mapQualityFocusMessage.value = ''
    if (state.selectedLake.value !== target.lake) {
      state.selectedLake.value = target.lake
      await nextTick()
    }

    const targetView: MapAdminView = (
      target.action === 'openBackground'
      || target.action === 'openLayers'
      || target.kind === 'layer'
    )
      ? 'vrstvy'
      : 'prvky'
    await state.selectMapAdminView(targetView)

    if (target.kind === 'lake' && target.action === 'createShoreline') {
      state.ensureShapeLayerVisible('shoreline')
      state.selectedKind.value = 'shape'

      const existingShoreline = state.editorShapes.value.find((shape) =>
        shape.lake === target.lake
        && shape.type === 'shoreline',
      )

      if (existingShoreline) {
        state.cancelShapeDrawing()
        state.selectShape(existingShoreline)
        state.mapQualityFocusMessage.value = existingShoreline.visibility === 'public'
          ? 'Otvorená existujúca vodná oblasť.'
          : 'Otvorená existujúca vodná oblasť. Ak má ísť na verejnú mapu, nastav viditeľnosť na verejné.'
        return
      }

      if (!state.canManageMap.value) {
        state.mapQualityFocusMessage.value = 'Jazero je otvorené, ale vodnú oblasť vie založiť iba rola s plným prístupom k mape.'
        return
      }

      const shape = createLakeShorelineShapeDraft(target.lake)
      state.editorShapes.value.push(shape)
      state.cancelShapeDrawing()
      state.selectShape(shape)
      state.resetSaveFeedback()
      state.mapQualityFocusMessage.value = 'Pripravená nová neuložená vodná oblasť. Uprav vrcholy podľa brehu a ulož draft mapy.'
      return
    }

    if (target.kind === 'lake' && target.action === 'openBackground') {
      state.cancelShapeDrawing()
      state.isEditingBackground.value = Boolean(state.activeBackgroundImage.value)
      await focusBackgroundUploadPanel()
      state.mapQualityFocusMessage.value = state.activeBackgroundImage.value
        ? 'Otvorený podklad mapy. Skontroluj napasovanie alebo nahraj presnejší obrázok.'
        : 'Jazero je otvorené. V paneli podkladu nahraj JPG, PNG alebo WebP mapu.'
      return
    }

    if ((target.kind === 'lake' && target.action === 'openLayers') || target.kind === 'layer') {
      state.cancelShapeDrawing()

      const targetLayer = target.id
        ? state.lakeLayers.value.find((layer) => layer.id === target.id)
        : undefined

      if (targetLayer && state.canManageMap.value && !state.enabledLayerIds.value.includes(targetLayer.id)) {
        state.setLakeEnabledLayerIds([
          ...state.lakeLayers.value
            .filter((layer) => state.enabledLayerIds.value.includes(layer.id))
            .map((layer) => layer.id),
          targetLayer.id,
        ])
        state.resetSaveFeedback()
        state.mapQualityFocusMessage.value = `Vrstva ${targetLayer.name} je zapnutá v neuloženom drafte mapy.`
      }
      else {
        state.mapQualityFocusMessage.value = targetLayer
          ? `Otvorená vrstva ${targetLayer.name}.`
          : 'Otvorený panel vrstiev. Doplň chýbajúcu vrstvu alebo vyber pracovný režim.'
      }

      await focusLayersPanel()
      return
    }

    if (target.kind === 'peg' && target.id && state.editorPegs.value.some((peg) => peg.id === target.id)) {
      state.selectedKind.value = 'peg'
      state.selectedPegId.value = target.id
      if (shouldFocusCabinCatalogPanel(issue)) {
        await focusCabinCatalogPanel()
        state.mapQualityFocusMessage.value = 'Otvorená väzba cenníkovej chaty pre vybrané miesto.'
        return
      }
    }
    else if (target.kind === 'facility' && target.id && state.editorFacilities.value.some((facility) => facility.id === target.id)) {
      state.selectedKind.value = 'facility'
      state.selectedFacilityId.value = target.id
    }
    else if (target.kind === 'shape' && target.id && state.editorShapes.value.some((shape) => shape.id === target.id)) {
      state.selectedKind.value = 'shape'
      state.selectedShapeId.value = target.id
    }
    else if (target.kind === 'tournamentSector') {
      state.ensureShapeLayerVisible('sector')
      state.selectedKind.value = 'shape'

      const tournament = tournaments.find((item) => item.id === target.tournamentId && item.lake === target.lake)
      const sector = tournament?.sectors.find((item) => item.id === target.sectorId)
      if (!tournament || !sector) {
        state.mapQualityFocusMessage.value = 'Jazero súťaže je otvorené, ale turnaj alebo sektor už v dátach neexistuje.'
        return
      }

      const existingShape = state.editorShapes.value.find((shape) =>
        shape.lake === tournament.lake
        && shape.type === 'sector'
        && shape.tournamentId === tournament.id
        && shape.sectorId === sector.id,
      )

      if (existingShape) {
        state.cancelShapeDrawing()
        state.selectShape(existingShape)
        state.mapQualityFocusMessage.value = `Otvorený polygon sektora ${sector.label}.`
        return
      }

      if (!state.canManageMap.value) {
        state.mapQualityFocusMessage.value = `Sektor ${sector.label} zatiaľ nemá polygon. Na vytvorenie treba plný prístup k mape.`
        return
      }

      const shape = createTournamentSectorShapeDraft(
        tournament,
        sector,
        state.editorShapes.value.map((item) => item.id),
      )
      state.editorShapes.value.push(shape)
      state.cancelShapeDrawing()
      state.selectShape(shape)
      state.resetSaveFeedback()
      state.mapQualityFocusMessage.value = `Pripravený nový neuložený polygon pre sektor ${sector.label}. Uprav vrcholy a ulož draft mapy.`
      return
    }

    state.mapQualityFocusMessage.value = `Otvorený nález: ${issue.title}.`
  }

  async function focusRequestedTournamentSector() {
    const tournamentId = state.requestedTournamentId.value
    const sectorId = state.requestedSectorId.value

    if (!tournamentId && !sectorId) return

    await state.selectMapAdminView('prvky')

    const tournament = state.requestedTournament.value
    if (!tournament) {
      routeFocusStatus.value = 'warning'
      routeFocusMessage.value = `Súťaž ${tournamentId ?? ''} sa v mapovom editore nenašla.`
      return
    }

    state.selectedLake.value = tournament.lake
    await nextTick()
    state.ensureShapeLayerVisible('sector')

    if (!sectorId) {
      routeFocusStatus.value = 'success'
      routeFocusMessage.value = `Mapa je prepnutá na jazero ${getLakeName(tournament.lake)} pre súťaž ${tournament.name}.`
      return
    }

    const sector = state.requestedTournamentSector.value
    if (!sector) {
      routeFocusStatus.value = 'warning'
      routeFocusMessage.value = `Sektor ${sectorId} nepatrí k súťaži ${tournament.name}.`
      return
    }

    const existingShape = state.editorShapes.value.find((shape) =>
      shape.lake === tournament.lake
      && shape.type === 'sector'
      && shape.tournamentId === tournament.id
      && shape.sectorId === sector.id,
    )

    if (existingShape) {
      state.cancelShapeDrawing()
      state.selectShape(existingShape)
      routeFocusStatus.value = 'success'
      routeFocusMessage.value = `Otvorený existujúci polygon pre sektor ${sector.label}.`
      return
    }

    if (!state.canManageMap.value) {
      state.selectedKind.value = 'shape'
      routeFocusStatus.value = 'warning'
      routeFocusMessage.value = `Sektor ${sector.label} zatiaľ nemá polygon. Na jeho vytvorenie potrebuješ plný prístup k mape.`
      return
    }

    const shape = createTournamentSectorShapeDraft(
      tournament,
      sector,
      state.editorShapes.value.map((item) => item.id),
    )

    state.editorShapes.value.push(shape)
    state.cancelShapeDrawing()
    state.selectShape(shape)
    state.resetSaveFeedback()
    routeFocusStatus.value = 'success'
    routeFocusMessage.value = `Pripravený nový neuložený polygon pre sektor ${sector.label}. Uprav vrcholy a ulož draft mapy.`
  }

  function addMissingTournamentSectorShapeDrafts() {
    const tournament = state.focusedTournament.value
    if (!tournament) {
      routeFocusStatus.value = 'warning'
      routeFocusMessage.value = 'Pre vybrané jazero nie je pripravená žiadna súťaž.'
      return
    }

    if (!state.canManageMap.value) {
      routeFocusStatus.value = 'warning'
      routeFocusMessage.value = state.mapReadOnlyMessage.value
      return
    }

    const drafts = createMissingTournamentSectorShapeDrafts(tournament, state.editorShapes.value)
    if (drafts.length === 0) {
      routeFocusStatus.value = 'success'
      routeFocusMessage.value = `Všetky sektory súťaže ${tournament.name} už majú polygon v aktuálnom editore.`
      return
    }

    state.ensureShapeLayerVisible('sector')
    state.editorShapes.value.push(...drafts)
    state.cancelShapeDrawing()
    state.selectShape(drafts[0]!)
    state.resetSaveFeedback()
    routeFocusStatus.value = 'success'
    routeFocusMessage.value = `Doplnené neuložené polygony pre ${drafts.length} sektorov súťaže ${tournament.name}.`
  }

  function alignFocusedTournamentSectorShapes() {
    const tournament = state.focusedTournament.value
    if (!tournament) {
      routeFocusStatus.value = 'warning'
      routeFocusMessage.value = 'Pre vybrané jazero nie je pripravená žiadna súťaž.'
      return
    }

    if (!state.canManageMap.value) {
      routeFocusStatus.value = 'warning'
      routeFocusMessage.value = state.mapReadOnlyMessage.value
      return
    }

    const result = alignTournamentSectorShapes(tournament, state.editorShapes.value, {
      heightPercent: sectorShapeHeight.value,
      mode: sectorShapeAlignmentMode.value,
      widthPercent: sectorShapeWidth.value,
    })

    if (result.updatedCount === 0) {
      routeFocusStatus.value = 'warning'
      routeFocusMessage.value = `Súťaž ${tournament.name} ešte nemá žiadne naviazané sektorové polygony na zarovnanie.`
      return
    }

    state.ensureShapeLayerVisible('sector')
    state.editorShapes.value = result.shapes
    state.cancelShapeDrawing()
    const firstUpdatedShape = state.editorShapes.value.find((shape) => shape.id === result.updatedShapeIds[0])
    if (firstUpdatedShape) state.selectShape(firstUpdatedShape)
    state.resetSaveFeedback()
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
    if (!state.isDrawingShape.value || isTypingTarget(event.target)) return

    if (event.key === 'Escape') {
      event.preventDefault()
      state.cancelShapeDrawing()
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      state.finishShapeDrawing()
      return
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      state.undoDraftShapePoint()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleDrawingShortcut)
    state.shapePointLegendPrintGeneratedAt.value = state.formatPrintTimestamp()
    void state.centerActiveMapAdminTab(false)
    void focusRequestedTournamentSector()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleDrawingShortcut)
    window.clearTimeout(backgroundUploadHighlightTimeout)
    window.clearTimeout(layersPanelHighlightTimeout)
    window.clearTimeout(cabinCatalogHighlightTimeout)
  })

  watch([state.requestedTournamentId, state.requestedSectorId], () => {
    void focusRequestedTournamentSector()
  })

  return {
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
  }
}
