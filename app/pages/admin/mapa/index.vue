<script setup lang="ts">
import type { LakeSlug, Peg } from '~/data/pond'
import { getValidationMessages, mapPointDraftSchema } from '~/schemas/pondSchemas'
import type { MapSaveSuccess, MapStateResponse } from '~/services/mapApiService'

useHead({ title: 'Admin mapa' })

const { getLakeName, lakes, mapLayers, mapShapes, pegs } = usePondData()

const fallbackMapState = (): MapStateResponse => ({
  ok: true,
  mapLayers,
  mapShapes,
  pegs,
  updatedAt: 'seed',
})
const { data: mapState, refresh: refreshMapState } = await useAsyncData<MapStateResponse>(
  'admin-map-state',
  () => $fetch<MapStateResponse>('/api/map'),
  {
    default: fallbackMapState,
  },
)

const selectedLake = ref<LakeSlug>('velky-cetin')
const selectedPegId = ref('vc-03')
const editorPegs = ref<Peg[]>(mapState.value.pegs.map((peg) => ({ ...peg })))
const enabledLayerIds = ref(
  mapState.value.mapLayers.filter((layer) => layer.enabled).map((layer) => layer.id),
)
const saveStatus = ref<'idle' | 'saving' | 'success' | 'error'>('idle')
const saveMessage = ref('')

const currentLake = computed(() => lakes.find((lake) => lake.slug === selectedLake.value) ?? lakes[0]!)
const storedPegs = computed(() => mapState.value.pegs)
const storedMapLayers = computed(() => mapState.value.mapLayers)
const storedMapShapes = computed(() => mapState.value.mapShapes)
const lakeLayers = computed(() => storedMapLayers.value.filter((layer) => layer.lake === selectedLake.value))
const enabledLayers = computed(() =>
  lakeLayers.value.filter((layer) => enabledLayerIds.value.includes(layer.id)),
)
const activeBackgroundImage = computed(() =>
  enabledLayers.value.find((layer) => layer.kind === 'background')?.source ?? '',
)
const lakePegs = computed(() => editorPegs.value.filter((peg) => peg.lake === selectedLake.value))
const visiblePegs = computed(() =>
  lakePegs.value.filter((peg) => {
    if (peg.type === 'cabin') return enabledLayers.value.some((layer) => layer.kind === 'cabins')
    return enabledLayers.value.some((layer) => layer.kind === 'pegs')
  }),
)
const visibleShapes = computed(() =>
  storedMapShapes.value.filter((shape) => {
    const sameLake = shape.lake === selectedLake.value
    const layerKind = shape.type === 'sector'
      ? 'sectors'
      : shape.type === 'service'
        ? 'service'
        : 'background'

    return sameLake && enabledLayers.value.some((layer) => layer.kind === layerKind)
  }),
)
const selectedPeg = computed(() => lakePegs.value.find((peg) => peg.id === selectedPegId.value) ?? lakePegs.value[0])
const cabinPegs = computed(() => lakePegs.value.filter((peg) => peg.type === 'cabin'))
const changedPegs = computed(() =>
  editorPegs.value.filter((peg) => {
    const original = storedPegs.value.find((item) => item.id === peg.id)
    return (
      original &&
      (
        original.capacity !== peg.capacity ||
        original.label !== peg.label ||
        Boolean(original.requiresCabinReservation) !== Boolean(peg.requiresCabinReservation) ||
        original.type !== peg.type ||
        original.x !== peg.x ||
        original.y !== peg.y
      )
    )
  }),
)
const selectedLayerSummary = computed(() =>
  enabledLayers.value.map((layer) => layer.name).join(', ') || 'žiadna aktívna vrstva',
)
const selectedPegValidation = computed(() =>
  selectedPeg.value
    ? mapPointDraftSchema.safeParse({
      capacity: selectedPeg.value.capacity,
      id: selectedPeg.value.id,
      label: selectedPeg.value.label,
      requiresCabinReservation: Boolean(selectedPeg.value.requiresCabinReservation),
      type: selectedPeg.value.type,
      x: selectedPeg.value.x,
      y: selectedPeg.value.y,
    })
    : mapPointDraftSchema.safeParse({}),
)
const selectedPegValidationMessages = computed(() => getValidationMessages(selectedPegValidation.value))

