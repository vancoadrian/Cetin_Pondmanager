<script setup lang="ts">
import type { AnglerLogbooksResponse } from '~/services/catchApiService'
import type { AccountReservation, AnglerReservationsResponse } from '~/services/reservationApiService'

useHead({ title: 'Môj účet' })

const {
  contactInfo,
  getLakeName,
  getPegLabel,
  permitProducts,
} = usePondData()
const { account } = useMockAnglerAuth()
const { logout } = useMockAuth()
const requestFetch = useRequestFetch()
const { liveCabinProducts } = await useCabinCatalogState({ key: 'angler-account-cabin-catalog-state' })
const { livePaymentMethods } = await usePaymentMethodState({ key: 'angler-account-payment-method-state' })
const { liveRentalItems, liveReservationExtras } = await useRentalCatalogState({ key: 'angler-account-rental-catalog-state' })

const emptyState = (): AnglerLogbooksResponse => ({
  account: account.value ?? { email: '', id: '', name: '' },
  ok: true,
  tripLogbookEntries: [],
  tripLogbooks: [],
  updatedAt: '',
})
const emptyReservationState = (): AnglerReservationsResponse => ({
  account: account.value ?? { email: '', id: '', name: '' },
  ok: true,
  rentalBookings: [],
  reservations: [],
  updatedAt: '',
})

const {
  data: accountState,
  error: accountError,
  refresh,
  status,
} = await useAsyncData<AnglerLogbooksResponse>(
  'angler-account-logbooks',
  () => account.value
    ? requestFetch<AnglerLogbooksResponse>('/api/account/logbooks')
    : Promise.resolve(emptyState()),
  {
    default: emptyState,
    watch: [account],
  },
)
const {
  data: reservationState,
  error: reservationError,
  refresh: refreshReservations,
  status: reservationStatus,
} = await useAsyncData<AnglerReservationsResponse>(
  'angler-account-reservations',
  () => account.value
    ? requestFetch<AnglerReservationsResponse>('/api/account/reservations')
    : Promise.resolve(emptyReservationState()),
  {
    default: emptyReservationState,
    watch: [account],
  },
)

const activeLogbooks = computed(() =>
  accountState.value.tripLogbooks.filter((logbook) => logbook.status !== 'closed'),
)
const closedLogbooks = computed(() =>
  accountState.value.tripLogbooks.filter((logbook) => logbook.status === 'closed'),
)
const isLoadingAccount = computed(() => status.value === 'pending')
const isLoadingReservations = computed(() => reservationStatus.value === 'pending')
const accountLoadError = computed(() =>
  accountError.value
    ? 'Zápisníky sa nepodarilo načítať. Skontrolujte pripojenie a skúste to znova.'
    : '',
)
const reservationLoadError = computed(() =>
  reservationError.value
    ? 'Rezervácie sa nepodarilo načítať. Skontrolujte pripojenie a skúste to znova.'
    : '',
)
const totalWeight = computed(() =>
  accountState.value.tripLogbookEntries.reduce((sum, entry) => sum + entry.weightKg, 0),
)
const accountReservations = computed(() => reservationState.value.reservations)
const pendingReservationCount = computed(() =>
  accountReservations.value.filter((reservation) => reservation.status === 'pending').length,
)
const confirmedReservationCount = computed(() =>
  accountReservations.value.filter((reservation) => reservation.status === 'confirmed').length,
)
const sortedEntries = computed(() =>
  [...accountState.value.tripLogbookEntries].sort((first, second) =>
    new Date(second.caughtAt).getTime() - new Date(first.caughtAt).getTime(),
  ),
)
const recentEntries = computed(() => sortedEntries.value.slice(0, 5))
const largestEntry = computed(() =>
  [...accountState.value.tripLogbookEntries].sort((first, second) => second.weightKg - first.weightKg)[0],
)

function entriesFor(logbookId: string) {
  return accountState.value.tripLogbookEntries.filter((entry) => entry.logbookId === logbookId)
}

function logbookTotalWeight(logbookId: string) {
  return entriesFor(logbookId).reduce((sum, entry) => sum + entry.weightKg, 0)
}

function verifiedEntryCount(logbookId: string) {
  return entriesFor(logbookId).filter((entry) => entry.verified).length
}

function logbookById(logbookId: string) {
  return accountState.value.tripLogbooks.find((logbook) => logbook.id === logbookId)
}

function permitLabel(permitId: string) {
  return permitProducts.find((permit) => permit.id === permitId)?.label ?? permitId
}

