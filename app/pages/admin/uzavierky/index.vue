<script setup lang="ts">
import type { LakeClosure, LakeScope } from '~/data/pond'
import type {
  ClosureMutationSuccess,
} from '~/services/closureApiService'

useHead({ title: 'Admin uzávierky' })

const { getLakeName, lakes, pegs } = usePondData()
const {
  canManage: canManageClosures,
  isReadOnly: closuresReadOnly,
  label: closureAccessLabel,
  readOnlyMessage: closureReadOnlyMessage,
} = useAdminModuleAccess('closures')

const reasonLabels: Record<LakeClosure['reason'], string> = {
  emergency: 'mimoriadna situácia',
  maintenance: 'údržba',
  pandemic: 'pandémia',
  season: 'sezóna',
  spawning: 'neres',
  tournament: 'preteky',
}

const reasonOptions = Object.entries(reasonLabels).map(([value, label]) => ({ label, value }))
const { liveClosures: unsortedLiveClosures, refresh: refreshClosureState } = await useClosureState({
  admin: true,
  key: 'admin-closures-state',
})

const closureDraft = reactive({
  affectsReservations: true,
  from: '2026-06-01',
  lake: 'velky-cetin' as LakeScope,
  notes: 'Krátkodobá blokácia pre servisné práce pri brehu.',
  organization: '',
  pegIds: [] as string[],
  reason: 'maintenance' as LakeClosure['reason'],
  title: 'Servisné práce pri brehu',
  to: '2026-06-02',
  visibility: 'internal' as LakeClosure['visibility'],
})
const closureSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const closureSubmitMessage = ref('')

const liveClosures = computed(() =>
  [...unsortedLiveClosures.value].sort((first, second) =>
    first.from.localeCompare(second.from),
  ),
)
const publicClosures = computed(() => liveClosures.value.filter((closure) => closure.visibility === 'public'))
const internalClosures = computed(() => liveClosures.value.filter((closure) => closure.visibility === 'internal'))
const blockingClosures = computed(() => liveClosures.value.filter((closure) => closure.affectsReservations))
const availablePegTargets = computed(() =>
  pegs.filter((peg) => closureDraft.lake === 'all' || peg.lake === closureDraft.lake),
)

watch(
  () => closureDraft.lake,
  () => {
    const allowedPegIds = new Set(availablePegTargets.value.map((peg) => peg.id))
    closureDraft.pegIds = closureDraft.pegIds.filter((pegId) => allowedPegIds.has(pegId))
  },
)

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

  return messages?.join(' ') || fetchError.data?.message || fetchError.data?.statusMessage || 'Uzávierku sa nepodarilo uložiť.'
}

