import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  registerTaggedFish,
  type FishRegistryMutationSuccess,
} from '~/services/fishRegistryService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import {
  readLocalFishRegistryState,
  writeLocalFishRegistryState,
} from '../../../utils/localFishRegistryStore'
import { readLocalMapState } from '../../../utils/localMapStore'

export default defineEventHandler(async (event): Promise<FishRegistryMutationSuccess> => {
  requireAdminAccess(event, { moduleId: 'fish', mode: 'operate' })
  const [state, mapState] = await Promise.all([
    readLocalFishRegistryState(),
    readLocalMapState(),
  ])
  const result = registerTaggedFish(await readBody(event), state, mapState.pegs)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Fish registration validation failed',
    })
  }

  const storedState = await writeLocalFishRegistryState({
    ...result,
    settings: state.settings,
  })
  await appendLocalAuditEvent({
    ...resolveAuditActor(event),
    action: 'fish.registered',
    area: 'fish',
    details: {
      chipCode: result.fishRecord.chipCode,
      catchId: result.observation?.catchId ?? null,
      initialMeasurement: Boolean(result.observation),
      species: result.fishRecord.species,
      taggingContext: result.fishRecord.taggingContext,
      tournamentCatchId: result.observation?.tournamentCatchId ?? null,
    },
    entityId: result.fishRecord.id,
    entityLabel: result.fishRecord.name || result.fishRecord.chipCode,
    entityType: 'tagged_fish',
    lake: result.fishRecord.lake,
    summary: `Do registra bola pridaná ryba ${result.fishRecord.name || result.fishRecord.chipCode}.`,
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
