<script setup lang="ts">
import type { TournamentPenalty, TournamentRuleCheck } from '~/data/pond'
import type {
  TournamentActionSuccess,
  TournamentCatchVerificationSuccess,
  TournamentPenaltySubmissionSuccess,
  TournamentRuleCheckSubmissionSuccess,
  TournamentStateResponse,
} from '~/services/tournamentApiService'
import {
  getValidationMessages,
  tournamentPenaltyInputSchema,
  tournamentRuleCheckInputSchema,
} from '~/schemas/pondSchemas'

useHead({ title: 'Admin súťaže' })

const {
  tournaments: seedTournaments,
  tournamentCatches: seedTournamentCatches,
  tournamentMarshals: seedTournamentMarshals,
  tournamentMarshalStatusLabels,
  tournamentPenalties: seedTournamentPenalties,
  tournamentPenaltyTypeLabels,
  tournamentRequests: seedTournamentRequests,
  tournamentRequestStatusLabels,
  tournamentRequestTypeLabels,
  tournamentRuleChecks: seedTournamentRuleChecks,
} = usePondData()

const fallbackTournamentState = (): TournamentStateResponse => ({
  ok: true,
  tournamentCatches: seedTournamentCatches,
  tournamentMarshals: seedTournamentMarshals,
  tournamentPenalties: seedTournamentPenalties,
  tournamentRequests: seedTournamentRequests,
  tournamentRuleChecks: seedTournamentRuleChecks,
  tournaments: seedTournaments,
  updatedAt: 'seed',
})
const { data: tournamentState, refresh: refreshTournamentState } = await useAsyncData<TournamentStateResponse>(
  'admin-tournament-state',
  () => $fetch<TournamentStateResponse>('/api/tournaments'),
  {
    default: fallbackTournamentState,
  },
)

const liveTournaments = computed(() => tournamentState.value?.tournaments ?? seedTournaments)
const liveTournamentCatches = computed(() => tournamentState.value?.tournamentCatches ?? seedTournamentCatches)
const liveTournamentMarshals = computed(() => tournamentState.value?.tournamentMarshals ?? seedTournamentMarshals)
const liveTournamentPenalties = computed(() => tournamentState.value?.tournamentPenalties ?? seedTournamentPenalties)
const liveTournamentRequests = computed(() => tournamentState.value?.tournamentRequests ?? seedTournamentRequests)
const liveTournamentRuleChecks = computed(() => tournamentState.value?.tournamentRuleChecks ?? seedTournamentRuleChecks)
const activeTournament = computed(() => liveTournaments.value[0] ?? seedTournaments[0]!)
const actionStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const actionMessage = ref('')
const activeActionId = ref('')
const penaltyForm = reactive({
  durationHours: 2,
  marshalId: 'marshal-2',
  reason: 'Tím porušil vyznačený limit sektora.',
  rodsLess: 1,
  sectorId: 'b4',
  type: 'rod-reduction' as TournamentPenalty['type'],
})
const ruleCheckForm = reactive({
  marshalId: 'marshal-1',
  note: 'Montáže, počet prútov a pripravená podložka sú v poriadku.',
  result: 'ok' as TournamentRuleCheck['result'],
  sectorId: 'a1',
})
const penaltyTypeOptions = Object.entries(tournamentPenaltyTypeLabels) as [
  TournamentPenalty['type'],
  string,
][]
const ruleCheckResultLabels = {
  ok: 'OK',
  penalty: 'trest',
  warning: 'napomenutie',
} as const
const ruleCheckResultOptions = Object.entries(ruleCheckResultLabels) as [
  TournamentRuleCheck['result'],
  string,
][]

const activeRequests = computed(() =>
  liveTournamentRequests.value.filter(
    (request) => request.tournamentId === activeTournament.value.id && request.status !== 'resolved',
  ),
)
const waitingCatches = computed(() =>
  liveTournamentCatches.value.filter((catchItem) => catchItem.status === 'waiting'),
)
const activePenalties = computed(() =>
  liveTournamentPenalties.value.filter((penalty) => penalty.status === 'active'),
)

const sectorLabel = (sectorId: string) =>
  activeTournament.value.sectors.find((sector) => sector.id === sectorId)?.label ?? sectorId

const marshalName = (marshalId?: string) =>
  liveTournamentMarshals.value.find((marshal) => marshal.id === marshalId)?.name ?? 'nepriradený'

const marshalsForSector = (sectorId: string) =>
  liveTournamentMarshals.value.filter((marshal) => marshal.assignedSectorIds.includes(sectorId))

