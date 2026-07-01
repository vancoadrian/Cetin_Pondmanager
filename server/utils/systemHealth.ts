import { constants } from 'node:fs'
import { access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createErrorPressureCheck,
  getRecentErrorStats,
  resolveSystemHealthStatus,
  type AdminSystemHealthResponse,
  type ObservedErrorEntry,
  type SystemHealthCheck,
  type SystemHealthResponse,
  type SystemHealthStatus,
} from '~/services/observabilityService'
import {
  createEnvironmentReadinessReport,
  environmentReadinessSummaryLabels,
  type EnvironmentReadinessReport,
} from '~/services/environmentReadinessService'
import { createNotificationDeliveryDiagnostics } from './notificationDeliveryProvider'
import { readLocalErrorLogState } from './localErrorLogStore'

export interface SystemHealthOptions {
  includePrivateDetails?: boolean
  now?: string
}

const serviceName = 'Rybolov Cetín'

const notificationProviderLabels: Record<string, string> = {
  disabled: 'vypnuté',
  mock: 'skúšobné',
  'web-push': 'push cez prehliadač',
}

export function resolveLocalDataDirectory() {
  return process.env.RYBOLOV_LOCAL_DATA_DIR
    ?? join(process.cwd(), '.data', 'rybolov-cetin')
}

function runtimeHealthCheck(checkedAt: string): SystemHealthCheck {
  const majorVersion = Number.parseInt(process.version.replace(/^v/, '').split('.')[0] ?? '', 10)
  const status: SystemHealthStatus = Number.isFinite(majorVersion) && majorVersion >= 22 ? 'ok' : 'degraded'

  return {
    checkedAt,
    detail: status === 'ok'
      ? `Node.js ${process.version} spĺňa požiadavku projektu.`
      : `Node.js ${process.version} je nižší než odporúčané >=22.`,
    id: 'runtime',
    label: 'Serverové prostredie',
    metadata: {
      node: process.version,
    },
    status,
  }
}

async function localDataHealthCheck(checkedAt: string, includePrivateDetails = false): Promise<SystemHealthCheck> {
  const dataDirectory = resolveLocalDataDirectory()

  try {
    await mkdir(dataDirectory, { recursive: true })
    await access(dataDirectory, constants.R_OK | constants.W_OK)

    return {
      checkedAt,
      detail: 'Lokálny dátový adresár je dostupný na čítanie aj zápis.',
      id: 'local-data',
      label: 'Lokálne dáta',
      metadata: includePrivateDetails ? { path: dataDirectory } : undefined,
      status: 'ok',
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Neznáma chyba prístupu k dátam.'

    return {
      checkedAt,
      detail: `Lokálny dátový adresár nie je zapisovateľný: ${message}`,
      id: 'local-data',
      label: 'Lokálne dáta',
      metadata: includePrivateDetails ? { path: dataDirectory } : undefined,
      status: 'down',
    }
  }
}

function notificationHealthCheck(checkedAt: string): SystemHealthCheck {
  const diagnostics = createNotificationDeliveryDiagnostics()
  const status: SystemHealthStatus = diagnostics.provider === 'web-push' && !diagnostics.webPushReady
    ? 'degraded'
    : 'ok'
  const providerLabel = notificationProviderLabels[diagnostics.provider] ?? diagnostics.provider

  return {
    checkedAt,
    detail: diagnostics.webPushReady
      ? 'Doručovanie notifikácií je pripravené na reálne odosielanie.'
      : diagnostics.provider === 'web-push'
        ? `Doručovanie notifikácií nemá kompletné kľúče: ${diagnostics.missingConfigKeys.join(', ')}.`
        : `Doručovanie notifikácií beží v režime ${providerLabel}.`,
    id: 'notifications',
    label: 'Notifikácie',
    metadata: {
      missingConfigKeys: diagnostics.missingConfigKeys.length,
      provider: providerLabel,
      webPushReady: diagnostics.webPushReady,
    },
    status,
  }
}

function environmentReadinessHealthCheck(
  report: EnvironmentReadinessReport,
  checkedAt: string,
): SystemHealthCheck {
  const status: SystemHealthStatus = report.status === 'ready' ? 'ok' : 'degraded'

  return {
    checkedAt,
    detail: report.status === 'ready'
      ? 'Profil prostredia má všetky povinné a odporúčané hodnoty pripravené.'
      : `Profil prostredia je ${environmentReadinessSummaryLabels[report.status]}: ${report.missingRequiredCount} povinných chýba, ${report.attentionCount} odporúčaných alebo skúšobných položiek je na pozornosť.`,
    id: 'environment-readiness',
    label: 'Pripravenosť prostredia',
    metadata: {
      attentionCount: report.attentionCount,
      environment: report.environment,
      missingRequiredCount: report.missingRequiredCount,
    },
    status,
  }
}

export async function collectSystemHealth(
  options: SystemHealthOptions = {},
): Promise<AdminSystemHealthResponse | SystemHealthResponse> {
  const checkedAt = options.now ?? new Date().toISOString()
  const errorState = await readLocalErrorLogState()
  const environmentReadiness = createEnvironmentReadinessReport(process.env, checkedAt)
  const recentErrorEntries = errorState.errors.slice(0, 20)
  const checks = [
    runtimeHealthCheck(checkedAt),
    await localDataHealthCheck(checkedAt, options.includePrivateDetails),
    environmentReadinessHealthCheck(environmentReadiness, checkedAt),
    notificationHealthCheck(checkedAt),
    createErrorPressureCheck(errorState.errors, checkedAt),
  ]
  const status = resolveSystemHealthStatus(checks)
  const baseResponse: SystemHealthResponse = {
    checkedAt,
    checks,
    environment: process.env.RYBOLOV_ENVIRONMENT ?? process.env.NODE_ENV ?? 'unknown',
    ok: status !== 'down',
    recentErrors: getRecentErrorStats(errorState.errors, checkedAt),
    service: serviceName,
    status,
  }

  if (!options.includePrivateDetails) return baseResponse

  return {
    ...baseResponse,
    dataDirectory: resolveLocalDataDirectory(),
    environmentReadiness,
    recentErrorEntries: recentErrorEntries.map((error: ObservedErrorEntry) => ({
      ...error,
      context: { ...error.context },
    })),
  }
}
