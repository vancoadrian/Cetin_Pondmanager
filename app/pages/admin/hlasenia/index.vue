<script setup lang="ts">
import type { LakeScope, PlaceIssue, PlaceIssuePriority, PlaceIssueStatus } from '~/data/pond'
import {
  placeIssueCategoryLabels,
  placeIssuePriorityLabels,
  placeIssueStatusLabels,
  placeIssueTargetTypeLabels,
} from '~/data/pond'
import type { PlaceIssueActionSuccess, PlaceIssueStateResponse } from '~/services/placeIssueService'
import type { StatusBadgeTone } from '~/utils/ui'

type IssueMetricId = 'in-progress' | 'open' | 'resolved' | 'urgent'
type NoticeTone = 'error' | 'info' | 'success' | 'warning'

useHead({ title: 'Admin hlásenia nedostatkov' })

const { getLakeName, lakes, placeIssues } = usePondData()
const { canOperate, isReadOnly, label: accessLabel, readOnlyMessage } = useAdminModuleAccess('issues')
const requestFetch = useRequestFetch()

const fallbackIssueState = (): PlaceIssueStateResponse => ({
  ok: true,
  placeIssues,
  updatedAt: 'seed',
})

const { data: issueState } = await useAsyncData<PlaceIssueStateResponse>(
  'admin-place-issue-state',
  () => requestFetch<PlaceIssueStateResponse>('/api/admin/place-issues'),
  {
    default: fallbackIssueState,
  },
)

const liveIssues = ref<PlaceIssue[]>([...issueState.value.placeIssues])
const selectedIssueId = ref(liveIssues.value.find((issue) => issue.status !== 'resolved' && issue.status !== 'rejected')?.id ?? liveIssues.value[0]?.id ?? '')
const statusFilter = ref<PlaceIssueStatus | 'all' | 'open'>('open')
const priorityFilter = ref<PlaceIssuePriority | 'all'>('all')
const lakeFilter = ref<LakeScope>('all')
const actionStatus = ref<'error' | 'idle' | 'submitting' | 'success'>('idle')
const actionMessage = ref('')
const actionForm = reactive({
  assignedTo: '',
  internalNote: '',
  priority: 'normal' as PlaceIssuePriority,
  resolutionNote: '',
  status: 'new' as PlaceIssueStatus,
})

watch(issueState, (state) => {
  liveIssues.value = [...state.placeIssues]
}, { immediate: true })

const selectedIssue = computed(() =>
  liveIssues.value.find((issue) => issue.id === selectedIssueId.value) ?? liveIssues.value[0],
)

watch(selectedIssue, (issue) => {
  if (!issue) return

  actionForm.assignedTo = issue.assignedTo ?? ''
  actionForm.internalNote = issue.internalNote
  actionForm.priority = issue.priority
  actionForm.resolutionNote = issue.resolutionNote ?? ''
  actionForm.status = issue.status
}, { immediate: true })

const openIssues = computed(() =>
  liveIssues.value.filter((issue) => issue.status !== 'resolved' && issue.status !== 'rejected'),
)
const urgentIssues = computed(() =>
  openIssues.value.filter((issue) => issue.priority === 'urgent'),
)
const inProgressIssues = computed(() =>
  liveIssues.value.filter((issue) => issue.status === 'in-progress'),
)
const resolvedIssues = computed(() =>
  liveIssues.value.filter((issue) => issue.status === 'resolved'),
)

const filteredIssues = computed(() =>
  liveIssues.value
    .filter((issue) => lakeFilter.value === 'all' || issue.lake === lakeFilter.value)
    .filter((issue) => priorityFilter.value === 'all' || issue.priority === priorityFilter.value)
    .filter((issue) => {
      if (statusFilter.value === 'all') return true
      if (statusFilter.value === 'open') return issue.status !== 'resolved' && issue.status !== 'rejected'

      return issue.status === statusFilter.value
    }),
)

const statusOptions = computed(() =>
  Object.entries(placeIssueStatusLabels).map(([value, label]) => ({
    label,
    value: value as PlaceIssueStatus,
  })),
)
const priorityOptions = computed(() =>
  Object.entries(placeIssuePriorityLabels).map(([value, label]) => ({
    label,
    value: value as PlaceIssuePriority,
  })),
)
const lakeOptions = computed(() => [
  { label: 'Všetky jazerá', value: 'all' as LakeScope },
  ...lakes.map((lake) => ({ label: lake.name, value: lake.slug })),
])

