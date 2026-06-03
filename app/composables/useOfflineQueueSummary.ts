import { OFFLINE_QUEUE_CHANGED_EVENT } from '~/services/offlineQueueDb'
import { readOfflineCatchQueue } from '~/services/offlineCatchQueueService'
import { readOfflineReservationQueue } from '~/services/offlineReservationQueueService'
import { readOfflineTournamentAdminActionQueue } from '~/services/offlineTournamentAdminActionQueueService'
import { readOfflineTournamentRequestQueue } from '~/services/offlineTournamentRequestQueueService'

export function useOfflineQueueSummary() {
  const reservations = useState('offline-queue-count-reservations', () => 0)
  const catches = useState('offline-queue-count-catches', () => 0)
  const tournamentRequests = useState('offline-queue-count-tournament-requests', () => 0)
  const adminTournamentActions = useState('offline-queue-count-admin-tournament-actions', () => 0)
  const loaded = useState('offline-queue-count-loaded', () => false)
  const error = useState('offline-queue-count-error', () => '')

  const total = computed(() =>
    reservations.value + catches.value + tournamentRequests.value + adminTournamentActions.value,
  )

  async function refresh() {
    if (!import.meta.client) return

    try {
      const [reservationItems, catchItems, tournamentRequestItems, adminTournamentActionItems] = await Promise.all([
        readOfflineReservationQueue(),
        readOfflineCatchQueue(),
        readOfflineTournamentRequestQueue(),
        readOfflineTournamentAdminActionQueue(),
      ])

      reservations.value = reservationItems.length
      catches.value = catchItems.length
      tournamentRequests.value = tournamentRequestItems.length
      adminTournamentActions.value = adminTournamentActionItems.length
      loaded.value = true
      error.value = ''
    }
    catch (caughtError) {
      error.value = caughtError instanceof Error
        ? caughtError.message
        : 'Offline frontu sa nepodarilo načítať.'
    }
  }

  if (import.meta.client) {
    onMounted(() => {
      void refresh()
      window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, refresh)
      window.addEventListener('focus', refresh)
      document.addEventListener('visibilitychange', refresh)
    })

    onBeforeUnmount(() => {
      window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    })
  }

  return {
    adminTournamentActions,
    catches,
    error,
    loaded,
    refresh,
    reservations,
    total,
    tournamentRequests,
  }
}
