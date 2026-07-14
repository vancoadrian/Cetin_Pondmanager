<script setup lang="ts">
import type { AuditArea, AuditEvent, AuditSeverity } from '~/data/pond'
import {
  auditActionLabels,
  auditAreaLabels,
  auditAreas,
  auditSeverityLabels,
  type AuditLogResponse,
} from '~/services/auditLogService'
import type { StatusBadgeTone } from '~/utils/ui'

useHead({ title: 'Admin audit' })

type AuditAreaFilter = AuditArea | 'all'
type AuditPeriodFilter = '24h' | '30d' | '7d' | 'all'
type AuditSeverityFilter = AuditSeverity | 'all'

const auditPageSize = 12
const route = useRoute()
const router = useRouter()
const requestFetch = useRequestFetch()

const fallbackAuditState = (): AuditLogResponse => ({
  events: [],
  ok: true,
  updatedAt: 'seed',
})

const {
  data: auditState,
  error: auditError,
  refresh: refreshAuditState,
  status: auditStatus,
} = await useAsyncData<AuditLogResponse>(
  'admin-audit-state',
  () => requestFetch<AuditLogResponse>('/api/admin/audit?limit=200'),
  {
    default: fallbackAuditState,
  },
)

function getRouteQueryValue(value: unknown) {
  const normalizedValue = Array.isArray(value) ? value[0] : value
  return typeof normalizedValue === 'string' ? normalizedValue : ''
}

function parseAuditArea(value: unknown): AuditAreaFilter {
  const normalizedValue = getRouteQueryValue(value)
  return auditAreas.includes(normalizedValue as AuditArea) ? normalizedValue as AuditArea : 'all'
}

function parseAuditSeverity(value: unknown): AuditSeverityFilter {
  const normalizedValue = getRouteQueryValue(value)
  return normalizedValue === 'info' || normalizedValue === 'warning' || normalizedValue === 'critical'
    ? normalizedValue
    : 'all'
}

function parseAuditPeriod(value: unknown): AuditPeriodFilter {
  const normalizedValue = getRouteQueryValue(value)
  return normalizedValue === '24h' || normalizedValue === '7d' || normalizedValue === '30d'
    ? normalizedValue
    : 'all'
}

const selectedArea = ref<AuditAreaFilter>(parseAuditArea(route.query.oblast))
const selectedSeverity = ref<AuditSeverityFilter>(parseAuditSeverity(route.query.zavaznost))
const selectedPeriod = ref<AuditPeriodFilter>(parseAuditPeriod(route.query.obdobie))
const searchFilter = ref(getRouteQueryValue(route.query.hladat))
const expandedEventId = ref(getRouteQueryValue(route.query.zaznam))
const visibleEventLimit = ref(auditPageSize)
let searchQueryTimer: ReturnType<typeof setTimeout> | undefined

const areaOptions: Array<{ label: string, value: AuditAreaFilter }> = [
  { label: 'Všetky oblasti', value: 'all' },
  ...auditAreas.map((area) => ({ label: auditAreaLabels[area], value: area })),
]
const severityOptions: Array<{ label: string, value: AuditSeverityFilter }> = [
  { label: 'Každá závažnosť', value: 'all' },
  { label: 'Informačné', value: 'info' },
  { label: 'Na pozornosť', value: 'warning' },
  { label: 'Kritické', value: 'critical' },
]
const periodOptions: Array<{ label: string, value: AuditPeriodFilter }> = [
  { label: 'Celá história', value: 'all' },
  { label: 'Posledných 24 hodín', value: '24h' },
  { label: 'Posledných 7 dní', value: '7d' },
  { label: 'Posledných 30 dní', value: '30d' },
]

const auditEvents = computed(() => auditState.value?.events ?? [])

function formatDate(value: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value

  return new Date(parsed).toLocaleString('sk-SK', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Bratislava',
  })
}

function actionLabel(event: AuditEvent) {
  return auditActionLabels[event.action] ?? event.action
}

function severityTone(severity: AuditSeverity): StatusBadgeTone {
  if (severity === 'critical') return 'error'
  if (severity === 'warning') return 'warning'
  return 'neutral'
}

function severityIcon(severity: AuditSeverity) {
  if (severity === 'critical') return 'i-heroicons-exclamation-circle'
  if (severity === 'warning') return 'i-heroicons-exclamation-triangle'
  return 'i-heroicons-information-circle'
}

