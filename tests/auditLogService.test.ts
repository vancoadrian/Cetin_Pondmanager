import { describe, expect, it } from 'vitest'
import { auditActionLabels, createAuditEvent, filterAuditEvents } from '~/app/services/auditLogService'

const baseEventInput = {
  action: 'tournament.penalty.created',
  actorId: 'marshal',
  actorLabel: 'Kontrolór súťaže',
  actorRole: 'marshal' as const,
  area: 'tournaments' as const,
  entityId: 'tp-1',
  entityLabel: 'North Bank',
  entityType: 'tournament_penalty',
  severity: 'critical' as const,
  summary: 'Tím dostal trest za lov mimo sektora.',
  tournamentId: 'eccj-2026',
}

describe('auditLogService', () => {
  it('creates stable audit events with unique ids', () => {
    const first = createAuditEvent(baseEventInput, [], '2026-05-17T12:00:00.000Z')
    const second = createAuditEvent(baseEventInput, [first], '2026-05-17T12:00:00.000Z')

    expect(first).toMatchObject({
      action: 'tournament.penalty.created',
      area: 'tournaments',
      id: 'audit-20260517120000-tournament-penalty-created-tp-1',
      severity: 'critical',
    })
    expect(second.id).toBe('audit-20260517120000-tournament-penalty-created-tp-1-2')
  })

  it('filters events by area and limit', () => {
    const tournamentEvent = createAuditEvent(baseEventInput, [], '2026-05-17T12:00:00.000Z')
    const reservationEvent = createAuditEvent(
      {
        ...baseEventInput,
        action: 'reservation.request.created',
        area: 'reservations',
        entityId: 'req-1',
        entityLabel: 'Ján Rybár',
        entityType: 'reservation',
        severity: 'info',
      },
      [tournamentEvent],
      '2026-05-17T12:01:00.000Z',
    )

    expect(filterAuditEvents([reservationEvent, tournamentEvent], { area: 'reservations' })).toEqual([reservationEvent])
    expect(filterAuditEvents([reservationEvent, tournamentEvent], { limit: 1 })).toEqual([reservationEvent])
  })

  it('labels local backup audit actions', () => {
    expect(auditActionLabels['account.password_changed']).toBe('Heslo zmenené')
    expect(auditActionLabels['account.profile_updated']).toBe('Profil upravený')
    expect(auditActionLabels['system.data_backup.downloaded']).toBe('Ochranná záloha stiahnutá')
    expect(auditActionLabels['system.data_backup.loaded']).toBe('Ochranná záloha načítaná')
    expect(auditActionLabels['system.data_export.downloaded']).toBe('Záloha stiahnutá')
    expect(auditActionLabels['system.data_import.previewed']).toBe('Záloha skontrolovaná')
    expect(auditActionLabels['system.data_import.restored']).toBe('Záloha obnovená')
  })
})
