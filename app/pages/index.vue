<script setup lang="ts">
import type { PublicNotificationStateResponse } from '~/services/notificationService'
import { getPegAvailability } from '~/utils/availability'
import { resolveAvailabilityDateRange } from '~/utils/availabilityDateRange'

useHead({ title: 'Prehľad' })

const { alerts: seedAlerts, catches, getPegLabel, lakes, pegs, reservations } = usePondData()
const route = useRoute()
const router = useRouter()
const { liveClosures } = await useClosureState({ key: 'public-home-closure-state' })
const fallbackNotificationState = (): PublicNotificationStateResponse => ({
  alerts: seedAlerts,
  ok: true,
  subscriptionCount: 0,
  updatedAt: 'seed',
})
const {
  data: notificationState,
  error: notificationStateError,
  status: notificationStateStatus,
} = await useAsyncData<PublicNotificationStateResponse>(
  'public-home-notifications',
  () => $fetch<PublicNotificationStateResponse>('/api/notifications'),
  {
    default: fallbackNotificationState,
  },
)
const initialDateRange = resolveAvailabilityDateRange(route.query.od, route.query.do)
const dateFrom = ref(initialDateRange.dateFrom)
const dateTo = ref(initialDateRange.dateTo)

const livePegAvailabilityRows = computed(() =>
  pegs.map((peg) => getPegAvailability(peg, {
    closures: liveClosures.value,
    dateFrom: dateFrom.value,
    dateTo: dateTo.value,
    reservations,
  })),
)
const availableCount = computed(() =>
  livePegAvailabilityRows.value.filter((availability) => availability.reservable).length,
)
const reservedCount = computed(() =>
  livePegAvailabilityRows.value.filter((availability) => !availability.reservable).length,
)
const cabinCount = computed(() => pegs.filter((peg) => peg.type === 'cabin').length)
const publicCatches = computed(() => catches.filter((catchItem) => catchItem.status === 'approved'))
const latestCatches = computed(() => publicCatches.value.slice(0, 3))
const publicAlerts = computed(() => notificationState.value?.alerts ?? seedAlerts)
const activeAlert = computed(() => publicAlerts.value[0])
const alertCardTitle = computed(() => {
  if (activeAlert.value) return activeAlert.value.title
  if (notificationStateStatus.value === 'pending') return 'Kontrolujem výstrahy'
  if (notificationStateError.value) return 'Výstrahy sa nepodarilo obnoviť'

  return 'Bez aktívnej výstrahy'
})
const alertCardBody = computed(() => {
  if (activeAlert.value) return activeAlert.value.body
  if (notificationStateStatus.value === 'pending') {
    return 'Overujeme aktuálne oznamy pre počasie, revír, rezervácie a súťaže.'
  }
  if (notificationStateError.value) {
    return 'Zobrazte stránku výstrah alebo skúste obnoviť pripojenie.'
  }

  return 'Momentálne nie je zverejnený žiadny mimoriadny oznam pre rybárov.'
})
const alertCardIcon = computed(() =>
  activeAlert.value || notificationStateError.value
    ? 'i-heroicons-bell-alert'
    : 'i-heroicons-check-circle',
)
const alertCardIconClasses = computed(() =>
  activeAlert.value || notificationStateError.value
    ? 'bg-error-500 text-white'
    : 'bg-success-500 text-white',
)
const alertCardMeta = computed(() =>
  activeAlert.value ? `Platí do ${activeAlert.value.validUntil}` : 'Aktuálny stav výstrah',
)
const mapTarget = computed(() => ({
  path: '/mapa',
  query: { do: dateTo.value, od: dateFrom.value },
}))
const reservationTarget = computed(() => ({
  path: '/rezervacie',
  query: { do: dateTo.value, od: dateFrom.value },
}))
const lakeAvailabilityRows = computed(() =>
  lakes.map((lake) => {
    const lakePegs = pegs.filter((peg) => peg.lake === lake.slug)
    const availabilityRows = lakePegs.map((peg) => ({
      availability: getPegAvailability(peg, {
        closures: liveClosures.value,
        dateFrom: dateFrom.value,
        dateTo: dateTo.value,
        reservations,
      }),
      peg,
    }))
    const reservablePegs = availabilityRows.filter((row) => row.availability.reservable)

    return {
      cabinCount: lakePegs.filter((peg) => peg.type === 'cabin').length,
      cabinReservableCount: reservablePegs.filter((row) => row.peg.type === 'cabin').length,
      lake,
      mapTarget: {
        path: '/mapa',
        query: { do: dateTo.value, jazero: lake.slug, od: dateFrom.value },
      },
      pegCount: lakePegs.length,
      reservationTarget: {
        path: '/rezervacie',
        query: { do: dateTo.value, jazero: lake.slug, od: dateFrom.value },
      },
      reservableCount: reservablePegs.length,
    }
  }),
)

watch([dateFrom, dateTo], () => {
  if (!import.meta.client) return
  void router.replace({
    query: {
      ...route.query,
      do: dateTo.value,
      od: dateFrom.value,
    },
  })
})
</script>

