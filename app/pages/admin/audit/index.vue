<script setup lang="ts">
import type { AuditArea, AuditEvent, AuditSeverity } from '~/data/pond'
import {
  auditActionLabels,
  auditAreaLabels,
  auditSeverityLabels,
  type AuditLogResponse,
} from '~/services/auditLogService'

useHead({ title: 'Admin audit' })

const fallbackAuditState = (): AuditLogResponse => ({
  events: [],
  ok: true,
  updatedAt: 'seed',
})

const requestFetch = useRequestFetch()

const { data: auditState, refresh: refreshAuditState } = await useAsyncData<AuditLogResponse>(
  'admin-audit-state',
  () => requestFetch<AuditLogResponse>('/api/admin/audit?limit=200'),
  {
    default: fallbackAuditState,
  },
)

const selectedArea = ref<AuditArea | 'all'>('all')
const areaOptions: { label: string, value: AuditArea | 'all' }[] = [
  { label: 'Všetko', value: 'all' },
  { label: auditAreaLabels.reservations, value: 'reservations' },
  { label: auditAreaLabels.tournaments, value: 'tournaments' },
  { label: auditAreaLabels.catches, value: 'catches' },
  { label: auditAreaLabels.logbooks, value: 'logbooks' },
  { label: auditAreaLabels.map, value: 'map' },
  { label: auditAreaLabels.rentals, value: 'rentals' },
  { label: auditAreaLabels.sponsors, value: 'sponsors' },
  { label: auditAreaLabels.system, value: 'system' },
]

const auditEvents = computed(() => auditState.value?.events ?? [])
const filteredEvents = computed(() =>
  selectedArea.value === 'all'
    ? auditEvents.value
    : auditEvents.value.filter((event) => event.area === selectedArea.value),
)
const auditStats = computed(() => ({
  critical: auditEvents.value.filter((event) => event.severity === 'critical').length,
  reservations: auditEvents.value.filter((event) => event.area === 'reservations').length,
  system: auditEvents.value.filter((event) => event.area === 'system').length,
  tournaments: auditEvents.value.filter((event) => event.area === 'tournaments').length,
  warnings: auditEvents.value.filter((event) => event.severity === 'warning').length,
}))

const refreshAudit = async () => {
  await refreshAuditState()
}

const formatDate = (value: string) => {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value

  return new Date(parsed).toLocaleString('sk-SK', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Bratislava',
  })
}

const actionLabel = (event: AuditEvent) => auditActionLabels[event.action] ?? event.action

const severityClass = (severity: AuditSeverity) => {
  switch (severity) {
    case 'critical':
      return 'bg-error-500/10 text-error-700'
    case 'warning':
      return 'bg-warning-500/10 text-warning-700'
    default:
      return 'bg-success-500/10 text-success-700'
  }
}

const areaIcon = (area: AuditArea) => {
  switch (area) {
    case 'catches':
      return 'i-heroicons-chart-bar'
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
  alert: 'výstraha',
  catch: 'úlovok',
  closure: 'uzávierka',
  'data-backup': 'záloha dát',
  fish: 'ryba',
  lake: 'revír',
  'local data backup': 'záloha dát',
  logbook: 'zápisník',
  map: 'mapa',
  notification: 'notifikácia',
  'notification-broadcast': 'rozoslanie notifikácie',
  'notification-subscription': 'odber notifikácií',
  place: 'miesto',
  reservation: 'rezervácia',
  sponsor: 'sponzor',
  system: 'systém',
  tournament: 'súťaž',
}

const formatAuditDetailValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(formatAuditDetailValue).join(', ')
  if (typeof value === 'boolean') return value ? 'áno' : 'nie'
  const stringValue = String(value)

  return auditDetailValueLabels[stringValue] ?? stringValue
}

const formatAuditDetailKey = (key: string) => {
  if (auditDetailKeyLabels[key]) return auditDetailKeyLabels[key]

  const normalizedKey = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .toLocaleLowerCase('sk-SK')

  return auditDetailKeyLabels[normalizedKey] ?? normalizedKey
}

const formatEntityType = (entityType: string) => {
  if (auditEntityTypeLabels[entityType]) return auditEntityTypeLabels[entityType]

  const normalizedEntityType = entityType
    .replace(/[-_]/g, ' ')
    .toLocaleLowerCase('sk-SK')

  return auditEntityTypeLabels[normalizedEntityType] ?? normalizedEntityType
}

