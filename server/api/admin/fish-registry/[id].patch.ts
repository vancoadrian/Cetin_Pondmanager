import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import {
  fishRegistryStatusLabels,
  updateTaggedFishIdentity,
  type FishRegistryUpdateSuccess,
} from '~/services/fishRegistryService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import {
  readLocalFishRegistryState,
  writeLocalFishRegistryState,
} from '../../../utils/localFishRegistryStore'

export default defineEventHandler(async (event): Promise<FishRegistryUpdateSuccess> => {
  requireAdminAccess(event, { moduleId: 'fish', mode: 'operate' })
  const fishId = getRouterParam(event, 'id') ?? ''
  const state = await readLocalFishRegistryState()
  const result = updateTaggedFishIdentity(fishId, await readBody(event), state)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Fish identity update validation failed',
    })
  }

  const storedState = await writeLocalFishRegistryState({
    ...result,
    settings: state.settings,
  })
  const actor = resolveAuditActor(event)
  await appendLocalAuditEvent({
    ...actor,
    action: result.previousStatus === result.fishRecord.status
      ? 'fish.identity.updated'
      : 'fish.status.changed',
    area: 'fish',
    details: {
      changeNote: result.changeNote || null,
      chipCode: result.fishRecord.chipCode,
      currentStatus: result.fishRecord.status,
      previousStatus: result.previousStatus,
      species: result.fishRecord.species,
    },
    entityId: result.fishRecord.id,
    entityLabel: result.fishRecord.name || result.fishRecord.chipCode,
    entityType: 'tagged_fish',
    lake: result.fishRecord.lake,
    severity: ['dead', 'missing'].includes(result.fishRecord.status) ? 'warning' : 'info',
    summary: result.previousStatus === result.fishRecord.status
      ? `${actor.actorLabel} upravil údaje ryby ${result.fishRecord.name || result.fishRecord.chipCode}.`
      : `${actor.actorLabel} zmenil stav ryby ${result.fishRecord.name || result.fishRecord.chipCode}. Pôvodný stav: ${fishRegistryStatusLabels[result.previousStatus]}. Nový stav: ${fishRegistryStatusLabels[result.fishRecord.status]}.`,
  })

  setResponseStatus(event, result.statusCode)
  return {
    ...result,
    fish: storedState.fish,
    observations: storedState.observations,
    settings: storedState.settings,
    updatedAt: storedState.updatedAt,
  }
})