watch(
  mapState,
  (state) => {
    editorPegs.value = state.pegs.map((peg) => ({ ...peg }))
    enabledLayerIds.value = state.mapLayers.filter((layer) => layer.enabled).map((layer) => layer.id)
  },
  { immediate: true },
)

watch(selectedLake, () => {
  selectedPegId.value = lakePegs.value[0]?.id ?? ''
  saveStatus.value = 'idle'
  saveMessage.value = ''
})

function selectPeg(peg: Peg) {
  selectedPegId.value = peg.id
}

function toggleLayer(layerId: string) {
  if (enabledLayerIds.value.includes(layerId)) {
    enabledLayerIds.value = enabledLayerIds.value.filter((id) => id !== layerId)
    return
  }

  enabledLayerIds.value = [...enabledLayerIds.value, layerId]
  saveStatus.value = 'idle'
  saveMessage.value = ''
}

function movePoint(payload: { id: string, x: number, y: number }) {
  const peg = editorPegs.value.find((item) => item.id === payload.id)
  if (!peg) return
  peg.x = payload.x
  peg.y = payload.y
  selectedPegId.value = payload.id
  saveStatus.value = 'idle'
  saveMessage.value = ''
}

function resetSelectedPegPosition() {
  const peg = selectedPeg.value
  const original = peg ? storedPegs.value.find((item) => item.id === peg.id) : undefined
  if (!peg || !original) return

  peg.capacity = original.capacity
  peg.label = original.label
  peg.requiresCabinReservation = original.requiresCabinReservation
  peg.type = original.type
  peg.x = original.x
  peg.y = original.y
}

function getApiErrorMessage(error: unknown) {
  const fetchError = error as {
    data?: {
      data?: {
        messages?: string[]
      }
      message?: string
      statusMessage?: string
    }
  }

  return (
    fetchError.data?.data?.messages?.join(' ') ??
    fetchError.data?.message ??
    fetchError.data?.statusMessage ??
    'Mapu sa nepodarilo uložiť.'
  )
}