function severityBorderClass(severity: AuditSeverity) {
  if (severity === 'critical') return 'border-l-error-500'
  if (severity === 'warning') return 'border-l-warning-500'
  return 'border-l-primary-700'
}

function areaIcon(area: AuditArea) {
  switch (area) {
    case 'accounts':
      return 'i-heroicons-user-group'
    case 'catches':
      return 'i-heroicons-chart-bar'
    case 'fish':
      return 'i-heroicons-tag'
    case 'issues':
      return 'i-heroicons-exclamation-triangle'
    case 'logbooks':
      return 'i-heroicons-table-cells'
    case 'map':
      return 'i-heroicons-map'
    case 'reservations':
      return 'i-heroicons-calendar-days'
    case 'rentals':
      return 'i-heroicons-wrench-screwdriver'
    case 'sponsors':
      return 'i-heroicons-building-storefront'
    case 'system':
      return 'i-heroicons-circle-stack'
    case 'tournaments':
      return 'i-heroicons-trophy'
    default:
      return 'i-heroicons-circle-stack'
  }
}

const auditDetailValueLabels: Record<string, string> = {
  disabled: 'vypnuté',
  full: 'plná záloha',
  inline: 'dáta s vloženými súbormi',
  invalid: 'neplatné',
  manifest: 'dáta so zoznamom súborov',
  mock: 'skúšobné',
  prepared: 'pripravené',
  resend: 'Resend',
  sent: 'odoslané',
  skipped: 'preskočené',
  summary: 'prehľad',
  warning: 'na kontrolu',
  'web-push': 'push cez prehliadač',
}

const auditDetailKeyLabels: Record<string, string> = {
  actorRole: 'rola používateľa',
  allowWarnings: 'povolené upozornenia',
  'asset files': 'súbory',
  assetPolicy: 'typ súborov',
  audienceRole: 'rola príjemcu',
  catchId: 'úlovok',
  confirmPhrase: 'potvrdzovacia fráza',
  endpoint: 'zariadenie',
  fishId: 'ryba',
  from: 'od',
  'has contact email': 'má e-mail',
  issues: 'upozornenia',
  keepRecent: 'ponechať posledné',
  lakeId: 'revír',
  mode: 'režim',
  note: 'poznámka',
  'notification channel': 'kanál notifikácie',
  'notification delivery provider': 'doručovanie notifikácie',
  'notification delivery status': 'stav doručenia',
  'peg id': 'miesto',
  provider: 'doručovanie',
  records: 'záznamy',
  removedCount: 'zmazané',
  removedSizeBytes: 'uvoľnená veľkosť',
  requestId: 'požiadavka',
  reservationId: 'rezervácia',
  restoreAssets: 'obnoviť súbory',
  safetyBackupPath: 'ochranná záloha',
  sectorId: 'sektor',
  sectorIds: 'sektory',
  status: 'stav',
  stores: 'úložiská',
  subject: 'kontakt odosielateľa',
  targetTopics: 'okruhy',
  to: 'do',
  tournamentId: 'súťaž',
}

const auditEntityTypeLabels: Record<string, string> = {
  account: 'účet',
  alert: 'výstraha',
  catch: 'úlovok',
  catch_report_scheduler: 'plánovač reportov',
  catch_saved_report: 'uložený report',
  closure: 'uzávierka',
  'data-backup': 'záloha dát',
  fish: 'ryba',
  lake: 'revír',
  lake_closure: 'uzávierka',
  lake_manager_presence: 'dostupnosť správcu',
  'local data backup': 'záloha dát',
  logbook: 'zápisník',
  map: 'mapa',
  notification: 'notifikácia',
  notification_broadcast: 'rozoslanie notifikácie',
  'notification-broadcast': 'rozoslanie notifikácie',
  'notification-subscription': 'odber notifikácií',
  place: 'miesto',
  place_issue: 'hlásenie nedostatku',
  reservation: 'rezervácia',
  sponsor: 'sponzor',
  system: 'systém',
  tournament: 'súťaž',
}

function formatAuditDetailValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatAuditDetailValue).join(', ')
  if (typeof value === 'boolean') return value ? 'áno' : 'nie'
  const stringValue = String(value)

  return auditDetailValueLabels[stringValue] ?? stringValue
}

