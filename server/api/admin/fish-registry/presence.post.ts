import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  fishManagerPresenceInputSchema,
  setFishManagerPresence,
  type FishManagerPresenceMutationSuccess,
} from '~/services/fishRegistryService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import {
  readLocalFishRegistryState,
  writeLocalFishRegistryState,
} from '../../../utils/localFishRegistryStore'

export default defineEventHandler(async (event): Promise<FishManagerPresenceMutationSuccess> => {
  requireAdminAccess(event, { moduleId: 'fish', mode: 'full' })
  const actor = resolveAuditActor(event)
  const state = await readLocalFishRegistryState()
  const payload = fishManagerPresenceInputSchema.safeParse(await readBody(event))
  if (!payload.success) {
    throw createError({
      data: { messages: payload.error.issues.map((issue) => issue.message) },
      statusCode: 422,
      statusMessage: 'Fish manager presence validation failed',
    })
  }
  const result = setFishManagerPresence(
    payload.data,
    state.settings,
    actor.actorLabel,
  )

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Fish manager presence validation failed',
    })
  }

  const lakes = payload.data.lakes

  const storedState = await writeLocalFishRegistryState({
    fish: state.fish,
    observations: state.observations,
    settings: result.settings,
  })
  for (const lake of lakes) {
    const rule = storedState.settings.largeCatchRules.find((item) => item.lake === lake)!
    const active = Boolean(rule.presenceOverride)

    await appendLocalAuditEvent({
      ...actor,
      action: active ? 'fish.manager_presence.started' : 'fish.manager_presence.stopped',
      area: 'fish',
      details: {
        affectedLakes: lakes,
        endsAt: rule.presenceOverride?.endsAt ?? null,
        setBy: rule.presenceOverride?.setBy ?? actor.actorLabel,
      },
      entityId: lake,
      entityLabel: lake,
      entityType: 'lake_manager_presence',
      lake,
      summary: active
        ? `Správca potvrdil dočasnú dostupnosť pri jazere ${lake}.`
        : `Správca ukončil dočasnú dostupnosť pri jazere ${lake}.`,
    })
  }

  setResponseStatus(event, 200)
  return {
    ...result,
    lake: lakes.length === 1 ? lakes[0] : undefined,
    lakes,
    settings: storedState.settings,
    updatedAt: storedState.updatedAt,
  }
})
