export type DeploymentEnvironment = 'development' | 'production' | 'staging'
export type EnvironmentReadinessCategory = 'core' | 'notifications' | 'reports' | 'storage' | 'weather'
export type EnvironmentReadinessSeverity = 'optional' | 'recommended' | 'required'
export type EnvironmentReadinessStatus = 'configured' | 'missing' | 'mock' | 'not-applicable'
export type EnvironmentReadinessSummaryStatus = 'attention' | 'blocked' | 'ready'

export interface EnvironmentReadinessItem {
  category: EnvironmentReadinessCategory
  description: string
  key: string
  label: string
  message: string
  sensitive?: boolean
  severity: EnvironmentReadinessSeverity
  status: EnvironmentReadinessStatus
  valuePreview?: string
}

export interface EnvironmentReadinessReport {
  attentionCount: number
  checkedAt: string
  configuredCount: number
  environment: DeploymentEnvironment
  items: EnvironmentReadinessItem[]
  missingRequiredCount: number
  status: EnvironmentReadinessSummaryStatus
}

interface ReadinessInput {
  category: EnvironmentReadinessCategory
  description: string
  key: string
  label: string
  missingMessage?: string
  required?: boolean
  recommended?: boolean
  sensitive?: boolean
}

export const deploymentEnvironmentLabels: Record<DeploymentEnvironment, string> = {
  development: 'dev',
  production: 'prod',
  staging: 'stage',
}

export const environmentReadinessCategoryLabels: Record<EnvironmentReadinessCategory, string> = {
  core: 'Jadro',
  notifications: 'Notifikácie',
  reports: 'Reporty',
  storage: 'Úložisko',
  weather: 'Počasie',
}

export const environmentReadinessStatusLabels: Record<EnvironmentReadinessStatus, string> = {
  configured: 'nastavené',
  missing: 'chýba',
  mock: 'mock',
  'not-applicable': 'netreba',
}

export const environmentReadinessSummaryLabels: Record<EnvironmentReadinessSummaryStatus, string> = {
  attention: 'na pozornosť',
  blocked: 'blokované',
  ready: 'pripravené',
}

function parseDeploymentEnvironment(value?: string, nodeEnv?: string): DeploymentEnvironment {
  const normalized = value?.trim().toLowerCase()

  if (normalized === 'prod' || normalized === 'production') return 'production'
  if (normalized === 'stage' || normalized === 'staging') return 'staging'
  if (normalized === 'dev' || normalized === 'development') return 'development'

  return nodeEnv === 'production' ? 'production' : 'development'
}

function envValue(env: Record<string, string | undefined>, key: string) {
  return env[key]?.trim()
}

function previewValue(value: string | undefined, sensitive = false) {
  if (!value) return undefined
  if (sensitive) return 'nastavené'
  if (value.length <= 42) return value

  return `${value.slice(0, 39)}...`
}

function createRequirement(
  env: Record<string, string | undefined>,
  input: ReadinessInput,
): EnvironmentReadinessItem {
  const value = envValue(env, input.key)
  const severity: EnvironmentReadinessSeverity = input.required
    ? 'required'
    : input.recommended ? 'recommended' : 'optional'
  const status: EnvironmentReadinessStatus = value
    ? 'configured'
    : severity === 'optional' ? 'not-applicable' : 'missing'

  return {
    category: input.category,
    description: input.description,
    key: input.key,
    label: input.label,
    message: status === 'configured'
      ? 'Hodnota je nastavená.'
      : input.missingMessage ?? 'Hodnota zatiaľ nie je nastavená.',
    sensitive: input.sensitive,
    severity,
    status,
    valuePreview: previewValue(value, input.sensitive),
  }
}

function createMockProviderItem(options: {
  category: EnvironmentReadinessCategory
  description: string
  environment: DeploymentEnvironment
  key: string
  label: string
  provider: string | undefined
  recommendedProvider: string
}) {
  const isProductionLike = options.environment === 'production' || options.environment === 'staging'
  const provider = options.provider?.trim() || 'mock'
  const isRecommendedProvider = provider === options.recommendedProvider

  return {
    category: options.category,
    description: options.description,
    key: options.key,
    label: options.label,
    message: isRecommendedProvider
      ? `Provider je nastavený na ${provider}.`
      : isProductionLike
        ? `Pre ${deploymentEnvironmentLabels[options.environment]} odporúčame ${options.recommendedProvider}; aktuálne je ${provider}.`
        : `V dev režime je ${provider} v poriadku.`,
    severity: isProductionLike ? 'recommended' : 'optional',
    status: isRecommendedProvider ? 'configured' : isProductionLike ? 'mock' : 'not-applicable',
    valuePreview: provider,
  } satisfies EnvironmentReadinessItem
}

export function resolveDeploymentEnvironment(env: Record<string, string | undefined> = process.env) {
  return parseDeploymentEnvironment(env.RYBOLOV_ENVIRONMENT, env.NODE_ENV)
}

