<script setup lang="ts">
import type { AuditArea, AuditEvent, AuditSeverity } from '~/data/pond'
import {
  auditActionLabels,
  auditAreaLabels,
  auditSeverityLabels,
  type AuditLogResponse,
} from '~/services/auditLogService'

useHead({ title: 'Admin audit log' })

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

const detailEntries = (event: AuditEvent) =>
  Object.entries(event.details)
    .filter(([, value]) => value !== null && value !== '')
    .map(([key, value]) => ({
      key,
      value: Array.isArray(value) ? value.join(', ') : String(value),
    }))
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Audit log"
      description="Chronologický záznam lokálnych zmien v prototype, pripravený na budúci Supabase audit."
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
                <p class="mt-2 text-sm text-foreground-muted">{{ event.summary }}</p>
                <p class="mt-2 text-xs font-semibold text-foreground-muted">
                  {{ event.actorLabel }} · {{ formatDate(event.createdAt) }}
                </p>
              </div>
            </div>

            <div class="lg:text-right">
              <p class="font-semibold">{{ event.entityLabel }}</p>
              <p class="text-foreground-muted text-sm">{{ event.entityType }} · {{ event.entityId }}</p>
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