<template>
  <div>
    <section class="relative overflow-hidden bg-primary-950 text-white">
      <img
        src="/images/source-web/home-img-0999.jpg"
        alt="Vstup do areálu Štrkovisko Kocka a Veľký Cetín"
        class="absolute inset-0 h-full w-full object-cover opacity-35"
      >
      <div class="absolute inset-0 bg-linear-to-r from-primary-950 via-primary-950/90 to-primary-950/60" />
      <div class="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-14">
        <div class="relative">
          <p class="text-accent-300 text-sm font-semibold tracking-wide uppercase">
            {{ lakes.length }} susedné jazerá · Veľký Cetín
          </p>
          <h1 class="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
            Rybolov Cetín: obsadenosť, úlovky a výstrahy pri vode.
          </h1>
          <p class="mt-4 max-w-2xl text-base text-white/75 sm:text-lg">
            Skontrolujte dostupnosť lovných miest, vyberte si termín, prečítajte pravidlá revíru
            a majte dôležité oznamy vždy poruke.
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
            <UButton :to="reservationTarget" color="warning" size="lg" icon="i-heroicons-calendar-days">
              Pozrieť obsadenosť
            </UButton>
            <UButton
              :to="mapTarget"
              color="neutral"
              variant="outline"
              size="lg"
              icon="i-heroicons-map-pin"
              class="border-white/30 bg-white/10 text-white hover:border-white/50 hover:bg-white/20"
            >
              Otvoriť mapu
            </UButton>
          </div>
        </div>

        <div class="relative self-start rounded-card border border-white/10 bg-white/10 p-4 backdrop-blur">
          <div class="flex items-start gap-3">
            <div class="rounded-full p-2" :class="alertCardIconClasses">
              <UIcon :name="alertCardIcon" class="h-5 w-5" />
            </div>
            <div>
              <p class="text-sm font-semibold text-white">{{ alertCardTitle }}</p>
              <p class="mt-1 text-sm text-white/75">{{ alertCardBody }}</p>
              <p class="mt-3 text-xs font-semibold text-accent-200">
                {{ alertCardMeta }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
      <AvailabilityRangePicker
        v-model:date-from="dateFrom"
        v-model:date-to="dateTo"
      />
    </section>

    <section class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Voľné miesta</p>
          <p class="mt-2 text-3xl font-bold">{{ availableCount }}</p>
          <p class="text-success-500 mt-1 text-sm">vo zvolenom termíne</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Obsadené</p>
          <p class="mt-2 text-3xl font-bold">{{ reservedCount }}</p>
          <p class="text-error-500 mt-1 text-sm">vo zvolenom termíne</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Chaty</p>
          <p class="mt-2 text-3xl font-bold">{{ cabinCount }}</p>
          <p class="text-foreground-muted mt-1 text-sm">pri lovných miestach</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Úlovky v denníku</p>
          <p class="mt-2 text-3xl font-bold">{{ publicCatches.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">schválené správcom</p>
        </div>
      </div>
    </section>

    <section class="mx-auto grid max-w-7xl gap-6 px-4 pb-10 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
      <div class="space-y-6">
        <div>
          <div class="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 class="text-2xl font-bold tracking-tight">Rýchla mapa revíru</h2>
              <p class="text-foreground-muted mt-1 text-sm">Veľký Cetín s chatami a miestami.</p>
            </div>
            <UButton :to="mapTarget" variant="link" trailing-icon="i-heroicons-arrow-right">
              Celá mapa
            </UButton>
          </div>
          <LakeMap
            title="Veľký Cetín"
            image="/images/source-web/velky-cetin-map-original.jpg"
            :closures="liveClosures"
            :date-from="dateFrom"
            :date-to="dateTo"
            :points="pegs.filter((peg) => peg.lake === 'velky-cetin')"
            :reservations="reservations"
            selected-id="vc-03"
          />
        </div>
      </div>

      <aside class="space-y-6">
        <div class="border-border bg-surface rounded-card border p-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-lg font-bold">Dostupnosť podľa jazera</h2>
              <p class="text-foreground-muted text-sm">Súhrn voľných miest pre zvolený termín.</p>
            </div>
            <UButton to="/rezervacie" icon="i-heroicons-arrow-right" variant="ghost" aria-label="Rezervácie" />
          </div>
          <div class="mt-4 space-y-4">
            <div
              v-for="row in lakeAvailabilityRows"
              :key="row.lake.slug"
              class="rounded-md border border-border bg-muted/70 p-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-semibold">{{ row.lake.name }}</p>
                  <p class="text-foreground-muted mt-1 text-sm">
                    {{ row.reservableCount }} voľných z {{ row.pegCount }} miest
                  </p>
                </div>
                <span class="rounded-full bg-success-500/10 px-2 py-0.5 text-xs font-semibold text-success-700">
                  {{ row.cabinReservableCount }}/{{ row.cabinCount }} chát
                </span>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <UButton :to="row.mapTarget" icon="i-heroicons-map-pin" size="xs" variant="soft">
                  Mapa
                </UButton>
                <UButton :to="row.reservationTarget" icon="i-heroicons-calendar-days" size="xs" color="warning">
                  Rezervovať
                </UButton>
              </div>
            </div>
          </div>
        </div>

        <div class="border-border bg-surface rounded-card border p-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-lg font-bold">Posledné úlovky</h2>
              <p class="text-foreground-muted text-sm">Schválené záznamy rybárov z oboch jazier.</p>
            </div>
            <UButton to="/ulovky" icon="i-heroicons-camera" variant="ghost" aria-label="Úlovky" />
          </div>
          <div class="mt-4 space-y-3">
            <div v-for="catchItem in latestCatches" :key="catchItem.id" class="flex gap-3">
              <div class="bg-water-100 text-water-800 flex h-12 w-12 shrink-0 items-center justify-center rounded-md">
                <UIcon name="i-heroicons-scale" class="h-5 w-5" />
              </div>
              <div>
                <p class="font-semibold">
                  {{ catchItem.species }} · {{ catchItem.weightKg }} kg
                </p>
                <p class="text-foreground-muted text-sm">
                  {{ getPegLabel(catchItem.pegId) }} · {{ catchItem.bait }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </section>
  </div>
</template>
