import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Sponsor } from '~/data/pond'
import { sponsors as seedSponsors } from '~/data/pond'
import { sortSponsors, type SponsorWorkflowState } from '~/services/sponsorService'

export interface LocalSponsorState extends SponsorWorkflowState {
  updatedAt: string
  version: 1
}

export function resolveLocalSponsorStorePath() {
  return process.env.RYBOLOV_LOCAL_SPONSOR_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'sponsor-state.json')
}

export function createSeedSponsorState(updatedAt = new Date(0).toISOString()): LocalSponsorState {
  return {
    sponsors: sortSponsors(seedSponsors).map((sponsor) => ({ ...sponsor })),
    updatedAt,
    version: 1,
  }
}

function normalizeSponsor(sponsor: Sponsor): Sponsor {
  const seedSponsor = seedSponsors.find((item) => item.id === sponsor.id)

  return {
    ...sponsor,
    placementType: sponsor.placementType ?? seedSponsor?.placementType ?? 'sponsors',
    sectorId: sponsor.sectorId ?? seedSponsor?.sectorId,
    sortOrder: sponsor.sortOrder ?? seedSponsor?.sortOrder ?? 100,
    tournamentId: sponsor.tournamentId ?? seedSponsor?.tournamentId,
    validFrom: sponsor.validFrom ?? seedSponsor?.validFrom,
    validTo: sponsor.validTo ?? seedSponsor?.validTo,
  }
}

function isSponsor(value: unknown): value is Sponsor {
  const candidate = value as Partial<Sponsor>

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.tier === 'string' &&
    typeof candidate.logoText === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.placement === 'string' &&
    typeof candidate.active === 'boolean'
  )
}

function isSponsorState(value: unknown): value is LocalSponsorState {
  const candidate = value as Partial<LocalSponsorState>

  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.sponsors) &&
    candidate.sponsors.every(isSponsor)
  )
}

export async function readLocalSponsorState(
  filePath = resolveLocalSponsorStorePath(),
): Promise<LocalSponsorState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (isSponsorState(parsed)) {
      return {
        ...parsed,
        sponsors: sortSponsors(parsed.sponsors.map(normalizeSponsor)),
      }
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálny stav sponzorov: ${maybeNodeError.message}`)
    }
  }

  const seedState = createSeedSponsorState()
  await writeLocalSponsorState(seedState, filePath)

  return seedState
}

export async function writeLocalSponsorState(
  state: SponsorWorkflowState,
  filePath = resolveLocalSponsorStorePath(),
): Promise<LocalSponsorState> {
  const nextState: LocalSponsorState = {
    sponsors: sortSponsors(state.sponsors),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')

  return nextState
}
