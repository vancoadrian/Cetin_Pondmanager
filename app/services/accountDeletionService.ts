import {
  getMockAnglerAccountEmails,
  getMockAnglerAccountNames,
  type MockAnglerAccount,
} from '~/services/anglerAccountService'
import type { CatchWorkflowState } from '~/services/catchApiService'
import type { ReservationWorkflowState } from '~/services/reservationWorkflowService'

export const ACCOUNT_DELETION_CONFIRMATION = 'ZMAZAŤ'
export const ANONYMIZED_ANGLER_LABEL = 'Anonymný rybár'

export interface AccountDeletionSummary {
  catches: number
  logbookEntries: number
  logbooks: number
  reservations: number
}

export interface AccountDeletionResponse {
  deletedAt: string
  message: string
  ok: true
  summary: AccountDeletionSummary
}

export interface AccountAnonymizationResult {
  catchState: CatchWorkflowState
  reservationState: ReservationWorkflowState
  summary: AccountDeletionSummary
}

function normalizeIdentity(value?: string | null) {
  return value?.trim().toLocaleLowerCase('sk') ?? ''
}

export function anonymizeAccountData(
  account: MockAnglerAccount,
  reservationState: ReservationWorkflowState,
  catchState: CatchWorkflowState,
): AccountAnonymizationResult {
  const accountEmails = new Set(getMockAnglerAccountEmails(account))
  const accountNames = new Set(getMockAnglerAccountNames(account))
  const matchesAccountName = (name?: string | null) => accountNames.has(normalizeIdentity(name))
  let reservationCount = 0
  let catchCount = 0
  let logbookCount = 0
  let logbookEntryCount = 0

  const reservations = reservationState.reservations.map((reservation) => {
    const reservationEmail = normalizeIdentity(reservation.contactEmail)
    const matchesAccount = reservationEmail
      ? accountEmails.has(reservationEmail)
      : matchesAccountName(reservation.guest)

    if (!matchesAccount) return reservation

    reservationCount += 1
    return {
      ...reservation,
      contactEmail: undefined,
      contactPhone: '',
      guest: ANONYMIZED_ANGLER_LABEL,
      internalNote: 'Osobné kontaktné údaje boli odstránené po zmazaní účtu.',
    }
  })

  const catches = catchState.catches.map((catchItem) => {
    if (!matchesAccountName(catchItem.angler)) return catchItem

    catchCount += 1
    return {
      ...catchItem,
      angler: ANONYMIZED_ANGLER_LABEL,
    }
  })

  const tripLogbooks = catchState.tripLogbooks.map((logbook) => {
    const ownerMatches = logbook.ownerUserId === account.id
      || matchesAccountName(logbook.owner)
    let memberChanged = false
    const members = logbook.members.map((member) => {
      const memberMatches = member.userId === account.id
        || matchesAccountName(member.name)
      if (!memberMatches) return member

      memberChanged = true
      return {
        ...member,
        name: ANONYMIZED_ANGLER_LABEL,
        userId: undefined,
      }
    })

    if (!ownerMatches && !memberChanged) return logbook

    logbookCount += 1
    return {
      ...logbook,
      members,
      owner: ownerMatches ? ANONYMIZED_ANGLER_LABEL : logbook.owner,
      ownerUserId: ownerMatches ? undefined : logbook.ownerUserId,
    }
  })

  const tripLogbookEntries = catchState.tripLogbookEntries.map((entry) => {
    if (!matchesAccountName(entry.angler)) return entry

    logbookEntryCount += 1
    return {
      ...entry,
      angler: ANONYMIZED_ANGLER_LABEL,
    }
  })

  return {
    catchState: {
      catchPhotos: catchState.catchPhotos,
      catches,
      tripLogbookEntries,
      tripLogbooks,
    },
    reservationState: {
      rentalBookings: reservationState.rentalBookings,
      reservations,
    },
    summary: {
      catches: catchCount,
      logbookEntries: logbookEntryCount,
      logbooks: logbookCount,
      reservations: reservationCount,
    },
  }
}