const issueFiltersActive = computed(() =>
  lakeFilter.value !== 'all' || priorityFilter.value !== 'all' || statusFilter.value !== 'open',
)

const issueMetrics = computed<Array<{
  description: string
  icon: string
  id: IssueMetricId
  label: string
  tone: StatusBadgeTone
  value: number
}>>(() => [
  {
    description: 'nové alebo rozpracované',
    icon: 'i-heroicons-inbox-stack',
    id: 'open',
    label: 'Otvorené',
    tone: 'primary',
    value: openIssues.value.length,
  },
  {
    description: 'bezpečnosť alebo výbava',
    icon: 'i-heroicons-bell-alert',
    id: 'urgent',
    label: 'Urgentné',
    tone: 'error',
    value: urgentIssues.value.length,
  },
  {
    description: 'priradené prevádzke',
    icon: 'i-heroicons-wrench-screwdriver',
    id: 'in-progress',
    label: 'Rieši sa',
    tone: 'warning',
    value: inProgressIssues.value.length,
  },
  {
    description: 'uzavreté hlásenia',
    icon: 'i-heroicons-check-circle',
    id: 'resolved',
    label: 'Vyriešené',
    tone: 'success',
    value: resolvedIssues.value.length,
  },
])

const actionNoticeTitle = computed(() => {
  if (actionStatus.value === 'error') return 'Hlásenie sa nepodarilo uložiť'
  if (actionStatus.value === 'submitting') return 'Ukladám hlásenie'
  return 'Hlásenie je uložené'
})
const actionNoticeTone = computed<NoticeTone>(() => {
  if (actionStatus.value === 'error') return 'error'
  if (actionStatus.value === 'submitting') return 'info'
  return 'success'
})
const actionNoticeIcon = computed(() => {
  if (actionStatus.value === 'error') return 'i-heroicons-exclamation-triangle'
  if (actionStatus.value === 'submitting') return 'i-heroicons-arrow-path'
  return 'i-heroicons-check-circle'
})
const selectedIssuePhoneHref = computed(() => {
  const phone = normalisePhoneForHref(selectedIssue.value?.reporterPhone)
  return phone ? `tel:${phone}` : ''
})
const selectedIssueSmsHref = computed(() => {
  const phone = normalisePhoneForHref(selectedIssue.value?.reporterPhone)
  if (!phone || !selectedIssue.value) return ''

  const message = encodeURIComponent(
    `Dobrý deň, reagujeme na hlásenie "${selectedIssue.value.title}" v Rybolov Cetín. Správca revíru.`,
  )

  return `sms:${phone}?body=${message}`
})

function getStatusTone(status: PlaceIssueStatus): StatusBadgeTone {
  if (status === 'resolved') return 'success'
  if (status === 'rejected') return 'muted'
  if (status === 'in-progress') return 'primary'
  if (status === 'triaged') return 'warning'

  return 'error'
}

function getPriorityTone(priority: PlaceIssuePriority): StatusBadgeTone {
  if (priority === 'urgent') return 'error'
  if (priority === 'normal') return 'warning'

  return 'muted'
}

function getStatusIcon(status: PlaceIssueStatus) {
  if (status === 'resolved') return 'i-heroicons-check-circle'
  if (status === 'rejected') return 'i-heroicons-no-symbol'
  if (status === 'in-progress') return 'i-heroicons-wrench-screwdriver'
  if (status === 'triaged') return 'i-heroicons-clipboard-document-check'

  return 'i-heroicons-exclamation-triangle'
}

function getPriorityIcon(priority: PlaceIssuePriority) {
  if (priority === 'urgent') return 'i-heroicons-bell-alert'
  if (priority === 'normal') return 'i-heroicons-flag'

  return 'i-heroicons-minus-circle'
}

function formatIssueDate(value: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value

  return new Intl.DateTimeFormat('sk-SK', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(parsed))
}

function normalisePhoneForHref(value?: string) {
  if (!value) return ''

  const trimmed = value.trim()
  if (!trimmed) return ''

  return trimmed.replace(/[^\d+]/g, '')
}

function applyMetricFilter(metric: IssueMetricId) {
  if (metric === 'urgent') {
    statusFilter.value = 'open'
    priorityFilter.value = 'urgent'
    return
  }

  priorityFilter.value = 'all'
  statusFilter.value = metric === 'open' ? 'open' : metric
}

function resetIssueFilters() {
  lakeFilter.value = 'all'
  priorityFilter.value = 'all'
  statusFilter.value = 'open'
}

