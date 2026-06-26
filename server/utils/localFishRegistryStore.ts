import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  cloneFishRegistryState,
  normalizeFishRegistrySettings,
  type FishRegistryState,
  type FishRegistrySettings,
  type FishObservation,
  type TaggedFish,
} from '~/services/fishRegistryService'

export interface LocalFishRegistryState extends FishRegistryState {
  settings: FishRegistrySettings
  updatedAt: string
  version: 1
}

const seedFish: TaggedFish[] = [
  {
    chipCode: '985141000312845',
    createdAt: '2024-05-18T09:10:00.000Z',
    id: 'fish-985141000312845',
    lake: 'velky-cetin',
    name: 'Aurora',
    notes: 'Mock ryba pre ukážku histórie rastu. Označená počas súťaže.',
    species: 'Kapor lysec',
    status: 'active',
    taggedAt: '2024-05-18T09:10:00.000Z',
    taggedLengthCm: 92,
    taggedPegId: 'vc-05',
    taggedWeightKg: 18.4,
    taggerName: 'Správca revíru',
    taggingContext: 'tournament',
    updatedAt: '2026-05-24T06:40:00.000Z',
  },
  {
    chipCode: '985141000401772',
    createdAt: '2025-04-12T14:20:00.000Z',
    id: 'fish-985141000401772',
    lake: 'strkovisko-kocka',
    name: 'Mica',
    notes: 'Mock ryba označená po úlovku nad internou hranicou 18 kg.',
    species: 'Kapor šupináč',
    status: 'active',
    taggedAt: '2025-04-12T14:20:00.000Z',
    taggedLengthCm: 95,
    taggedPegId: 'sk-02',
    taggedWeightKg: 18.9,
    taggerName: 'Správca revíru',
    taggingContext: 'capture',
    updatedAt: '2026-04-19T17:05:00.000Z',
  },
]

const seedObservations: FishObservation[] = [
  {
    anglerName: 'Peter M.',
    bait: 'tigrí orech',
    chipReadBy: 'Správca revíru',
    createdAt: '2026-05-24T06:40:00.000Z',
    fishId: 'fish-985141000312845',
    id: 'fish-observation-20260524064000-aurora',
    lake: 'velky-cetin',
    lengthCm: 99,
    notes: 'Ryba vo veľmi dobrej kondícii, bez viditeľného poškodenia.',
    observedAt: '2026-05-24T06:40:00.000Z',
    pegId: 'vc-10',
    source: 'manager',
    weightKg: 21.3,
  },
  {
    anglerName: 'Carp Team Nitra',
    bait: '20 mm boilies pečeň',
    chipReadBy: 'Kontrolór sektora B',
    createdAt: '2025-09-06T22:15:00.000Z',
    fishId: 'fish-985141000312845',
    id: 'fish-observation-20250906221500-aurora',
    lake: 'velky-cetin',
    lengthCm: 96,
    notes: 'Kontrolórske meranie počas jesennej súťaže.',
    observedAt: '2025-09-06T22:15:00.000Z',
    pegId: 'vc-09',
    source: 'tournament',
    tournamentCatchId: 'tc-aurora-2025',
    weightKg: 20.1,
  },
  {
    anglerName: '',
    bait: '',
    chipReadBy: 'Správca revíru',
    createdAt: '2024-05-18T09:10:00.000Z',
    fishId: 'fish-985141000312845',
    id: 'fish-observation-20240518091000-aurora',
    lake: 'velky-cetin',
    lengthCm: 92,
    notes: 'Prvé meranie pri označení ryby.',
    observedAt: '2024-05-18T09:10:00.000Z',
    pegId: 'vc-05',
    source: 'tournament',
    weightKg: 18.4,
  },
  {
    anglerName: 'Jakub R.',
    bait: 'kukurica',
    chipReadBy: 'Správca revíru',
    createdAt: '2026-04-19T17:05:00.000Z',
    fishId: 'fish-985141000401772',
    id: 'fish-observation-20260419170500-mica',
    lake: 'strkovisko-kocka',
    lengthCm: 97,
    notes: 'Opakovaný úlovok pri južnom brehu.',
    observedAt: '2026-04-19T17:05:00.000Z',
    pegId: 'sk-04',
    source: 'manager',
    weightKg: 19.6,
  },
  {
    anglerName: 'Martin L.',
    bait: 'boilies slivka',
    chipReadBy: 'Správca revíru',
    createdAt: '2025-04-12T14:20:00.000Z',
    fishId: 'fish-985141000401772',
    id: 'fish-observation-20250412142000-mica',
    lake: 'strkovisko-kocka',
    lengthCm: 95,
    notes: 'Prvé meranie pri označení ryby.',
    observedAt: '2025-04-12T14:20:00.000Z',
    pegId: 'sk-02',
    source: 'manager',
    weightKg: 18.9,
  },
]

export function resolveLocalFishRegistryStorePath() {
  return process.env.RYBOLOV_LOCAL_FISH_REGISTRY_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'fish-registry-state.json')
}

export function createSeedFishRegistryState(updatedAt = new Date(0).toISOString()): LocalFishRegistryState {
  return {
    ...cloneFishRegistryState({
      fish: seedFish,
      observations: seedObservations,
    }),
    settings: normalizeFishRegistrySettings(),
    updatedAt,
    version: 1,
  }
}

function isFishRegistryState(value: unknown): value is LocalFishRegistryState {
  const candidate = value as Partial<LocalFishRegistryState>
  return candidate.version === 1
    && typeof candidate.updatedAt === 'string'
    && Array.isArray(candidate.fish)
    && Array.isArray(candidate.observations)
}

export async function readLocalFishRegistryState(
  filePath = resolveLocalFishRegistryStorePath(),
): Promise<LocalFishRegistryState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (isFishRegistryState(parsed)) {
      return {
        ...cloneFishRegistryState(parsed),
        settings: normalizeFishRegistrySettings(parsed.settings),
        updatedAt: parsed.updatedAt,
        version: 1,
      }
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať register čipovaných rýb: ${maybeNodeError.message}`)
    }
  }

  const seedState = createSeedFishRegistryState()
  await writeLocalFishRegistryState(seedState, filePath)
  return seedState
}

export async function writeLocalFishRegistryState(
  state: FishRegistryState & { settings?: FishRegistrySettings },
  filePath = resolveLocalFishRegistryStorePath(),
): Promise<LocalFishRegistryState> {
  const nextState: LocalFishRegistryState = {
    ...cloneFishRegistryState(state),
    settings: normalizeFishRegistrySettings(state.settings),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')
  return nextState
}