function formatAuditDetailKey(key: string) {
  if (auditDetailKeyLabels[key]) return auditDetailKeyLabels[key]

  const normalizedKey = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .toLocaleLowerCase('sk-SK')

  return auditDetailKeyLabels[normalizedKey] ?? normalizedKey
}

function formatEntityType(entityType: string) {
  if (auditEntityTypeLabels[entityType]) return auditEntityTypeLabels[entityType]

  const normalizedEntityType = entityType
    .replace(/[-_]/g, ' ')
    .toLocaleLowerCase('sk-SK')

  return auditEntityTypeLabels[normalizedEntityType] ?? normalizedEntityType
}

function formatAuditSummary(summary: string) {
  return summary
    .replace(/Safety backup/gu, 'Ochranná záloha')
    .replace(/safety backup/gu, 'ochranná záloha')
    .replace(/Backup/gu, 'Záloha')
    .replace(/backup/gu, 'záloha')
    .replace(/\((\d+) store, (\d+) záznamov\)/gu, '($1 úložísk, $2 záznamov)')
    .replace(/Stiahnutý lokálny záloha/gu, 'Stiahnutá lokálna záloha')
    .replace(/Skontrolovaný záloha/gu, 'Skontrolovaná záloha')
    .replace(/stavom invalid/gu, 'stavom neplatné')
    .replace(/stavom warning/gu, 'stavom na kontrolu')
}

function formatAuditEntityLabel(event: AuditEvent) {
  const label = event.entityLabel

  if (event.area === 'system' && (label.includes('backup') || label.endsWith('.json'))) {
    return 'Záloha dát'
  }

  return label
    .replace(/Safety backup/gu, 'Ochranná záloha')
    .replace(/backup/gu, 'záloha')
    .replace(/\.json$/u, '')
}

function detailEntries(event: AuditEvent) {
  return Object.entries(event.details)
    .filter(([, value]) => value !== null && value !== '')
    .map(([key, value]) => ({
      key: formatAuditDetailKey(key),
      value: formatAuditDetailValue(value),
    }))
}

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sk-SK')
    .trim()
}

function auditEventSearchText(event: AuditEvent) {
  return normalizeSearchValue([
    actionLabel(event),
    auditAreaLabels[event.area],
    event.actorLabel,
    event.entityId,
    formatAuditEntityLabel(event),
    formatEntityType(event.entityType),
    formatAuditSummary(event.summary),
    ...detailEntries(event).flatMap((detail) => [detail.key, detail.value]),
  ].join(' '))
}

function periodStart(period: AuditPeriodFilter) {
  const now = Date.now()
  if (period === '24h') return now - 24 * 60 * 60 * 1000
  if (period === '7d') return now - 7 * 24 * 60 * 60 * 1000
  if (period === '30d') return now - 30 * 24 * 60 * 60 * 1000
  return null
}

const filteredEvents = computed(() => {
  const searchValue = normalizeSearchValue(searchFilter.value)
  const minimumDate = periodStart(selectedPeriod.value)

  return auditEvents.value.filter((event) => {
    if (selectedArea.value !== 'all' && event.area !== selectedArea.value) return false
    if (selectedSeverity.value !== 'all' && event.severity !== selectedSeverity.value) return false

    if (minimumDate !== null) {
      const eventDate = Date.parse(event.createdAt)
      if (!Number.isFinite(eventDate) || eventDate < minimumDate) return false
    }

    return !searchValue || auditEventSearchText(event).includes(searchValue)
  })
})

const visibleEvents = computed(() => filteredEvents.value.slice(0, visibleEventLimit.value))
const remainingEventCount = computed(() => Math.max(filteredEvents.value.length - visibleEvents.value.length, 0))
const hasActiveFilters = computed(() =>
  selectedArea.value !== 'all'
  || selectedSeverity.value !== 'all'
  || selectedPeriod.value !== 'all'
  || Boolean(searchFilter.value.trim()),
)
const auditStats = computed(() => {
  const last24Hours = Date.now() - 24 * 60 * 60 * 1000

  return {
    attention: auditEvents.value.filter((event) => event.severity !== 'info').length,
    critical: auditEvents.value.filter((event) => event.severity === 'critical').length,
    last24h: auditEvents.value.filter((event) => {
      const createdAt = Date.parse(event.createdAt)
      return Number.isFinite(createdAt) && createdAt >= last24Hours
    }).length,
    total: auditEvents.value.length,
  }
})
const auditSummaryCards = computed(() => [
  {
    detail: 'načítaná história',
    icon: 'i-heroicons-list-bullet',
    label: 'Záznamy',
    value: auditStats.value.total,
  },
  {
    detail: 'posledný deň',
    icon: 'i-heroicons-clock',
    label: 'Za 24 hodín',
    value: auditStats.value.last24h,
  },
  {
    detail: 'pozor alebo kritické',
    icon: 'i-heroicons-exclamation-triangle',
    label: 'Na pozornosť',
    value: auditStats.value.attention,
  },
  {
    detail: 'vyžadujú preverenie',
    icon: 'i-heroicons-exclamation-circle',
    label: 'Kritické',
    value: auditStats.value.critical,
  },
])