async function saveMapChanges() {
  if (!selectedPegValidation.value.success) {
    saveStatus.value = 'error'
    saveMessage.value = selectedPegValidationMessages.value[0] ?? 'Skontrolujte vybraný bod mapy.'
    return
  }

  saveStatus.value = 'saving'
  saveMessage.value = ''

  try {
    const result = await $fetch<MapSaveSuccess>('/api/admin/map', {
      body: {
        enabledLayerIds: enabledLayerIds.value,
        pegs: editorPegs.value,
      },
      method: 'PUT',
    })

    mapState.value = {
      ok: true,
      mapLayers: result.mapLayers,
      mapShapes: result.mapShapes,
      pegs: result.pegs,
      updatedAt: result.updatedAt,
    }
    await refreshMapState()
    saveStatus.value = 'success'
    saveMessage.value = result.message
  }
  catch (error) {
    saveStatus.value = 'error'
    saveMessage.value = getApiErrorMessage(error)
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Mapa a editor miest"
      description="Mock admin editor lovných miest, chát, servisných zón a súťažných vrstiev. Body sú už vedené ako SVG model s lokálnou drag úpravou."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div class="mb-5 inline-flex rounded-lg bg-muted p-1">
        <button
          v-for="lake in lakes"
          :key="lake.slug"
          type="button"
          class="rounded-md px-4 py-2 text-sm font-semibold transition-colors"
          :class="selectedLake === lake.slug ? 'bg-white text-primary-900 shadow-sm' : 'text-foreground-muted hover:text-foreground'"
          @click="selectedLake = lake.slug"
        >
          {{ lake.name }}
        </button>
      </div>

      <div class="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <MapEditorCanvas
          editable
          :title="`${currentLake.name} · SVG editor`"
          :image="activeBackgroundImage"
          :points="visiblePegs"
          :shapes="visibleShapes"
          :selected-id="selectedPegId"
          @select="selectPeg"
          @move-point="movePoint"
        />

        <aside class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Vrstvy mapy</h2>
                <p class="text-foreground-muted mt-1 text-sm">{{ selectedLayerSummary }}</p>
              </div>
              <UIcon name="i-heroicons-squares-2x2" class="text-primary-800 h-5 w-5" />
            </div>
            <div class="mt-4 space-y-2">
              <button
                v-for="layer in lakeLayers"
                :key="layer.id"
                type="button"
                class="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors"
                :class="
                  enabledLayerIds.includes(layer.id)
                    ? 'border-primary-200 bg-primary-50'
                    : 'border-border bg-white hover:bg-muted'
                "
                @click="toggleLayer(layer.id)"
              >
                <span>
                  <span class="block text-sm font-bold">{{ layer.name }}</span>
                  <span class="text-foreground-muted text-xs">
                    {{ layer.visibility }} · {{ layer.editable ? 'editovateľná' : 'fixná' }}
                  </span>
                </span>
                <UIcon
                  :name="enabledLayerIds.includes(layer.id) ? 'i-heroicons-eye' : 'i-heroicons-eye-slash'"
                  class="h-4 w-4"
                />
              </button>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Vybrané miesto</h2>
            <form v-if="selectedPeg" class="mt-5 space-y-4">
              <label class="block">
                <span class="text-sm font-semibold">Názov</span>
                <input v-model="selectedPeg.label" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
              </label>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">X pozícia</span>
                  <input v-model.number="selectedPeg.x" type="number" min="0" max="100" step="0.1" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Y pozícia</span>
                  <input v-model.number="selectedPeg.y" type="number" min="0" max="100" step="0.1" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                </label>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Typ</span>
                  <select v-model="selectedPeg.type" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                    <option value="shore">lovné miesto</option>
                    <option value="cabin">miesto s chatou</option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Kapacita</span>
                  <input v-model.number="selectedPeg.capacity" type="number" min="1" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                </label>
              </div>
              <label class="flex items-center gap-2 rounded-md bg-muted p-3 text-sm font-semibold">
                <input
                  v-model="selectedPeg.requiresCabinReservation"
                  type="checkbox"
                  :disabled="selectedPeg.type !== 'cabin'"
                  class="h-4 w-4 accent-primary-700 disabled:opacity-50"
                >
                Pri rezervácii vyžadovať aj chatu
              </label>
              <ValidationSummary
                :messages="selectedPegValidationMessages"
                valid-title="Bod mapy je validný"
                valid-description="Súradnice, názov, typ a kapacita sú pripravené na uloženie."
              />
              <div class="grid gap-2 sm:grid-cols-2">
                <UButton type="button" icon="i-heroicons-arrow-path" variant="soft" @click="resetSelectedPegPosition">
                  Vrátiť pozíciu
                </UButton>
                <UButton
                  type="button"
                  icon="i-heroicons-check"
                  :disabled="!selectedPegValidation.success || saveStatus === 'saving'"
                  :loading="saveStatus === 'saving'"
                  @click="saveMapChanges"
                >
                  Uložiť lokálne
                </UButton>
              </div>
              <p
                v-if="saveMessage"
                class="rounded-md px-3 py-2 text-sm font-semibold"
                :class="
                  saveStatus === 'success'
                    ? 'bg-success-500/10 text-success-700'
                    : 'bg-error-500/10 text-error-700'
                "
              >
                {{ saveMessage }}
              </p>
            </form>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Súhrn mapy</h2>
            <dl class="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div class="rounded-md bg-muted p-3">
                <dt class="text-foreground-muted text-xs">Jazero</dt>
                <dd class="font-semibold">{{ getLakeName(selectedLake) }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-foreground-muted text-xs">Miest</dt>
                <dd class="font-semibold">{{ lakePegs.length }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-foreground-muted text-xs">Chaty</dt>
                <dd class="font-semibold">{{ cabinPegs.length }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-foreground-muted text-xs">Podklad</dt>
                <dd class="font-semibold">{{ activeBackgroundImage ? 'obrázok' : 'generovaný SVG' }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-foreground-muted text-xs">Vrstvy</dt>
                <dd class="font-semibold">{{ enabledLayers.length }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-foreground-muted text-xs">Lokálne zmeny</dt>
                <dd class="font-semibold">{{ changedPegs.length }}</dd>
              </div>
            </dl>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Export modelu</h2>
            <p class="text-foreground-muted mt-2 text-sm">
              Lokálna úprava sa ukladá do JSON store. Produkčne sa rovnaký kontrakt nahradí
              tabuľkami `map_points` a `map_layers`.
            </p>
            <div class="mt-4 max-h-44 overflow-auto rounded-md bg-muted p-3 text-xs">
              <pre>{{ JSON.stringify(changedPegs.map((peg) => ({ id: peg.id, label: peg.label, capacity: peg.capacity, x: peg.x, y: peg.y, type: peg.type, requiresCabinReservation: peg.requiresCabinReservation })), null, 2) }}</pre>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
