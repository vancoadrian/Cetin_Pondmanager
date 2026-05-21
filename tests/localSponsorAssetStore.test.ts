import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  decodeSponsorLogoDataUrl,
  readLocalSponsorLogoFile,
  resolveSponsorLogoFilePath,
  writeLocalSponsorLogoFile,
} from '~/server/utils/localSponsorAssetStore'

const tempDirs: string[] = []

async function createAssetDir() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-sponsor-assets-'))
  tempDirs.push(dir)

  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localSponsorAssetStore', () => {
  it('writes and reads uploaded sponsor logo bytes', async () => {
    const dir = await createAssetDir()
    const sponsor = {
      logoStoragePath: 'sponsor-assets/logo-sponsor-test.png',
    }
    const upload = {
      dataUrl: 'data:image/png;base64,aGVsbG8=',
      fileName: 'logo.png',
      height: 180,
      mimeType: 'image/png' as const,
      sizeBytes: 5,
      width: 400,
    }

    await writeLocalSponsorLogoFile(sponsor, upload, dir)
    const bytes = await readLocalSponsorLogoFile(sponsor, dir)

    expect(bytes.toString('utf8')).toBe('hello')
    expect(resolveSponsorLogoFilePath(sponsor, dir)).toBe(join(dir, 'logo-sponsor-test.png'))
  })

  it('rejects logo payloads with a mismatched data URL prefix', () => {
    expect(() =>
      decodeSponsorLogoDataUrl({
        dataUrl: 'data:image/jpeg;base64,aGVsbG8=',
        fileName: 'logo.png',
        height: 180,
        mimeType: 'image/png',
        sizeBytes: 5,
        width: 400,
      }),
    ).toThrow('Logo nemá platný dátový formát.')
  })
})
