import { OFFLINE_QUEUE_CHANGED_EVENT, readOfflineQueueCounts } from '~/services/offlineQueueDb'

export function useOfflineQueueSummary() {
  const reservations = useState('offline-queue-count-reservations', () => 0)
  const catches = useState('offline-queue-count-catches', () => 0)
  const placeIssues = useState('offline-queue-count-place-issues', () => 0)
  const tournamentRequests = useState('offline-queue-count-tournament-requests', () => 0)
  const adminTournamentActions = useState('offline-queue-count-admin-tournament-actions', () => 0)
  const loaded = useState('offline-queue-count-loaded', () => false)
  const error = useState('offline-queue-count-error', () => '')

  const total = computed(() =>
    reservations.value + catches.value + placeIssues.value + tournamentRequests.value + adminTournamentActions.value,
  )

  async function refresh() {
    if (!import.meta.client) return

    try {
      const counts = await readOfflineQueueCounts()

      reservations.value = counts.reservations
      catches.value = counts.catches
      placeIssues.value = counts.placeIssues
      tournamentRequests.value = counts.tournamentRequests
      adminTournamentActions.value = counts.adminTournamentActions
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
    let idleCallbackId: number | undefined
    let fallbackTimerId: number | undefined
    const refreshFromEvent = () => {
      void refresh()
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }

    onMounted(() => {
      if (typeof window.requestIdleCallback === 'function') {
        idleCallbackId = window.requestIdleCallback(refreshFromEvent, { timeout: 1500 })
      }
      else {
        fallbackTimerId = window.setTimeout(refreshFromEvent, 250)
      }

      window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, refreshFromEvent)
      window.addEventListener('focus', refreshFromEvent)
      document.addEventListener('visibilitychange', refreshWhenVisible)
    })

    onBeforeUnmount(() => {
      if (idleCallbackId !== undefined) window.cancelIdleCallback(idleCallbackId)
      if (fallbackTimerId !== undefined) window.clearTimeout(fallbackTimerId)

      window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, refreshFromEvent)
      window.removeEventListener('focus', refreshFromEvent)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    })
  }

  return {
    adminTournamentActions,
    catches,
    error,
    loaded,
    placeIssues,
    refresh,
    reservations,
    total,
    tournamentRequests,
  }
}