const formatAuditSummary = (summary: string) =>
  summary
    .replace(/Safety backup/gu, 'Ochranná záloha')
    .replace(/safety backup/gu, 'ochranná záloha')
    .replace(/Backup/gu, 'Záloha')
    .replace(/backup/gu, 'záloha')
    .replace(/\((\d+) store, (\d+) záznamov\)/gu, '($1 úložísk, $2 záznamov)')
    .replace(/Stiahnutý lokálny záloha/gu, 'Stiahnutá lokálna záloha')
    .replace(/Skontrolovaný záloha/gu, 'Skontrolovaná záloha')
    .replace(/stavom invalid/gu, 'stavom neplatné')
    .replace(/stavom warning/gu, 'stavom na kontrolu')

const formatAuditEntityLabel = (event: AuditEvent) => {
  const label = event.entityLabel

  if (event.area === 'system' && (label.includes('backup') || label.endsWith('.json'))) {
    return 'Záloha dát'
  }

  return label
    .replace(/Safety backup/gu, 'Ochranná záloha')
    .replace(/backup/gu, 'záloha')
    .replace(/\.json$/u, '')
}

const detailEntries = (event: AuditEvent) =>
  Object.entries(event.details)
    .filter(([, value]) => value !== null && value !== '')
    .map(([key, value]) => ({
      key: formatAuditDetailKey(key),
      value: formatAuditDetailValue(value),
    }))
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

      <div class="grid gap-4 md:grid-cols-5">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Rezervácie</p>
          <p class="mt-2 text-3xl font-bold">{{ auditStats.reservations }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Súťaže</p>
          <p class="mt-2 text-3xl font-bold">{{ auditStats.tournaments }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Systém</p>
          <p class="mt-2 text-3xl font-bold">{{ auditStats.system }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Upozornenia</p>
          <p class="mt-2 text-3xl font-bold">{{ auditStats.warnings }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Kritické</p>
          <p class="mt-2 text-3xl font-bold">{{ auditStats.critical }}</p>
        </div>
      </div>

      <div class="mt-6 flex flex-col gap-3 rounded-card border border-border bg-surface p-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in areaOptions"
            :key="option.value"
            type="button"
            class="inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold transition-colors"
            :class="
              selectedArea === option.value
                ? 'bg-primary-900 text-white'
                : 'bg-muted text-foreground-muted hover:text-foreground'
            "
            @click="selectedArea = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <UButton icon="i-heroicons-arrow-path" variant="soft" @click="refreshAudit">
          Obnoviť
        </UButton>
      </div>

      <div class="mt-6 overflow-hidden rounded-card border border-border bg-surface">
        <div
          v-if="filteredEvents.length === 0"
          class="p-8 text-center"
        >
          <p class="font-bold">Zatiaľ tu nie sú žiadne udalosti</p>
          <p class="text-foreground-muted mt-1 text-sm">Audit sa začne plniť po uložení rezervácie, mapy, úlovku alebo súťažnej akcie.</p>
        </div>

        <div
          v-for="event in filteredEvents"
          :key="event.id"
          class="border-b border-border bg-white p-5 last:border-b-0"
        >
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="flex min-w-0 gap-3">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-800">
                <UIcon :name="areaIcon(event.area)" class="h-5 w-5" />
              </div>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="font-bold">{{ actionLabel(event) }}</p>
                  <span class="rounded-md bg-muted px-2 py-1 text-xs font-bold text-foreground-muted">
                    {{ auditAreaLabels[event.area] }}
                  </span>
                  <span class="rounded-md px-2 py-1 text-xs font-bold" :class="severityClass(event.severity)">
                    {{ auditSeverityLabels[event.severity] }}
                  </span>
                </div>
                <p class="mt-2 text-sm text-foreground-muted">{{ formatAuditSummary(event.summary) }}</p>
                <p class="mt-2 text-xs font-semibold text-foreground-muted">
                  {{ event.actorLabel }} · {{ formatDate(event.createdAt) }}
                </p>
              </div>
            </div>

            <div class="lg:text-right">
              <p class="font-semibold">{{ formatAuditEntityLabel(event) }}</p>
              <p class="text-foreground-muted text-sm">{{ formatEntityType(event.entityType) }} · {{ event.entityId }}</p>
            </div>
          </div>

          <div v-if="detailEntries(event).length" class="mt-4 flex flex-wrap gap-2">
            <span
              v-for="detail in detailEntries(event)"
              :key="`${event.id}-${detail.key}`"
              class="rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-foreground-muted"
            >
              {{ detail.key }}: {{ detail.value }}
            </span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
