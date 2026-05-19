<script setup lang="ts">
import { getPegAvailability } from '~/utils/availability'

useHead({ title: 'Admin' })

const {
  getLakeName,
  lakeClosures,
  lakes,
  pegs,
  rentalItems,
  reservations,
  sponsors,
  tournamentPenalties,
  tournamentRequests,
  tournamentRequestTypeLabels,
} = usePondData()

const { logout, user } = useMockAuth()

const pendingReservations = computed(() =>
  reservations.filter((reservation) => reservation.status === 'pending'),
)
const blockedReservations = computed(() =>
  reservations.filter((reservation) => reservation.status === 'blocked'),
)
const internalClosures = computed(() =>
  lakeClosures.filter((closure) => closure.visibility === 'internal' || closure.affectsReservations),
)
const activeSponsors = computed(() => sponsors.filter((sponsor) => sponsor.active))
const activeTournamentRequests = computed(() =>
  tournamentRequests.filter((request) => request.status !== 'resolved'),
)
const activeTournamentPenalties = computed(() =>
  tournamentPenalties.filter((penalty) => penalty.status === 'active'),
)
const blockedPegs = computed(() =>
  pegs.filter((peg) => !getPegAvailability(peg, { closures: lakeClosures, reservations }).reservable),
)

async function signOut() {
  logout()
  await navigateTo('/login')
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Interná zóna"
      title="Admin dashboard"
      description="Mocknutý interný pohľad pre správcu, majiteľa, kontrolóra alebo súťažný tím. Dáta sú zatiaľ lokálne seed dáta."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div class="mb-6 flex flex-col gap-4 rounded-card border border-border bg-primary-900 p-5 text-white lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-sm font-semibold text-accent-300">Prihlásený mock používateľ</p>
          <h2 class="mt-1 text-2xl font-bold">{{ user?.name }}</h2>
          <p class="mt-1 text-sm text-white/75">{{ user?.description }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton to="/" color="neutral" variant="outline" class="border-white/30 bg-white/10 text-white hover:bg-white/15">
            Public web
          </UButton>
          <UButton color="warning" icon="i-heroicons-arrow-left-on-rectangle" @click="signOut">
            Odhlásiť
          </UButton>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Jazerá</p>
          <p class="mt-2 text-3xl font-bold">{{ lakes.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">multi-revír pripravený dátovo</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Blokované miesta</p>
          <p class="mt-2 text-3xl font-bold">{{ blockedPegs.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">rezervácie a uzávierky</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Na schválenie</p>
          <p class="mt-2 text-3xl font-bold">{{ pendingReservations.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">rezervácie</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Súťažné hlásenia</p>
          <p class="mt-2 text-3xl font-bold">{{ activeTournamentRequests.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">čakajúce alebo priradené</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Sponzori</p>
          <p class="mt-2 text-3xl font-bold">{{ activeSponsors.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">aktívne umiestnenia</p>
        </div>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div class="space-y-6">
          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Uzávierky a interné blokácie</h2>
                <p class="text-foreground-muted text-sm">
                  Jedno miesto pre sezónu, neres, údržbu, mimoriadne stavy a preteky.
                </p>
              </div>
              <UButton to="/admin/uzavierky" icon="i-heroicons-arrow-right" variant="soft">
                Otvoriť uzávierky
              </UButton>
            </div>
            <div class="mt-5 space-y-3">
              <div
                v-for="closure in internalClosures"
                :key="closure.id"
                class="rounded-md border border-border bg-white p-4"
              >
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-bold">{{ closure.title }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ closure.lake === 'all' ? 'Všetky jazerá' : getLakeName(closure.lake) }} ·
                      {{ closure.from }} až {{ closure.to }}
                    </p>
                  </div>
                  <span
                    class="w-fit rounded-md px-2.5 py-1 text-xs font-bold"
                    :class="
                      closure.visibility === 'public'
                        ? 'bg-success-500/10 text-success-700'
                        : 'bg-warning-500/10 text-warning-700'
                    "
                  >
                    {{ closure.visibility === 'public' ? 'public' : 'interné' }}
                  </span>
                </div>
                <p class="text-foreground-muted mt-3 text-sm">{{ closure.notes }}</p>
              </div>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 class="text-lg font-bold">Rezervácie na spracovanie</h2>
                <UButton to="/admin/rezervacie" icon="i-heroicons-arrow-right" variant="ghost">
                  Všetky rezervácie
                </UButton>
              </div>
            <div class="mt-4 grid gap-3 md:grid-cols-2">
              <div
                v-for="reservation in [...pendingReservations, ...blockedReservations]"
                :key="reservation.id"
                class="rounded-md border border-border bg-white p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-bold">{{ reservation.guest }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ getLakeName(reservation.lake) }} · {{ reservation.pegId }}
                    </p>
                  </div>
                  <span class="rounded-md bg-warning-500/10 px-2 py-1 text-xs font-bold text-warning-700">
                    {{ reservation.status }}
                  </span>
                </div>
                <p class="text-foreground-muted mt-3 text-sm">
                  {{ reservation.from }} až {{ reservation.to }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-lg font-bold">Požičovňa</h2>
              <UButton to="/admin/pozicovna" icon="i-heroicons-arrow-right" variant="ghost" aria-label="Požičovňa" />
            </div>
            <div class="mt-4 space-y-3">
              <div v-for="item in rentalItems" :key="item.id" class="rounded-md bg-muted p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ item.label }}</p>
                    <p class="text-foreground-muted text-sm">{{ item.priceLabel }}</p>
                  </div>
                  <span class="text-lg font-bold">{{ item.stock }} ks</span>
                </div>
              </div>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-lg font-bold">Súťažný dispečing</h2>
              <UButton to="/admin/sutaze" icon="i-heroicons-arrow-right" variant="ghost" aria-label="Súťaže" />
            </div>
            <div class="mt-4 space-y-3">
              <div
                v-for="request in activeTournamentRequests"
                :key="request.id"
                class="rounded-md border border-border bg-white p-4"
              >
                <p class="font-bold">{{ request.team }} · {{ request.sectorId.toUpperCase() }}</p>
                <p class="text-primary-800 text-sm font-semibold">
                  {{ tournamentRequestTypeLabels[request.type] }}
                </p>
                <p class="text-foreground-muted mt-2 text-sm">{{ request.description }}</p>
              </div>
            </div>
            <div v-if="activeTournamentPenalties.length" class="mt-4 rounded-md bg-error-500/10 p-4">
              <p class="text-sm font-bold text-error-700">
                {{ activeTournamentPenalties.length }} aktívny trest v súťaži
              </p>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-lg font-bold">Sponzori</h2>
              <UButton to="/admin/sponzori" icon="i-heroicons-arrow-right" variant="ghost" aria-label="Sponzori" />
            </div>
            <div class="mt-4 space-y-3">
              <div v-for="sponsor in sponsors" :key="sponsor.id" class="flex items-center gap-3 rounded-md bg-muted p-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-md bg-primary-900 text-sm font-black text-accent-300">
                  {{ sponsor.logoText }}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold">{{ sponsor.name }}</p>
                  <p class="text-foreground-muted truncate text-sm">{{ sponsor.placement }}</p>
                </div>
                <span
                  class="rounded-md px-2 py-1 text-xs font-bold"
                  :class="sponsor.active ? 'bg-success-500/10 text-success-700' : 'bg-muted text-foreground-muted'"
                >
                  {{ sponsor.active ? 'aktívny' : 'pauza' }}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
