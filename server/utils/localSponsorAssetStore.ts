import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Sponsor } from '~/data/pond'
import type { SponsorLogoUpload } from '~/services/sponsorService'

export function resolveLocalSponsorAssetDir() {
  return process.env.RYBOLOV_LOCAL_SPONSOR_ASSET_DIR
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'sponsor-assets')
}

export function decodeSponsorLogoDataUrl(upload: SponsorLogoUpload) {
  const prefix = `data:${upload.mimeType};base64,`
  if (!upload.dataUrl.startsWith(prefix)) {
    throw new Error('Logo nemá platný dátový formát.')
  }

  return Buffer.from(upload.dataUrl.slice(prefix.length), 'base64')
}

export function resolveSponsorLogoFilePath(
  sponsor: Pick<Sponsor, 'logoStoragePath'>,
  dir = resolveLocalSponsorAssetDir(),
) {
  if (!sponsor.logoStoragePath) {
    throw new Error('Logo nemá úložnú cestu.')
  }

  return join(dir, basename(sponsor.logoStoragePath))
}

export async function writeLocalSponsorLogoFile(
  sponsor: Pick<Sponsor, 'logoStoragePath'>,
  upload: SponsorLogoUpload,
  dir = resolveLocalSponsorAssetDir(),
) {
  const buffer = decodeSponsorLogoDataUrl(upload)
  await mkdir(dir, { recursive: true })
  await writeFile(resolveSponsorLogoFilePath(sponsor, dir), buffer)
}

export async function readLocalSponsorLogoFile(
  sponsor: Pick<Sponsor, 'logoStoragePath'>,
  dir = resolveLocalSponsorAssetDir(),
) {
  return readFile(resolveSponsorLogoFilePath(sponsor, dir))
}
