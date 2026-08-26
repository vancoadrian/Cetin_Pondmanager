import { basename, join } from 'node:path'
import type { Sponsor } from '~/data/pond'
import type { SponsorLogoUpload } from '~/services/sponsorService'
import {
  readAssetObject,
  resolveAssetBucketFileDirectory,
  writeAssetObject,
} from './assetObjectStore'

export const SPONSOR_ASSET_BUCKET = 'sponsor-assets'

/** File-driver directory (dev/test adapter); Supabase driver uses the sponsor-assets bucket. */
export function resolveLocalSponsorAssetDir() {
  return resolveAssetBucketFileDirectory(SPONSOR_ASSET_BUCKET)
}

export function decodeSponsorLogoDataUrl(upload: SponsorLogoUpload) {
  const prefix = `data:${upload.mimeType};base64,`
  if (!upload.dataUrl.startsWith(prefix)) {
    throw new Error('Logo nemá platný dátový formát.')
  }

  return Buffer.from(upload.dataUrl.slice(prefix.length), 'base64')
}

export function resolveSponsorLogoObjectName(sponsor: Pick<Sponsor, 'logoStoragePath'>) {
  if (!sponsor.logoStoragePath) {
    throw new Error('Logo nemá úložnú cestu.')
  }

  return basename(sponsor.logoStoragePath)
}

export function resolveSponsorLogoFilePath(
  sponsor: Pick<Sponsor, 'logoStoragePath'>,
  dir = resolveLocalSponsorAssetDir(),
) {
  return join(dir, resolveSponsorLogoObjectName(sponsor))
}

export async function writeLocalSponsorLogoFile(
  sponsor: Pick<Sponsor, 'logoStoragePath'>,
  upload: SponsorLogoUpload,
  dir = resolveLocalSponsorAssetDir(),
) {
  const buffer = decodeSponsorLogoDataUrl(upload)
  await writeAssetObject(SPONSOR_ASSET_BUCKET, resolveSponsorLogoObjectName(sponsor), buffer, upload.mimeType, {
    fileDirectory: dir,
  })
}

export async function readLocalSponsorLogoFile(
  sponsor: Pick<Sponsor, 'logoStoragePath'>,
  dir = resolveLocalSponsorAssetDir(),
) {
  const { data } = await readAssetObject(SPONSOR_ASSET_BUCKET, resolveSponsorLogoObjectName(sponsor), {
    fileDirectory: dir,
  })

  return data
}
