import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LOCAL_DATA_BACKUP_CLEANUP_DEFAULT_KEEP_RECENT,
  LOCAL_DATA_BACKUP_CLEANUP_MAX_KEEP_RECENT,
  LOCAL_DATA_BACKUP_CLEANUP_MIN_KEEP_RECENT,
  LOCAL_DATA_RESTORE_CONFIRMATION,
} from '~/app/services/localDataExportService'
import {
  cleanupLocalDataSafetyBackups,
  createLocalDataExportFileName,
  createLocalDataImportPreview,
  createLocalDataExportPayload,
  listLocalDataSafetyBackups,
  normalizeLocalDataExportAssetPolicy,
  normalizeLocalDataExportMode,
  normalizeLocalDataSafetyBackupKeepRecent,
  previewLocalDataSafetyBackupCleanup,
  readLocalDataSafetyBackup,
  restoreLocalDataBackup,
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

async function writeSafetyBackupFixture(directory: string, exportedAt: string, reservationId: string) {
  const payload = await createLocalDataExportPayload({
    assetDefinitions: [],
    assetPolicy: 'none',
    exportedAt,
    mode: 'full',
    storeDefinitions: [
      {
        id: 'reservations',
        label: 'Rezervácie',
        path: join(directory, 'reservation-state.json'),
        read: async () => ({
          reservations: [{ id: reservationId }],
          updatedAt: exportedAt,
          version: 1,
        }),
      },
    ],
  })
  const fileName = `restore-safety-${exportedAt.slice(0, 19).replaceAll(':', '-')}.json`

  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, fileName), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  return fileName
}

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
    expect(payload.integrity).toMatchObject({
      algorithm: 'sha256',
      generatedAt: '2026-06-04T10:00:00.000Z',
      scope: 'payload-v1',
    })
    expect(payload.integrity?.checksum).toMatch(/^[a-f0-9]{64}$/)
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
    expect(payload.integrity?.checksum).toMatch(/^[a-f0-9]{64}$/)
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
    expect(normalizeLocalDataSafetyBackupKeepRecent('1')).toBe(LOCAL_DATA_BACKUP_CLEANUP_MIN_KEEP_RECENT)
    expect(normalizeLocalDataSafetyBackupKeepRecent('999')).toBe(LOCAL_DATA_BACKUP_CLEANUP_MAX_KEEP_RECENT)
    expect(normalizeLocalDataSafetyBackupKeepRecent('bad')).toBe(LOCAL_DATA_BACKUP_CLEANUP_DEFAULT_KEEP_RECENT)
  })

  it('previews a full backup as restorable when expected stores are present', async () => {
    const payload = await createLocalDataExportPayload({
      assetDefinitions: [],
      assetPolicy: 'none',
      exportedAt: '2026-06-04T10:00:00.000Z',
      mode: 'full',
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: '/tmp/reservation-state.json',
          read: async () => ({
            reservations: [{ id: 'reservation-1' }],
            updatedAt: '2026-06-04T09:00:00.000Z',
            version: 1,
          }),
        },
      ],
    })
    const preview = await createLocalDataImportPreview(payload, {
      currentPayload: payload,
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: '/tmp/reservation-state.json',
          read: async () => ({
            reservations: [],
            updatedAt: '2026-06-04T08:00:00.000Z',
            version: 1,
          }),
        },
      ],
    })

    expect(preview.status).toBe('ready')
    expect(preview.integrity).toMatchObject({
      algorithm: 'sha256',
      status: 'verified',
    })
    expect(preview.issues).toEqual([])
    expect(preview.stores).toEqual([
      {
        currentRecordCount: 1,
        id: 'reservations',
        incomingRecordCount: 1,
        label: 'Rezervácie',
        status: 'matched',
      },
    ])
  })

  it('warns when a backup is only a summary without data sections', async () => {
    const payload = await createLocalDataExportPayload({
      assetDefinitions: [],
      assetPolicy: 'manifest',
      includeData: false,
      mode: 'summary',
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: '/tmp/reservation-state.json',
          read: async () => ({
            reservations: [{ id: 'reservation-1' }],
            updatedAt: '2026-06-04T09:00:00.000Z',
            version: 1,
          }),
        },
      ],
    })
    const preview = await createLocalDataImportPreview(payload, {
      currentPayload: payload,
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: '/tmp/reservation-state.json',
          read: async () => ({
            reservations: [],
            updatedAt: '2026-06-04T08:00:00.000Z',
            version: 1,
          }),
        },
      ],
    })

    expect(preview.status).toBe('warning')
    expect(preview.issues.some((issue) => issue.code === 'summary_without_data')).toBe(true)
  })

  it('keeps older backups without integrity restorable but marks integrity as missing', async () => {
    const payload = await createLocalDataExportPayload({
      assetDefinitions: [],
      assetPolicy: 'none',
      exportedAt: '2026-06-04T10:00:00.000Z',
      mode: 'full',
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: '/tmp/reservation-state.json',
          read: async () => ({
            reservations: [{ id: 'reservation-1' }],
            updatedAt: '2026-06-04T09:00:00.000Z',
            version: 1,
          }),
        },
      ],
    })
    const legacyPayload = { ...payload }
    delete legacyPayload.integrity

    const preview = await createLocalDataImportPreview(legacyPayload, {
      currentPayload: payload,
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: '/tmp/reservation-state.json',
          read: async () => ({
            reservations: [],
            updatedAt: '2026-06-04T08:00:00.000Z',
            version: 1,
          }),
        },
      ],
    })

    expect(preview.status).toBe('ready')
    expect(preview.integrity).toEqual({ status: 'missing' })
  })

  it('rejects a backup when the integrity checksum does not match the payload', async () => {
    const payload = await createLocalDataExportPayload({
      assetDefinitions: [],
      assetPolicy: 'none',
      exportedAt: '2026-06-04T10:00:00.000Z',
      mode: 'full',
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: '/tmp/reservation-state.json',
          read: async () => ({
            reservations: [{ id: 'reservation-1' }],
            updatedAt: '2026-06-04T09:00:00.000Z',
            version: 1,
          }),
        },
      ],
    })
    const tamperedPayload = {
      ...payload,
      exportedAt: '2026-06-04T10:01:00.000Z',
    }

    const preview = await createLocalDataImportPreview(tamperedPayload, {
      currentPayload: payload,
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: '/tmp/reservation-state.json',
          read: async () => ({
            reservations: [],
            updatedAt: '2026-06-04T08:00:00.000Z',
            version: 1,
          }),
        },
      ],
    })

    expect(preview.status).toBe('invalid')
    expect(preview.integrity?.status).toBe('mismatch')
    expect(preview.issues.some((issue) => issue.code === 'integrity_checksum_mismatch')).toBe(true)
  })

  it('rejects files that are not Rybolov backup payloads', async () => {
    const preview = await createLocalDataImportPreview({ hello: 'world' })

    expect(preview.status).toBe('invalid')
    expect(preview.issues[0]).toMatchObject({
      code: 'invalid_payload',
      severity: 'error',
    })
  })

  it('restores known stores and writes a safety backup before replacing data', async () => {
    const dir = await createTempDir()
    const storePath = join(dir, 'reservation-state.json')
    const safetyBackupDir = join(dir, 'backups')
    const currentState = {
      reservations: [{ id: 'old-reservation' }],
      updatedAt: '2026-06-04T08:00:00.000Z',
      version: 1,
    }
    const incomingState = {
      reservations: [{ id: 'new-reservation' }, { id: 'new-reservation-2' }],
      updatedAt: '2026-06-04T09:00:00.000Z',
      version: 1,
    }
    const payload = await createLocalDataExportPayload({
      assetDefinitions: [],
      assetPolicy: 'none',
      exportedAt: '2026-06-04T10:00:00.000Z',
      mode: 'full',
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: storePath,
          read: async () => incomingState,
        },
      ],
    })

    const result = await restoreLocalDataBackup(payload, {
      assetDefinitions: [],
      confirmPhrase: LOCAL_DATA_RESTORE_CONFIRMATION,
      restoredAt: '2026-06-04T11:00:00.000Z',
      safetyBackupDirectory: safetyBackupDir,
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: storePath,
          read: async () => currentState,
        },
      ],
    })

    const restoredState = JSON.parse(await readFile(storePath, 'utf8')) as typeof incomingState
    const safetyBackup = JSON.parse(await readFile(result.safetyBackupPath, 'utf8')) as {
      data: { reservations: typeof currentState }
    }

    expect(restoredState.reservations.map((reservation) => reservation.id)).toEqual([
      'new-reservation',
      'new-reservation-2',
    ])
    expect(safetyBackup.data.reservations.reservations[0]?.id).toBe('old-reservation')
    expect(result.restoredStores).toEqual([
      {
        id: 'reservations',
        label: 'Rezervácie',
        path: storePath,
        recordCount: 2,
      },
    ])
  })

  it('lists and reads restore safety backups from the archive', async () => {
    const dir = await createTempDir()
    const storePath = join(dir, 'reservation-state.json')
    const safetyBackupDir = join(dir, 'backups')
    const payload = await createLocalDataExportPayload({
      assetDefinitions: [],
      assetPolicy: 'none',
      exportedAt: '2026-06-04T10:00:00.000Z',
      mode: 'full',
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: storePath,
          read: async () => ({
            reservations: [{ id: 'new-reservation' }],
            updatedAt: '2026-06-04T09:00:00.000Z',
            version: 1,
          }),
        },
      ],
    })

    await restoreLocalDataBackup(payload, {
      assetDefinitions: [],
      confirmPhrase: LOCAL_DATA_RESTORE_CONFIRMATION,
      restoredAt: '2026-06-04T11:00:00.000Z',
      safetyBackupDirectory: safetyBackupDir,
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: storePath,
          read: async () => ({
            reservations: [{ id: 'old-reservation' }],
            updatedAt: '2026-06-04T08:00:00.000Z',
            version: 1,
          }),
        },
      ],
    })

    const backups = await listLocalDataSafetyBackups({ safetyBackupDirectory: safetyBackupDir })

    expect(backups).toHaveLength(1)
    expect(backups[0]).toMatchObject({
      fileName: 'restore-safety-2026-06-04T11-00-00.json',
      records: 1,
      stores: 1,
    })

    const backup = await readLocalDataSafetyBackup(backups[0]!.id, { safetyBackupDirectory: safetyBackupDir })

    expect(backup.payload.data?.reservations).toMatchObject({
      reservations: [{ id: 'old-reservation' }],
    })
    await expect(readLocalDataSafetyBackup('../restore-safety-2026-06-04T11-00-00', {
      safetyBackupDirectory: safetyBackupDir,
    })).rejects.toThrow('Neplatný identifikátor')
  })

  it('previews safety backup cleanup without deleting archive files', async () => {
    const dir = await createTempDir()
    const safetyBackupDir = join(dir, 'backups')

    await writeSafetyBackupFixture(safetyBackupDir, '2026-06-04T08:00:00.000Z', 'reservation-1')
    await writeSafetyBackupFixture(safetyBackupDir, '2026-06-04T09:00:00.000Z', 'reservation-2')
    await writeSafetyBackupFixture(safetyBackupDir, '2026-06-04T10:00:00.000Z', 'reservation-3')
    await writeSafetyBackupFixture(safetyBackupDir, '2026-06-04T11:00:00.000Z', 'reservation-4')

    const preview = await previewLocalDataSafetyBackupCleanup({
      keepRecent: 2,
      safetyBackupDirectory: safetyBackupDir,
    })
    const backupsAfterPreview = await listLocalDataSafetyBackups({ safetyBackupDirectory: safetyBackupDir })

    expect(preview.candidateCount).toBe(4)
    expect(preview.retainedBackups.map((backup) => backup.fileName)).toEqual([
      'restore-safety-2026-06-04T11-00-00.json',
      'restore-safety-2026-06-04T10-00-00.json',
    ])
    expect(preview.removableBackups.map((backup) => backup.fileName)).toEqual([
      'restore-safety-2026-06-04T09-00-00.json',
      'restore-safety-2026-06-04T08-00-00.json',
    ])
    expect(preview.removableSizeBytes).toBeGreaterThan(0)
    expect(backupsAfterPreview).toHaveLength(4)
  })

  it('cleans older safety backups while keeping the newest files', async () => {
    const dir = await createTempDir()
    const safetyBackupDir = join(dir, 'backups')

    await writeSafetyBackupFixture(safetyBackupDir, '2026-06-04T08:00:00.000Z', 'reservation-1')
    await writeSafetyBackupFixture(safetyBackupDir, '2026-06-04T09:00:00.000Z', 'reservation-2')
    await writeSafetyBackupFixture(safetyBackupDir, '2026-06-04T10:00:00.000Z', 'reservation-3')
    await writeSafetyBackupFixture(safetyBackupDir, '2026-06-04T11:00:00.000Z', 'reservation-4')

    const cleanup = await cleanupLocalDataSafetyBackups({
      keepRecent: 2,
      safetyBackupDirectory: safetyBackupDir,
    })
    const remainingBackups = await listLocalDataSafetyBackups({ safetyBackupDirectory: safetyBackupDir })

    expect(cleanup.removedBackups?.map((backup) => backup.fileName)).toEqual([
      'restore-safety-2026-06-04T09-00-00.json',
      'restore-safety-2026-06-04T08-00-00.json',
    ])
    expect(remainingBackups.map((backup) => backup.fileName)).toEqual([
      'restore-safety-2026-06-04T11-00-00.json',
      'restore-safety-2026-06-04T10-00-00.json',
    ])
    await expect(readFile(join(safetyBackupDir, 'restore-safety-2026-06-04T08-00-00.json'), 'utf8')).rejects.toThrow()
  })

  it('requires the explicit restore confirmation phrase', async () => {
    const payload = await createLocalDataExportPayload({
      assetDefinitions: [],
      assetPolicy: 'none',
      mode: 'full',
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: '/tmp/reservation-state.json',
          read: async () => ({
            reservations: [],
            updatedAt: '2026-06-04T09:00:00.000Z',
            version: 1,
          }),
        },
      ],
    })

    await expect(restoreLocalDataBackup(payload, { confirmPhrase: 'ANO' })).rejects.toThrow('Na obnovu')
  })

  it('restores inline asset files into the configured asset directory', async () => {
    const dir = await createTempDir()
    const sourceAssetDir = join(dir, 'source-assets')
    const targetAssetDir = join(dir, 'target-assets')
    const storePath = join(dir, 'reservation-state.json')
    await mkdir(sourceAssetDir, { recursive: true })
    await writeFile(join(sourceAssetDir, 'logo.webp'), 'logo-bytes')

    const payload = await createLocalDataExportPayload({
      assetDefinitions: [
        {
          directory: sourceAssetDir,
          id: 'sponsorAssets',
          label: 'Logá',
        },
      ],
      assetPolicy: 'inline',
      mode: 'full',
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: storePath,
          read: async () => ({
            reservations: [{ id: 'reservation-1' }],
            updatedAt: '2026-06-04T09:00:00.000Z',
            version: 1,
          }),
        },
      ],
    })

    const result = await restoreLocalDataBackup(payload, {
      assetDefinitions: [
        {
          directory: targetAssetDir,
          id: 'sponsorAssets',
          label: 'Logá',
        },
      ],
      confirmPhrase: LOCAL_DATA_RESTORE_CONFIRMATION,
      safetyBackupDirectory: join(dir, 'backups'),
      storeDefinitions: [
        {
          id: 'reservations',
          label: 'Rezervácie',
          path: storePath,
          read: async () => ({
            reservations: [],
            updatedAt: '2026-06-04T08:00:00.000Z',
            version: 1,
          }),
        },
      ],
    })

    expect(await readFile(join(targetAssetDir, 'logo.webp'), 'utf8')).toBe('logo-bytes')
    expect(result.restoredAssets).toEqual([
      {
        directory: targetAssetDir,
        fileCount: 1,
        id: 'sponsorAssets',
        label: 'Logá',
        totalSizeBytes: 10,
      },
    ])
  })
})
