import type { ClosureStateResponse } from '~/services/closureApiService'

interface UseClosureStateOptions {
  admin?: boolean
  key?: string
}

export async function useClosureState(options: UseClosureStateOptions = {}) {
  const { lakeClosures } = usePondData()
  const requestFetch = useRequestFetch()
  const endpoint = options.admin ? '/api/admin/closures' : '/api/closures'
  const fallbackClosureState = (): ClosureStateResponse => ({
    lakeClosures,
    ok: true,
    updatedAt: 'seed',
  })
  const asyncData = await useAsyncData<ClosureStateResponse>(
    options.key ?? `${options.admin ? 'admin' : 'public'}-closure-state`,
    () => requestFetch<ClosureStateResponse>(endpoint),
    {
      default: fallbackClosureState,
    },
  )
  const liveClosures = computed(() => asyncData.data.value?.lakeClosures ?? lakeClosures)

  return {
    ...asyncData,
    liveClosures,
  }
}
