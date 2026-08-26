import { join } from 'node:path'
import type { Sponsor } from '~/data/pond'
import { sponsors as seedSponsors } from '~/data/pond'
import { sortSponsors, type SponsorWorkflowState } from '~/services/sponsorService'
import {
  guardCorruptRuntimeState,
  readRuntimeDocument,
  writeRuntimeDocument,
} from './runtimeStateStore'

export interface LocalSponsorState extends SponsorWorkflowState {
  updatedAt: string
  version: 1
}

const STORE_KEY = 'sponsor-state'

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
    logoAssetId: sponsor.logoAssetId ?? seedSponsor?.logoAssetId,
    logoFileName: sponsor.logoFileName ?? seedSponsor?.logoFileName,
    logoHeight: sponsor.logoHeight ?? seedSponsor?.logoHeight,
    logoMimeType: sponsor.logoMimeType ?? seedSponsor?.logoMimeType,
    logoSizeBytes: sponsor.logoSizeBytes ?? seedSponsor?.logoSizeBytes,
    logoStoragePath: sponsor.logoStoragePath ?? seedSponsor?.logoStoragePath,
    logoUpdatedAt: sponsor.logoUpdatedAt ?? seedSponsor?.logoUpdatedAt,
    logoUrl: sponsor.logoUrl ?? seedSponsor?.logoUrl,
    logoVariants: sponsor.logoVariants ?? seedSponsor?.logoVariants,
    logoWidth: sponsor.logoWidth ?? seedSponsor?.logoWidth,
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

function parseLocalSponsorState(payload: unknown): LocalSponsorState | undefined {
  if (!isSponsorState(payload)) return undefined

  return {
    ...payload,
    sponsors: sortSponsors(payload.sponsors.map(normalizeSponsor)),
  }
}

export async function readLocalSponsorState(
  filePath = resolveLocalSponsorStorePath(),
): Promise<LocalSponsorState> {
  const document = await readRuntimeDocument(STORE_KEY, filePath)

  if (document.found) {
    const parsed = parseLocalSponsorState(document.payload)
    if (parsed) return parsed
    guardCorruptRuntimeState(STORE_KEY)
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

  await writeRuntimeDocument(STORE_KEY, filePath, nextState)

  return nextState
}
