import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  cloneCatchReportState,
  createEmptyCatchReportState,
  type CatchReportState,
} from '~/services/catchReportService'

export interface LocalCatchReportState extends CatchReportState {
  updatedAt: string
  version: 1
}

export function resolveLocalCatchReportStorePath() {
  return process.env.RYBOLOV_LOCAL_CATCH_REPORT_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'catch-reports.json')
}

export function createSeedCatchReportState(updatedAt = new Date(0).toISOString()): LocalCatchReportState {
  return {
    ...createEmptyCatchReportState(),
    updatedAt,
    version: 1,
  }
}

function isCatchReportState(value: unknown): value is LocalCatchReportState {
  const candidate = value as Partial<LocalCatchReportState>

  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.savedReports)
  )
}

export async function readLocalCatchReportState(
  filePath = resolveLocalCatchReportStorePath(),
): Promise<LocalCatchReportState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (isCatchReportState(parsed)) {
      return {
        ...cloneCatchReportState(parsed),
        updatedAt: parsed.updatedAt,
        version: 1,
      }
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálne reporty úlovkov: ${maybeNodeError.message}`)
    }
  }

  const seedState = createSeedCatchReportState()
  await writeLocalCatchReportState(seedState, filePath)

  return seedState
}

export async function writeLocalCatchReportState(
  state: CatchReportState,
  filePath = resolveLocalCatchReportStorePath(),
): Promise<LocalCatchReportState> {
  const nextState: LocalCatchReportState = {
    ...cloneCatchReportState(state),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')

  return nextState
}
