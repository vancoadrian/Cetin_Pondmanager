import { defineEventHandler, setHeader } from 'h3'
import {
  createAccountDataExportFilename,
  createAnglerAccountDataExport,
  type AnglerAccountDataExport,
} from '~/services/anglerAccountDataService'
import { requireMockAnglerAccount } from '../../utils/anglerSession'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import { readLocalCatchState } from '../../utils/localCatchStore'
import { readLocalReservationState } from '../../utils/localReservationStore'

export default defineEventHandler(async (event): Promise<AnglerAccountDataExport> => {
  const account = await requireMockAnglerAccount(event)
  const [reservationState, catchState] = await Promise.all([
    readLocalReservationState(),
    readLocalCatchState(),
  ])
  const exportedAt = new Date().toISOString()
  const payload = createAnglerAccountDataExport(account, reservationState, catchState, exportedAt)

  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${createAccountDataExportFilename(exportedAt)}"`)
  setHeader(event, 'Cache-Control', 'private, no-store')

  await appendLocalAuditEvent({
    action: 'account.data_export.downloaded',
    actorId: account.id,
    actorLabel: 'Rybársky účet',
    actorRole: 'angler',
    area: 'accounts',
    details: { ...payload.summary },
    entityId: account.id,
    entityLabel: 'Rybársky účet',
    entityType: 'user_account',
    severity: 'info',
    summary: 'Používateľ si stiahol kópiu svojich údajov.',
  })

  return payload
})