function isMetricActive(metric: IssueMetricId) {
  if (metric === 'urgent') return statusFilter.value === 'open' && priorityFilter.value === 'urgent'
  if (metric === 'open') return statusFilter.value === 'open' && priorityFilter.value === 'all'

  return statusFilter.value === metric && priorityFilter.value === 'all'
}

function applyQuickStatus(status: PlaceIssueStatus) {
  actionForm.status = status

  if (status === 'in-progress' && !actionForm.assignedTo.trim()) {
    actionForm.assignedTo = accessLabel.value
  }

  if (status === 'resolved' && !actionForm.resolutionNote.trim()) {
    actionForm.resolutionNote = 'Nedostatok je odstránený a hlásenie uzavreté.'
  }

  if (status === 'rejected' && !actionForm.resolutionNote.trim()) {
    actionForm.resolutionNote = 'Hlásenie uzavreté bez zásahu.'
  }
}

function getApiErrorMessage(error: unknown, fallback = 'Hlásenie sa nepodarilo uložiť.') {
  const maybeError = error as {
    data?: {
      data?: { messages?: string[] }
      message?: string
    }
    message?: string
  }
  const messages = maybeError.data?.data?.messages
  if (Array.isArray(messages) && messages.length > 0) return messages.join(' ')

  return maybeError.data?.message ?? maybeError.message ?? fallback
}

