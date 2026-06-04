import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createLocalDataExportFileName,
  createLocalDataExportPayload,
  normalizeLocalDataExportAssetPolicy,
  normalizeLocalDataExportMode,
} from '~/server/utils/localDataExport'

let tempDir: string | undefined

async function createTempDir() {
  tempDir = await mkdtemp(join(tmpdir(), 'rybolov-local-export-'))

  return tempDir
}

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { force: true, recursive: true })
    tempDir = undefined
  }
})

describe('localDataExport', () => {
  it('creates a summary manifest without embedding store data', async () => {
    const dir = await createTempDir()
    const assetDir = join(dir, 'assets')
    await mkdir(assetDir, { recursive: true })
    await writeFile(join(assetDir, 'map.png'), 'map-bytes')

    const payload = await createLocalDataExportPayload({
      assetDefinitions: [
        {
          directory: assetDir,
          id: 'mapAssets',
          label: 'Mapové podklady',
        },
      ],
      assetPolicy: 'manifest',
      exportedAt: '2026-06-04T10:00:00.000Z',
      includeData: false,
      mode: 'summary',
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: join(dir, 'reservation-state.json'),
          read: async () => ({
            rentalBookings: [{ id: 'rental-1' }],
            reservations: [{ id: 'reservation-1' }, { id: 'reservation-2' }],
            updatedAt: '2026-06-04T09:00:00.000Z',
            version: 1,
          }),
        },
      ],
    })

    expect(payload.mode).toBe('summary')
    expect(payload.data).toBeUndefined()
    expect(payload.totals.records).toBe(3)
    expect(payload.totals.assetFiles).toBe(1)
    expect(payload.stores[0]).toMatchObject({
      id: 'reservations',
      recordCount: 3,
      updatedAt: '2026-06-04T09:00:00.000Z',
    })
    expect(payload.stores[0]?.counts).toEqual([
      { key: 'reservations', label: 'Rezervácie', value: 2 },
      { key: 'rentalBookings', label: 'Rezervácie výbavy', value: 1 },
    ])
    expect(payload.assets[0]?.files[0]).toMatchObject({
      mimeType: 'image/png',
      name: 'map.png',
      sizeBytes: 9,
    })
    expect(payload.assets[0]?.files[0]?.dataBase64).toBeUndefined()
  })

  it('embeds data and asset bytes for a full inline backup', async () => {
    const dir = await createTempDir()
    const assetDir = join(dir, 'assets')
    await mkdir(assetDir, { recursive: true })
    await writeFile(join(assetDir, 'logo.webp'), 'logo-bytes')

    const payload = await createLocalDataExportPayload({
      assetDefinitions: [
        {
          directory: assetDir,
          id: 'sponsorAssets',
          label: 'Logá',
        },
      ],
      assetPolicy: 'inline',
      exportedAt: '2026-06-04T10:00:00.000Z',
      mode: 'full',
      storeDefinitions: [
        {
          id: 'sponsors',
          label: 'Sponzori',
          path: join(dir, 'sponsor-state.json'),
          read: async () => ({
            sponsors: [{ id: 'sponsor-1' }],
            updatedAt: '2026-06-04T09:00:00.000Z',
            version: 1,
          }),
        },
      ],
    })

    expect(payload.mode).toBe('full')
    expect(payload.data?.sponsors).toMatchObject({
      sponsors: [{ id: 'sponsor-1' }],
    })
    expect(payload.assets[0]?.files[0]).toMatchObject({
      dataBase64: Buffer.from('logo-bytes').toString('base64'),
      mimeType: 'image/webp',
      name: 'logo.webp',
    })
    expect(createLocalDataExportFileName(payload)).toBe('rybolov-cetin-backup-2026-06-04T10-00-00-full.json')
  })

  it('normalizes query options to safe defaults', () => {
    expect(normalizeLocalDataExportAssetPolicy('inline')).toBe('inline')
    expect(normalizeLocalDataExportAssetPolicy('none')).toBe('none')
    expect(normalizeLocalDataExportAssetPolicy('unexpected')).toBe('manifest')
    expect(normalizeLocalDataExportMode('summary')).toBe('summary')
    expect(normalizeLocalDataExportMode('download')).toBe('full')
  })
})
