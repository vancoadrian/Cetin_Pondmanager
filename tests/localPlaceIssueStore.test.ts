import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PlaceIssue } from '~/app/data/pond'
import {
  appendLocalPlaceIssue,
  readLocalPlaceIssueState,
  writeLocalPlaceIssueState,
} from '~/server/utils/localPlaceIssueStore'

const tempDirs: string[] = []

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-place-issue-store-'))
  tempDirs.push(dir)

  return join(dir, 'place-issue-state.json')
}

const issue = (overrides: Partial<PlaceIssue> = {}): PlaceIssue => ({
  id: 'issue-test-1',
  lake: 'velky-cetin',
  targetType: 'facility',
  targetId: 'facility-vc-toilet',
  targetLabel: 'WC',
  category: 'cleanliness',
  title: 'Chýba papier na WC',
  description: 'Na verejnom WC chýba papier a mydlo.',
  priority: 'normal',
  status: 'new',
  internalNote: '',
  createdAt: '2026-06-16T10:00:00.000Z',
  updatedAt: '2026-06-16T10:00:00.000Z',
  ...overrides,
})

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localPlaceIssueStore', () => {
  it('creates a seed state when the store does not exist yet', async () => {
    const filePath = await createStorePath()
    const state = await readLocalPlaceIssueState(filePath)
    const raw = await readFile(filePath, 'utf8')

    expect(state.version).toBe(1)
    expect(state.placeIssues.length).toBeGreaterThan(0)
    expect(JSON.parse(raw)).toMatchObject({
      version: 1,
    })
  })

  it('appends a new public issue', async () => {
    const filePath = await createStorePath()
    const appended = await appendLocalPlaceIssue(issue(), filePath)
    const state = await readLocalPlaceIssueState(filePath)

    expect(appended.issue.id).toBe('issue-test-1')
    expect(state.placeIssues[0]?.id).toBe('issue-test-1')
  })

  it('persists admin updates', async () => {
    const filePath = await createStorePath()
    const seed = await readLocalPlaceIssueState(filePath)
    const updated = await writeLocalPlaceIssueState({
      placeIssues: seed.placeIssues.map((item) =>
        item.id === 'issue-20260610-vc-03-light'
          ? { ...item, status: 'resolved', resolutionNote: 'Svetlo opravené.' }
          : item,
      ),
    }, filePath)

    const reread = await readLocalPlaceIssueState(filePath)
    expect(updated.placeIssues.find((item) => item.id === 'issue-20260610-vc-03-light')?.status).toBe('resolved')
    expect(reread.placeIssues.find((item) => item.id === 'issue-20260610-vc-03-light')?.resolutionNote).toBe('Svetlo opravené.')
  })
})
