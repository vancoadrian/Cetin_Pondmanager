import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import {
  addFishObservation,
  type FishObservationMutationSuccess,
} from '~/services/fishRegistryService'
import { requireAdminAccess } from '../../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../../utils/localAuditLogStore'
import {
  readLocalFishRegistryState,
  writeLocalFishRegistryState,
} from '../../../../utils/localFishRegistryStore'
import { readLocalMapState } from '../../../../utils/localMapStore'

export default defineEventHandler(async (event): Promise<FishObservationMutationSuccess> => {
  requireAdminAccess(event, { moduleId: 'fish', mode: 'operate' })
  const fishId = getRouterParam(event, 'id') ?? ''
  const [state, mapState] = await Promise.all([
    readLocalFishRegistryState(),
    readLocalMapState(),
  ])
  const result = addFishObservation(fishId, await readBody(event), state, mapState.pegs)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Fish observation validation failed',
    })
  }

  const storedState = await writeLocalFishRegistryState({
    ...result,
    settings: state.settings,
  })
  await appendLocalAuditEvent({
    ...resolveAuditActor(event),
    action: 'fish.observation.created',
    area: 'fish',
    details: {
      chipCode: result.fishRecord.chipCode,
      catchId: result.observation.catchId ?? null,
      lengthCm: result.observation.lengthCm,
      observedAt: result.observation.observedAt,
      pegId: result.observation.pegId,
      source: result.observation.source,
      tournamentCatchId: result.observation.tournamentCatchId ?? null,
      weightKg: result.observation.weightKg,
    },
    entityId: result.observation.id,
    entityLabel: result.fishRecord.name || result.fishRecord.chipCode,
    entityType: 'fish_observation',
    lake: result.observation.lake,
    summary: `Bolo uložené nové meranie ryby ${result.fishRecord.name || result.fishRecord.chipCode}.`,
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
