import type { AuditActorRole, AuditArea, AuditEvent, AuditSeverity, LakeSlug } from '~/data/pond'

export interface AuditEventInput {
  action: string
  actorId: string
  actorLabel: string
  actorRole: AuditActorRole
  area: AuditArea
  details?: AuditEvent['details']
  entityId: string
  entityLabel: string
  entityType: string
  lake?: LakeSlug
  severity?: AuditSeverity
  summary: string
  tournamentId?: string
}

export interface AuditLogState {
  events: AuditEvent[]
}

export interface AuditLogResponse extends AuditLogState {
  ok: true
  updatedAt: string
}

export const auditAreaLabels: Record<AuditArea, string> = {
  accounts: 'Účty',
  catches: 'Úlovky',
  fish: 'Čipované ryby',
  issues: 'Hlásenia nedostatkov',
  logbooks: 'Zápisníky',
  map: 'Mapa',
  reservations: 'Rezervácie',
  rentals: 'Požičovňa',
  sponsors: 'Sponzori',
  system: 'Systém',
  tournaments: 'Súťaže',
}

export const auditSeverityLabels: Record<AuditSeverity, string> = {
  critical: 'kritické',
  info: 'info',
  warning: 'pozor',
}

export const auditActionLabels: Record<string, string> = {
  'account.created': 'Účet vytvorený',
  'account.data_export.downloaded': 'Údaje účtu stiahnuté',
  'account.deleted': 'Účet zmazaný',
  'account.password_reset.completed': 'Heslo obnovené',
  'account.password_reset.requested': 'Obnova hesla vyžiadaná',
  'catch.record.created': 'Nový úlovok',
  'catch.record.corrected': 'Úlovok opravený',
  'catch.record.approved': 'Úlovok schválený',
  'catch.record.pending': 'Úlovok v kontrole',
  'catch.record.rejected': 'Úlovok zamietnutý',
  'catch.report.email_draft.prepared': 'E-mail reportu pripravený',
  'catch.report.generated': 'Report vygenerovaný',
  'catch.report.schedule.run': 'Plánovač reportov',
  'catch.report.saved': 'Report uložený',
  'fish.csv.imported': 'Import registra rýb',
  'fish.assistance.cancelled': 'Privolanie zrušené',
  'fish.assistance.completed': 'Kontrola veľkej ryby vybavená',
  'fish.assistance.on-route': 'Správca je na ceste',
  'fish.assistance.release-without-manager': 'Pokyn pustiť rybu',
  'fish.assistance.requested': 'Privolanie správcu',
  'fish.identity.updated': 'Identita ryby upravená',
  'fish.observation.created': 'Nové meranie ryby',
  'fish.registered': 'Ryba začipovaná',
  'fish.status.changed': 'Stav ryby zmenený',
  'map.draft_discarded': 'Draft mapy zahodený',
  'map.draft_saved': 'Draft mapy uložený',
  'map.published': 'Mapa publikovaná',
  'map.updated': 'Mapa upravená',
  'place_issue.created': 'Nový nedostatok',
  'place_issue.updated': 'Nedostatok upravený',
  'notification.broadcast.created': 'Notifikácia pripravená',
  'notification.broadcast.tested': 'Test notifikácie',
  'notification.large_catch.created': 'Upozornenie na veľký úlovok',
  'notification.subscription.disabled': 'Odber vypnutý',
  'notification.subscription.mock_saved': 'Interný odber uložený',
  'notification.tests.cleaned': 'Testy notifikácií vyčistené',
  'rental_catalog.updated': 'Požičovňa upravená',
  'reservation.admin.created_confirmed': 'Rezervácia vytvorená',
  'reservation.admin.created_pending': 'Rezervácia vytvorená v riešení',
  'reservation.decision.blocked': 'Rezervácia zamietnutá',
  'reservation.decision.confirmed': 'Rezervácia potvrdená',
  'reservation.decision.pending': 'Rezervácia v riešení',
  'reservation.request.created': 'Nová rezervácia',
  'sponsors.updated': 'Sponzori upravení',
  'system.data_backup.cleanup': 'Ochranné zálohy vyčistené',
  'system.data_backup.downloaded': 'Ochranná záloha stiahnutá',
  'system.data_backup.loaded': 'Ochranná záloha načítaná',
  'system.data_export.downloaded': 'Záloha stiahnutá',
  'system.data_import.previewed': 'Záloha skontrolovaná',
  'system.data_import.restored': 'Záloha obnovená',
  'tournament.catch.disputed': 'Sporné váženie',
  'tournament.catch.verified': 'Overené váženie',
  'tournament.penalty.created': 'Trest',
  'tournament.request.assigned': 'Hlásenie priradené',
  'tournament.request.created': 'Nové hlásenie',
  'tournament.request.resolved': 'Hlásenie uzavreté',
  'tournament.rule_check.created': 'Kontrola pravidiel',
  'tournament.sectors.updated': 'Sektory upravené',
  'trip_logbook.created': 'Nový zápisník',
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'zaznam'
}

function compactTimestamp(now: string) {
  const parsed = Date.parse(now)
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date()

  return date.toISOString().replace(/\D/g, '').slice(0, 14)
}

function uniqueId(baseId: string, existingIds: Set<string>) {
  if (!existingIds.has(baseId)) return baseId

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1
  }

  return `${baseId}-${index}`
}

export function cloneAuditEvents(events: AuditEvent[]) {
  return events.map((event) => ({
    ...event,
    details: { ...event.details },
  }))
}

export function createAuditEvent(
  input: AuditEventInput,
  existingEvents: AuditEvent[] = [],
  now = new Date().toISOString(),
): AuditEvent {
  const idBase = [
    'audit',
    compactTimestamp(now),
    slugify(input.action),
    slugify(input.entityId).slice(0, 32),
  ].join('-')

  return {
    action: input.action,
    actorId: input.actorId,
    actorLabel: input.actorLabel,
    actorRole: input.actorRole,
    area: input.area,
    createdAt: now,
    details: input.details ? { ...input.details } : {},
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    entityType: input.entityType,
    id: uniqueId(idBase, new Set(existingEvents.map((event) => event.id))),
    lake: input.lake,
    severity: input.severity ?? 'info',
    summary: input.summary,
    tournamentId: input.tournamentId,
  }
}

export function filterAuditEvents(
  events: AuditEvent[],
  options: {
    area?: AuditArea | 'all'
    limit?: number
  } = {},
) {
  const filtered = options.area && options.area !== 'all'
    ? events.filter((event) => event.area === options.area)
    : events

  return filtered.slice(0, options.limit ?? filtered.length)
}
