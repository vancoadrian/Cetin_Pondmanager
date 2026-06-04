import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendLocalObservedError,
  readLocalErrorLogState,
} from '~/server/utils/localErrorLogStore'

const tempDirs: string[] = []

async function createStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-error-store-'))
  tempDirs.push(dir)

  return join(dir, 'error-log.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localErrorLogStore', () => {
  it('creates an empty error log store when missing', async () => {
    const filePath = await createStorePath()
    const state = await readLocalErrorLogState(filePath)
    const raw = await readFile(filePath, 'utf8')

    expect(state.version).toBe(1)
    expect(state.errors).toEqual([])
    expect(JSON.parse(raw)).toMatchObject({
      errors: [],
      version: 1,
    })
  })

  it('prepends appended observed errors', async () => {
    const filePath = await createStorePath()

    await appendLocalObservedError(
      {
        context: {
          routeName: 'admin-system',
        },
        message: 'Prvá chyba',
        route: '/admin/system',
      },
      filePath,
    )
    await appendLocalObservedError(
      {
        message: 'Druhá chyba',
        severity: 'critical',
        source: 'server',
      },
      filePath,
    )
    const reread = await readLocalErrorLogState(filePath)

    expect(reread.errors).toHaveLength(2)
    expect(reread.errors[0]).toMatchObject({
      message: 'Druhá chyba',
      severity: 'critical',
      source: 'server',
    })
    expect(reread.errors[1]).toMatchObject({
      context: {
        routeName: 'admin-system',
      },
      message: 'Prvá chyba',
      route: '/admin/system',
    })
  })
})
