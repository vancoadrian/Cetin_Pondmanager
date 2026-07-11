import type {
  CatchPhoto,
  CatchRecord,
  RentalBooking,
  Reservation,
  TripLogbook,
  TripLogbookEntry,
} from '~/data/pond'
import type { CatchWorkflowState } from '~/services/catchApiService'
import {
  getMockAnglerAccountEmails,
  getMockAnglerAccountNames,
  type MockAnglerAccount,
} from '~/services/anglerAccountService'
import type { AccountReservation } from '~/services/reservationApiService'
import type { ReservationWorkflowState } from '~/services/reservationWorkflowService'

export interface AnglerReservationSelection {
  rentalBookings: RentalBooking[]
  reservations: AccountReservation[]
}

export interface AnglerLogbookSelection {
  tripLogbookEntries: TripLogbookEntry[]
  tripLogbooks: TripLogbook[]
}

export interface AccountDataExportLogbookMember {
  isCurrentUser: boolean
  name: string
  role: TripLogbook['members'][number]['role']
}

export interface AccountDataExportLogbook extends Omit<TripLogbook, 'members' | 'owner' | 'ownerUserId'> {
  isOwner: boolean
  members: AccountDataExportLogbookMember[]
  owner: string
}

export type AccountDataExportCatch = Omit<
  CatchRecord,
  'photoStoragePath' | 'reviewNote' | 'reviewedBy'
>

export type AccountDataExportPhoto = Omit<CatchPhoto, 'storagePath'>

export interface AnglerAccountDataExport {
  account: {
    email: string
    emailAliases: string[]
    id: string
    name: string
    nameAliases: string[]
    phone?: string
  }
  catches: AccountDataExportCatch[]
  exportedAt: string
  formatVersion: 2
  photos: AccountDataExportPhoto[]
  rentalBookings: RentalBooking[]
  reservations: AccountReservation[]
  summary: {
    catches: number
    logbookEntries: number
    logbooks: number
    photos: number
    reservations: number
  }
  tripLogbookEntries: TripLogbookEntry[]
  tripLogbooks: AccountDataExportLogbook[]
}

function normalizeIdentity(value?: string | null) {
  return value?.trim().toLocaleLowerCase('sk') ?? ''
}

function isAccountIdentity(account: MockAnglerAccount, userId?: string, name?: string) {
  return userId === account.id || getMockAnglerAccountNames(account).includes(normalizeIdentity(name))
}

function toAccountReservation(reservation: Reservation): AccountReservation {
  const { internalNote: _internalNote, ...accountReservation } = reservation
  return accountReservation
}

export function selectAnglerReservations(
  account: MockAnglerAccount,
  state: ReservationWorkflowState,
): AnglerReservationSelection {
  const accountEmails = new Set(getMockAnglerAccountEmails(account))
  const accountName = normalizeIdentity(account.name)
  const reservations = state.reservations
    .filter((reservation) => {
      const reservationEmail = normalizeIdentity(reservation.contactEmail)
      if (reservationEmail) return accountEmails.has(reservationEmail)
      return normalizeIdentity(reservation.guest) === accountName
    })
    .map(toAccountReservation)
    .sort((first, second) => second.from.localeCompare(first.from))
  const reservationIds = new Set(reservations.map((reservation) => reservation.id))

  return {
    rentalBookings: state.rentalBookings.filter((booking) => reservationIds.has(booking.reservationId)),
    reservations,
  }
}

export function selectAnglerLogbooks(
  account: MockAnglerAccount,
  state: CatchWorkflowState,
): AnglerLogbookSelection {
  const tripLogbooks = state.tripLogbooks.filter((logbook) =>
    isAccountIdentity(account, logbook.ownerUserId, logbook.owner)
    || logbook.members.some((member) => isAccountIdentity(account, member.userId, member.name)),
  )
  const logbookIds = new Set(tripLogbooks.map((logbook) => logbook.id))

  return {
    tripLogbookEntries: state.tripLogbookEntries.filter((entry) => logbookIds.has(entry.logbookId)),
    tripLogbooks,
  }
}

export function createAnglerAccountDataExport(
  account: MockAnglerAccount,
  reservationState: ReservationWorkflowState,
  catchState: CatchWorkflowState,
  exportedAt = new Date().toISOString(),
): AnglerAccountDataExport {
  const reservationSelection = selectAnglerReservations(account, reservationState)
  const logbookSelection = selectAnglerLogbooks(account, catchState)
  const ownEntryCatchIds = new Set(
    logbookSelection.tripLogbookEntries
      .filter((entry) => isAccountIdentity(account, undefined, entry.angler))
      .map((entry) => entry.catchId)
      .filter((catchId): catchId is string => Boolean(catchId)),
  )
  const catches = catchState.catches
    .filter((catchItem) =>
      ownEntryCatchIds.has(catchItem.id) || isAccountIdentity(account, undefined, catchItem.angler),
    )
    .map((catchItem): AccountDataExportCatch => {
      const {
        photoStoragePath: _photoStoragePath,
        reviewNote: _reviewNote,
        reviewedBy: _reviewedBy,
        ...exportedCatch
      } = catchItem
      return exportedCatch
    })
  const catchIds = new Set(catches.map((catchItem) => catchItem.id))
  const photos = catchState.catchPhotos
    .filter((photo) => catchIds.has(photo.catchId))
    .map((photo): AccountDataExportPhoto => {
      const { storagePath: _storagePath, ...exportedPhoto } = photo
      return exportedPhoto
    })
  const tripLogbooks = logbookSelection.tripLogbooks.map((logbook): AccountDataExportLogbook => {
    const isOwner = isAccountIdentity(account, logbook.ownerUserId, logbook.owner)
    const {
      members: _members,
      owner: _owner,
      ownerUserId: _ownerUserId,
      ...exportedLogbook
    } = logbook
    return {
      ...exportedLogbook,
      isOwner,
      members: logbook.members.map((member, index) => {
        const isCurrentUser = isAccountIdentity(account, member.userId, member.name)
        return {
          isCurrentUser,
          name: isCurrentUser ? account.name : `Člen výpravy ${index + 1}`,
          role: member.role,
        }
      }),
      owner: isOwner ? account.name : 'Vedúci výpravy',
    }
  })
  const tripLogbookEntries = logbookSelection.tripLogbookEntries.map((entry) => ({
    ...entry,
    angler: isAccountIdentity(account, undefined, entry.angler) ? account.name : 'Člen výpravy',
  }))

  return {
    account: {
      email: account.email,
      emailAliases: account.emailAliases ? [...account.emailAliases] : [],
      id: account.id,
      name: account.name,
      nameAliases: account.nameAliases ? [...account.nameAliases] : [],
      phone: account.phone,
    },
    catches,
    exportedAt,
    formatVersion: 2,
    photos,
    rentalBookings: reservationSelection.rentalBookings,
    reservations: reservationSelection.reservations,
    summary: {
      catches: catches.length,
      logbookEntries: tripLogbookEntries.length,
      logbooks: tripLogbooks.length,
      photos: photos.length,
      reservations: reservationSelection.reservations.length,
    },
    tripLogbookEntries,
    tripLogbooks,
  }
}

export function createAccountDataExportFilename(exportedAt = new Date().toISOString()) {
  return `rybolov-cetin-moje-udaje-${exportedAt.slice(0, 10)}.json`
}
