<script setup lang="ts">
import { getPegAvailability } from '~/utils/availability'

useHead({ title: 'Prehľad' })

const { alerts, catches, getLakeName, getPegLabel, lakes, pegs, reservations } = usePondData()
const { liveClosures } = await useClosureState({ key: 'public-home-closure-state' })

const livePegAvailabilityRows = computed(() =>
  pegs.map((peg) => getPegAvailability(peg, { closures: liveClosures.value, reservations })),
)
const availableCount = computed(() =>
  livePegAvailabilityRows.value.filter((availability) => availability.reservable).length,
)
const reservedCount = computed(() =>
  livePegAvailabilityRows.value.filter((availability) => !availability.reservable).length,
)
const cabinCount = computed(() => pegs.filter((peg) => peg.type === 'cabin').length)
const latestCatches = computed(() => catches.filter((catchItem) => catchItem.status === 'approved').slice(0, 3))
const todayReservations = computed(() => reservations.slice(0, 4))
const activeAlert = alerts[0]!
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
            {{ lakes.length }} susedné jazerá · PWA revíru
          </p>
          <h1 class="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
            Rybolov Cetín: obsadenosť, úlovky a výstrahy pri vode.
          </h1>
          <p class="mt-4 max-w-2xl text-base text-white/75 sm:text-lg">
            Pilotný dashboard pre rybárov aj správcu revíru. Lovné miesta, chaty, súťažné sektory,
            rezervácie a evidencia úlovkov sú pripravené na napojenie na reálne dáta.
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
            <UButton to="/rezervacie" color="warning" size="lg" icon="i-heroicons-calendar-days">
              Pozrieť obsadenosť
            </UButton>
            <UButton
              to="/mapa"
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

        <div class="relative rounded-card border border-white/10 bg-white/10 p-4 backdrop-blur">
          <div class="flex items-start gap-3">
            <div class="bg-error-500 rounded-full p-2 text-white">
              <UIcon name="i-heroicons-bell-alert" class="h-5 w-5" />
            </div>
            <div>
              <p class="text-sm font-semibold text-white">{{ activeAlert.title }}</p>
              <p class="mt-1 text-sm text-white/75">{{ activeAlert.body }}</p>
              <p class="mt-3 text-xs font-semibold text-accent-200">
                Platí do {{ activeAlert.validUntil }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Voľné miesta</p>
          <p class="mt-2 text-3xl font-bold">{{ availableCount }}</p>
          <p class="text-success-500 mt-1 text-sm">dostupné ihneď</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Obsadené</p>
          <p class="mt-2 text-3xl font-bold">{{ reservedCount }}</p>
          <p class="text-error-500 mt-1 text-sm">aktuálne blokované</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Chaty</p>
          <p class="mt-2 text-3xl font-bold">{{ cabinCount }}</p>
          <p class="text-foreground-muted mt-1 text-sm">pri lovných miestach</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Úlovky v denníku</p>
          <p class="mt-2 text-3xl font-bold">{{ catches.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">s mierou, váhou a nástrahou</p>
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
            <UButton to="/mapa" variant="link" trailing-icon="i-heroicons-arrow-right">
              Celá mapa
            </UButton>
          </div>
          <LakeMap
            title="Veľký Cetín"
            image="/images/source-web/velky-cetin-map-original.jpg"
            :closures="liveClosures"
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
              <h2 class="text-lg font-bold">Dnešné rezervácie</h2>
              <p class="text-foreground-muted text-sm">Prvý nástrel kalendára správcu.</p>
            </div>
            <UButton to="/rezervacie" icon="i-heroicons-arrow-right" variant="ghost" aria-label="Rezervácie" />
          </div>
          <div class="mt-4 space-y-3">
            <div
              v-for="reservation in todayReservations"
              :key="reservation.id"
              class="bg-muted rounded-md p-3"
            >
              <div class="flex items-center justify-between gap-3">
                <p class="font-semibold">{{ getPegLabel(reservation.pegId) }}</p>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-semibold"
                  :class="
                    reservation.status === 'confirmed'
                      ? 'bg-success-500/10 text-success-500'
                      : 'bg-warning-500/10 text-warning-500'
                  "
                >
                  {{ reservation.status === 'confirmed' ? 'potvrdené' : 'čaká' }}
                </span>
              </div>
              <p class="text-foreground-muted mt-1 text-sm">
                {{ reservation.guest }} · {{ getLakeName(reservation.lake) }}
              </p>
            </div>
          </div>
        </div>

        <div class="border-border bg-surface rounded-card border p-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-lg font-bold">Posledné úlovky</h2>
              <p class="text-foreground-muted text-sm">Dáta pre budúcu analytiku rýb.</p>
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
