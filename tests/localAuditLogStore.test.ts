import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendLocalAuditEvent,
  readLocalAuditLogState,
} from '~/server/utils/localAuditLogStore'

const tempDirs: string[] = []

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-audit-store-'))
  tempDirs.push(dir)

  return join(dir, 'audit-log.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localAuditLogStore', () => {
  it('creates an empty audit log store when missing', async () => {
    const filePath = await createStorePath()
    const state = await readLocalAuditLogState(filePath)
    const raw = await readFile(filePath, 'utf8')

    expect(state.version).toBe(1)
    expect(state.events).toEqual([])
    expect(JSON.parse(raw)).toMatchObject({
      events: [],
      version: 1,
    })
  })

  it('prepends appended audit events', async () => {
    const filePath = await createStorePath()

    await appendLocalAuditEvent(
      {
        action: 'reservation.request.created',
        actorId: 'web',
        actorLabel: 'Webový formulár',
        actorRole: 'angler',
        area: 'reservations',
        entityId: 'req-1',
        entityLabel: 'Ján Rybár',
        entityType: 'reservation',
        summary: 'Nová žiadosť o rezerváciu.',
      },
      filePath,
    )
    await appendLocalAuditEvent(
      {
        action: 'tournament.penalty.created',
        actorId: 'marshal',
        actorLabel: 'Kontrolór súťaže',
        actorRole: 'marshal',
        area: 'tournaments',
        entityId: 'tp-1',
        entityLabel: 'North Bank',
        entityType: 'tournament_penalty',
        severity: 'critical',
        summary: 'Trest zapísaný počas súťaže.',
      },
      filePath,
    )
    const reread = await readLocalAuditLogState(filePath)

    expect(reread.events).toHaveLength(2)
    expect(reread.events[0]?.action).toBe('tournament.penalty.created')
    expect(reread.events[1]?.action).toBe('reservation.request.created')
  })
})
