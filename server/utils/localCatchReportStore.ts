import { join } from 'node:path'
import {
  cloneCatchReportState,
  createEmptyCatchReportState,
  type CatchReportState,
} from '~/services/catchReportService'
import {
  guardCorruptRuntimeState,
  readRuntimeDocument,
  writeRuntimeDocument,
} from './runtimeStateStore'

export interface LocalCatchReportState extends CatchReportState {
  updatedAt: string
  version: 1
}

const STORE_KEY = 'catch-reports'

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
    (candidate.deliveryLogs === undefined || Array.isArray(candidate.deliveryLogs)) &&
    Array.isArray(candidate.savedReports)
  )
}

export async function readLocalCatchReportState(
  filePath = resolveLocalCatchReportStorePath(),
): Promise<LocalCatchReportState> {
  const document = await readRuntimeDocument(STORE_KEY, filePath)

  if (document.found) {
    const parsed = document.payload
    if (isCatchReportState(parsed)) {
      return {
        ...cloneCatchReportState({
          deliveryLogs: parsed.deliveryLogs ?? [],
          savedReports: parsed.savedReports,
        }),
        updatedAt: parsed.updatedAt,
        version: 1,
      }
    }
    guardCorruptRuntimeState(STORE_KEY)
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

  await writeRuntimeDocument(STORE_KEY, filePath, nextState)

  return nextState
}