const penaltyDraft = computed(() => ({
  durationHours: penaltyForm.type === 'fishing-pause' || penaltyForm.type === 'rod-reduction'
    ? penaltyForm.durationHours
    : undefined,
  marshalId: penaltyForm.marshalId,
  reason: penaltyForm.reason,
  rodsLess: penaltyForm.type === 'rod-reduction' ? penaltyForm.rodsLess : undefined,
  sectorId: penaltyForm.sectorId,
  tournamentId: activeTournament.value.id,
  type: penaltyForm.type,
}))
const ruleCheckDraft = computed(() => ({
  marshalId: ruleCheckForm.marshalId,
  note: ruleCheckForm.note,
  result: ruleCheckForm.result,
  sectorId: ruleCheckForm.sectorId,
  tournamentId: activeTournament.value.id,
}))
const penaltyValidation = computed(() => tournamentPenaltyInputSchema.safeParse(penaltyDraft.value))
const ruleCheckValidation = computed(() => tournamentRuleCheckInputSchema.safeParse(ruleCheckDraft.value))
const penaltyValidationMessages = computed(() => getValidationMessages(penaltyValidation.value))
const ruleCheckValidationMessages = computed(() => getValidationMessages(ruleCheckValidation.value))

const getApiErrorMessage = (error: unknown) => {
  const fetchError = error as {
    data?: {
      data?: {
        messages?: string[]
      }
      message?: string
      statusMessage?: string
    }
  }
  const messages = fetchError.data?.data?.messages

  return messages?.join(' ') || fetchError.data?.message || fetchError.data?.statusMessage || 'Akciu sa nepodarilo uložiť.'
}

const submitRequestAction = async (requestId: string, action: 'assign' | 'resolve') => {
  actionStatus.value = 'submitting'
  actionMessage.value = ''
  activeActionId.value = `${requestId}:${action}`

  try {
    const result = await $fetch<TournamentActionSuccess>(`/api/admin/tournaments/requests/${requestId}/action`, {
      body: { action },
      method: 'POST',
    })

    actionStatus.value = 'success'
    actionMessage.value = result.message
    await refreshTournamentState()
  }
  catch (error) {
    actionStatus.value = 'error'
    actionMessage.value = getApiErrorMessage(error)
  }
  finally {
    activeActionId.value = ''
  }
}

const verifyCatch = async (catchId: string) => {
  actionStatus.value = 'submitting'
  actionMessage.value = ''
  activeActionId.value = `${catchId}:verify`

  try {
    const result = await $fetch<TournamentCatchVerificationSuccess>(`/api/admin/tournaments/catches/${catchId}/verify`, {
      body: { status: 'verified' },
      method: 'POST',
    })

    actionStatus.value = 'success'
    actionMessage.value = result.message
    await refreshTournamentState()
  }
  catch (error) {
    actionStatus.value = 'error'
    actionMessage.value = getApiErrorMessage(error)
  }
  finally {
    activeActionId.value = ''
  }
}

const submitPenalty = async () => {
  const validation = penaltyValidation.value
  if (!validation.success) {
    actionStatus.value = 'error'
    actionMessage.value = penaltyValidationMessages.value[0] ?? 'Skontrolujte trest.'
    return
  }

  actionStatus.value = 'submitting'
  actionMessage.value = ''
  activeActionId.value = 'penalty:create'

  try {
    const result = await $fetch<TournamentPenaltySubmissionSuccess>('/api/admin/tournaments/penalties', {
      body: validation.data,
      method: 'POST',
    })

    actionStatus.value = 'success'
    actionMessage.value = result.message
    await refreshTournamentState()
  }
  catch (error) {
    actionStatus.value = 'error'
    actionMessage.value = getApiErrorMessage(error)
  }
  finally {
    activeActionId.value = ''
  }
}

const submitRuleCheck = async () => {
  const validation = ruleCheckValidation.value
  if (!validation.success) {
    actionStatus.value = 'error'
    actionMessage.value = ruleCheckValidationMessages.value[0] ?? 'Skontrolujte kontrolu pravidiel.'
    return
  }

  actionStatus.value = 'submitting'
  actionMessage.value = ''
  activeActionId.value = 'rule-check:create'

  try {
    const result = await $fetch<TournamentRuleCheckSubmissionSuccess>('/api/admin/tournaments/rule-checks', {
      body: validation.data,
      method: 'POST',
    })

    actionStatus.value = 'success'
    actionMessage.value = result.message
    await refreshTournamentState()
  }
  catch (error) {
    actionStatus.value = 'error'
    actionMessage.value = getApiErrorMessage(error)
  }
  finally {
    activeActionId.value = ''
  }
}

