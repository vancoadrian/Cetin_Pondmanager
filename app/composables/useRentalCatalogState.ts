import type { RentalCatalogStateResponse } from '~/services/rentalCatalogService'
import { sortRentalItems, sortReservationExtras } from '~/services/rentalCatalogService'

interface RentalCatalogStateOptions {
  admin?: boolean
  key?: string
}

export async function useRentalCatalogState(options: RentalCatalogStateOptions = {}) {
  const { rentalItems, reservationExtras } = usePondData()
  const fallbackRentalCatalogState = (): RentalCatalogStateResponse => ({
    ok: true,
    rentalItems: options.admin ? rentalItems : rentalItems.filter((item) => item.active),
    reservationExtras: options.admin
      ? reservationExtras
      : reservationExtras.filter((extra) => extra.active),
    updatedAt: 'seed',
  })

  const { data, refresh } = await useAsyncData<RentalCatalogStateResponse>(
    options.key ?? (options.admin ? 'admin-rental-catalog-state' : 'public-rental-catalog-state'),
    () => $fetch<RentalCatalogStateResponse>(options.admin ? '/api/admin/rental-catalog' : '/api/rental-catalog'),
    {
      default: fallbackRentalCatalogState,
    },
  )

  const liveRentalItems = computed(() => sortRentalItems(data.value?.rentalItems ?? fallbackRentalCatalogState().rentalItems))
  const liveReservationExtras = computed(() =>
    sortReservationExtras(data.value?.reservationExtras ?? fallbackRentalCatalogState().reservationExtras),
  )
  const activeRentalItems = computed(() => liveRentalItems.value.filter((item) => item.active))
  const activeReservationExtras = computed(() => liveReservationExtras.value.filter((extra) => extra.active))

  return {
    activeRentalItems,
    activeReservationExtras,
    liveRentalItems,
    liveReservationExtras,
    refresh,
    rentalCatalogState: data,
  }
}
