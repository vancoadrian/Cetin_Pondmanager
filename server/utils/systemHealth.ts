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
      ? `Node runtime ${process.version} spĺňa požiadavku projektu.`
      : `Node runtime ${process.version} je nižší než odporúčané >=22.`,
    id: 'runtime',
    label: 'Runtime',
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

  return {
    checkedAt,
    detail: diagnostics.webPushReady
      ? 'Web Push provider je pripravený na reálne odosielanie.'
      : diagnostics.provider === 'web-push'
        ? `Web Push provider nemá kompletné VAPID nastavenie: ${diagnostics.missingConfigKeys.join(', ')}.`
        : `Notifikačný provider beží v režime ${diagnostics.provider}.`,
    id: 'notifications',
    label: 'Notifikácie',
    metadata: {
      missingConfigKeys: diagnostics.missingConfigKeys.length,
      provider: diagnostics.provider,
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
      ? 'Environment profil má všetky povinné a odporúčané hodnoty pripravené.'
      : `Environment profil je ${environmentReadinessSummaryLabels[report.status]}: ${report.missingRequiredCount} povinných chýba, ${report.attentionCount} odporúčaných alebo mock položiek je na pozornosť.`,
    id: 'environment-readiness',
    label: 'Environment',
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