function eventCountLabel(count: number) {
  if (count === 1) return 'udalosť'
  if (count >= 2 && count <= 4) return 'udalosti'
  return 'udalostí'
}

function syncAuditQuery() {
  const query = { ...route.query }

  if (selectedArea.value === 'all') delete query.oblast
  else query.oblast = selectedArea.value

  if (selectedSeverity.value === 'all') delete query.zavaznost
  else query.zavaznost = selectedSeverity.value

  if (selectedPeriod.value === 'all') delete query.obdobie
  else query.obdobie = selectedPeriod.value

  const normalizedSearch = searchFilter.value.trim()
  if (normalizedSearch) query.hladat = normalizedSearch
  else delete query.hladat

  if (expandedEventId.value) query.zaznam = expandedEventId.value
  else delete query.zaznam

  void router.replace({ query })
}

function handleFilterChange() {
  visibleEventLimit.value = auditPageSize
  expandedEventId.value = ''
  syncAuditQuery()
}

function handleSearchInput() {
  visibleEventLimit.value = auditPageSize
  expandedEventId.value = ''
  if (searchQueryTimer) clearTimeout(searchQueryTimer)
  searchQueryTimer = setTimeout(syncAuditQuery, 250)
}

function clearFilters() {
  if (searchQueryTimer) clearTimeout(searchQueryTimer)
  selectedArea.value = 'all'
  selectedSeverity.value = 'all'
  selectedPeriod.value = 'all'
  searchFilter.value = ''
  expandedEventId.value = ''
  visibleEventLimit.value = auditPageSize

  const query = { ...route.query }
  delete query.oblast
  delete query.zavaznost
  delete query.obdobie
  delete query.hladat
  delete query.zaznam
  void router.replace({ query })
}

async function refreshAudit() {
  await refreshAuditState()
}

function showMoreEvents() {
  visibleEventLimit.value += auditPageSize
}

function toggleEventDetails(eventId: string) {
  expandedEventId.value = expandedEventId.value === eventId ? '' : eventId
  syncAuditQuery()
}

