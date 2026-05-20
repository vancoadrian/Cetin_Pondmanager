<script setup lang="ts">
import type { LakeSlug, Peg } from '~/data/pond'
import type { MapStateResponse } from '~/services/mapApiService'
import { getPegAvailability } from '~/utils/availability'

useHead({ title: 'Mapa lovných miest' })

const { lakes, mapLayers, mapShapes, pegs, reservations } = usePondData()
const { liveClosures } = await useClosureState({ key: 'public-map-closure-state' })

const fallbackMapState = (): MapStateResponse => ({
  ok: true,
  mapLayers,
  mapShapes,
  pegs,
  updatedAt: 'seed',
})
const { data: mapState } = await useAsyncData<MapStateResponse>(
  'public-map-state',
  () => $fetch<MapStateResponse>('/api/map'),
  {
    default: fallbackMapState,
  },
)

const selectedLake = ref<LakeSlug>('velky-cetin')
const selectedPegId = ref('vc-03')

const currentLake = computed(() => lakes.find((lake) => lake.slug === selectedLake.value) ?? lakes[0]!)
const livePegs = computed(() => mapState.value.pegs)
const liveMapLayers = computed(() => mapState.value.mapLayers)
const liveMapShapes = computed(() => mapState.value.mapShapes)
const activeBackgroundImage = computed(() =>
  liveMapLayers.value.find(
    (layer) => layer.lake === selectedLake.value && layer.kind === 'background' && layer.enabled,
  )?.source ?? currentLake.value.mapImage,
)
const lakePegs = computed(() => livePegs.value.filter((peg) => peg.lake === selectedLake.value))
const availabilityRows = computed(() =>
  lakePegs.value.map((peg) => ({
    availability: getPegAvailability(peg, { closures: liveClosures.value, reservations }),
    peg,
  })),
)
const selectedPeg = computed(() => lakePegs.value.find((peg) => peg.id === selectedPegId.value))
const selectedAvailability = computed(() =>
  selectedPeg.value
    ? getPegAvailability(selectedPeg.value, { closures: liveClosures.value, reservations })
    : undefined,
)

watch(selectedLake, () => {
  selectedPegId.value = lakePegs.value[0]?.id ?? ''
})

function selectPeg(peg: Peg) {
  selectedPegId.value = peg.id
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Mapa"
      title="Lovné miesta, chaty a stav obsadenosti"
      description="Interaktívna vrstva nad mapou jazera. Pri súťaži môže rovnaký princíp ukazovať sektory, tímy a priebežné váženie."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="inline-flex rounded-lg bg-muted p-1">
          <button
            v-for="lake in lakes"
            :key="lake.slug"
            type="button"
            class="rounded-md px-4 py-2 text-sm font-semibold transition-colors"
            :class="
              selectedLake === lake.slug
                ? 'bg-white text-primary-900 shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            "
            @click="selectedLake = lake.slug"
          >
            {{ lake.name }}
          </button>
        </div>
        <UButton to="/rezervacie" icon="i-heroicons-calendar-days" color="warning">
          Rezervovať vybrané miesto
        </UButton>
      </div>

      <LakeMap
        :title="currentLake.name"
        :image="activeBackgroundImage"
        :closures="liveClosures"
        :points="lakePegs"
        :reservations="reservations"
        :shapes="liveMapShapes"
        :selected-id="selectedPegId"
        @select="selectPeg"
      />

      <div class="mt-8 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
        <div class="border-border bg-surface rounded-card border p-5">
          <h2 class="text-lg font-bold">Vybrané miesto</h2>
          <div v-if="selectedPeg" class="mt-4 space-y-4">
            <div class="flex items-center justify-between gap-3">
              <p class="text-2xl font-bold">{{ selectedPeg.label }}</p>
              <AvailabilityBadge v-if="selectedAvailability" :availability="selectedAvailability" />
            </div>
            <p class="text-foreground-muted text-sm">{{ selectedPeg.notes }}</p>
            <p v-if="selectedAvailability" class="text-primary-800 text-sm font-semibold">
              {{ selectedAvailability.reasons[0] }}
            </p>
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-muted rounded-md p-3">
                <p class="text-foreground-muted text-xs">Kapacita</p>
                <p class="font-semibold">{{ selectedPeg.capacity }} osoby</p>
              </div>
              <div class="bg-muted rounded-md p-3">
                <p class="text-foreground-muted text-xs">Typ</p>
                <p class="font-semibold">{{ selectedPeg.type === 'cabin' ? 'chata' : 'breh' }}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="border-border bg-surface rounded-card border p-5">
          <h2 class="text-lg font-bold">Zoznam miest</h2>
          <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <button
              v-for="row in availabilityRows"
              :key="row.peg.id"
              type="button"
              class="border-border rounded-md border p-3 text-left transition-colors hover:bg-muted"
              :class="selectedPegId === row.peg.id ? 'border-primary-600 bg-primary-50' : 'bg-white'"
              @click="selectPeg(row.peg)"
            >
              <div class="flex items-start justify-between gap-3">
                <p class="font-semibold">{{ row.peg.label }}</p>
                <AvailabilityBadge :availability="row.availability" />
              </div>
              <p class="text-foreground-muted mt-2 line-clamp-2 text-sm">{{ row.peg.notes }}</p>
              <p class="text-primary-800 mt-2 line-clamp-1 text-xs font-semibold">
                {{ row.availability.reasons[0] }}
              </p>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
