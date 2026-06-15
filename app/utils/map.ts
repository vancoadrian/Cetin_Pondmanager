import type {
  CabinProduct,
  LakeSlug,
  MapFacility,
  MapFacilityType,
  MapLayer,
  MapLayerImageSettings,
  MapShape,
  MapShapePointRole,
  Peg,
  Tournament,
} from '~/data/pond'
import type { AvailabilityStatus } from '~/utils/availability'

export const MAP_VIEWBOX_WIDTH = 100
export const MAP_VIEWBOX_HEIGHT = 75
const MAP_VIEWBOX_ASPECT_RATIO = MAP_VIEWBOX_WIDTH / MAP_VIEWBOX_HEIGHT
export const defaultMapLayerImageSettings: MapLayerImageSettings = {
  fit: 'cover',
  offsetX: 0,
  offsetY: 0,
  opacity: 0.9,
  scale: 1,
}

export function clampMapPercent(value: number) {
  return Math.min(100, Math.max(0, Number(value.toFixed(1))))
}

export function toSvgY(yPercent: number) {
  return (yPercent / 100) * MAP_VIEWBOX_HEIGHT
}

export function fromSvgY(svgY: number) {
  return clampMapPercent((svgY / MAP_VIEWBOX_HEIGHT) * 100)
}

