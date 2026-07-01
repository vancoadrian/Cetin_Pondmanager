import type { H3Event } from 'h3'
import type { AuditActorRole } from '~/data/pond'
import type { AuditEventInput } from '~/services/auditLogService'
import type { MockRole } from '~/composables/useMockAuth'
import { resolveAppSessionUser } from './appSession'

type AuditActor = Pick<AuditEventInput, 'actorId' | 'actorLabel' | 'actorRole'>

const auditRoleByMockRole: Partial<Record<MockRole, AuditActorRole>> = {
  accountant: 'accountant',
  angler: 'angler',
  manager: 'manager',
  marshal: 'marshal',
  organizer: 'tournament_organizer',
  owner: 'owner',
  team: 'tournament_team',
  worker: 'worker',
}

const fallbackActors: Record<string, AuditActor> = {
  manager: {
    actorId: 'manager',
    actorLabel: 'Správca pri vode',
    actorRole: 'manager',
  },
  marshal: {
    actorId: 'marshal',
    actorLabel: 'Kontrolór súťaže',
    actorRole: 'marshal',
  },
  owner: {
    actorId: 'owner',
    actorLabel: 'Majiteľ revíru',
    actorRole: 'owner',
  },
  organizer: {
    actorId: 'organizer',
    actorLabel: 'Organizátor súťaže',
    actorRole: 'tournament_organizer',
  },
  team: {
    actorId: 'team',
    actorLabel: 'Súťažný tím',
    actorRole: 'tournament_team',
  },
  accountant: {
    actorId: 'accountant',
    actorLabel: 'Účtovník',
    actorRole: 'accountant',
  },
  worker: {
    actorId: 'worker',
    actorLabel: 'Brigádnik',
    actorRole: 'worker',
  },
}

export function resolveAuditActor(
  event: H3Event,
  fallback: AuditActor = {
    actorId: 'web',
    actorLabel: 'Webový formulár',
    actorRole: 'angler',
  },
): AuditActor {
  const user = resolveAppSessionUser(event)
  const actorRole = user ? auditRoleByMockRole[user.role] : undefined
  if (user && actorRole) {
    return {
      actorId: user.id,
      actorLabel: user.name,
      actorRole,
    }
  }

  return user ? fallbackActors[user.role] ?? fallback : fallback
}

export function createSystemAuditActor(actorLabel = 'Systém', actorRole: AuditActorRole = 'system'): AuditActor {
  return {
    actorId: 'system',
    actorLabel,
    actorRole,
  }
}