function cabinLabel(reservation: AccountReservation) {
  if (!reservation.cabinProductId) return ''

  return liveCabinProducts.value.find((cabin) => cabin.id === reservation.cabinProductId)?.label ?? 'Chata'
}

function rentalLabels(reservation: AccountReservation) {
  return reservation.rentalIds
    .map((id) => liveRentalItems.value.find((item) => item.id === id)?.label)
    .filter(Boolean)
}

function extraLabels(reservation: AccountReservation) {
  return reservation.extraIds
    .map((id) => liveReservationExtras.value.find((extra) => extra.id === id)?.label)
    .filter(Boolean)
}

function reservationRentalStatus(reservationId: string) {
  const statuses = new Set(
    reservationState.value.rentalBookings
      .filter((booking) => booking.reservationId === reservationId)
      .map((booking) => booking.status),
  )

  if (statuses.has('reserved')) return 'výbava potvrdená'
  if (statuses.has('requested')) return 'výbava čaká'
  if (statuses.has('unavailable')) return 'výbava nedostupná'

  return ''
}

function paymentMethodLabel(reservation: AccountReservation) {
  if (!reservation.paymentMethodId) return ''

  return livePaymentMethods.value.find((method) => method.id === reservation.paymentMethodId)?.label ?? 'Spôsob platby'
}

function paymentInstructions(reservation: AccountReservation) {
  if (!reservation.paymentMethodId) {
    return 'Správca potvrdí spôsob platby spolu s termínom.'
  }

  return livePaymentMethods.value.find((method) => method.id === reservation.paymentMethodId)?.instructions
    ?? 'Pokyny k platbe pošle správca po potvrdení rezervácie.'
}

function reservationSmsBody(reservation: AccountReservation) {
  return [
    'Rybolov Cetín - rezervácia',
    `ID: ${reservation.id}`,
    `Meno: ${account.value?.name ?? reservation.guest}`,
    `Termín: ${formatDateRange(reservation.from, reservation.to)}`,
    `Miesto: ${getLakeName(reservation.lake)} · ${getPegLabel(reservation.pegId)}`,
    'Správa: prosím o informáciu k rezervácii.',
  ].join('\n')
}

function reservationSmsHref(reservation: AccountReservation) {
  return `sms:${contactInfo.phoneHref}?&body=${encodeURIComponent(reservationSmsBody(reservation))}`
}

function entryCountLabel(count: number) {
  if (count === 1) return '1 úlovok'
  if (count >= 2 && count <= 4) return `${count} úlovky`
  return `${count} úlovkov`
}

function formatDateRange(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat('sk-SK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${formatter.format(new Date(from))} – ${formatter.format(new Date(to))}`
}

function reservationStatusLabel(status: AccountReservation['status']) {
  switch (status) {
    case 'confirmed':
      return 'potvrdená'
    case 'pending':
      return 'čaká na potvrdenie'
    case 'blocked':
      return 'zamietnutá'
  }
}

function reservationStatusTone(status: AccountReservation['status']) {
  switch (status) {
    case 'confirmed':
      return 'success'
    case 'pending':
      return 'warning'
    case 'blocked':
      return 'error'
  }
}

function paymentStatusLabel(status?: AccountReservation['paymentStatus']) {
  switch (status) {
    case 'paid':
      return 'uhradené'
    case 'pending':
      return 'platba čaká'
    case 'unpaid':
      return 'neuhradené'
    case 'waived':
      return 'bez úhrady'
    default:
      return 'platba podľa dohody'
  }
}

function paymentStatusTone(status?: AccountReservation['paymentStatus']) {
  if (status === 'paid' || status === 'waived') return 'success'
  if (status === 'unpaid') return 'warning'

  return 'neutral'
}

function formatCatchTime(value: string) {
  return new Intl.DateTimeFormat('sk-SK', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value))
}

function formatWeight(value: number) {
  return value.toLocaleString('sk-SK', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })
}

async function retryLogbooks() {
  await refresh()
}

async function retryReservations() {
  await refreshReservations()
}