async function revealExpandedEvent() {
  if (!expandedEventId.value) return
  const eventIndex = filteredEvents.value.findIndex((event) => event.id === expandedEventId.value)
  if (eventIndex < 0) return

  visibleEventLimit.value = Math.max(visibleEventLimit.value, eventIndex + 1)
  await nextTick()
  document.getElementById(`audit-event-${expandedEventId.value}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function exportAuditCsv() {
  if (!filteredEvents.value.length) return

  const rows = [
    ['Dátum', 'Oblasť', 'Závažnosť', 'Udalosť', 'Súhrn', 'Objekt', 'Typ objektu', 'Používateľ', 'Podrobnosti'],
    ...filteredEvents.value.map((event) => [
      formatDate(event.createdAt),
      auditAreaLabels[event.area],
      auditSeverityLabels[event.severity],
      actionLabel(event),
      formatAuditSummary(event.summary),
      formatAuditEntityLabel(event),
      formatEntityType(event.entityType),
      event.actorLabel,
      detailEntries(event).map((detail) => `${detail.key}: ${detail.value}`).join('; '),
    ]),
  ]
  const csv = rows.map((row) => row.map(csvCell).join(';')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = `rybolov-cetin-audit-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

watch(
  () => [route.query.oblast, route.query.zavaznost, route.query.obdobie, route.query.hladat],
  () => {
    selectedArea.value = parseAuditArea(route.query.oblast)
    selectedSeverity.value = parseAuditSeverity(route.query.zavaznost)
    selectedPeriod.value = parseAuditPeriod(route.query.obdobie)
    searchFilter.value = getRouteQueryValue(route.query.hladat)
    visibleEventLimit.value = auditPageSize
  },
)

watch(
  () => route.query.zaznam,
  (value) => {
    expandedEventId.value = getRouteQueryValue(value)
    void revealExpandedEvent()
  },
)

onMounted(() => {
  void revealExpandedEvent()
})

onBeforeUnmount(() => {
  if (searchQueryTimer) clearTimeout(searchQueryTimer)
})
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Audit udalostí"
      description="Chronologický záznam interných rozhodnutí, úprav a citlivých prevádzkových zmien."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <DataStatusNotice
        v-if="auditError"
        class="mb-6"
        action-label="Skúsiť znova"
        :action-loading="auditStatus === 'pending'"
        description="Nepodarilo sa načítať aktuálnu históriu zmien. Zobrazené údaje môžu byť neúplné."
        icon="i-heroicons-exclamation-triangle"
        title="Audit nie je aktuálny"
        tone="error"
        @action="refreshAudit"
      />

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          v-for="stat in auditSummaryCards"
          :key="stat.label"
          class="min-w-0 rounded-card border border-border bg-surface p-4"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="truncate text-xs font-semibold text-foreground-muted sm:text-sm">{{ stat.label }}</p>
            <UIcon :name="stat.icon" class="h-4 w-4 shrink-0 text-primary-700" />
          </div>
          <p class="mt-2 text-2xl font-bold sm:text-3xl">{{ stat.value }}</p>
          <p class="mt-1 line-clamp-1 text-xs text-foreground-muted">{{ stat.detail }}</p>
        </div>
      </div>

      <section aria-labelledby="audit-filter-title" class="mt-6 border-y border-border py-5">
        <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="audit-filter-title" class="text-lg font-bold">Nájsť udalosť</h2>
            <p class="mt-1 text-sm text-foreground-muted">
              Filtre zostanú v adrese, takže rovnaký pohľad môžete znovu otvoriť alebo poslať kolegovi.
            </p>
          </div>
          <p class="text-sm font-semibold text-foreground-muted" aria-live="polite">
            {{ filteredEvents.length }} {{ eventCountLabel(filteredEvents.length) }}
          </p>
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1.4fr)_repeat(3,minmax(0,1fr))]">
          <label class="min-w-0 sm:col-span-2 lg:col-span-1">
            <span class="text-xs font-bold uppercase text-foreground-muted">Hľadať</span>
            <span class="relative mt-1 block">
              <UIcon
                name="i-heroicons-magnifying-glass"
                class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted"
              />
              <input
                v-model="searchFilter"
                type="search"
                class="h-11 w-full rounded-md border border-border bg-white pl-10 pr-3 text-sm outline-none transition focus:border-primary-700 focus:ring-2 focus:ring-primary-700/15"
                placeholder="Názov, osoba, miesto alebo ID"
                @input="handleSearchInput"
              >
            </span>
          </label>

          <label class="min-w-0">
            <span class="text-xs font-bold uppercase text-foreground-muted">Oblasť</span>
            <select
              v-model="selectedArea"
              class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/15"
              @change="handleFilterChange"
            >
              <option v-for="option in areaOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="min-w-0">
            <span class="text-xs font-bold uppercase text-foreground-muted">Závažnosť</span>
            <select
              v-model="selectedSeverity"
              class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/15"
              @change="handleFilterChange"
            >
              <option v-for="option in severityOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="min-w-0">
            <span class="text-xs font-bold uppercase text-foreground-muted">Obdobie</span>
            <select
              v-model="selectedPeriod"
              class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/15"
              @change="handleFilterChange"
            >
              <option v-for="option in periodOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>

        <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-xs text-foreground-muted">
            Zobrazených {{ visibleEvents.length }} z {{ filteredEvents.length }} výsledkov.
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="hasActiveFilters"
              icon="i-heroicons-x-mark"
              color="neutral"
              variant="ghost"
              @click="clearFilters"
            >
              Zrušiť filtre
            </UButton>
            <UButton
              icon="i-heroicons-arrow-down-tray"
              color="neutral"
              variant="outline"
              :disabled="filteredEvents.length === 0"
              @click="exportAuditCsv"
            >
              Export CSV
            </UButton>
            <UButton
              icon="i-heroicons-arrow-path"
              variant="soft"
              :loading="auditStatus === 'pending'"
              @click="refreshAudit"
            >
              Obnoviť
            </UButton>
          </div>
        </div>
      </section>

      <section class="mt-6" aria-labelledby="audit-results-title">
        <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="audit-results-title" class="text-lg font-bold">Udalosti</h2>
            <p class="mt-1 text-sm text-foreground-muted">Najnovšie záznamy sú zobrazené ako prvé.</p>
          </div>
          <p v-if="auditState?.updatedAt && auditState.updatedAt !== 'seed'" class="text-xs text-foreground-muted">
            Aktualizované {{ formatDate(auditState.updatedAt) }}
          </p>
        </div>

        <DataStatusNotice
          v-if="filteredEvents.length === 0"
          class="mt-4"
          :action-label="hasActiveFilters ? 'Zrušiť filtre' : ''"
          description="Skúste zmeniť hľadaný výraz, oblasť, závažnosť alebo obdobie."
          icon="i-heroicons-magnifying-glass"
          title="Žiadna udalosť nezodpovedá filtrom"
          @action="clearFilters"
        />

        <div v-else class="mt-4 space-y-3">
          <article
            v-for="event in visibleEvents"
            :id="`audit-event-${event.id}`"
            :key="event.id"
            class="scroll-mt-28 rounded-card border border-l-4 border-border bg-surface p-4 sm:p-5"
            :class="severityBorderClass(event.severity)"
          >
            <div class="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="flex min-w-0 gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-800">
                  <UIcon :name="areaIcon(event.area)" class="h-5 w-5" />
                </div>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="font-bold leading-tight">{{ actionLabel(event) }}</h3>
                    <StatusBadge
                      :icon="areaIcon(event.area)"
                      :label="auditAreaLabels[event.area]"
                      size="xs"
                      tone="primary"
                    />
                    <StatusBadge
                      :icon="severityIcon(event.severity)"
                      :label="auditSeverityLabels[event.severity]"
                      size="xs"
                      :tone="severityTone(event.severity)"
                    />
                  </div>
                  <p
                    class="mt-2 break-words text-sm text-foreground-muted"
                    :class="{ 'line-clamp-2': expandedEventId !== event.id }"
                  >
                    {{ formatAuditSummary(event.summary) }}
                  </p>
                  <p class="mt-2 text-xs font-semibold text-foreground-muted">
                    {{ event.actorLabel }} · {{ formatDate(event.createdAt) }}
                  </p>
                </div>
              </div>

              <div class="min-w-0 border-t border-border pt-3 lg:max-w-xs lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0 lg:text-right">
                <p class="break-words font-semibold">{{ formatAuditEntityLabel(event) }}</p>
                <p class="mt-1 text-sm text-foreground-muted">{{ formatEntityType(event.entityType) }}</p>
              </div>
            </div>

            <div
              v-if="expandedEventId === event.id"
              :id="`audit-details-${event.id}`"
              class="mt-4 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              <div>
                <p class="text-[11px] font-bold uppercase text-foreground-muted">Interné ID</p>
                <p class="mt-1 break-all text-sm font-semibold">{{ event.entityId }}</p>
              </div>
              <div v-for="detail in detailEntries(event)" :key="`${event.id}-${detail.key}`" class="min-w-0">
                <p class="text-[11px] font-bold uppercase text-foreground-muted">{{ detail.key }}</p>
                <p class="mt-1 break-words text-sm font-semibold">{{ detail.value }}</p>
              </div>
            </div>

            <div class="mt-3 flex justify-end border-t border-border pt-3">
              <UButton
                :aria-controls="`audit-details-${event.id}`"
                :aria-expanded="expandedEventId === event.id"
                :icon="expandedEventId === event.id ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                color="neutral"
                size="sm"
                variant="ghost"
                @click="toggleEventDetails(event.id)"
              >
                {{ expandedEventId === event.id ? 'Skryť podrobnosti' : `Podrobnosti (${detailEntries(event).length + 1})` }}
              </UButton>
            </div>
          </article>
        </div>

        <div v-if="remainingEventCount" class="mt-5 flex flex-col items-center gap-3 border-t border-border pt-5 text-center">
          <p class="text-sm text-foreground-muted">
            Zostáva {{ remainingEventCount }} {{ eventCountLabel(remainingEventCount) }}.
          </p>
          <UButton icon="i-heroicons-chevron-down" variant="outline" @click="showMoreEvents">
            Zobraziť ďalšie
          </UButton>
        </div>
      </section>
    </section>
  </div>
</template>
