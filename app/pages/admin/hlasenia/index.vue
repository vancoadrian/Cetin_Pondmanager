<script setup lang="ts">
import type { LakeScope, PlaceIssue, PlaceIssuePriority, PlaceIssueStatus } from '~/data/pond'
import {
  placeIssueCategoryLabels,
  placeIssuePriorityLabels,
  placeIssueStatusLabels,
  placeIssueTargetTypeLabels,
} from '~/data/pond'
import type { PlaceIssueActionSuccess, PlaceIssueStateResponse } from '~/services/placeIssueService'

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

function getStatusTone(status: PlaceIssueStatus) {
  if (status === 'resolved') return 'success'
  if (status === 'rejected') return 'muted'
  if (status === 'in-progress') return 'primary'
  if (status === 'triaged') return 'warning'

  return 'error'
}

function getPriorityTone(priority: PlaceIssuePriority) {
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
  actionMessage.value = ''

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

      <div
        v-if="isReadOnly"
        class="mb-6 rounded-card border border-warning-500/25 bg-warning-500/10 p-4 text-sm text-warning-800"
      >
        <p class="font-bold">Režim prístupu: {{ accessLabel }}</p>
        <p class="mt-1">{{ readOnlyMessage }}</p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-sm text-foreground-muted">Otvorené</p>
          <p class="mt-2 text-3xl font-bold">{{ openIssues.length }}</p>
          <p class="mt-1 text-sm text-foreground-muted">nové alebo rozpracované</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-sm text-foreground-muted">Urgentné</p>
          <p class="mt-2 text-3xl font-bold text-error-700">{{ urgentIssues.length }}</p>
          <p class="mt-1 text-sm text-foreground-muted">bezpečnosť alebo výbava</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-sm text-foreground-muted">Rieši sa</p>
          <p class="mt-2 text-3xl font-bold">{{ inProgressIssues.length }}</p>
          <p class="mt-1 text-sm text-foreground-muted">priradené prevádzke</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-sm text-foreground-muted">Vyriešené</p>
          <p class="mt-2 text-3xl font-bold">{{ resolvedIssues.length }}</p>
          <p class="mt-1 text-sm text-foreground-muted">uzavreté hlásenia</p>
        </div>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Zoznam hlásení</h2>
              <p class="text-sm text-foreground-muted">{{ filteredIssues.length }} záznamov podľa filtra</p>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <label class="space-y-1 text-xs font-bold text-foreground-muted">
                <span>Jazero</span>
                <select v-model="lakeFilter" class="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground">
                  <option v-for="option in lakeOptions" :key="option.value" :value="option.value">
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
            </dl>

            <form class="space-y-4 border-t border-border pt-5" @submit.prevent="submitIssueAction">
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

              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p
                  v-if="actionMessage"
                  class="text-sm font-semibold"
                  :class="actionStatus === 'error' ? 'text-error-700' : 'text-success-700'"
                >
                  {{ actionMessage }}
                </p>
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

          <p v-else class="rounded-md bg-muted p-4 text-sm text-foreground-muted">
            Zatiaľ nie je vybrané žiadne hlásenie.
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