async function submitLogout() {
  logout()
  accountState.value = emptyState()
  reservationState.value = emptyReservationState()
  await navigateTo('/')
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Rybársky účet"
      title="Môj účet"
      description="Rezervácie, zápisníky výprav a úlovky uložené k prihlásenému e-mailu."
    />

    <section class="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-4 border-y border-primary-200 bg-primary-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="font-bold">{{ account?.name }}</p>
          <p class="mt-1 text-sm text-foreground-muted">{{ account?.email }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton to="/ulovky" icon="i-heroicons-plus" color="warning">Nový zápisník</UButton>
          <UButton icon="i-heroicons-arrow-right-on-rectangle" variant="ghost" @click="submitLogout">
            Odhlásiť
          </UButton>
        </div>
      </div>

      <AppState
        v-if="isLoadingAccount"
        type="loading"
        title="Načítavam zápisníky"
        description="Sťahujeme výpravy a úlovky uložené k vášmu účtu."
        class="mt-6"
      />
      <AppState
        v-else-if="accountLoadError"
        type="error"
        title="Zápisníky sa nedajú načítať"
        :description="accountLoadError"
        class="mt-6"
      >
        <UButton icon="i-heroicons-arrow-path" variant="soft" @click="retryLogbooks">
          Skúsiť znova
        </UButton>
      </AppState>

      <template v-else>
        <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div class="rounded-card border border-border bg-surface p-4">
            <p class="text-sm text-foreground-muted">Rezervácie</p>
            <p class="mt-2 text-3xl font-bold">{{ accountReservations.length }}</p>
            <p class="mt-1 text-xs text-foreground-muted">
              {{ confirmedReservationCount }} potvrdené · {{ pendingReservationCount }} čaká
            </p>
          </div>
          <div class="rounded-card border border-border bg-surface p-4">
            <p class="text-sm text-foreground-muted">Zápisníky</p>
            <p class="mt-2 text-3xl font-bold">{{ accountState.tripLogbooks.length }}</p>
          </div>
          <div class="rounded-card border border-border bg-surface p-4">
            <p class="text-sm text-foreground-muted">Úlovky vo výpravách</p>
            <p class="mt-2 text-3xl font-bold">{{ accountState.tripLogbookEntries.length }}</p>
          </div>
          <div class="rounded-card border border-border bg-surface p-4">
            <p class="text-sm text-foreground-muted">Spoločná váha</p>
            <p class="mt-2 text-3xl font-bold">{{ formatWeight(totalWeight) }} kg</p>
          </div>
          <div class="rounded-card border border-border bg-surface p-4">
            <p class="text-sm text-foreground-muted">Najväčší úlovok</p>
            <p class="mt-2 text-3xl font-bold">
              {{ largestEntry ? `${formatWeight(largestEntry.weightKg)} kg` : '—' }}
            </p>
            <p v-if="largestEntry" class="mt-1 text-xs text-foreground-muted">
              {{ largestEntry.species }} · {{ getPegLabel(largestEntry.pegId) }}
            </p>
          </div>
        </div>

        <section class="mt-8">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 class="text-xl font-bold">Moje rezervácie</h2>
              <p class="mt-1 text-sm text-foreground-muted">
                Termíny priradené k e-mailu {{ account?.email }}.
              </p>
            </div>
            <UButton to="/rezervacie" icon="i-heroicons-calendar-days" variant="soft">
              Nová rezervácia
            </UButton>
          </div>

          <AppState
            v-if="isLoadingReservations"
            type="loading"
            title="Načítavam rezervácie"
            description="Sťahujeme termíny uložené k vášmu účtu."
            class="mt-4"
          />
          <AppState
            v-else-if="reservationLoadError"
            type="error"
            title="Rezervácie sa nedajú načítať"
            :description="reservationLoadError"
            class="mt-4"
          >
            <UButton icon="i-heroicons-arrow-path" variant="soft" @click="retryReservations">
              Skúsiť znova
            </UButton>
          </AppState>

          <div v-else-if="accountReservations.length" class="mt-4 grid gap-4 lg:grid-cols-2">
            <article
              v-for="reservation in accountReservations"
              :key="reservation.id"
              class="rounded-card border border-border bg-surface p-5"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-sm font-bold text-primary-800">{{ getLakeName(reservation.lake) }}</p>
                  <h3 class="mt-1 text-xl font-bold">{{ getPegLabel(reservation.pegId) }}</h3>
                  <p class="mt-1 text-sm text-foreground-muted">
                    {{ formatDateRange(reservation.from, reservation.to) }} · {{ permitLabel(reservation.permitId) }}
                  </p>
                </div>
                <StatusBadge
                  :label="reservationStatusLabel(reservation.status)"
                  :tone="reservationStatusTone(reservation.status)"
                  size="xs"
                />
              </div>

              <div class="mt-4 flex flex-wrap gap-2 text-sm">
                <StatusBadge
                  :label="paymentStatusLabel(reservation.paymentStatus)"
                  :tone="paymentStatusTone(reservation.paymentStatus)"
                  size="xs"
                />
                <span v-if="cabinLabel(reservation)" class="rounded-md bg-primary-50 px-2.5 py-1 font-semibold text-primary-800">
                  {{ cabinLabel(reservation) }}
                </span>
                <span v-if="reservationRentalStatus(reservation.id)" class="rounded-md bg-muted px-2.5 py-1 font-semibold">
                  {{ reservationRentalStatus(reservation.id) }}
                </span>
              </div>

              <div v-if="rentalLabels(reservation).length || extraLabels(reservation).length" class="mt-4 grid gap-3 sm:grid-cols-2">
                <div v-if="rentalLabels(reservation).length" class="rounded-md bg-muted p-3">
                  <p class="text-xs font-semibold text-foreground-muted">Požičovňa</p>
                  <p class="mt-1 text-sm font-semibold">{{ rentalLabels(reservation).join(', ') }}</p>
                </div>
                <div v-if="extraLabels(reservation).length" class="rounded-md bg-muted p-3">
                  <p class="text-xs font-semibold text-foreground-muted">Doplnky</p>
                  <p class="mt-1 text-sm font-semibold">{{ extraLabels(reservation).join(', ') }}</p>
                </div>
              </div>

              <div class="mt-4 rounded-md border border-border bg-white p-3 text-sm">
                <div class="flex items-start gap-2">
                  <UIcon name="i-heroicons-banknotes" class="mt-0.5 h-5 w-5 shrink-0 text-primary-700" />
                  <div>
                    <p class="font-bold">
                      {{ paymentMethodLabel(reservation) || paymentStatusLabel(reservation.paymentStatus) }}
                    </p>
                    <p class="text-foreground-muted mt-1">
                      {{ paymentInstructions(reservation) }}
                    </p>
                  </div>
                </div>
              </div>

              <div class="mt-5 flex flex-wrap gap-2">
                <UButton
                  :to="{ path: '/rezervacie', query: { do: reservation.to, jazero: reservation.lake, miesto: reservation.pegId, od: reservation.from } }"
                  icon="i-heroicons-calendar-days"
                  variant="ghost"
                >
                  Otvoriť termín
                </UButton>
                <UButton :to="`tel:${contactInfo.phoneHref}`" icon="i-heroicons-phone" color="neutral" variant="soft">
                  Zavolať správcovi
                </UButton>
                <UButton :to="reservationSmsHref(reservation)" icon="i-heroicons-chat-bubble-left-ellipsis" variant="soft">
                  SMS k rezervácii
                </UButton>
              </div>
            </article>
          </div>
          <AppState
            v-else
            title="Zatiaľ bez rezervácií"
            description="Rezervácia odoslaná s týmto e-mailom sa po uložení zobrazí v účte."
            icon="i-heroicons-calendar-days"
            class="mt-4"
          >
            <UButton to="/rezervacie" icon="i-heroicons-calendar-days" variant="soft">
              Vytvoriť rezerváciu
            </UButton>
          </AppState>
        </section>

        <section class="mt-8">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 class="text-xl font-bold">Posledné úlovky</h2>
              <p class="mt-1 text-sm text-foreground-muted">
                Rýchly prehľad zápisov z vašich vlastných a priradených výprav.
              </p>
            </div>
            <UButton to="/ulovky" icon="i-heroicons-plus" variant="soft">
              Zapísať úlovok
            </UButton>
          </div>

          <div v-if="recentEntries.length" class="mt-4 divide-y divide-border border-y border-border">
            <div
              v-for="entry in recentEntries"
              :key="entry.id"
              class="grid gap-3 py-4 md:grid-cols-[1fr_auto]"
            >
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <p class="font-bold">{{ entry.species }} · {{ formatWeight(entry.weightKg) }} kg</p>
                  <StatusBadge
                    :label="entry.verified ? 'overené' : 'čaká na kontrolu'"
                    :tone="entry.verified ? 'success' : 'warning'"
                    size="xs"
                  />
                </div>
                <p class="mt-1 text-sm text-foreground-muted">
                  {{ entry.angler }} · {{ getLakeName(entry.lake) }} · {{ getPegLabel(entry.pegId) }} ·
                  {{ formatCatchTime(entry.caughtAt) }}
                </p>
                <p class="mt-1 text-xs text-foreground-muted">
                  {{ entry.bait }} · zápisník {{ logbookById(entry.logbookId)?.shareCode ?? 'bez kódu' }}
                </p>
              </div>
              <UButton
                :to="{ path: '/ulovky', query: { zapisnik: logbookById(entry.logbookId)?.shareCode } }"
                icon="i-heroicons-book-open"
                variant="ghost"
              >
                Otvoriť
              </UButton>
            </div>
          </div>
          <AppState
            v-else
            title="Zatiaľ bez úlovkov"
            description="Keď do zápisníka pribudne prvý úlovok, zobrazí sa v tomto prehľade."
            icon="i-heroicons-camera"
          />
        </section>

        <section class="mt-8">
          <div>
            <h2 class="text-xl font-bold">Aktívne výpravy</h2>
            <p class="mt-1 text-sm text-foreground-muted">Vlastné zápisníky aj výpravy, ku ktorým je účet priradený.</p>
          </div>

          <div v-if="activeLogbooks.length" class="mt-4 grid gap-4 lg:grid-cols-2">
            <article
              v-for="logbook in activeLogbooks"
              :key="logbook.id"
              class="rounded-card border border-border bg-surface p-5"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-bold text-primary-800">{{ getLakeName(logbook.lake) }}</p>
                  <h3 class="mt-1 text-xl font-bold">{{ logbook.title }}</h3>
                </div>
                <StatusBadge :label="logbook.status === 'active' ? 'aktívny' : 'rozpracovaný'" :tone="logbook.status === 'active' ? 'success' : 'warning'" size="xs" />
              </div>
              <p class="mt-3 text-sm text-foreground-muted">
                {{ formatDateRange(logbook.from, logbook.to) }} ·
                {{ logbook.pegIds.map((pegId) => getPegLabel(pegId)).join(', ') }}
              </p>
              <div class="mt-4 flex flex-wrap gap-2 text-sm">
                <span class="rounded-md bg-muted px-2.5 py-1 font-semibold">
                  {{ entryCountLabel(entriesFor(logbook.id).length) }}
                </span>
                <span class="rounded-md bg-muted px-2.5 py-1 font-semibold">
                  {{ formatWeight(logbookTotalWeight(logbook.id)) }} kg
                </span>
                <span class="rounded-md bg-muted px-2.5 py-1 font-semibold">
                  {{ verifiedEntryCount(logbook.id) }} overené
                </span>
                <span class="rounded-md bg-muted px-2.5 py-1 font-mono font-semibold">{{ logbook.shareCode }}</span>
              </div>
              <div v-if="entriesFor(logbook.id).length" class="mt-5 divide-y divide-border border-y border-border">
                <div
                  v-for="entry in entriesFor(logbook.id).slice(0, 3)"
                  :key="entry.id"
                  class="py-3 text-sm"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="font-semibold">{{ entry.species }} · {{ formatWeight(entry.weightKg) }} kg</p>
                      <p class="mt-0.5 text-foreground-muted">
                        {{ entry.angler }} · {{ getPegLabel(entry.pegId) }} · {{ formatCatchTime(entry.caughtAt) }}
                      </p>
                    </div>
                    <StatusBadge
                      :label="entry.verified ? 'overené' : 'kontrola'"
                      :tone="entry.verified ? 'success' : 'warning'"
                      size="xs"
                    />
                  </div>
                </div>
              </div>
              <UButton
                :to="{ path: '/ulovky', query: { zapisnik: logbook.shareCode } }"
                icon="i-heroicons-book-open"
                variant="soft"
                class="mt-5"
              >
                Otvoriť zápisník
              </UButton>
            </article>
          </div>
          <AppState
            v-else-if="status !== 'pending'"
            title="Zatiaľ bez aktívnej výpravy"
            description="Nový zápisník vytvorený po prihlásení sa tu zobrazí automaticky."
            icon="i-heroicons-book-open"
          />
        </section>

        <section v-if="closedLogbooks.length" class="mt-10">
          <h2 class="text-xl font-bold">Ukončené výpravy</h2>
          <div class="mt-4 divide-y divide-border border-y border-border">
            <div
              v-for="logbook in closedLogbooks"
              :key="logbook.id"
              class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p class="font-bold">{{ logbook.title }}</p>
                <p class="mt-1 text-sm text-foreground-muted">{{ formatDateRange(logbook.from, logbook.to) }}</p>
              </div>
              <UButton :to="{ path: '/ulovky', query: { zapisnik: logbook.shareCode } }" variant="ghost">
                História
              </UButton>
            </div>
          </div>
        </section>
      </template>
    </section>
  </div>
</template>
