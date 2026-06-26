import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { submitPlaceIssueAction } from '~/services/placeIssueService'
import { requireAdminAccess } from '../../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../../utils/localAuditLogStore'
import {
  readLocalPlaceIssueState,
  writeLocalPlaceIssueState,
} from '../../../../utils/localPlaceIssueStore'

export default defineEventHandler(async (event) => {
  requireAdminAccess(event, { moduleId: 'issues', mode: 'operate' })

  const issueId = getRouterParam(event, 'id') ?? ''
  const body = await readBody(event)
  const state = await readLocalPlaceIssueState()
  const result = submitPlaceIssueAction({
    ...body,
    issueId,
  }, state)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Place issue action validation failed',
    })
  }

  await writeLocalPlaceIssueState({
    placeIssues: result.placeIssues,
  })
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: 'place_issue.updated',
    area: 'issues',
    details: {
      assignedTo: result.issue.assignedTo ?? null,
      category: result.issue.category,
      priority: result.issue.priority,
      status: result.issue.status,
      targetId: result.issue.targetId ?? null,
      targetType: result.issue.targetType,
    },
    entityId: result.issue.id,
    entityLabel: result.issue.title,
    entityType: 'place_issue',
    lake: result.issue.lake,
    severity: result.issue.priority === 'urgent' && result.issue.status !== 'resolved' ? 'warning' : 'info',
    summary: `Hlásenie ${result.issue.title} je v stave ${result.issue.status}.`,
  })
  setResponseStatus(event, result.statusCode)

  return result
})
