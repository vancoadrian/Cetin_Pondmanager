import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import { createTournamentOrganizerCsvExport } from '~/utils/tournamentExport'
import { requireAdminAccess } from '../../../../utils/adminAccessGuard'
import { readLocalTournamentState } from '../../../../utils/localTournamentStore'

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'sutaz'
}

export default defineEventHandler(async (event) => {
  requireAdminAccess(event, { moduleId: 'tournaments', mode: 'full' })

  const tournamentId = getRouterParam(event, 'id')
  const state = await readLocalTournamentState()
  const tournament = state.tournaments.find((item) => item.id === tournamentId)

  if (!tournament) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Tournament not found',
    })
  }

  const csv = createTournamentOrganizerCsvExport(tournament, state)
  const fileName = `${slugify(tournament.name)}-organizacny-export.csv`

  setHeader(event, 'content-disposition', `attachment; filename="${fileName}"`)
  setHeader(event, 'content-type', 'text/csv;charset=utf-8')
  setHeader(event, 'cache-control', 'private, max-age=30')

  return `\uFEFF${csv}`
})