function clampRange(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function normalizeMapLayerImageSettings(settings?: Partial<MapLayerImageSettings>): MapLayerImageSettings {
  return {
    fit: settings?.fit ?? defaultMapLayerImageSettings.fit,
    offsetX: clampRange(Number(settings?.offsetX ?? defaultMapLayerImageSettings.offsetX), -50, 50),
    offsetY: clampRange(Number(settings?.offsetY ?? defaultMapLayerImageSettings.offsetY), -50, 50),
    opacity: clampRange(Number(settings?.opacity ?? defaultMapLayerImageSettings.opacity), 0.2, 1),
    scale: clampRange(Number(settings?.scale ?? defaultMapLayerImageSettings.scale), 0.5, 2.5),
  }
}

export function getMapLayerImageAttributes(settings?: Partial<MapLayerImageSettings>) {
  const normalized = normalizeMapLayerImageSettings(settings)
  const width = MAP_VIEWBOX_WIDTH * normalized.scale
  const height = MAP_VIEWBOX_HEIGHT * normalized.scale

  return {
    height,
    opacity: normalized.opacity,
    preserveAspectRatio: normalized.fit === 'stretch'
      ? 'none'
      : `xMidYMid ${normalized.fit === 'contain' ? 'meet' : 'slice'}`,
    width,
    x: ((MAP_VIEWBOX_WIDTH - width) / 2) + normalized.offsetX,
    y: ((MAP_VIEWBOX_HEIGHT - height) / 2) + normalized.offsetY,
  }
}

export type MapExportFramePresetId = 'a4-landscape' | 'a4-portrait' | 'map-4-3' | 'square' | 'wide'

export interface MapExportFramePreset {
  aspectRatio: number
  description: string
  id: MapExportFramePresetId
  label: string
}

export interface MapExportFrame {
  aspectRatio: number
  height: number
  id: MapExportFramePresetId
  label: string
  width: number
  x: number
  y: number
}

export const mapExportFramePresets: MapExportFramePreset[] = [
  {
    aspectRatio: MAP_VIEWBOX_ASPECT_RATIO,
    description: 'Celý pracovný viewBox mapy bez orezu.',
    id: 'map-4-3',
    label: 'Mapa 4:3',
  },
  {
    aspectRatio: 297 / 210,
    description: 'Tlač na A4 alebo A3 na šírku.',
    id: 'a4-landscape',
    label: 'A4/A3 na šírku',
  },
  {
    aspectRatio: 210 / 297,
    description: 'Úzky výrez pre vertikálny informačný hárok.',
    id: 'a4-portrait',
    label: 'A4 na výšku',
  },
  {
    aspectRatio: 1,
    description: 'Štvorcový výrez pre rýchly náhľad alebo sociálny export.',
    id: 'square',
    label: 'Štvorec',
  },
  {
    aspectRatio: 16 / 9,
    description: 'Široký výrez pre projektor, kiosk alebo web banner.',
    id: 'wide',
    label: '16:9',
  },
]

export function getMapExportFramePreset(id: MapExportFramePresetId) {
  return mapExportFramePresets.find((preset) => preset.id === id) ?? mapExportFramePresets[0]!
}

export function getMapExportFrame(id: MapExportFramePresetId): MapExportFrame {
  const preset = getMapExportFramePreset(id)
  const frame = preset.aspectRatio >= MAP_VIEWBOX_ASPECT_RATIO
    ? {
        height: MAP_VIEWBOX_WIDTH / preset.aspectRatio,
        width: MAP_VIEWBOX_WIDTH,
        x: 0,
        y: (MAP_VIEWBOX_HEIGHT - (MAP_VIEWBOX_WIDTH / preset.aspectRatio)) / 2,
      }
    : {
        height: MAP_VIEWBOX_HEIGHT,
        width: MAP_VIEWBOX_HEIGHT * preset.aspectRatio,
        x: (MAP_VIEWBOX_WIDTH - (MAP_VIEWBOX_HEIGHT * preset.aspectRatio)) / 2,
        y: 0,
      }

  return {
    aspectRatio: preset.aspectRatio,
    height: Number(frame.height.toFixed(2)),
    id: preset.id,
    label: preset.label,
    width: Number(frame.width.toFixed(2)),
    x: Number(frame.x.toFixed(2)),
    y: Number(frame.y.toFixed(2)),
  }
}

export type MapQualityIssueSeverity = 'error' | 'info' | 'warning'

export interface MapQualityIssue {
  actionLabel?: string
  description: string
  entityLabel?: string
  id: string
  severity: MapQualityIssueSeverity
  title: string
}

export interface MapQualityIssueSummary {
  blockingCount: number
  errorCount: number
  infoCount: number
  warningCount: number
}

export interface MapQualityCheckInput {
  cabinProducts?: Array<Pick<CabinProduct, 'id' | 'label' | 'pegIds'>>
  enabledLayerIds?: string[]
  focusedTournament?: Pick<Tournament, 'id' | 'lake' | 'name' | 'sectors'>
  lake?: LakeSlug
  mapFacilities: Array<Pick<MapFacility, 'id' | 'lake' | 'label' | 'type' | 'visibility'>>
  mapLayers: Array<Pick<MapLayer, 'enabled' | 'id' | 'kind' | 'lake' | 'name' | 'source' | 'visibility'>>
  mapShapes: Array<Pick<MapShape, 'id' | 'lake' | 'label' | 'points' | 'sectorId' | 'tournamentId' | 'type' | 'visibility'>>
  pegs: Array<Pick<Peg, 'id' | 'lake' | 'label' | 'requiresCabinReservation' | 'status' | 'type'>>
}

function getQualityScopeFilter(lake?: LakeSlug) {
  return <Item extends { lake: LakeSlug }>(item: Item) => !lake || item.lake === lake
}

function formatCountLabel(count: number, one: string, few: string, many: string) {
  if (count === 1) return one
  if (count >= 2 && count <= 4) return few

  return many
}

export function getMapQualityIssues(input: MapQualityCheckInput): MapQualityIssue[] {
  const isInScope = getQualityScopeFilter(input.lake)
  const pegsInScope = input.pegs.filter(isInScope)
  const layersInScope = input.mapLayers.filter(isInScope)
  const facilitiesInScope = input.mapFacilities.filter(isInScope)
  const shapesInScope = input.mapShapes.filter(isInScope)
  const enabledLayerIds = new Set(input.enabledLayerIds ?? layersInScope.filter((layer) => layer.enabled).map((layer) => layer.id))
  const cabinProducts = input.cabinProducts ?? []
  const issues: MapQualityIssue[] = []
  const pegById = new Map(pegsInScope.map((peg) => [peg.id, peg]))
  const cabinProductsByPegId = new Map<string, Array<Pick<CabinProduct, 'id' | 'label' | 'pegIds'>>>()

  for (const product of cabinProducts) {
    if (product.pegIds.length === 0) {
      issues.push({
        actionLabel: 'Priradiť lovné miesto v katalógu chát',
        description: 'Produkt chaty sa dá ponúknuť v rezervácii až po naviazaní na konkrétne lovné miesto.',
        entityLabel: product.label,
        id: `cabin-product-empty-${product.id}`,
        severity: 'warning',
        title: 'Chata nemá priradené miesto',
      })
    }

    for (const pegId of product.pegIds) {
      const linkedPeg = pegById.get(pegId)
      if (!linkedPeg) {
        issues.push({
          actionLabel: 'Skontrolovať pegIds v katalógu chát',
          description: 'Produkt odkazuje na miesto, ktoré v tejto mape neexistuje alebo patrí inému jazeru.',
          entityLabel: `${product.label} · ${pegId}`,
          id: `cabin-product-missing-peg-${product.id}-${pegId}`,
          severity: 'error',
          title: 'Chata odkazuje na neexistujúce miesto',
        })
        continue
      }

      if (linkedPeg.type !== 'cabin') {
        issues.push({
          actionLabel: 'Zmeniť typ miesta alebo väzbu produktu',
          description: 'Produkt chaty je naviazaný na brehové miesto. V rezervácii by sa potom správal ako chata, hoci mapa ho ukazuje inak.',
          entityLabel: `${product.label} · ${linkedPeg.label}`,
          id: `cabin-product-shore-peg-${product.id}-${pegId}`,
          severity: 'warning',
          title: 'Produkt chaty je na brehovom mieste',
        })
      }

      cabinProductsByPegId.set(pegId, [...(cabinProductsByPegId.get(pegId) ?? []), product])
    }
  }

  for (const peg of pegsInScope.filter((item) => item.type === 'cabin')) {
    const linkedProducts = cabinProductsByPegId.get(peg.id) ?? []

    if (linkedProducts.length === 0 && peg.requiresCabinReservation) {
      issues.push({
        actionLabel: 'Pridať väzbu v katalógu chát',
        description: 'Miesto vyžaduje rezerváciu chaty, ale nemá cenníkový produkt. Public rezervácia by nevedela správne ponúknuť cenu a doplnky.',
        entityLabel: peg.label,
        id: `required-cabin-without-product-${peg.id}`,
        severity: 'error',
        title: 'Povinná chata nemá produkt',
      })
    }
    else if (linkedProducts.length === 0) {
      issues.push({
        actionLabel: 'Doplniť produkt, ak sa má chata rezervovať',
        description: 'Miesto je označené ako chata, no nie je napojené na katalóg. Ak je to iba orientačný bod, môže zostať ako upozornenie.',
        entityLabel: peg.label,
        id: `optional-cabin-without-product-${peg.id}`,
        severity: 'warning',
        title: 'Chata bez produktu',
      })
    }

    if (linkedProducts.length > 1) {
      issues.push({
        actionLabel: 'Nechať jednu väzbu produktu',
        description: 'Jedno lovné miesto je naviazané na viac chát. Rezervačný systém by nevedel jednoznačne určiť cenu.',
        entityLabel: `${peg.label} · ${linkedProducts.map((product) => product.label).join(', ')}`,
        id: `cabin-peg-multiple-products-${peg.id}`,
        severity: 'error',
        title: 'Miesto má viac produktov chaty',
      })
    }
  }

  const enabledPublicServiceLayers = layersInScope.filter((layer) =>
    layer.kind === 'service' && layer.visibility === 'public' && enabledLayerIds.has(layer.id),
  )
  const internalFacilities = facilitiesInScope.filter((facility) => facility.visibility === 'internal')
  if (enabledPublicServiceLayers.length > 0 && internalFacilities.length > 0) {
    issues.push({
      actionLabel: 'Skontrolovať viditeľnosť servisných bodov',
      description: `${internalFacilities.length} ${formatCountLabel(internalFacilities.length, 'interný bod zostane', 'interné body zostanú', 'interných bodov zostane')} v public mape skrytých, aj keď je servisná vrstva zapnutá.`,
      entityLabel: enabledPublicServiceLayers.map((layer) => layer.name).join(', '),
      id: `public-service-layer-with-internal-facilities-${input.lake ?? 'all'}`,
      severity: 'warning',
      title: 'Servisná vrstva mieša verejné a interné body',
    })
  }

  for (const shape of shapesInScope.filter((item) => item.type === 'service' && item.visibility === 'public')) {
    issues.push({
      actionLabel: 'Zvážiť internú viditeľnosť',
      description: 'Servisná zóna môže prezrádzať prevádzkové miesta. Ak má byť pre rybárov viditeľná, nechajte ju verejnú.',
      entityLabel: shape.label,
      id: `public-service-shape-${shape.id}`,
      severity: 'warning',
      title: 'Servisná zóna je verejná',
    })
  }

  const publicShorelineShapes = shapesInScope.filter((shape) => shape.type === 'shoreline' && shape.visibility === 'public')
  if (publicShorelineShapes.length === 0) {
    issues.push({
      actionLabel: 'Nakresliť alebo zverejniť vodnú oblasť',
      description: 'Mapa bude fungovať aj bez nej, ale verejný náhľad a automatické súťažné sektory budú menej čitateľné.',
      id: `missing-public-shoreline-${input.lake ?? 'all'}`,
      severity: 'info',
      title: 'Chýba verejná vodná oblasť',
    })
  }

  const enabledBackgroundLayers = layersInScope.filter((layer) =>
    layer.kind === 'background' && enabledLayerIds.has(layer.id) && Boolean(layer.source),
  )
  if (enabledBackgroundLayers.length === 0) {
    issues.push({
      actionLabel: 'Nahrať podkladový obrázok',
      description: 'SVG mapa ostane použiteľná, no publikovaný náhľad bude presnejší s reálnym podkladom jazera.',
      id: `missing-background-source-${input.lake ?? 'all'}`,
      severity: 'info',
      title: 'Mapa nemá aktívny obrázkový podklad',
    })
  }

  const sectorShapes = shapesInScope.filter((shape) => shape.type === 'sector')
  for (const shape of sectorShapes) {
    if (shape.visibility !== 'competition') {
      issues.push({
        actionLabel: 'Prepnúť viditeľnosť na súťažné',
        description: 'Súťažný sektor je lepšie držať v súťažnej vrstve, aby sa nemiešal s bežnou public mapou.',
        entityLabel: shape.label,
        id: `sector-shape-non-competition-visibility-${shape.id}`,
        severity: 'warning',
        title: 'Súťažný sektor nemá súťažnú viditeľnosť',
      })
    }

    if (shape.tournamentId && !shape.sectorId) {
      issues.push({
        actionLabel: 'Vybrať sektor turnaja',
        description: 'Plocha je napojená na turnaj, ale nie na konkrétny sektor. V rozhraní rozhodcov by nemala jasného vlastníka.',
        entityLabel: shape.label,
        id: `sector-shape-without-sector-${shape.id}`,
        severity: 'warning',
        title: 'Súťažný polygon nemá sektor',
      })
    }
  }

  if (input.focusedTournament && (!input.lake || input.focusedTournament.lake === input.lake)) {
    const tournamentSectorShapes = sectorShapes.filter((shape) => shape.tournamentId === input.focusedTournament?.id)
    const shapesBySectorId = new Map<string, typeof tournamentSectorShapes>()
    for (const shape of tournamentSectorShapes) {
      if (!shape.sectorId) continue
      shapesBySectorId.set(shape.sectorId, [...(shapesBySectorId.get(shape.sectorId) ?? []), shape])
    }

    for (const sector of input.focusedTournament.sectors) {
      const shapesForSector = shapesBySectorId.get(sector.id) ?? []

      if (shapesForSector.length === 0) {
        issues.push({
          actionLabel: 'Vygenerovať alebo nakresliť sektor',
          description: 'Sektor bude v zozname súťaže, ale mapa ho nebude vedieť zvýrazniť pre tímy ani kontrolórov.',
          entityLabel: `${input.focusedTournament.name} · ${sector.label}`,
          id: `missing-tournament-sector-shape-${input.focusedTournament.id}-${sector.id}`,
          severity: 'warning',
          title: 'Sektor súťaže nemá polygon v mape',
        })
      }
      else if (shapesForSector.length > 1) {
        issues.push({
          actionLabel: 'Nechať jeden polygon na sektor',
          description: 'Duplicitné prepojenie môže rozhodiť smerovanie kontrolórov, výzvy tímu aj export mapy pre preteky.',
          entityLabel: `${input.focusedTournament.name} · ${sector.label}`,
          id: `duplicate-tournament-sector-shape-${input.focusedTournament.id}-${sector.id}`,
          severity: 'error',
          title: 'Sektor súťaže má viac polygonov',
        })
      }
    }
  }

  return issues
}

export function getMapQualityIssueSummary(issues: MapQualityIssue[]): MapQualityIssueSummary {
  const errorCount = issues.filter((issue) => issue.severity === 'error').length
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length
  const infoCount = issues.filter((issue) => issue.severity === 'info').length

  return {
    blockingCount: errorCount,
    errorCount,
    infoCount,
    warningCount,
  }
}

export function getMapPointLabel(point: Pick<Peg, 'label' | 'type'>) {
  const number = point.label.match(/\d+/)?.[0] ?? point.label.slice(0, 2).toUpperCase()

  if (point.label.includes('Kocka')) return `K${number}`
  if (point.type === 'cabin') return `CH${number}`
  return number
}

export function getMapShapePoints(shape: Pick<MapShape, 'points'>) {
  return shape.points.map((point) => `${point.x},${toSvgY(point.y)}`).join(' ')
}

export interface MapShapePointLegendRow {
  id: string
  label: string
  pointIndex: number
  role?: MapShapePointRole
  roleLabel: string
  shapeId: string
  shapeLabel: string
  shapeType: MapShape['type']
  visibility: MapShape['visibility']
  x: number
  y: number
}

export interface MapShapePointLegendFilters {
  role?: 'all' | MapShapePointRole
  visibility?: 'all' | MapShape['visibility']
}

export const mapShapeTypeLabels: Record<MapShape['type'], string> = {
  island: 'ostrov / vegetácia',
  sector: 'súťažný sektor',
  service: 'servisná zóna',
  shoreline: 'vodná plocha',
  zone: 'zákaz / režim',
}

export const mapShapePointRoleLabels: Record<MapShapePointRole, string> = {
  anchor: 'kotva podkladu',
  boundary: 'hranica',
  entry: 'vstup',
  regular: 'bežný bod',
  service: 'servisný bod',
  shore: 'breh',
}

export const mapShapeVisibilityLabels: Record<MapShape['visibility'], string> = {
  competition: 'súťažné',
  internal: 'interné',
  public: 'verejné',
}

export function getMapShapePointLegendRows(shapes: MapShape[]): MapShapePointLegendRow[] {
  return shapes.flatMap((shape) =>
    shape.points
      .map((point, pointIndex): MapShapePointLegendRow | undefined => {
        const label = point.label?.trim()
        const hasMeaningfulRole = Boolean(point.role && point.role !== 'regular')
        if (!label && !hasMeaningfulRole) return undefined

        return {
          id: `${shape.id}-${pointIndex}`,
          label: label || mapShapePointRoleLabels[point.role ?? 'regular'],
          pointIndex,
          role: point.role,
          roleLabel: mapShapePointRoleLabels[point.role ?? 'regular'],
          shapeId: shape.id,
          shapeLabel: shape.label,
          shapeType: shape.type,
          visibility: shape.visibility,
          x: point.x,
          y: point.y,
        }
      })
      .filter((row): row is MapShapePointLegendRow => Boolean(row)),
  )
}

export function getMapShapePointRoleSummary(rows: MapShapePointLegendRow[]) {
  return Object.entries(mapShapePointRoleLabels)
    .map(([role, label]) => ({
      count: rows.filter((row) => (row.role ?? 'regular') === role).length,
      label,
      role: role as MapShapePointRole,
    }))
    .filter((row) => row.count > 0)
}

export function filterMapShapePointLegendRows(
  rows: MapShapePointLegendRow[],
  filters: MapShapePointLegendFilters = {},
) {
  return rows.filter((row) => {
    const role = row.role ?? 'regular'
    const roleMatches = !filters.role || filters.role === 'all' || role === filters.role
    const visibilityMatches = !filters.visibility || filters.visibility === 'all' || row.visibility === filters.visibility

    return roleMatches && visibilityMatches
  })
}

function escapeCsvValue(value: string | number) {
  const normalized = String(value)
  if (!/[",\n\r]/.test(normalized)) return normalized

  return `"${normalized.replaceAll('"', '""')}"`
}

export function createMapShapePointLegendCsv(rows: MapShapePointLegendRow[]) {
  const header = [
    'ID',
    'Názov bodu',
    'Typ bodu',
    'Plocha',
    'Typ plochy',
    'Viditeľnosť',
    'Vrchol',
    'X',
    'Y',
  ]
  const body = rows.map((row) => [
    row.id,
    row.label,
    row.roleLabel,
    row.shapeLabel,
    mapShapeTypeLabels[row.shapeType],
    mapShapeVisibilityLabels[row.visibility],
    row.pointIndex + 1,
    row.x,
    row.y,
  ])

  return [header, ...body].map((line) => line.map(escapeCsvValue).join(',')).join('\n')
}

export const mapShapeToneLabels: Record<MapShape['tone'], string> = {
  reed: 'porast',
  sector: 'súťaž',
  service: 'servis',
  warning: 'obmedzenie',
  water: 'voda',
}

export function getMapShapeStyle(tone: MapShape['tone']) {
  const styles: Record<MapShape['tone'], { fill: string, stroke: string }> = {
    water: { fill: 'rgba(72, 185, 245, 0.22)', stroke: 'rgba(18, 122, 189, 0.55)' },
    reed: { fill: 'rgba(102, 138, 53, 0.42)', stroke: 'rgba(18, 74, 70, 0.55)' },
    warning: { fill: 'rgba(217, 141, 12, 0.2)', stroke: 'rgba(217, 141, 12, 0.85)' },
    service: { fill: 'rgba(201, 55, 44, 0.16)', stroke: 'rgba(201, 55, 44, 0.75)' },
    sector: { fill: 'rgba(255, 194, 71, 0.2)', stroke: 'rgba(244, 169, 29, 0.85)' },
  }

  return styles[tone]
}

export const mapFacilityTypeLabels: Record<MapFacilityType, string> = {
  electricity: 'elektrická rozvodňa',
  entry: 'vjazd',
  'first-aid': 'prvá pomoc',
  other: 'iné miesto',
  parking: 'parkovanie',
  reception: 'recepcia',
  shower: 'sprchy',
  storage: 'sklad',
  toilet: 'WC',
  waste: 'odpad',
  wood: 'drevo',
}

export function getMapFacilityShortLabel(type: MapFacilityType) {
  const labels: Record<MapFacilityType, string> = {
    electricity: 'EL',
    entry: 'VJ',
    'first-aid': '+',
    other: '•',
    parking: 'P',
    reception: 'R',
    shower: 'S',
    storage: 'SK',
    toilet: 'WC',
    waste: 'OD',
    wood: 'DR',
  }

  return labels[type]
}

export function getMapFacilityStyle(facility: Pick<MapFacility, 'type' | 'visibility'>) {
  const typeStyles: Partial<Record<MapFacilityType, { fill: string, stroke: string, text: string }>> = {
    electricity: { fill: '#f4a91d', stroke: '#ffffff', text: '#062523' },
    entry: { fill: '#155c55', stroke: '#ffffff', text: '#ffffff' },
    'first-aid': { fill: '#c9372c', stroke: '#ffffff', text: '#ffffff' },
    parking: { fill: '#116199', stroke: '#ffffff', text: '#ffffff' },
    reception: { fill: '#063b36', stroke: '#ffc247', text: '#ffffff' },
    shower: { fill: '#48b9f5', stroke: '#ffffff', text: '#062523' },
    storage: { fill: '#60716d', stroke: '#ffffff', text: '#ffffff' },
    toilet: { fill: '#ffffff', stroke: '#155c55', text: '#155c55' },
    waste: { fill: '#668a35', stroke: '#ffffff', text: '#ffffff' },
    wood: { fill: '#8a5a2b', stroke: '#ffffff', text: '#ffffff' },
  }
  const base = typeStyles[facility.type] ?? { fill: '#f6f2e8', stroke: '#063b36', text: '#063b36' }

  if (facility.visibility === 'internal') {
    return { ...base, stroke: '#d98d0c' }
  }

  if (facility.visibility === 'competition') {
    return { ...base, stroke: '#f4a91d' }
  }

  return base
}

export function getMapMarkerStyle(status: AvailabilityStatus) {
  const styles: Record<AvailabilityStatus, { fill: string, stroke: string, text: string }> = {
    available: { fill: '#198754', stroke: '#ffffff', text: '#ffffff' },
    limited: { fill: '#d98d0c', stroke: '#ffffff', text: '#062523' },
    reserved: { fill: '#c9372c', stroke: '#ffffff', text: '#ffffff' },
    blocked: { fill: '#60716d', stroke: '#ffffff', text: '#ffffff' },
    closed: { fill: '#8f241c', stroke: '#ffffff', text: '#ffffff' },
    requires_approval: { fill: '#155c55', stroke: '#ffffff', text: '#ffffff' },
  }

  return styles[status]
}
