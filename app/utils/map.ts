import type { MapShape, Peg } from '~/data/pond'
import type { AvailabilityStatus } from '~/utils/availability'

export const MAP_VIEWBOX_WIDTH = 100
export const MAP_VIEWBOX_HEIGHT = 75

export function clampMapPercent(value: number) {
  return Math.min(100, Math.max(0, Number(value.toFixed(1))))
}

export function toSvgY(yPercent: number) {
  return (yPercent / 100) * MAP_VIEWBOX_HEIGHT
}

export function fromSvgY(svgY: number) {
  return clampMapPercent((svgY / MAP_VIEWBOX_HEIGHT) * 100)
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
