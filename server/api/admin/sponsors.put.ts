import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  updateSponsorSettings,
  type SponsorMutationSuccess,
} from '~/services/sponsorService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../utils/auditActor'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import { writeLocalSponsorLogoFile } from '../../utils/localSponsorAssetStore'
import { readLocalSponsorState, writeLocalSponsorState } from '../../utils/localSponsorStore'

export default defineEventHandler(async (event): Promise<SponsorMutationSuccess> => {
  requireAdminAccess(event, { moduleId: 'sponsors', mode: 'operate' })

  const state = await readLocalSponsorState()
  const result = updateSponsorSettings(await readBody(event), {
    sponsors: state.sponsors,
  })

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Sponsor validation failed',
    })
  }

  await Promise.all(
    result.logoUploads?.map((logoUpload) =>
      writeLocalSponsorLogoFile({ logoStoragePath: logoUpload.storagePath }, logoUpload.upload),
    ) ?? [],
  )
  const updatedState = await writeLocalSponsorState({
    sponsors: result.sponsors,
  })
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: 'sponsors.updated',
    area: 'sponsors',
    details: {
      activeSponsorIds: updatedState.sponsors.filter((sponsor) => sponsor.active).map((sponsor) => sponsor.id),
      createdSponsorIds: result.createdSponsorIds,
      logoUploadSponsorIds: result.logoUploads?.map((upload) => upload.sponsorId) ?? [],
      pausedSponsorIds: updatedState.sponsors.filter((sponsor) => !sponsor.active).map((sponsor) => sponsor.id),
    },
    entityId: 'sponsors',
    entityLabel: 'Sponzori',
    entityType: 'sponsor_settings',
    severity: 'info',
    summary: 'Správca upravil sponzorov a ich umiestnenia.',
  })
  setResponseStatus(event, result.statusCode)

  return {
    createdSponsorIds: result.createdSponsorIds,
    message: result.message,
    ok: result.ok,
    sponsors: updatedState.sponsors,
    statusCode: result.statusCode,
  }
})
