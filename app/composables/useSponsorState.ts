import type { SponsorStateResponse } from '~/services/sponsorService'
import { sortSponsors } from '~/services/sponsorService'

interface SponsorStateOptions {
  admin?: boolean
  key?: string
}

export async function useSponsorState(options: SponsorStateOptions = {}) {
  const { sponsors } = usePondData()
  const fallbackSponsorState = (): SponsorStateResponse => ({
    ok: true,
    sponsors: options.admin ? sponsors : sponsors.filter((sponsor) => sponsor.active),
    updatedAt: 'seed',
  })

  const { data, refresh } = await useAsyncData<SponsorStateResponse>(
    options.key ?? (options.admin ? 'admin-sponsor-state' : 'public-sponsor-state'),
    () => $fetch<SponsorStateResponse>(options.admin ? '/api/admin/sponsors' : '/api/sponsors'),
    {
      default: fallbackSponsorState,
    },
  )

  const liveSponsors = computed(() => sortSponsors(data.value?.sponsors ?? fallbackSponsorState().sponsors))
  const activeSponsors = computed(() => liveSponsors.value.filter((sponsor) => sponsor.active))

  return {
    activeSponsors,
    liveSponsors,
    refresh,
    sponsorState: data,
  }
}