async function submitClosure() {
  if (!canManageClosures.value) {
    closureSubmitStatus.value = 'error'
    closureSubmitMessage.value = closureReadOnlyMessage.value
    return
  }

  closureSubmitStatus.value = 'submitting'
  closureSubmitMessage.value = 'Ukladám uzávierku do lokálneho stavu dostupnosti.'

  try {
    const result = await $fetch<ClosureMutationSuccess>('/api/admin/closures', {
      body: {
        ...closureDraft,
        organization: closureDraft.organization.trim() || undefined,
        pegIds: [...closureDraft.pegIds],
      },
      method: 'POST',
    })

    await refreshClosureState()
    closureSubmitStatus.value = 'success'
    closureSubmitMessage.value = result.message
  }
  catch (error) {
    closureSubmitStatus.value = 'error'
    closureSubmitMessage.value = getApiErrorMessage(error)
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Uzávierky, sezóny a výnimky"
      description="Miesto pre neres, údržbu, zimný režim, pandémiu, preteky aj interné servisné blokácie."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div
        v-if="closuresReadOnly"
        class="mb-5 rounded-card border border-info-500/25 bg-info-500/10 p-4 text-info-700"
      >
        <p class="text-sm font-bold">Režim prístupu: {{ closureAccessLabel }}</p>
        <p class="mt-1 text-sm">{{ closureReadOnlyMessage }}</p>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Public uzávierky</p>
          <p class="mt-2 text-3xl font-bold">{{ publicClosures.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Interné blokácie</p>
          <p class="mt-2 text-3xl font-bold">{{ internalClosures.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Blokujú rezervácie</p>
          <p class="mt-2 text-3xl font-bold">{{ blockingClosures.length }}</p>
        </div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_0.75fr]">
        <div class="rounded-card border border-border bg-surface p-5">
          <h2 class="text-lg font-bold">Kalendár uzávierok</h2>
          <div class="mt-5 space-y-3">
            <div v-for="closure in liveClosures" :key="closure.id" class="rounded-md border border-border bg-white p-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-bold">{{ closure.title }}</p>
                  <p class="text-foreground-muted text-sm">
                    {{ closure.lake === 'all' ? 'Všetky jazerá' : getLakeName(closure.lake) }} ·
                    {{ closure.from }} až {{ closure.to }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <span class="rounded-md bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-800">
                    {{ reasonLabels[closure.reason] }}
                  </span>
                  <span
                    class="rounded-md px-2.5 py-1 text-xs font-bold"
                    :class="
                      closure.visibility === 'public'
                        ? 'bg-success-500/10 text-success-700'
                        : 'bg-warning-500/10 text-warning-700'
                    "
                  >
                    {{ closure.visibility === 'public' ? 'public' : 'interné' }}
                  </span>
                </div>
              </div>
              <p class="text-foreground-muted mt-3 text-sm">{{ closure.notes }}</p>
              <p v-if="closure.organization" class="text-primary-800 mt-3 text-sm font-semibold">
                Organizácia: {{ closure.organization }}
              </p>
              <div v-if="closure.pegIds?.length" class="mt-3 flex flex-wrap gap-2 text-xs">
                <span
                  v-for="pegId in closure.pegIds"
                  :key="pegId"
                  class="rounded-md bg-muted px-2 py-1 font-semibold text-foreground-muted"
                >
                  {{ pegId }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Nová uzávierka</h2>
            <form class="mt-4 space-y-4" @submit.prevent="submitClosure">
              <fieldset :disabled="!canManageClosures" class="contents">
                <label class="block">
                  <span class="text-sm font-semibold">Názov</span>
                  <input v-model="closureDraft.title" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Jazero</span>
                  <select v-model="closureDraft.lake" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                    <option value="all">Všetky jazerá</option>
                    <option v-for="lake in lakes" :key="lake.slug" :value="lake.slug">{{ lake.name }}</option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Dôvod</span>
                  <select v-model="closureDraft.reason" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                    <option v-for="option in reasonOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="block">
                    <span class="text-sm font-semibold">Od</span>
                    <input v-model="closureDraft.from" type="date" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Do</span>
                    <input v-model="closureDraft.to" type="date" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                  </label>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="block">
                    <span class="text-sm font-semibold">Viditeľnosť</span>
                    <select v-model="closureDraft.visibility" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                      <option value="public">public</option>
                      <option value="internal">interné</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Organizácia</span>
                    <input v-model="closureDraft.organization" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm" placeholder="voliteľné">
                  </label>
                </div>
                <label class="flex items-center gap-2 rounded-md bg-muted p-3 text-sm font-semibold">
                  <input v-model="closureDraft.affectsReservations" type="checkbox" class="h-4 w-4 accent-primary-700">
                  Blokuje rezervácie
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Poznámka</span>
                  <textarea v-model="closureDraft.notes" rows="3" class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm" />
                </label>
                <div>
                  <p class="text-sm font-semibold">Konkrétne miesta</p>
                  <p class="text-foreground-muted mt-1 text-xs">Bez výberu platí uzávierka na celé zvolené jazero alebo stredisko.</p>
                  <div class="mt-3 grid max-h-48 gap-2 overflow-y-auto rounded-md border border-border bg-muted/40 p-3 sm:grid-cols-2">
                    <label
                      v-for="peg in availablePegTargets"
                      :key="peg.id"
                      class="flex items-center gap-2 rounded bg-white px-2 py-1.5 text-xs font-semibold"
                    >
                      <input v-model="closureDraft.pegIds" type="checkbox" :value="peg.id" class="h-4 w-4 accent-primary-700">
                      {{ peg.label }}
                    </label>
                  </div>
                </div>
              </fieldset>
              <UButton
                type="submit"
                icon="i-heroicons-plus"
                block
                :disabled="!canManageClosures || closureSubmitStatus === 'submitting'"
                :loading="closureSubmitStatus === 'submitting'"
              >
                Uložiť uzávierku
              </UButton>
              <p
                v-if="closureSubmitMessage"
                class="rounded-md px-3 py-2 text-sm font-semibold"
                :class="
                  closureSubmitStatus === 'error'
                    ? 'bg-error-500/10 text-error-700'
                    : 'bg-success-500/10 text-success-700'
                "
              >
                {{ closureSubmitMessage }}
              </p>
            </form>
          </div>

          <div class="rounded-card border border-border bg-primary-900 p-5 text-white">
            <h2 class="text-lg font-bold">Pravidlo dostupnosti</h2>
            <p class="mt-3 text-sm text-white/75">
              Availability engine musí tieto uzávierky vyhodnocovať pred každou rezerváciou.
              Public uzávierka sa zobrazí rybárovi, interná iba správcovi, ale obe vedia blokovať termín.
            </p>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
