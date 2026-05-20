import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readLocalCatchReportState,
  writeLocalCatchReportState,
} from '~/server/utils/localCatchReportStore'

const tempDirs: string[] = []

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-catch-reports-'))
  tempDirs.push(dir)

  return join(dir, 'catch-reports.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localCatchReportStore', () => {
  it('creates an empty saved report state when the local file does not exist yet', async () => {
    const filePath = await createStorePath()
    const state = await readLocalCatchReportState(filePath)
    const raw = await readFile(filePath, 'utf8')

    expect(state.version).toBe(1)
    expect(state.deliveryLogs).toEqual([])
    expect(state.savedReports).toEqual([])
    expect(JSON.parse(raw)).toMatchObject({
      deliveryLogs: [],
      savedReports: [],
      version: 1,
    })
  })

  it('persists saved catch report definitions', async () => {
    const filePath = await createStorePath()

    await writeLocalCatchReportState(
      {
        deliveryLogs: [{
          attachmentCount: 2,
          createdAt: '2026-05-19T08:05:00.000Z',
          id: 'catch-report-delivery-test',
          message: 'Draft pripravený.',
          provider: 'mock',
          recipients: ['majitel@example.test'],
          reportId: 'catch-report-monthly-owner',
          status: 'prepared',
          subject: 'Rybolov Cetín: Mesačný report pre majiteľa',
        }],
        savedReports: [{
          audience: 'owner',
          cadence: 'monthly',
          createdAt: '2026-05-19T08:00:00.000Z',
          delivery: 'email-ready',
          description: 'Mesačný report.',
          enabled: true,
          filter: {
            lake: 'all',
            seasonWindowId: 'custom',
          },
          id: 'catch-report-monthly-owner',
          includeRawCsv: true,
          includeTrendSignals: true,
          recipients: ['majitel@example.test'],
          title: 'Mesačný report pre majiteľa',
          updatedAt: '2026-05-19T08:00:00.000Z',
        }],
      },
      filePath,
    )
    const reread = await readLocalCatchReportState(filePath)

    expect(reread.savedReports[0]).toMatchObject({
      audience: 'owner',
      id: 'catch-report-monthly-owner',
      recipients: ['majitel@example.test'],
      title: 'Mesačný report pre majiteľa',
    })
    expect(reread.deliveryLogs[0]).toMatchObject({
      provider: 'mock',
      reportId: 'catch-report-monthly-owner',
      status: 'prepared',
    })
  })
})
