import type { CabinCatalogStateResponse } from '~/services/cabinCatalogService'
import { sortCabinProducts } from '~/services/cabinCatalogService'

interface CabinCatalogStateOptions {
  admin?: boolean
  key?: string
}

export async function useCabinCatalogState(options: CabinCatalogStateOptions = {}) {
  const { cabinProducts } = usePondData()
  const requestFetch = useRequestFetch()
  const endpoint = options.admin ? '/api/admin/cabin-products' : '/api/cabin-products'
  const fallbackCabinCatalogState = (): CabinCatalogStateResponse => ({
    cabinProducts: sortCabinProducts(cabinProducts),
    ok: true,
    updatedAt: 'seed',
  })

  const asyncData = await useAsyncData<CabinCatalogStateResponse>(
    options.key ?? `${options.admin ? 'admin' : 'public'}-cabin-catalog-state`,
    () => requestFetch<CabinCatalogStateResponse>(endpoint),
    {
      default: fallbackCabinCatalogState,
    },
  )
  const liveCabinProducts = computed(() =>
    sortCabinProducts(asyncData.data.value?.cabinProducts ?? fallbackCabinCatalogState().cabinProducts),
  )

  return {
    ...asyncData,
    liveCabinProducts,
  }
}
