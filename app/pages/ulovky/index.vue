<script setup lang="ts">
import type { LakeSlug } from '~/data/pond'
import type {
  CatchStateResponse,
  CatchSubmissionSuccess,
  TripLogbookSubmissionSuccess,
} from '~/services/catchApiService'
import {
  catchRecordInputSchema,
  getValidationMessages,
  MAX_CATCH_PHOTO_BYTES,
  tripLogbookInputSchema,
} from '~/schemas/pondSchemas'
import {
  enqueueOfflineCatch,
  getOfflineCatchQueueErrorMessage,
  markOfflineCatchAttempt,
  readOfflineCatchQueue,
  removeOfflineCatch,
  shouldQueueCatchSubmission,
  type OfflineCatchPayload,
  type OfflineCatchQueueItem,
} from '~/services/offlineCatchQueueService'

useHead({ title: 'Úlovky' })

const {
  catches: seedCatches,
  catchPhotos: seedCatchPhotos,
  getLakeName,
  getPegLabel,
  lakes,
  pegs,
  tripLogbookEntries: seedTripLogbookEntries,
  tripLogbookModeLabels,
  tripLogbooks: seedTripLogbooks,
  tripLogbookStatusLabels,
} = usePondData()

type LogbookMode = keyof typeof tripLogbookModeLabels

const fallbackCatchState = (): CatchStateResponse => ({
  catches: seedCatches,
  catchPhotos: seedCatchPhotos,
  ok: true,
  tripLogbookEntries: seedTripLogbookEntries,
  tripLogbooks: seedTripLogbooks,
  updatedAt: 'seed',
})
const { data: catchState, refresh: refreshCatchState } = await useAsyncData<CatchStateResponse>(
  'public-catch-state',
  () => $fetch<CatchStateResponse>('/api/catches'),
  {
    default: fallbackCatchState,
  },
)

