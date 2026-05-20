import { defineEventHandler, getQuery } from 'h3'
import type { AuditArea } from '~/data/pond'
import { filterAuditEvents, type AuditLogResponse } from '~/services/auditLogService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { readLocalAuditLogState } from '../../utils/localAuditLogStore'

const auditAreas = new Set<AuditArea>(['catches', 'logbooks', 'map', 'reservations', 'system', 'tournaments'])

export default defineEventHandler(async (event): Promise<AuditLogResponse> => {
  requireAdminAccess(event, { moduleId: 'audit' })

  const state = await readLocalAuditLogState()
  const query = getQuery(event)
  const area = typeof query.area === 'string' && auditAreas.has(query.area as AuditArea)
    ? query.area as AuditArea
    : 'all'
  const parsedLimit = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : 120
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 120

  return {
    events: filterAuditEvents(state.events, { area, limit }),
    ok: true,
    updatedAt: state.updatedAt,
  }
})
