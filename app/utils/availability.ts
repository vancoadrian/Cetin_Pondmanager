import type { LakeClosure, Peg, Reservation } from '~/data/pond'

export type AvailabilityStatus =
  | 'available'
  | 'limited'
  | 'reserved'
  | 'blocked'
  | 'closed'
  | 'requires_approval'

export interface AvailabilityResult {
  status: AvailabilityStatus
  label: string
  description: string
  icon: string
  classes: string
  dotClasses: string
  reservable: boolean
  reasons: string[]
  sourceIds: string[]
}

interface AvailabilityInput {
  closures: LakeClosure[]
  dateFrom?: string
  dateTo?: string
  reservations: Reservation[]
}

const statusMeta: Record<
  AvailabilityStatus,
  Pick<AvailabilityResult, 'classes' | 'description' | 'dotClasses' | 'icon' | 'label' | 'reservable'>
> = {
  available: {
    label: 'dostupné',
    description: 'Miesto je dostupné pre rezerváciu.',
    icon: 'i-heroicons-check-circle',
    classes: 'bg-success-500/10 text-success-700 border-success-500/25',
    dotClasses: 'bg-success-500 text-white',
    reservable: true,
  },
  limited: {
    label: 'obmedzené',
    description: 'Miesto je dostupné, ale má obmedzenie alebo čakajúcu žiadosť.',
    icon: 'i-heroicons-exclamation-triangle',
    classes: 'bg-warning-500/10 text-warning-700 border-warning-500/25',
    dotClasses: 'bg-warning-500 text-primary-950',
    reservable: true,
  },
  reserved: {
    label: 'obsadené',
    description: 'Miesto má v danom termíne potvrdenú rezerváciu.',
    icon: 'i-heroicons-lock-closed',
    classes: 'bg-error-500/10 text-error-700 border-error-500/25',
    dotClasses: 'bg-error-500 text-white',
    reservable: false,
  },
  blocked: {
    label: 'blokované',
    description: 'Miesto je blokované údržbou alebo interným pravidlom.',
    icon: 'i-heroicons-wrench-screwdriver',
    classes: 'bg-foreground-muted/10 text-foreground-muted border-border',
    dotClasses: 'bg-foreground-muted text-white',
    reservable: false,
  },
  closed: {
    label: 'zatvorené',
    description: 'Jazero alebo stredisko je v danom termíne zatvorené.',
    icon: 'i-heroicons-no-symbol',
    classes: 'bg-error-500/10 text-error-700 border-error-500/25',
    dotClasses: 'bg-error-700 text-white',
    reservable: false,
  },
  requires_approval: {
    label: 'na schválenie',
    description: 'Rezervácia je možná iba po individuálnom potvrdení správcom.',
    icon: 'i-heroicons-clipboard-document-check',
    classes: 'bg-primary-50 text-primary-800 border-primary-200',
    dotClasses: 'bg-primary-700 text-white',
    reservable: true,
  },
}

const todayIso = () => new Date().toISOString().slice(0, 10)

function normalizeDate(value?: string) {
  return value?.slice(0, 10) || todayIso()
}

export function rangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string) {
  return aFrom <= bTo && bFrom <= aTo
}

function buildResult(status: AvailabilityStatus, reasons: string[], sourceIds: string[]): AvailabilityResult {
  return {
    status,
    reasons,
    sourceIds,
    ...statusMeta[status],
  }
}

export function getPegAvailability(peg: Peg, input: AvailabilityInput): AvailabilityResult {
  const hasExplicitDateRange = Boolean(input.dateFrom || input.dateTo)
  const dateFrom = normalizeDate(input.dateFrom)
  const dateTo = normalizeDate(input.dateTo || input.dateFrom)
  const reasons: string[] = []
  const sourceIds: string[] = []

  const activeClosures = input.closures.filter((closure) => {
    const targetsLake = closure.lake === 'all' || closure.lake === peg.lake
    const targetsPeg = !closure.pegIds || closure.pegIds.includes(peg.id)
    return targetsLake && targetsPeg && closure.affectsReservations && rangesOverlap(dateFrom, dateTo, closure.from, closure.to)
  })

  const hardClosure = activeClosures.find((closure) =>
    ['emergency', 'pandemic', 'season', 'tournament'].includes(closure.reason),
  )
  if (hardClosure) {
    reasons.push(hardClosure.title)
    sourceIds.push(hardClosure.id)
    return buildResult('closed', reasons, sourceIds)
  }

  if (peg.status === 'reserved' && !hasExplicitDateRange) {
    reasons.push('Miesto je označené ako rezervované správcom.')
    sourceIds.push(peg.id)
    return buildResult('reserved', reasons, sourceIds)
  }

  if (peg.status === 'maintenance') {
    reasons.push('Miesto je označené ako údržba.')
    sourceIds.push(peg.id)
    return buildResult('blocked', reasons, sourceIds)
  }

  const maintenanceClosure = activeClosures.find((closure) => closure.reason === 'maintenance')
  if (maintenanceClosure) {
    reasons.push(maintenanceClosure.title)
    sourceIds.push(maintenanceClosure.id)
    return buildResult('blocked', reasons, sourceIds)
  }

  const overlappingReservations = input.reservations.filter(
    (reservation) =>
      reservation.pegId === peg.id && rangesOverlap(dateFrom, dateTo, reservation.from, reservation.to),
  )
  const confirmedReservation = overlappingReservations.find((reservation) => reservation.status === 'confirmed')
  if (confirmedReservation) {
    reasons.push(`Rezervácia: ${confirmedReservation.guest}`)
    sourceIds.push(confirmedReservation.id)
    return buildResult('reserved', reasons, sourceIds)
  }

  const blockedReservation = overlappingReservations.find((reservation) => reservation.status === 'blocked')
  if (blockedReservation) {
    reasons.push(`Blokácia: ${blockedReservation.guest}`)
    sourceIds.push(blockedReservation.id)
    return buildResult('blocked', reasons, sourceIds)
  }

  const approvalClosure = activeClosures.find((closure) => closure.reason === 'spawning')
  if (approvalClosure) {
    reasons.push(approvalClosure.title)
    sourceIds.push(approvalClosure.id)
    return buildResult('requires_approval', reasons, sourceIds)
  }

  const pendingReservation = overlappingReservations.find((reservation) => reservation.status === 'pending')
  if (pendingReservation) {
    reasons.push(`Čakajúca žiadosť: ${pendingReservation.guest}`)
    sourceIds.push(pendingReservation.id)
    return buildResult('limited', reasons, sourceIds)
  }

  if (peg.status === 'weekend-free' && !hasExplicitDateRange) {
    reasons.push('Najbližší víkend je dostupný, ale vyžaduje potvrdenie termínu.')
    sourceIds.push(peg.id)
    return buildResult('limited', reasons, sourceIds)
  }

  reasons.push('Bez konfliktu v zvolenom termíne.')
  return buildResult('available', reasons, sourceIds)
}

export function getAvailabilityMeta(status: AvailabilityStatus) {
  return statusMeta[status]
}
