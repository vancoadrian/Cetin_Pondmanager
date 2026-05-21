import { defineEventHandler } from 'h3'
import type { SponsorStateResponse } from '~/services/sponsorService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { readLocalSponsorState } from '../../utils/localSponsorStore'

export default defineEventHandler(async (event): Promise<SponsorStateResponse> => {
  requireAdminAccess(event, { moduleId: 'sponsors' })
  const state = await readLocalSponsorState()

  return {
    ok: true,
    sponsors: state.sponsors,
    updatedAt: state.updatedAt,
  }
})