const selectedLogbookMode = ref<LogbookMode>('group')
const selectedLogbookId = ref('')
const selectedCatchLogbookId = ref('')
const logbookForm = reactive({
  lake: 'velky-cetin' as LakeSlug,
  membersText: 'Marek H.\nTomáš K.\nLenka R.',
  pegId: 'vc-03',
  title: 'Chata 3 - víkend',
})
const catchForm = reactive({
  angler: 'Marek H.',
  bait: 'scopex boilies 20 mm',
  caughtAt: '2026-05-16T18:30',
  lake: 'velky-cetin' as LakeSlug,
  lengthCm: 82,
  pegId: 'vc-03',
  released: true,
  species: 'Kapor',
  weightKg: 10.4,
})
const logbookSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const logbookSubmitMessage = ref('')
const catchSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const catchSubmitMessage = ref('')
const catchPhotoDraft = ref<{
  dataUrl: string
  fileName: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  previewUrl: string
  sizeBytes: number
} | null>(null)
const catchPhotoError = ref('')
const offlineCatchQueue = ref<OfflineCatchQueueItem[]>([])
const offlineSyncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const offlineSyncMessage = ref('')
const isOnline = ref(true)
let offlineSyncInProgress = false
const logbookModeOptions = Object.entries(tripLogbookModeLabels).map(([value, label]) => ({
  label,
  value: value as LogbookMode,
}))
const liveCatches = computed(() => catchState.value?.catches ?? seedCatches)
const liveCatchPhotos = computed(() => catchState.value?.catchPhotos ?? seedCatchPhotos)
const catchPhotoByCatchId = computed(() =>
  new Map(liveCatchPhotos.value.map((photo) => [photo.catchId, photo])),
)
const publicCatches = computed(() => liveCatches.value.filter((catchItem) => catchItem.status === 'approved'))
const pendingCatches = computed(() => liveCatches.value.filter((catchItem) => catchItem.status === 'pending'))
const liveTripLogbooks = computed(() => catchState.value?.tripLogbooks ?? seedTripLogbooks)
const liveTripLogbookEntries = computed(() => catchState.value?.tripLogbookEntries ?? seedTripLogbookEntries)
const logbookPegs = computed(() => pegs.filter((peg) => peg.lake === logbookForm.lake))
const catchPegs = computed(() => pegs.filter((peg) => peg.lake === catchForm.lake))
const compatibleLogbooks = computed(() =>
  liveTripLogbooks.value.filter((logbook) =>
    logbook.status !== 'closed' &&
    logbook.lake === catchForm.lake &&
    logbook.pegIds.includes(catchForm.pegId),
  ),
)
const logbookMemberNames = computed(() =>
  logbookForm.membersText.split('\n').map((name) => name.trim()).filter(Boolean),
)
const logbookValidation = computed(() =>
  tripLogbookInputSchema.safeParse({
    lake: logbookForm.lake,
    memberNames: logbookMemberNames.value,
    mode: selectedLogbookMode.value,
    pegIds: [logbookForm.pegId],
    title: logbookForm.title,
  }),
)
const catchPhotoPayload = computed(() =>
  catchPhotoDraft.value
    ? {
        dataUrl: catchPhotoDraft.value.dataUrl,
        fileName: catchPhotoDraft.value.fileName,
        mimeType: catchPhotoDraft.value.mimeType,
        sizeBytes: catchPhotoDraft.value.sizeBytes,
      }
    : undefined,
)
const catchValidation = computed(() =>
  catchRecordInputSchema.safeParse({
    ...catchForm,
    photo: catchPhotoPayload.value,
  }),
)
const logbookValidationMessages = computed(() => getValidationMessages(logbookValidation.value))
const catchValidationMessages = computed(() => [
  ...getValidationMessages(catchValidation.value),
  ...(catchPhotoError.value ? [catchPhotoError.value] : []),
])
const totalWeight = computed(() =>
  publicCatches.value.reduce((sum, catchItem) => sum + catchItem.weightKg, 0).toFixed(1),
)
const biggestCatch = computed(() =>
  publicCatches.value.reduce(
    (biggest, item) => (!biggest || item.weightKg > biggest.weightKg ? item : biggest),
    publicCatches.value[0],
  ),
)
const activeLogbook = computed(() =>
  liveTripLogbooks.value.find((logbook) => logbook.id === selectedLogbookId.value) ??
  liveTripLogbooks.value.find((logbook) => logbook.status === 'active') ??
  liveTripLogbooks.value[0],
)
const activeEntries = computed(() =>
  activeLogbook.value
    ? liveTripLogbookEntries.value.filter((entry) => entry.logbookId === activeLogbook.value?.id)
    : [],
)
const activeTotalWeight = computed(() =>
  activeEntries.value.reduce((sum, entry) => sum + entry.weightKg, 0).toFixed(1),
)
const latestLogbookEntry = computed(() =>
  [...activeEntries.value].sort((a, b) => b.caughtAt.localeCompare(a.caughtAt))[0],
)
const logbookMemberRows = computed(() =>
  activeLogbook.value?.members.map((member) => {
    const memberEntries = activeEntries.value.filter((entry) => entry.angler === member.name)
    const weightKg = memberEntries.reduce((sum, entry) => sum + entry.weightKg, 0)

    return {
      ...member,
      catchesCount: memberEntries.length,
      weightLabel: weightKg.toFixed(1),
    }
  }) ?? [],
)

const photoStatusMeta = {
  missing: {
    label: 'bez fotky',
    class: 'bg-warning-500/10 text-warning-700',
    icon: 'i-heroicons-photo',
  },
  uploaded: {
    label: 'foto nahraté',
    class: 'bg-primary-50 text-primary-800',
    icon: 'i-heroicons-arrow-up-tray',
  },
  'ai-ready': {
    label: 'AI-ready',
    class: 'bg-success-500/10 text-success-700',
    icon: 'i-heroicons-sparkles',
  },
} as const

function formatCatchTime(value: string) {
  return new Date(value).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' })
}

