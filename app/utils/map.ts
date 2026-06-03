import type { MapFacility, MapFacilityType, MapLayerImageSettings, MapShape, Peg } from '~/data/pond'
import type { AvailabilityStatus } from '~/utils/availability'

export const MAP_VIEWBOX_WIDTH = 100
export const MAP_VIEWBOX_HEIGHT = 75
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

export function getMapPointLabel(point: Pick<Peg, 'label' | 'type'>) {
  const number = point.label.match(/\d+/)?.[0] ?? point.label.slice(0, 2).toUpperCase()

  if (point.label.includes('Kocka')) return `K${number}`
  if (point.type === 'cabin') return `CH${number}`
  return number
}

export function getMapShapePoints(shape: Pick<MapShape, 'points'>) {
  return shape.points.map((point) => `${point.x},${toSvgY(point.y)}`).join(' ')
}

export const mapShapeTypeLabels: Record<MapShape['type'], string> = {
  island: 'ostrov / vegetácia',
  sector: 'súťažný sektor',
  service: 'servisná zóna',
  shoreline: 'vodná plocha',
  zone: 'zákaz / režim',
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