async function submitIssueAction() {
  if (!selectedIssue.value) return
  if (!canOperate.value) {
    actionStatus.value = 'error'
    actionMessage.value = readOnlyMessage.value
    return
  }

  actionStatus.value = 'submitting'
  actionMessage.value = 'Ukladám zmenu stavu hlásenia.'

  try {
    const result = await $fetch<PlaceIssueActionSuccess>(`/api/admin/place-issues/${selectedIssue.value.id}/action`, {
      body: {
        assignedTo: actionForm.assignedTo,
        internalNote: actionForm.internalNote,
        priority: actionForm.priority,
        resolutionNote: actionForm.resolutionNote,
        status: actionForm.status,
      },
      method: 'POST',
    })

    liveIssues.value = result.placeIssues
    actionStatus.value = 'success'
    actionMessage.value = result.message
  }
  catch (error) {
    actionStatus.value = 'error'
    actionMessage.value = getApiErrorMessage(error)
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Hlásenia nedostatkov"
      description="Prevádzkové hlásenia z lovných miest, chát a servisných bodov."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <DataStatusNotice
        v-if="isReadOnly"
        class="mb-6"
        :description="readOnlyMessage"
        icon="i-heroicons-lock-closed"
        :title="`Režim prístupu: ${accessLabel}`"
        tone="warning"
      />

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button
          v-for="metric in issueMetrics"
          :key="metric.id"
          type="button"
          class="rounded-card border p-4 text-left transition-colors"
          :class="isMetricActive(metric.id)
            ? 'border-primary-300 bg-primary-50 shadow-sm'
            : 'border-border bg-surface hover:border-primary-200 hover:bg-muted'"
          @click="applyMetricFilter(metric.id)"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm text-foreground-muted">{{ metric.label }}</p>
              <p
                class="mt-2 text-3xl font-bold"
                :class="metric.tone === 'error' ? 'text-error-700' : metric.tone === 'success' ? 'text-success-700' : ''"
              >
                {{ metric.value }}
              </p>
            </div>
            <span
              class="grid h-10 w-10 place-items-center rounded-md border"
              :class="isMetricActive(metric.id) ? 'border-primary-200 bg-white text-primary-800' : 'border-border bg-muted text-foreground-muted'"
            >
              <UIcon :name="metric.icon" class="h-5 w-5" />
            </span>
          </div>
          <p class="mt-1 text-sm text-foreground-muted">{{ metric.description }}</p>
        </button>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Zoznam hlásení</h2>
              <p class="text-sm text-foreground-muted">{{ filteredIssues.length }} záznamov podľa filtra</p>
            </div>
            <div class="grid gap-2 sm:grid-cols-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label class="space-y-1 text-xs font-bold text-foreground-muted">
                <span>Jazero</span>
                <select v-model="lakeFilter" class="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground">
                  <option v-for="option in lakeOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </label>
              <label class="space-y-1 text-xs font-bold text-foreground-muted">
                <span>Priorita</span>
                <select v-model="priorityFilter" class="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground">
                  <option value="all">Všetky</option>
                  <option v-for="option in priorityOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </label>
              <label class="space-y-1 text-xs font-bold text-foreground-muted">
                <span>Stav</span>
                <select v-model="statusFilter" class="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground">
                  <option value="open">Otvorené</option>
                  <option value="all">Všetky</option>
                  <option v-for="option in statusOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </label>
              <UButton
                v-if="issueFiltersActive"
                icon="i-heroicons-x-mark"
                variant="ghost"
                class="self-end"
                @click="resetIssueFilters"
              >
                Vyčistiť
              </UButton>
            </div>
          </div>

          <div class="mt-5 space-y-3">
            <button
              v-for="issue in filteredIssues"
              :key="issue.id"
              type="button"
              class="w-full rounded-md border p-4 text-left transition-colors hover:border-primary-200 hover:bg-muted"
              :class="[
                selectedIssue?.id === issue.id ? 'border-primary-700 bg-primary-50 shadow-sm' : 'border-border bg-white',
                issue.priority === 'urgent' && selectedIssue?.id !== issue.id ? 'border-l-error-500 border-l-4' : '',
              ]"
              @click="selectedIssueId = issue.id"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-bold">{{ issue.title }}</p>
                  <p class="mt-1 text-sm text-foreground-muted">
                    {{ getLakeName(issue.lake) }} · {{ issue.targetLabel }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <StatusBadge
                    size="xs"
                    :icon="getStatusIcon(issue.status)"
                    :label="placeIssueStatusLabels[issue.status]"
                    :tone="getStatusTone(issue.status)"
                  />
                  <StatusBadge
                    size="xs"
                    :icon="getPriorityIcon(issue.priority)"
                    :label="placeIssuePriorityLabels[issue.priority]"
                    :tone="getPriorityTone(issue.priority)"
                  />
                </div>
              </div>
              <p class="mt-3 line-clamp-2 text-sm text-foreground-muted">{{ issue.description }}</p>
              <div class="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-foreground-muted">
                <span>{{ placeIssueCategoryLabels[issue.category] }}</span>
                <span>{{ placeIssueTargetTypeLabels[issue.targetType] }}</span>
                <span>{{ formatIssueDate(issue.createdAt) }}</span>
              </div>
            </button>

            <AppState
              v-if="filteredIssues.length === 0"
              title="Žiadne hlásenie"
              description="Skús zmeniť jazero alebo stav filtra."
              icon="i-heroicons-funnel"
            />
          </div>
        </div>

        <div class="rounded-card border border-border bg-surface p-5">
          <div v-if="selectedIssue" class="space-y-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-sm font-semibold text-primary-800">{{ getLakeName(selectedIssue.lake) }} · {{ selectedIssue.targetLabel }}</p>
                <h2 class="mt-1 text-2xl font-bold">{{ selectedIssue.title }}</h2>
                <p class="mt-2 text-sm text-foreground-muted">{{ selectedIssue.description }}</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <UButton
                    v-if="selectedIssuePhoneHref"
                    :to="selectedIssuePhoneHref"
                    icon="i-heroicons-phone"
                    size="xs"
                    variant="soft"
                  >
                    Zavolať
                  </UButton>
                  <UButton
                    v-if="selectedIssueSmsHref"
                    :to="selectedIssueSmsHref"
                    icon="i-heroicons-chat-bubble-left-ellipsis"
                    size="xs"
                    variant="soft"
                  >
                    SMS
                  </UButton>
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <StatusBadge
                  :icon="getStatusIcon(selectedIssue.status)"
                  :label="placeIssueStatusLabels[selectedIssue.status]"
                  :tone="getStatusTone(selectedIssue.status)"
                />
                <StatusBadge
                  :icon="getPriorityIcon(selectedIssue.priority)"
                  :label="placeIssuePriorityLabels[selectedIssue.priority]"
                  :tone="getPriorityTone(selectedIssue.priority)"
                />
              </div>
            </div>

            <dl class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-md bg-muted p-3">
                <dt class="text-xs text-foreground-muted">Kategória</dt>
                <dd class="font-semibold">{{ placeIssueCategoryLabels[selectedIssue.category] }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-xs text-foreground-muted">Cieľ</dt>
                <dd class="font-semibold">{{ placeIssueTargetTypeLabels[selectedIssue.targetType] }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-xs text-foreground-muted">Nahlásil</dt>
                <dd class="font-semibold">{{ selectedIssue.reporterName || 'bez mena' }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-xs text-foreground-muted">Kontakt</dt>
                <dd class="font-semibold">{{ selectedIssue.reporterPhone || 'bez kontaktu' }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-xs text-foreground-muted">Nahlásené</dt>
                <dd class="font-semibold">{{ formatIssueDate(selectedIssue.createdAt) }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-xs text-foreground-muted">Priradené</dt>
                <dd class="font-semibold">{{ selectedIssue.assignedTo || 'nepriradené' }}</dd>
              </div>
              <div v-if="selectedIssue.photoLabel" class="rounded-md bg-muted p-3 sm:col-span-2">
                <dt class="text-xs text-foreground-muted">Fotka alebo poznámka k fotke</dt>
                <dd class="font-semibold">{{ selectedIssue.photoLabel }}</dd>
              </div>
            </dl>

            <form class="space-y-4 border-t border-border pt-5" @submit.prevent="submitIssueAction">
              <div class="rounded-md border border-border bg-white p-3">
                <p class="text-sm font-bold">Rýchle kroky</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <UButton
                    type="button"
                    icon="i-heroicons-clipboard-document-check"
                    size="xs"
                    variant="soft"
                    :disabled="!canOperate"
                    @click="applyQuickStatus('triaged')"
                  >
                    Prijať
                  </UButton>
                  <UButton
                    type="button"
                    icon="i-heroicons-wrench-screwdriver"
                    size="xs"
                    variant="soft"
                    :disabled="!canOperate"
                    @click="applyQuickStatus('in-progress')"
                  >
                    Prevziať
                  </UButton>
                  <UButton
                    type="button"
                    icon="i-heroicons-check-circle"
                    size="xs"
                    variant="soft"
                    :disabled="!canOperate"
                    @click="applyQuickStatus('resolved')"
                  >
                    Vyriešené
                  </UButton>
                  <UButton
                    type="button"
                    icon="i-heroicons-no-symbol"
                    size="xs"
                    variant="ghost"
                    :disabled="!canOperate"
                    @click="applyQuickStatus('rejected')"
                  >
                    Zamietnuť
                  </UButton>
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <label class="space-y-1 text-sm font-semibold">
                  <span>Stav</span>
                  <select v-model="actionForm.status" class="w-full rounded-md border border-border bg-white px-3 py-2 text-sm" :disabled="!canOperate">
                    <option v-for="option in statusOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <label class="space-y-1 text-sm font-semibold">
                  <span>Priorita</span>
                  <select v-model="actionForm.priority" class="w-full rounded-md border border-border bg-white px-3 py-2 text-sm" :disabled="!canOperate">
                    <option v-for="option in priorityOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
              </div>

              <label class="block space-y-1 text-sm font-semibold">
                <span>Priradené</span>
                <input v-model="actionForm.assignedTo" class="w-full rounded-md border border-border px-3 py-2 text-sm" :disabled="!canOperate" placeholder="meno alebo rola">
              </label>

              <label class="block space-y-1 text-sm font-semibold">
                <span>Interná poznámka</span>
                <textarea v-model="actionForm.internalNote" class="min-h-24 w-full rounded-md border border-border px-3 py-2 text-sm" :disabled="!canOperate" />
              </label>

              <label class="block space-y-1 text-sm font-semibold">
                <span>Riešenie</span>
                <textarea v-model="actionForm.resolutionNote" class="min-h-20 w-full rounded-md border border-border px-3 py-2 text-sm" :disabled="!canOperate" placeholder="čo sa opravilo alebo prečo sa hlásenie zamieta" />
              </label>

              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <DataStatusNotice
                  v-if="actionMessage"
                  class="sm:flex-1"
                  :description="actionMessage"
                  :icon="actionNoticeIcon"
                  :loading="actionStatus === 'submitting'"
                  :title="actionNoticeTitle"
                  :tone="actionNoticeTone"
                />
                <UButton
                  type="submit"
                  icon="i-heroicons-check-circle"
                  color="warning"
                  class="sm:ml-auto"
                  :disabled="!canOperate"
                  :loading="actionStatus === 'submitting'"
                >
                  Uložiť hlásenie
                </UButton>
              </div>
            </form>
          </div>

          <AppState
            v-else
            title="Zatiaľ nie je vybrané žiadne hlásenie"
            description="Vyber hlásenie zo zoznamu alebo uprav filter."
            icon="i-heroicons-inbox"
          />
        </div>
      </div>
    </section>
  </div>
</template>