function getCatchPhoto(catchId: string) {
  return catchPhotoByCatchId.value.get(catchId)
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`

  return `${(bytes / 1024 / 1024).toLocaleString('sk-SK', { maximumFractionDigits: 1 })} MB`
}

function clearCatchPhoto() {
  catchPhotoDraft.value = null
  catchPhotoError.value = ''
}

function handleCatchPhotoChange(event: Event) {
  catchPhotoError.value = ''
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    clearCatchPhoto()
    return
  }

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    catchPhotoDraft.value = null
    catchPhotoError.value = 'Podporované sú iba JPG, PNG alebo WebP fotky.'
    input.value = ''
    return
  }

  if (file.size > MAX_CATCH_PHOTO_BYTES) {
    catchPhotoDraft.value = null
    catchPhotoError.value = 'Fotka môže mať najviac 6 MB.'
    input.value = ''
    return
  }

  const reader = new FileReader()
  reader.addEventListener('load', () => {
    if (typeof reader.result !== 'string') {
      catchPhotoError.value = 'Fotku sa nepodarilo načítať.'
      return
    }

    catchPhotoDraft.value = {
      dataUrl: reader.result,
      fileName: file.name,
      mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
      previewUrl: reader.result,
      sizeBytes: file.size,
    }
  })
  reader.addEventListener('error', () => {
    catchPhotoError.value = 'Fotku sa nepodarilo načítať.'
  })
  reader.readAsDataURL(file)
}

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

  return messages?.join(' ') || fetchError.data?.message || fetchError.data?.statusMessage || 'Zápis sa nepodarilo uložiť.'
}

const getQueueFallbackErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Offline zápis sa nepodarilo uložiť v zariadení.'

async function refreshOfflineCatchQueue() {
  if (!import.meta.client) return

  try {
    offlineCatchQueue.value = await readOfflineCatchQueue()
  }
  catch (error) {
    offlineSyncStatus.value = 'error'
    offlineSyncMessage.value = getQueueFallbackErrorMessage(error)
  }
}

async function queueOfflineCatch(payload: OfflineCatchPayload) {
  try {
    const item = await enqueueOfflineCatch(payload)

    await refreshOfflineCatchQueue()
    catchSubmitStatus.value = 'success'
    catchSubmitMessage.value = `Slabý signál: úlovok je uložený v tomto zariadení a odošle sa automaticky. Fronta: ${item.id}.`
    offlineSyncStatus.value = 'success'
    offlineSyncMessage.value = `Vo fronte čaká ${offlineCatchQueue.value.length} offline zápis.`
    clearCatchPhoto()
  }
  catch (error) {
    catchSubmitStatus.value = 'error'
    catchSubmitMessage.value = getQueueFallbackErrorMessage(error)
  }
}

async function discardOfflineCatch(id: string) {
  try {
    await removeOfflineCatch(id)
    await refreshOfflineCatchQueue()
    offlineSyncStatus.value = 'success'
    offlineSyncMessage.value = 'Offline zápis bol odstránený zo zariadenia.'
  }
  catch (error) {
    offlineSyncStatus.value = 'error'
    offlineSyncMessage.value = getQueueFallbackErrorMessage(error)
  }
}

async function syncOfflineCatchQueue(options: { silent?: boolean } = {}) {
  if (!import.meta.client || offlineSyncInProgress) return

  isOnline.value = navigator.onLine
  if (!isOnline.value) {
    offlineSyncStatus.value = 'error'
    offlineSyncMessage.value = 'Bez pripojenia nechávam zápisy bezpečne v zariadení.'
    return
  }

  await refreshOfflineCatchQueue()
  if (offlineCatchQueue.value.length === 0) {
    if (!options.silent) {
      offlineSyncStatus.value = 'success'
      offlineSyncMessage.value = 'Offline fronta je prázdna.'
    }
    return
  }

  offlineSyncInProgress = true
  offlineSyncStatus.value = 'syncing'
  offlineSyncMessage.value = `Odosielam ${offlineCatchQueue.value.length} offline zápisov.`

  let syncedCount = 0

  try {
    for (const queuedCatch of [...offlineCatchQueue.value]) {
      try {
        const result = await $fetch<CatchSubmissionSuccess>('/api/catches', {
          body: queuedCatch.payload,
          method: 'POST',
        })

        if (result.logbookEntry) {
          selectedLogbookId.value = result.logbookEntry.logbookId
        }
        await removeOfflineCatch(queuedCatch.id)
        syncedCount += 1
      }
      catch (error) {
        await markOfflineCatchAttempt(queuedCatch.id, getOfflineCatchQueueErrorMessage(error))
      }
    }

    await refreshOfflineCatchQueue()
    if (syncedCount > 0) {
      await refreshCatchState()
    }

    offlineSyncStatus.value = offlineCatchQueue.value.length > 0 ? 'error' : 'success'
    offlineSyncMessage.value = offlineCatchQueue.value.length > 0
      ? `${syncedCount} zápisov odoslaných, ${offlineCatchQueue.value.length} čaká na ďalší pokus.`
      : `${syncedCount} offline zápisov bolo odoslaných na schválenie.`
  }
  finally {
    offlineSyncInProgress = false
  }
}

const submitLogbook = async () => {
  const validation = logbookValidation.value
  if (!validation.success) {
    logbookSubmitStatus.value = 'error'
    logbookSubmitMessage.value = logbookValidationMessages.value[0] ?? 'Skontrolujte údaje zápisníka.'
    return
  }

  logbookSubmitStatus.value = 'submitting'
  logbookSubmitMessage.value = ''

  try {
    const result = await $fetch<TripLogbookSubmissionSuccess>('/api/logbooks', {
      body: validation.data,
      method: 'POST',
    })

    selectedLogbookId.value = result.logbook.id
    selectedCatchLogbookId.value = result.logbook.id
    catchForm.lake = result.logbook.lake
    catchForm.pegId = result.logbook.pegIds[0] ?? catchForm.pegId
    catchForm.angler = result.logbook.owner
    logbookSubmitStatus.value = 'success'
    logbookSubmitMessage.value = result.message
    await refreshCatchState()
  }
  catch (error) {
    logbookSubmitStatus.value = 'error'
    logbookSubmitMessage.value = getApiErrorMessage(error)
  }
}

const submitCatch = async () => {
  const validation = catchValidation.value
  if (!validation.success) {
    catchSubmitStatus.value = 'error'
    catchSubmitMessage.value = catchValidationMessages.value[0] ?? 'Skontrolujte údaje úlovku.'
    return
  }

  catchSubmitStatus.value = 'submitting'
  catchSubmitMessage.value = ''

  try {
    const payload: OfflineCatchPayload = {
      ...validation.data,
      logbookId: selectedCatchLogbookId.value || undefined,
    }
    const result = await $fetch<CatchSubmissionSuccess>('/api/catches', {
      body: payload,
      method: 'POST',
    })

    if (result.logbookEntry) {
      selectedLogbookId.value = result.logbookEntry.logbookId
    }
    catchSubmitStatus.value = 'success'
    catchSubmitMessage.value = `${result.message} ID: ${result.catch.id}.`
    clearCatchPhoto()
    await refreshCatchState()
  }
  catch (error) {
    const payload: OfflineCatchPayload = {
      ...validation.data,
      logbookId: selectedCatchLogbookId.value || undefined,
    }

    if (import.meta.client && shouldQueueCatchSubmission(error, navigator.onLine)) {
      await queueOfflineCatch(payload)
      return
    }

    catchSubmitStatus.value = 'error'
    catchSubmitMessage.value = getApiErrorMessage(error)
  }
}

function handleOnline() {
  isOnline.value = true
  void syncOfflineCatchQueue({ silent: true })
}

function handleOffline() {
  isOnline.value = false
  offlineSyncStatus.value = 'idle'
  offlineSyncMessage.value = 'Signál vypadol. Nové úlovky sa uložia v zariadení.'
}

onMounted(() => {
  if (!import.meta.client) return

  isOnline.value = navigator.onLine
  void refreshOfflineCatchQueue().then(() => {
    if (navigator.onLine && offlineCatchQueue.value.length > 0) {
      void syncOfflineCatchQueue({ silent: true })
    }
  })
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return

  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
})

watch(() => logbookForm.lake, () => {
  logbookForm.pegId = logbookPegs.value[0]?.id ?? ''
})

watch(() => catchForm.lake, () => {
  catchForm.pegId = catchPegs.value[0]?.id ?? ''
})

watch(compatibleLogbooks, (items) => {
  if (selectedCatchLogbookId.value && items.some((logbook) => logbook.id === selectedCatchLogbookId.value)) return

  selectedCatchLogbookId.value = items[0]?.id ?? ''
})

watch(logbookValidation, () => {
  if (logbookSubmitStatus.value !== 'submitting') {
    logbookSubmitStatus.value = 'idle'
    logbookSubmitMessage.value = ''
  }
})

watch(catchValidation, () => {
  if (catchSubmitStatus.value !== 'submitting') {
    catchSubmitStatus.value = 'idle'
    catchSubmitMessage.value = ''
  }
})
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Úlovky"
      title="Denník úlovkov pripravený na analytiku"
      description="Každý zápis zbiera miesto, čas, druh, mieru, váhu, nástrahu a fotku. Neskôr sa dá pridať AI identifikácia opakovaných rýb."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Verejné úlovky</p>
          <p class="mt-2 text-3xl font-bold">{{ publicCatches.length }}</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Spolu zdolané</p>
          <p class="mt-2 text-3xl font-bold">{{ totalWeight }} kg</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Najväčšia ryba</p>
          <p class="mt-2 text-3xl font-bold">{{ biggestCatch?.weightKg ?? 0 }} kg</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Čaká na schválenie</p>
          <p class="mt-2 text-3xl font-bold">{{ pendingCatches.length }}</p>
        </div>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div class="space-y-4">
          <section v-if="activeLogbook" class="border-border bg-surface rounded-card border p-5">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p class="text-primary-800 text-sm font-bold">
                  {{ tripLogbookModeLabels[activeLogbook.mode] }} zápisník
                </p>
                <h2 class="mt-1 text-2xl font-bold">{{ activeLogbook.title }}</h2>
                <p class="text-foreground-muted mt-2 text-sm">
                  {{ getLakeName(activeLogbook.lake) }} ·
                  {{ activeLogbook.pegIds.map((pegId) => getPegLabel(pegId)).join(', ') }}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <span class="inline-flex items-center gap-1.5 rounded-md bg-success-500/10 px-2.5 py-1 text-xs font-bold text-success-700">
                  <UIcon name="i-heroicons-signal" class="h-3.5 w-3.5" />
                  {{ tripLogbookStatusLabels[activeLogbook.status] }}
                </span>
                <span class="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                  <UIcon name="i-heroicons-key" class="h-3.5 w-3.5" />
                  {{ activeLogbook.shareCode }}
                </span>
              </div>
            </div>

            <div class="mt-5 grid gap-3 sm:grid-cols-3">
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Členovia</p>
                <p class="mt-1 text-xl font-bold">{{ activeLogbook.members.length }}</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Úlovky v tabuľke</p>
                <p class="mt-1 text-xl font-bold">{{ activeEntries.length }}</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Spoločná váha</p>
                <p class="mt-1 text-xl font-bold">{{ activeTotalWeight }} kg</p>
              </div>
            </div>

            <div class="mt-5 grid gap-5 xl:grid-cols-[0.65fr_1.35fr]">
              <div>
                <h3 class="font-bold">Rybári</h3>
                <div class="mt-3 space-y-2">
                  <div
                    v-for="member in logbookMemberRows"
                    :key="member.id"
                    class="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2"
                  >
                    <div class="min-w-0">
                      <p class="truncate font-semibold">{{ member.name }}</p>
                      <p class="text-foreground-muted text-xs">
                        {{ member.role === 'owner' ? 'vedúci výpravy' : 'člen partie' }}
                      </p>
                    </div>
                    <div class="text-right text-sm">
                      <p class="font-bold">{{ member.catchesCount }}x</p>
                      <p class="text-foreground-muted text-xs">{{ member.weightLabel }} kg</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div class="flex items-center justify-between gap-3">
                  <h3 class="font-bold">Tabuľka úlovkov</h3>
                  <UButton size="sm" icon="i-heroicons-plus" variant="soft">
                    Pridať riadok
                  </UButton>
                </div>
                <div v-if="activeEntries.length" class="mt-3 overflow-x-auto">
                  <table class="min-w-full text-left text-sm">
                    <thead class="text-foreground-muted border-b border-border text-xs">
                      <tr>
                        <th class="py-2 pr-4 font-semibold">Rybár</th>
                        <th class="py-2 pr-4 font-semibold">Ryba</th>
                        <th class="py-2 pr-4 font-semibold">Miesto</th>
                        <th class="py-2 pr-4 font-semibold">Nástraha</th>
                        <th class="py-2 pr-4 font-semibold">Foto</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                      <tr v-for="entry in activeEntries" :key="entry.id">
                        <td class="py-3 pr-4 font-semibold">{{ entry.angler }}</td>
                        <td class="py-3 pr-4">
                          {{ entry.species }} · {{ entry.weightKg }} kg · {{ entry.lengthCm }} cm
                        </td>
                        <td class="py-3 pr-4">{{ getPegLabel(entry.pegId) }}</td>
                        <td class="py-3 pr-4">{{ entry.bait }}</td>
                        <td class="py-3 pr-4">
                          <span
                            class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold"
                            :class="photoStatusMeta[entry.photoStatus].class"
                          >
                            <UIcon :name="photoStatusMeta[entry.photoStatus].icon" class="h-3.5 w-3.5" />
                            {{ photoStatusMeta[entry.photoStatus].label }}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <AppState
                  v-else
                  title="Tabuľka je prázdna"
                  description="Po prvom úlovku sa tu zobrazí riadok s rybárom, miestom, nástrahou a fotkou."
                />
              </div>
            </div>
          </section>

          <AppState
            v-if="publicCatches.length === 0"
            title="Zatiaľ bez úlovkov"
            description="Verejný denník ukazuje iba úlovky schválené správcom."
          />

          <article
            v-for="catchItem in publicCatches"
            :key="catchItem.id"
            class="border-border bg-surface grid overflow-hidden rounded-card border md:grid-cols-[180px_1fr]"
          >
            <div class="bg-water-100 pond-grid flex min-h-40 items-center justify-center">
              <img
                v-if="getCatchPhoto(catchItem.id)?.publicUrl"
                :src="getCatchPhoto(catchItem.id)?.publicUrl"
                :alt="`Fotka úlovku ${catchItem.species}`"
                class="h-full min-h-40 w-full object-cover"
              >
              <div v-else class="bg-white/80 text-water-900 flex h-20 w-20 items-center justify-center rounded-full">
                <UIcon name="i-heroicons-camera" class="h-9 w-9" />
              </div>
            </div>
            <div class="p-5">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-foreground-muted text-sm">
                    {{ getLakeName(catchItem.lake) }} · {{ getPegLabel(catchItem.pegId) }}
                  </p>
                  <h2 class="mt-1 text-2xl font-bold">
                    {{ catchItem.species }} {{ catchItem.weightKg }} kg
                  </h2>
                </div>
                <span
                  class="bg-success-500/10 text-success-500 rounded-full px-3 py-1 text-xs font-semibold"
                >
                  {{ catchItem.released ? 'pustená späť' : 'ponechaná podľa pravidiel' }}
                </span>
              </div>

              <dl class="mt-5 grid gap-3 text-sm sm:grid-cols-4">
                <div class="bg-muted rounded-md p-3">
                  <dt class="text-foreground-muted text-xs">Miera</dt>
                  <dd class="font-semibold">{{ catchItem.lengthCm }} cm</dd>
                </div>
                <div class="bg-muted rounded-md p-3">
                  <dt class="text-foreground-muted text-xs">Nástraha</dt>
                  <dd class="font-semibold">{{ catchItem.bait }}</dd>
                </div>
                <div class="bg-muted rounded-md p-3">
                  <dt class="text-foreground-muted text-xs">Čas</dt>
                  <dd class="font-semibold">{{ formatCatchTime(catchItem.caughtAt) }}</dd>
                </div>
                <div class="bg-muted rounded-md p-3">
                  <dt class="text-foreground-muted text-xs">Foto</dt>
                  <dd class="font-semibold">{{ getCatchPhoto(catchItem.id)?.label ?? catchItem.photoLabel }}</dd>
                </div>
              </dl>

              <p class="text-foreground-muted mt-4 text-sm">{{ catchItem.notes }}</p>
            </div>
          </article>
        </div>

        <aside class="space-y-6">
          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Nový zápisník</h2>
                <p v-if="latestLogbookEntry" class="text-foreground-muted mt-1 text-sm">
                  Posledný zápis: {{ latestLogbookEntry.angler }} · {{ latestLogbookEntry.weightKg }} kg
                </p>
              </div>
              <UIcon name="i-heroicons-table-cells" class="text-primary-800 h-5 w-5" />
            </div>

            <form class="mt-5 space-y-4" @submit.prevent="submitLogbook">
              <div>
                <span class="text-sm font-semibold">Typ</span>
                <div class="mt-2 grid grid-cols-3 rounded-lg bg-muted p-1">
                  <button
                    v-for="option in logbookModeOptions"
                    :key="option.value"
                    type="button"
                    class="rounded-md px-2 py-2 text-xs font-bold transition-colors"
                    :class="
                      selectedLogbookMode === option.value
                        ? 'bg-white text-primary-900 shadow-sm'
                        : 'text-foreground-muted hover:text-foreground'
                    "
                    @click="selectedLogbookMode = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>

              <label class="block">
                <span class="text-sm font-semibold">Názov výpravy</span>
                <input
                  v-model="logbookForm.title"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
              </label>

              <label class="block">
                <span class="text-sm font-semibold">Rybári v partii</span>
                <textarea
                  v-model="logbookForm.membersText"
                  rows="3"
                  class="border-border mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                />
              </label>

              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Jazero</span>
                  <select
                    v-model="logbookForm.lake"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                  >
                    <option v-for="lake in lakes" :key="lake.slug" :value="lake.slug">{{ lake.name }}</option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Miesto</span>
                  <select
                    v-model="logbookForm.pegId"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                  >
                    <option v-for="peg in logbookPegs" :key="peg.id" :value="peg.id">{{ peg.label }}</option>
                  </select>
                </label>
              </div>

              <ValidationSummary
                :messages="logbookValidationMessages"
                valid-title="Zápisník je pripravený"
                valid-description="Partia má názov, miesto aj zoznam členov."
              />

              <p
                v-if="logbookSubmitMessage"
                class="rounded-md px-3 py-2 text-sm font-semibold"
                :class="
                  logbookSubmitStatus === 'success'
                    ? 'bg-success-500/10 text-success-700'
                    : 'bg-error-500/10 text-error-700'
                "
              >
                {{ logbookSubmitMessage }}
              </p>

              <UButton
                type="submit"
                icon="i-heroicons-share"
                block
                :disabled="!logbookValidation.success || logbookSubmitStatus === 'submitting'"
                :loading="logbookSubmitStatus === 'submitting'"
              >
                Vytvoriť tabuľku
              </UButton>
            </form>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <h2 class="text-lg font-bold">Pridať úlovok</h2>
            <div
              v-if="!isOnline || offlineCatchQueue.length > 0 || offlineSyncMessage"
              class="mt-4 rounded-md border p-3"
              :class="
                offlineSyncStatus === 'error' || !isOnline
                  ? 'border-warning-200 bg-warning-500/10 text-warning-900'
                  : 'border-primary-200 bg-primary-50 text-primary-950'
              "
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div class="flex items-center gap-2">
                    <UIcon
                      :name="isOnline ? 'i-heroicons-cloud-arrow-up' : 'i-heroicons-signal-slash'"
                      class="h-5 w-5"
                    />
                    <p class="text-sm font-bold">
                      {{ isOnline ? 'Offline fronta úlovkov' : 'Bez pripojenia pri vode' }}
                    </p>
                  </div>
                  <p class="mt-1 text-sm opacity-80">
                    {{ offlineSyncMessage || 'Pri výpadku signálu uložíme úlovok v zariadení a odošleme ho po návrate internetu.' }}
                  </p>
                </div>
                <UButton
                  v-if="offlineCatchQueue.length > 0"
                  size="sm"
                  icon="i-heroicons-arrow-path"
                  variant="soft"
                  :disabled="!isOnline || offlineSyncStatus === 'syncing'"
                  :loading="offlineSyncStatus === 'syncing'"
                  @click="syncOfflineCatchQueue()"
                >
                  Odoslať
                </UButton>
              </div>

              <div v-if="offlineCatchQueue.length > 0" class="mt-3 space-y-2">
                <div
                  v-for="item in offlineCatchQueue"
                  :key="item.id"
                  class="flex items-start justify-between gap-3 rounded-md bg-white/70 px-3 py-2 text-sm text-foreground"
                >
                  <div class="min-w-0">
                    <p class="truncate font-bold">
                      {{ item.payload.species }} {{ item.payload.weightKg }} kg · {{ item.payload.angler }}
                    </p>
                    <p class="text-foreground-muted mt-0.5 text-xs">
                      {{ getPegLabel(item.payload.pegId) }} · {{ formatCatchTime(item.payload.caughtAt) }}
                    </p>
                    <p v-if="item.lastError" class="mt-1 text-xs font-semibold text-error-700">
                      {{ item.lastError }}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="text-foreground-muted hover:text-error-700 shrink-0 rounded-md p-1"
                    aria-label="Odstrániť offline zápis"
                    @click="discardOfflineCatch(item.id)"
                  >
                    <UIcon name="i-heroicons-trash" class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <form class="mt-5 space-y-4" @submit.prevent="submitCatch">
              <label class="block">
                <span class="text-sm font-semibold">Jazero</span>
                <select
                  v-model="catchForm.lake"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                  <option v-for="lake in lakes" :key="lake.slug" :value="lake.slug">{{ lake.name }}</option>
                </select>
              </label>
              <label class="block">
                <span class="text-sm font-semibold">Lovné miesto</span>
                <select
                  v-model="catchForm.pegId"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                  <option v-for="peg in catchPegs" :key="peg.id" :value="peg.id">{{ peg.label }}</option>
                </select>
              </label>
              <label class="block">
                <span class="text-sm font-semibold">Zápisník partie</span>
                <select
                  v-model="selectedCatchLogbookId"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                  <option value="">Samostatný úlovok</option>
                  <option
                    v-for="logbook in compatibleLogbooks"
                    :key="logbook.id"
                    :value="logbook.id"
                  >
                    {{ logbook.title }} · {{ logbook.shareCode }}
                  </option>
                </select>
              </label>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Rybár</span>
                  <input v-model="catchForm.angler" class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm" >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Druh</span>
                  <input v-model="catchForm.species" class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm" >
                </label>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Váha kg</span>
                  <input
                    v-model.number="catchForm.weightKg"
                    type="number"
                    min="0"
                    step="0.1"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Miera cm</span>
                  <input
                    v-model.number="catchForm.lengthCm"
                    type="number"
                    min="0"
                    step="1"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                  >
                </label>
              </div>
              <label class="block">
                <span class="text-sm font-semibold">Nástraha</span>
                <input
                  v-model="catchForm.bait"
                  placeholder="boilies, kukurica, pelety..."
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
              </label>
              <label class="block">
                <span class="text-sm font-semibold">Čas úlovku</span>
                <input
                  v-model="catchForm.caughtAt"
                  type="datetime-local"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
              </label>
              <label class="flex items-center gap-2 rounded-md bg-muted p-3 text-sm font-semibold">
                <input v-model="catchForm.released" type="checkbox" class="h-4 w-4 accent-primary-700">
                Ryba bola pustená späť
              </label>
              <label class="block">
                <span class="text-sm font-semibold">Fotka</span>
                <input
                  type="file"
                  accept="image/*"
                  class="border-border mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  @change="handleCatchPhotoChange"
                >
              </label>
              <div
                v-if="catchPhotoDraft"
                class="grid gap-3 rounded-md border border-primary-200 bg-primary-50 p-3 sm:grid-cols-[88px_1fr]"
              >
                <img
                  :src="catchPhotoDraft.previewUrl"
                  alt="Náhľad fotky úlovku"
                  class="h-20 w-full rounded-md object-cover sm:w-20"
                >
                <div class="min-w-0">
                  <p class="truncate text-sm font-bold text-primary-950">{{ catchPhotoDraft.fileName }}</p>
                  <p class="mt-1 text-xs text-primary-800">
                    {{ formatFileSize(catchPhotoDraft.sizeBytes) }} · pripravené na uloženie
                  </p>
                  <p class="mt-2 text-xs text-primary-700">
                    Po uložení dostane fotka AI-ready metadata, ale verejná bude až po schválení úlovku.
                  </p>
                  <button
                    type="button"
                    class="mt-2 text-xs font-bold text-primary-900 underline"
                    @click="clearCatchPhoto"
                  >
                    Odobrať fotku
                  </button>
                </div>
              </div>
              <ValidationSummary
                :messages="catchValidationMessages"
                valid-title="Úlovok je pripravený"
                valid-description="Záznam má miesto, rybára, rozmery, nástrahu a čas."
              />

              <p
                v-if="catchSubmitMessage"
                class="rounded-md px-3 py-2 text-sm font-semibold"
                :class="
                  catchSubmitStatus === 'success'
                    ? 'bg-success-500/10 text-success-700'
                    : 'bg-error-500/10 text-error-700'
                "
              >
                {{ catchSubmitMessage }}
              </p>

              <UButton
                type="submit"
                icon="i-heroicons-plus"
                block
                :disabled="!catchValidation.success || !!catchPhotoError || catchSubmitStatus === 'submitting'"
                :loading="catchSubmitStatus === 'submitting'"
              >
                Uložiť úlovok
              </UButton>
            </form>
          </div>

          <div class="border-border bg-primary-900 rounded-card border p-5 text-white">
            <h2 class="text-lg font-bold">Budúca AI vrstva</h2>
            <p class="mt-3 text-sm text-white/75">
              Fotky budú ukladané pri zázname úlovku. Model potom môže porovnávať kresbu šupín,
              jazvy a proporcie rýb, aby sa našli opakované jedince a sledoval sa ich rast.
            </p>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
