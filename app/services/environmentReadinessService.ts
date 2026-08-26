export type DeploymentEnvironment = 'development' | 'production' | 'staging'
export type EnvironmentReadinessCategory = 'accounts' | 'core' | 'notifications' | 'observability' | 'reports' | 'reservations' | 'storage' | 'weather'
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
  accounts: 'Používateľské účty',
  core: 'Jadro',
  notifications: 'Notifikácie',
  observability: 'Monitoring',
  reports: 'Reporty',
  reservations: 'Rezervácie',
  storage: 'Úložisko',
  weather: 'Počasie',
}

export const environmentReadinessStatusLabels: Record<EnvironmentReadinessStatus, string> = {
  configured: 'nastavené',
  missing: 'chýba',
  mock: 'skúšobné',
  'not-applicable': 'netreba',
}

export const environmentReadinessSummaryLabels: Record<EnvironmentReadinessSummaryStatus, string> = {
  attention: 'na pozornosť',
  blocked: 'blokované',
  ready: 'pripravené',
}

const providerValueLabels: Record<string, string> = {
  disabled: 'vypnuté',
  file: 'filesystem (dev/test)',
  manual: 'manuálne',
  mock: 'skúšobné',
  resend: 'Resend',
  station: 'lokálna stanica',
  supabase: 'Supabase',
  'weather-api': 'Weather API',
  'web-push': 'Web Push',
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
  const providerLabel = providerValueLabels[provider] ?? provider
  const recommendedProviderLabel = providerValueLabels[options.recommendedProvider] ?? options.recommendedProvider

  return {
    category: options.category,
    description: options.description,
    key: options.key,
    label: options.label,
    message: isRecommendedProvider
      ? `Provider je nastavený na ${providerLabel}.`
      : isProductionLike
        ? `Pre ${deploymentEnvironmentLabels[options.environment]} odporúčame ${recommendedProviderLabel}; aktuálne je ${providerLabel}.`
        : `V dev režime je ${providerLabel} v poriadku.`,
    severity: isProductionLike ? 'recommended' : 'optional',
    status: isRecommendedProvider ? 'configured' : isProductionLike ? 'mock' : 'not-applicable',
    valuePreview: providerLabel,
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
  const authProvider = envValue(env, 'RYBOLOV_AUTH_DELIVERY_PROVIDER') || 'mock'
  const pushProvider = envValue(env, 'RYBOLOV_PUSH_PROVIDER') || 'mock'
  const reportProvider = envValue(env, 'RYBOLOV_REPORT_DELIVERY_PROVIDER') || 'mock'
  const reservationProvider = envValue(env, 'RYBOLOV_RESERVATION_DELIVERY_PROVIDER') || 'mock'
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
      category: 'observability',
      description: 'Verejné DSN pre Sentry error reporting v klientovi aj ako serverový fallback.',
      key: envValue(env, 'NEXT_PUBLIC_SENTRY_DSN') && !envValue(env, 'NUXT_PUBLIC_SENTRY_DSN')
        ? 'NEXT_PUBLIC_SENTRY_DSN'
        : 'NUXT_PUBLIC_SENTRY_DSN',
      label: 'Sentry DSN',
      missingMessage: 'Pre stage/prod vytvor samostatný Sentry projekt a nastav jeho verejné DSN.',
      recommended: environment === 'staging',
      required: isProduction,
      sensitive: true,
    }),
    createMockProviderItem({
      category: 'accounts',
      description: 'Provider jednorazových e-mailov na obnovu hesla.',
      environment,
      key: 'RYBOLOV_AUTH_DELIVERY_PROVIDER',
      label: 'Obnova hesla provider',
      provider: authProvider,
      recommendedProvider: 'resend',
    }),
    createRequirement(env, {
      category: 'accounts',
      description: 'Resend API kľúč pre odoslanie odkazu na obnovu hesla.',
      key: 'RYBOLOV_RESEND_API_KEY',
      label: 'Resend API key',
      required: authProvider === 'resend',
      sensitive: true,
    }),
    createRequirement(env, {
      category: 'accounts',
      description: 'Odosielateľ bezpečnostných e-mailov používateľského účtu.',
      key: 'RYBOLOV_AUTH_EMAIL_FROM',
      label: 'Účtový e-mail odosielateľ',
      recommended: isProductionLike,
      required: authProvider === 'resend',
    }),
    createRequirement(env, {
      category: 'storage',
      description: 'URL Supabase projektu (lokálne API URL zo `supabase start`, na hostingu URL projektu).',
      key: 'NUXT_PUBLIC_SUPABASE_URL',
      label: 'Supabase URL',
      missingMessage: 'Runtime dáta žijú v Supabase; bez URL server nevie čítať ani zapisovať stav.',
      recommended: !isProductionLike,
      required: isProductionLike,
    }),
    createRequirement(env, {
      category: 'storage',
      description: 'Publikovateľný (anon) kľúč pre klientske RLS flow; smie byť dostupný klientovi.',
      key: envValue(env, 'NUXT_PUBLIC_SUPABASE_ANON_KEY') && !envValue(env, 'NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
        ? 'NUXT_PUBLIC_SUPABASE_ANON_KEY'
        : 'NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      label: 'Supabase publishable key',
      recommended: !isProductionLike,
      required: isProductionLike,
      sensitive: true,
    }),
    createRequirement(env, {
      category: 'storage',
      description: 'Secret/service-role kľúč pre serverové repository operácie. Nikdy nesmie ísť do klienta.',
      key: envValue(env, 'SUPABASE_SERVICE_ROLE_KEY') && !envValue(env, 'SUPABASE_SECRET_KEY')
        ? 'SUPABASE_SERVICE_ROLE_KEY'
        : 'SUPABASE_SECRET_KEY',
      label: 'Supabase secret key',
      missingMessage: 'Server bez secret kľúča nevie pristupovať k runtime stavu ani Storage bucketom.',
      recommended: !isProductionLike,
      required: isProductionLike,
      sensitive: true,
    }),
    createRequirement(env, {
      category: 'storage',
      description: 'Priame Postgres pripojenie pre migrácie, import a RLS testy (CLI tooling, nie runtime).',
      key: 'SUPABASE_DB_URL',
      label: 'Supabase DB URL',
      recommended: !isProductionLike,
      sensitive: true,
    }),
    createMockProviderItem({
      category: 'storage',
      description: 'Driver runtime úložiska. `file` je explicitný dev/test adaptér a v produkcii je zakázaný.',
      environment,
      key: 'RYBOLOV_STORAGE_DRIVER',
      label: 'Storage driver',
      provider: envValue(env, 'RYBOLOV_STORAGE_DRIVER') || 'supabase',
      recommendedProvider: 'supabase',
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
      category: 'reservations',
      description: 'Provider pre potvrdenia a zamietnutia rezervácií.',
      environment,
      key: 'RYBOLOV_RESERVATION_DELIVERY_PROVIDER',
      label: 'Reservation delivery provider',
      provider: reservationProvider,
      recommendedProvider: 'resend',
    }),
    createRequirement(env, {
      category: 'reservations',
      description: 'Resend API kľúč pre odosielanie potvrdení rezervácií e-mailom.',
      key: 'RYBOLOV_RESEND_API_KEY',
      label: 'Resend API key',
      required: reservationProvider === 'resend',
      sensitive: true,
    }),
    createRequirement(env, {
      category: 'reservations',
      description: 'Odosielateľ rezervačných e-mailov.',
      key: 'RYBOLOV_RESERVATION_EMAIL_FROM',
      label: 'Rezervačný e-mail odosielateľ',
      recommended: isProductionLike,
      required: reservationProvider === 'resend',
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
      description: 'Endpoint externej meteoslužby. Predvolený adaptér používa Open-Meteo Historical Weather API.',
      key: 'RYBOLOV_WEATHER_API_ENDPOINT',
      label: 'Weather API endpoint',
      recommended: weatherProvider === 'weather-api',
    }),
    createRequirement(env, {
      category: 'weather',
      description: 'API kľúč externej meteoslužby, ak zvolený provider nie je verejný Open-Meteo endpoint.',
      key: 'RYBOLOV_WEATHER_API_KEY',
      label: 'Weather API key',
      sensitive: true,
    }),
    createRequirement(env, {
      category: 'weather',
      description: 'Zemepisná šírka revíru pre hodinový weather lookup.',
      key: 'RYBOLOV_WEATHER_LATITUDE',
      label: 'Weather latitude',
      required: weatherProvider === 'weather-api',
    }),
    createRequirement(env, {
      category: 'weather',
      description: 'Zemepisná dĺžka revíru pre hodinový weather lookup.',
      key: 'RYBOLOV_WEATHER_LONGITUDE',
      label: 'Weather longitude',
      required: weatherProvider === 'weather-api',
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