export function createEnvironmentReadinessReport(
  env: Record<string, string | undefined> = process.env,
  checkedAt = new Date().toISOString(),
): EnvironmentReadinessReport {
  const environment = resolveDeploymentEnvironment(env)
  const isProduction = environment === 'production'
  const isProductionLike = environment === 'production' || environment === 'staging'
  const pushProvider = envValue(env, 'RYBOLOV_PUSH_PROVIDER') || 'mock'
  const reportProvider = envValue(env, 'RYBOLOV_REPORT_DELIVERY_PROVIDER') || 'mock'
  const weatherProvider = envValue(env, 'RYBOLOV_WEATHER_PROVIDER') || 'mock'
  const items: EnvironmentReadinessItem[] = [
    createRequirement(env, {
      category: 'core',
      description: 'Explicitný profil prostredia pre admin readiness a budúce deployment skripty.',
      key: 'RYBOLOV_ENVIRONMENT',
      label: 'Profil prostredia',
      missingMessage: 'Nastav dev, stage alebo prod, aby bolo jasné, aké pravidlá sa majú aplikovať.',
      recommended: !isProduction,
      required: isProductionLike,
    }),
    createRequirement(env, {
      category: 'core',
      description: 'Verejná adresa aplikácie používaná pre PWA, SEO a budúce e-mailové odkazy.',
      key: 'NUXT_PUBLIC_SITE_URL',
      label: 'Verejná URL',
      missingMessage: 'Pre stage/prod musí smerovať na reálnu HTTPS doménu.',
      recommended: !isProductionLike,
      required: isProductionLike,
    }),
    createRequirement(env, {
      category: 'core',
      description: 'Telefón zobrazený vo verejnej rezervácii a kontaktných miestach.',
      key: 'NUXT_PUBLIC_REZERVACIE_PHONE',
      label: 'Rezervačný telefón',
      recommended: true,
    }),
    createRequirement(env, {
      category: 'storage',
      description: 'Perzistentný adresár pre lokálne JSON a asset stores, kým nie je napojený Supabase backend.',
      key: 'RYBOLOV_LOCAL_DATA_DIR',
      label: 'Lokálny dátový adresár',
      missingMessage: 'Pre produkčný beh s lokálnymi store nastav perzistentný volume path.',
      recommended: environment === 'staging',
      required: isProduction,
    }),
    createMockProviderItem({
      category: 'notifications',
      description: 'Provider pre reálne PWA Web Push doručovanie.',
      environment,
      key: 'RYBOLOV_PUSH_PROVIDER',
      label: 'Push provider',
      provider: pushProvider,
      recommendedProvider: 'web-push',
    }),
    createRequirement(env, {
      category: 'notifications',
      description: 'Verejný VAPID kľúč pre browser Push API.',
      key: 'NUXT_PUBLIC_VAPID_PUBLIC_KEY',
      label: 'VAPID public key',
      required: pushProvider === 'web-push',
      sensitive: true,
    }),
    createRequirement(env, {
      category: 'notifications',
      description: 'Privátny VAPID kľúč pre serverové odosielanie push notifikácií.',
      key: 'RYBOLOV_VAPID_PRIVATE_KEY',
      label: 'VAPID private key',
      required: pushProvider === 'web-push',
      sensitive: true,
    }),
    createRequirement(env, {
      category: 'notifications',
      description: 'Kontakt vo VAPID identite, napríklad mailto:spravca@example.sk.',
      key: 'RYBOLOV_PUSH_SUBJECT',
      label: 'VAPID subject',
      recommended: isProductionLike || pushProvider === 'web-push',
      required: pushProvider === 'web-push',
    }),
    createMockProviderItem({
      category: 'reports',
      description: 'Provider pre doručovanie uložených reportov úlovkov.',
      environment,
      key: 'RYBOLOV_REPORT_DELIVERY_PROVIDER',
      label: 'Report delivery provider',
      provider: reportProvider,
      recommendedProvider: 'resend',
    }),
    createRequirement(env, {
      category: 'reports',
      description: 'Resend API kľúč pre odoslanie reportov e-mailom.',
      key: 'RYBOLOV_RESEND_API_KEY',
      label: 'Resend API key',
      required: reportProvider === 'resend',
      sensitive: true,
    }),
    createRequirement(env, {
      category: 'reports',
      description: 'Odosielateľ reportových e-mailov.',
      key: 'RYBOLOV_REPORT_EMAIL_FROM',
      label: 'Report e-mail odosielateľ',
      recommended: isProductionLike,
      required: reportProvider === 'resend',
    }),
    createRequirement(env, {
      category: 'reports',
      description: 'Secret pre hostingový cron endpoint reportov.',
      key: 'RYBOLOV_REPORT_SCHEDULER_SECRET',
      label: 'Cron secret',
      recommended: environment === 'staging',
      required: isProduction,
      sensitive: true,
    }),
    createMockProviderItem({
      category: 'weather',
      description: 'Provider počasia pri nových úlovkoch a reportoch.',
      environment,
      key: 'RYBOLOV_WEATHER_PROVIDER',
      label: 'Weather provider',
      provider: weatherProvider,
      recommendedProvider: 'weather-api',
    }),
    createRequirement(env, {
      category: 'weather',
      description: 'Endpoint externej meteoslužby.',
      key: 'RYBOLOV_WEATHER_API_ENDPOINT',
      label: 'Weather API endpoint',
      required: weatherProvider === 'weather-api',
    }),
    createRequirement(env, {
      category: 'weather',
      description: 'API kľúč externej meteoslužby.',
      key: 'RYBOLOV_WEATHER_API_KEY',
      label: 'Weather API key',
      required: weatherProvider === 'weather-api',
      sensitive: true,
    }),
  ]
  const missingRequiredCount = items.filter((item) => item.severity === 'required' && item.status === 'missing').length
  const attentionCount = items.filter((item) =>
    item.status === 'mock' ||
    (item.severity === 'recommended' && item.status === 'missing'),
  ).length
  const configuredCount = items.filter((item) => item.status === 'configured').length
  const status: EnvironmentReadinessSummaryStatus = missingRequiredCount > 0
    ? 'blocked'
    : attentionCount > 0 ? 'attention' : 'ready'

  return {
    attentionCount,
    checkedAt,
    configuredCount,
    environment,
    items,
    missingRequiredCount,
    status,
  }
}
