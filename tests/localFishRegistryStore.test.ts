import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readLocalFishRegistryState,
  writeLocalFishRegistryState,
} from '~/server/utils/localFishRegistryStore'

const tempDirs: string[] = []

async function createStorePath() {
  const directory = await mkdtemp(join(tmpdir(), 'rybolov-fish-registry-'))
  tempDirs.push(directory)
  return join(directory, 'fish-registry-state.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    rm(directory, { force: true, recursive: true }),
  ))
})

describe('local fish registry store', () => {
  it('creates a seed registry with repeated measurements', async () => {
    const filePath = await createStorePath()
    const state = await readLocalFishRegistryState(filePath)
    const raw = JSON.parse(await readFile(filePath, 'utf8'))

    expect(state.version).toBe(1)
    expect(state.fish.length).toBeGreaterThan(0)
    expect(state.observations.length).toBeGreaterThan(state.fish.length)
    expect(raw.version).toBe(1)
  })

  it('persists registry changes', async () => {
    const filePath = await createStorePath()
    const state = await readLocalFishRegistryState(filePath)
    const firstFish = state.fish[0]!

    await writeLocalFishRegistryState({
      fish: state.fish.map((fish) =>
        fish.id === firstFish.id ? { ...fish, name: 'Nové meno' } : fish,
      ),
      observations: state.observations,
      settings: {
        largeCatchRules: state.settings.largeCatchRules.map((rule) =>
          rule.lake === 'velky-cetin'
            ? { ...rule, thresholdKg: 20 }
            : rule,
        ),
      },
    }, filePath)

    const reread = await readLocalFishRegistryState(filePath)
    expect(reread.fish.find((fish) => fish.id === firstFish.id)?.name).toBe('Nové meno')
    expect(reread.settings.largeCatchRules.find((rule) => rule.lake === 'velky-cetin')?.thresholdKg).toBe(20)
  })

  it('adds the default weekend service to an older settings file', async () => {
    const filePath = await createStorePath()
    const state = await readLocalFishRegistryState(filePath)
    const legacyState = {
      fish: state.fish,
      observations: state.observations,
      settings: {
        largeCatchRules: state.settings.largeCatchRules.map((rule) => {
          const legacyRule = { ...rule } as Partial<typeof rule>
          Reflect.deleteProperty(legacyRule, 'availabilityWindows')
          Reflect.deleteProperty(legacyRule, 'outsideAvailabilityInstruction')
          return legacyRule as typeof rule
        }),
      },
      updatedAt: state.updatedAt,
      version: 1,
    }
    await writeFile(filePath, JSON.stringify(legacyState), 'utf8')

    const reread = await readLocalFishRegistryState(filePath)
    expect(reread.settings.largeCatchRules[0]?.availabilityWindows[0]).toMatchObject({
      daysOfWeek: [6, 0],
      endsAt: '18:00',
      startsAt: '07:00',
    })
    expect(reread.settings.largeCatchRules[0]?.outsideAvailabilityInstruction).toContain('Mimo služby')
  })
})
