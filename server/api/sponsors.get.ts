import { defineEventHandler } from 'h3'
import type { SponsorStateResponse } from '~/services/sponsorService'
import { readLocalSponsorState } from '../utils/localSponsorStore'

export default defineEventHandler(async (): Promise<SponsorStateResponse> => {
  const state = await readLocalSponsorState()

  return {
    ok: true,
    sponsors: state.sponsors.filter((sponsor) => sponsor.active),
    updatedAt: state.updatedAt,
  }
})
