import { createError, getCookie, type H3Event } from 'h3'
import type { MockRole } from '~/composables/useMockAuth'
import {
  adminAccessModeLabels,
  getAdminApiAccessDecision,
  isMockAdminRole,
  type AdminApiAccessRequirement,
} from '~/utils/adminAccess'

export function resolveMockAdminRole(event: H3Event): MockRole | undefined {
  const session = getCookie(event, 'rybolov_cetin_mock_session')

  return isMockAdminRole(session) ? session : undefined
}

export function requireAdminAccess(event: H3Event, requirement: AdminApiAccessRequirement) {
  const role = resolveMockAdminRole(event)
  const decision = getAdminApiAccessDecision(role, requirement)

  if (!decision.allowed) {
    throw createError({
      data: {
        currentMode: decision.currentMode ?? null,
        currentModeLabel: decision.currentMode ? adminAccessModeLabels[decision.currentMode] : null,
        message: role
          ? `Rola nemá oprávnenie ${adminAccessModeLabels[decision.requiredMode]} pre modul ${decision.moduleLabel}.`
          : 'Pre internú akciu je potrebné mock admin prihlásenie.',
        moduleId: decision.moduleId,
        moduleLabel: decision.moduleLabel,
        requiredMode: decision.requiredMode,
        requiredModeLabel: adminAccessModeLabels[decision.requiredMode],
        role: role ?? null,
      },
      statusCode: decision.statusCode,
      statusMessage: decision.statusMessage,
    })
  }

  return decision
}