const syncMarshalForSector = (kind: 'penalty' | 'rule-check') => {
  const form = kind === 'penalty' ? penaltyForm : ruleCheckForm
  const options = marshalsForSector(form.sectorId)

  if (!options.some((marshal) => marshal.id === form.marshalId)) {
    form.marshalId = options[0]?.id ?? ''
  }
}

watch(() => penaltyForm.sectorId, () => syncMarshalForSector('penalty'), { immediate: true })
watch(() => ruleCheckForm.sectorId, () => syncMarshalForSector('rule-check'), { immediate: true })
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Súťažný dispečing"
      description="Interný prehľad pre organizátora: hlásenia tímov, kontrolóri, váženia, tresty a kontroly sektorov."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div class="grid gap-4 md:grid-cols-4">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Aktívne hlásenia</p>
          <p class="mt-2 text-3xl font-bold">{{ activeRequests.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Čaká na váženie</p>
          <p class="mt-2 text-3xl font-bold">{{ waitingCatches.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Aktívne tresty</p>
          <p class="mt-2 text-3xl font-bold">{{ activePenalties.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Kontrolóri</p>
          <p class="mt-2 text-3xl font-bold">{{ liveTournamentMarshals.length }}</p>
        </div>
      </div>

      <p
        v-if="actionMessage"
        class="mt-4 rounded-md px-3 py-2 text-sm font-semibold"
        :class="
          actionStatus === 'success'
            ? 'bg-success-500/10 text-success-700'
            : 'bg-error-500/10 text-error-700'
        "
      >
        {{ actionMessage }}
      </p>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Front hlásení</h2>
            <div class="mt-4 space-y-3">
              <div v-for="request in liveTournamentRequests" :key="request.id" class="rounded-md border border-border bg-white p-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-bold">{{ request.team }} · {{ sectorLabel(request.sectorId) }}</p>
                    <p class="text-primary-800 text-sm font-semibold">{{ tournamentRequestTypeLabels[request.type] }}</p>
                  </div>
                  <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold">
                    {{ tournamentRequestStatusLabels[request.status] }}
                  </span>
                </div>
                <p class="text-foreground-muted mt-3 text-sm">{{ request.description }}</p>
                <div class="mt-4 flex flex-wrap gap-2">
                  <UButton
                    size="sm"
                    icon="i-heroicons-user-plus"
                    variant="soft"
                    :disabled="request.status === 'resolved' || actionStatus === 'submitting'"
                    :loading="activeActionId === `${request.id}:assign`"
                    @click="submitRequestAction(request.id, 'assign')"
                  >
                    Priradiť kontrolóra
                  </UButton>
                  <UButton
                    size="sm"
                    icon="i-heroicons-check"
                    color="neutral"
                    variant="soft"
                    :disabled="request.status === 'resolved' || actionStatus === 'submitting'"
                    :loading="activeActionId === `${request.id}:resolve`"
                    @click="submitRequestAction(request.id, 'resolve')"
                  >
                    Uzavrieť
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Váženia úlovkov</h2>
            <div class="mt-4 overflow-hidden rounded-md border border-border">
              <div v-for="catchItem in liveTournamentCatches" :key="catchItem.id" class="border-b border-border bg-white p-4 last:border-b-0">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-bold">{{ catchItem.team }} · {{ sectorLabel(catchItem.sectorId) }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ catchItem.species }} · {{ catchItem.weightKg }} kg · {{ catchItem.lengthCm }} cm
                    </p>
                  </div>
                  <span class="rounded-md bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-800">
                    {{ catchItem.status }}
                  </span>
                </div>
                <p class="text-foreground-muted mt-2 text-sm">
                  Kontrolór: {{ marshalName(catchItem.verifiedByMarshalId) }} · {{ catchItem.notes }}
                </p>
                <div v-if="catchItem.status === 'waiting'" class="mt-4">
                  <UButton
                    size="sm"
                    icon="i-heroicons-scale"
                    variant="soft"
                    :disabled="actionStatus === 'submitting'"
                    :loading="activeActionId === `${catchItem.id}:verify`"
                    @click="verifyCatch(catchItem.id)"
                  >
                    Overiť váženie
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Kontrolóri</h2>
            <div class="mt-4 space-y-3">
              <div v-for="marshal in liveTournamentMarshals" :key="marshal.id" class="rounded-md bg-muted p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ marshal.name }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ marshal.assignedSectorIds.map(sectorLabel).join(', ') }}
                    </p>
                  </div>
                  <span class="rounded-md bg-white px-2 py-1 text-xs font-bold text-primary-800">
                    {{ tournamentMarshalStatusLabels[marshal.status] }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Zapísať trest</h2>
            <form class="mt-4 space-y-4" @submit.prevent="submitPenalty">
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Sektor</span>
                  <select
                    v-model="penaltyForm.sectorId"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option v-for="sector in activeTournament.sectors" :key="sector.id" :value="sector.id">
                      {{ sector.label }} · {{ sector.team }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Kontrolór</span>
                  <select
                    v-model="penaltyForm.marshalId"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option v-for="marshal in marshalsForSector(penaltyForm.sectorId)" :key="marshal.id" :value="marshal.id">
                      {{ marshal.name }}
                    </option>
                  </select>
                </label>
              </div>

              <label class="block">
                <span class="text-sm font-semibold">Typ trestu</span>
                <select
                  v-model="penaltyForm.type"
                  class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                >
                  <option v-for="[value, label] in penaltyTypeOptions" :key="value" :value="value">
                    {{ label }}
                  </option>
                </select>
              </label>

              <div
                v-if="penaltyForm.type === 'fishing-pause' || penaltyForm.type === 'rod-reduction'"
                class="grid gap-3 sm:grid-cols-2"
              >
                <label class="block">
                  <span class="text-sm font-semibold">Trvanie h</span>
                  <input
                    v-model.number="penaltyForm.durationHours"
                    type="number"
                    min="1"
                    max="24"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
                <label v-if="penaltyForm.type === 'rod-reduction'" class="block">
                  <span class="text-sm font-semibold">O koľko prútov</span>
                  <input
                    v-model.number="penaltyForm.rodsLess"
                    type="number"
                    min="1"
                    max="4"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
              </div>

              <label class="block">
                <span class="text-sm font-semibold">Dôvod</span>
                <textarea
                  v-model="penaltyForm.reason"
                  rows="3"
                  class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                />
              </label>

              <ValidationSummary
                :messages="penaltyValidationMessages"
                valid-title="Trest je pripravený"
                valid-description="Sektor, kontrolór, typ a dôvod sú pripravené na uloženie."
              />

              <UButton
                type="submit"
                icon="i-heroicons-no-symbol"
                block
                :disabled="!penaltyValidation.success || actionStatus === 'submitting'"
                :loading="activeActionId === 'penalty:create'"
              >
                Uložiť trest
              </UButton>
            </form>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Zapísať kontrolu</h2>
            <form class="mt-4 space-y-4" @submit.prevent="submitRuleCheck">
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Sektor</span>
                  <select
                    v-model="ruleCheckForm.sectorId"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option v-for="sector in activeTournament.sectors" :key="sector.id" :value="sector.id">
                      {{ sector.label }} · {{ sector.team }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Kontrolór</span>
                  <select
                    v-model="ruleCheckForm.marshalId"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option v-for="marshal in marshalsForSector(ruleCheckForm.sectorId)" :key="marshal.id" :value="marshal.id">
                      {{ marshal.name }}
                    </option>
                  </select>
                </label>
              </div>

              <label class="block">
                <span class="text-sm font-semibold">Výsledok</span>
                <select
                  v-model="ruleCheckForm.result"
                  class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                >
                  <option v-for="[value, label] in ruleCheckResultOptions" :key="value" :value="value">
                    {{ label }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-sm font-semibold">Poznámka</span>
                <textarea
                  v-model="ruleCheckForm.note"
                  rows="3"
                  class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                />
              </label>

              <ValidationSummary
                :messages="ruleCheckValidationMessages"
                valid-title="Kontrola je pripravená"
                valid-description="Kontrolór, sektor, výsledok a poznámka sú pripravené na uloženie."
              />

              <UButton
                type="submit"
                icon="i-heroicons-clipboard-document-check"
                block
                :disabled="!ruleCheckValidation.success || actionStatus === 'submitting'"
                :loading="activeActionId === 'rule-check:create'"
              >
                Uložiť kontrolu
              </UButton>
            </form>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Tresty</h2>
            <div class="mt-4 space-y-3">
              <div v-for="penalty in liveTournamentPenalties" :key="penalty.id" class="rounded-md border border-border bg-white p-4">
                <p class="font-bold">{{ penalty.team }} · {{ sectorLabel(penalty.sectorId) }}</p>
                <p class="text-error-700 text-sm font-semibold">{{ tournamentPenaltyTypeLabels[penalty.type] }}</p>
                <p class="text-foreground-muted mt-2 text-sm">{{ penalty.reason }}</p>
              </div>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Kontroly sektorov</h2>
            <div class="mt-4 space-y-3">
              <div v-for="check in liveTournamentRuleChecks" :key="check.id" class="rounded-md bg-muted p-4">
                <p class="font-semibold">{{ sectorLabel(check.sectorId) }} · {{ marshalName(check.marshalId) }}</p>
                <p class="text-foreground-muted mt-1 text-sm">{{ check.note }}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
