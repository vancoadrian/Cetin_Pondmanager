<script setup lang="ts">
import type { CabinProduct, RequiredEquipmentItem, ReservationExtra } from '~/data/pond'

useHead({ title: 'Pravidlá a výbava' })

const {
  cabinProducts: seedCabinProducts,
  contactInfo,
  pegs,
  infoSections,
  permitProducts,
  requiredEquipment,
} = usePondData()

const { liveCabinProducts } = await useCabinCatalogState({ key: 'info-cabin-catalog-state' })
const { enabledPaymentMethods } = await usePaymentMethodState({ key: 'info-payment-method-state' })
const {
  activeRentalItems,
  activeReservationExtras,
} = await useRentalCatalogState({ key: 'info-rental-catalog-state' })

const displayedCabinProducts = computed(() =>
  liveCabinProducts.value.length > 0 ? liveCabinProducts.value : seedCabinProducts,
)
const recommendedRentalItems = computed(() => activeRentalItems.value.filter((item) => item.recommended))
const rentableRequiredEquipmentCount = computed(() =>
  requiredEquipment.filter((item) => item.rentable).length,
)
const reservationTarget = {
  path: '/rezervacie',
}
const mapTarget = {
  path: '/mapa',
}
const equipmentRentalIdByEquipmentId: Partial<Record<string, string>> = {
  disinfection: 'fish-care-kit',
  'fish-cradle': 'fish-cradle-rental',
  'landing-net': 'landing-net-rental',
  pean: 'fish-care-kit',
}

function paymentMethodIcon(kind: string) {
  if (kind === 'cash') return 'i-heroicons-banknotes'
  if (kind === 'bank-transfer') return 'i-heroicons-building-library'
  if (kind === 'card-gateway') return 'i-heroicons-credit-card'

  return 'i-heroicons-receipt-percent'
}

const reservationWithRental = (rentalId: string) => ({
  path: '/rezervacie',
  query: {
    vybava: rentalId,
  },
})

const reservationWithEquipment = (item: RequiredEquipmentItem) => {
  const rentalId = equipmentRentalIdByEquipmentId[item.id]

  return rentalId ? reservationWithRental(rentalId) : undefined
}

const reservationWithExtra = (extra: ReservationExtra) => ({
  path: '/rezervacie',
  query: {
    doplnok: extra.id,
    jazero: extra.lake,
    typ: extra.appliesTo === 'cabin' ? 'chata' : undefined,
  },
})

const reservationWithCabin = (cabin: CabinProduct) => {
  const cabinPeg = pegs.find((peg) => cabin.pegIds.includes(peg.id))

  return {
    path: '/rezervacie',
    query: {
      chata: cabin.id,
      jazero: cabinPeg?.lake,
      typ: 'chata',
    },
  }
}

const quickReservationItems = computed(() => [
  ...recommendedRentalItems.value.map((item) => ({
    badge: 'výbava',
    description: item.description,
    icon: 'i-heroicons-archive-box',
    id: `rental-${item.id}`,
    label: item.label,
    priceLabel: item.priceLabel,
    tone: 'primary' as const,
    to: reservationWithRental(item.id),
  })),
  ...activeReservationExtras.value.map((extra) => ({
    badge: extra.appliesTo === 'cabin' ? 'k chate' : 'doplnok',
    description: extra.description,
    icon: extra.appliesTo === 'cabin' ? 'i-heroicons-home-modern' : 'i-heroicons-plus-circle',
    id: `extra-${extra.id}`,
    label: extra.label,
    priceLabel: extra.priceLabel,
    tone: extra.appliesTo === 'cabin' ? 'warning' as const : 'success' as const,
    to: reservationWithExtra(extra),
  })),
].slice(0, 6))
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Pravidlá"
      title="Pravidlá, cenník a výbava"
      description="Všetko, čo potrebujete vedieť pred príchodom: povolenky, pravidlá, povinná výbava, chaty a doplnkové služby."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="mb-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div class="rounded-card border border-primary-200 bg-primary-50 p-5">
          <div class="flex items-start gap-3">
            <span class="bg-primary-900 text-white flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
              <UIcon name="i-heroicons-clipboard-document-check" class="h-5 w-5" />
            </span>
            <div>
              <h2 class="text-xl font-bold">Pred príchodom k vode</h2>
              <p class="text-foreground-muted mt-1 text-sm">
                Vyberte termín, skontrolujte povinnú výbavu a doplnky pridajte rovno do rezervácie.
              </p>
            </div>
          </div>

          <div class="mt-5 grid gap-3 sm:grid-cols-3">
            <div class="rounded-md bg-white p-3">
              <p class="text-primary-800 text-xs font-semibold">1. Termín</p>
              <p class="mt-1 text-sm font-bold">Miesto alebo chata</p>
            </div>
            <div class="rounded-md bg-white p-3">
              <p class="text-primary-800 text-xs font-semibold">2. Výbava</p>
              <p class="mt-1 text-sm font-bold">Požičateľné položky: {{ rentableRequiredEquipmentCount }}</p>
            </div>
            <div class="rounded-md bg-white p-3">
              <p class="text-primary-800 text-xs font-semibold">3. Potvrdenie</p>
              <p class="mt-1 text-sm font-bold">{{ enabledPaymentMethods.length }} možnosti platby</p>
            </div>
          </div>

          <div class="mt-5 flex flex-wrap gap-3">
            <UButton :to="reservationTarget" icon="i-heroicons-calendar-days" color="warning">
              Začať rezerváciu
            </UButton>
            <UButton :to="mapTarget" icon="i-heroicons-map-pin" variant="soft">
              Pozrieť mapu miest
            </UButton>
          </div>
        </div>

        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-xl font-bold">Rýchlo pridať k rezervácii</h2>
              <p class="text-foreground-muted mt-1 text-sm">
                Výbava a doplnky, ktoré má zmysel riešiť už pri odoslaní žiadosti.
              </p>
            </div>
            <StatusBadge
              icon="i-heroicons-plus-circle"
              :label="`${quickReservationItems.length} položiek`"
              tone="primary"
              size="xs"
            />
          </div>

          <div class="mt-4 grid gap-2 sm:grid-cols-2">
            <NuxtLink
              v-for="item in quickReservationItems"
              :key="item.id"
              :to="item.to"
              class="group rounded-md border border-border bg-muted p-3 transition-colors hover:border-primary-300 hover:bg-primary-50"
            >
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="font-semibold">{{ item.label }}</p>
                  <p class="text-foreground-muted mt-1 line-clamp-2 text-xs">{{ item.description }}</p>
                </div>
                <StatusBadge
                  class="shrink-0"
                  :icon="item.icon"
                  :label="item.badge"
                  :tone="item.tone"
                  size="xs"
                />
              </div>
              <p class="text-primary-800 mt-2 text-xs font-semibold">{{ item.priceLabel }}</p>
              <span class="text-primary-800 mt-3 inline-flex items-center gap-1 text-xs font-bold">
                Pridať k rezervácii
                <UIcon name="i-heroicons-arrow-right" class="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </NuxtLink>
          </div>
          <AppState
            v-if="quickReservationItems.length === 0"
            class="mt-4"
            title="Doplnky nie sú zapnuté"
            description="Rezerváciu môžete odoslať aj bez výbavy alebo doplnkov."
            icon="i-heroicons-archive-box"
          />
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <aside class="space-y-6">
          <div class="border-border bg-primary-900 rounded-card border p-5 text-white">
            <p class="text-sm font-semibold text-accent-300">Správca revíru</p>
            <h2 class="mt-2 text-2xl font-bold">{{ contactInfo.managerName }}</h2>
            <p class="text-sm text-white/75">{{ contactInfo.role }}</p>
            <a
              :href="`tel:${contactInfo.phoneHref}`"
              class="mt-5 flex items-center gap-3 rounded-md bg-white/10 p-4 text-lg font-bold hover:bg-white/15"
            >
              <UIcon name="i-heroicons-phone" class="h-5 w-5" />
              {{ contactInfo.phoneDisplay }}
            </a>
            <div class="mt-4 space-y-2 text-sm text-white/75">
              <p v-for="hour in contactInfo.phoneHours" :key="hour" class="flex items-center gap-2">
                <UIcon name="i-heroicons-clock" class="h-4 w-4" />
                {{ hour }}
              </p>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <h2 class="text-lg font-bold">Povolenky</h2>
            <div class="mt-4 space-y-3">
              <div v-for="permit in permitProducts" :key="permit.id" class="rounded-md bg-muted p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ permit.label }}</p>
                    <p class="text-foreground-muted text-sm">{{ permit.durationHours }} hodín</p>
                  </div>
                  <p class="text-lg font-bold">{{ permit.priceEur }} €</p>
                </div>
                <p v-if="permit.note" class="text-primary-800 mt-2 text-sm">{{ permit.note }}</p>
              </div>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <h2 class="text-lg font-bold">Platba rezervácie</h2>
            <div class="mt-4 space-y-3">
              <div v-for="method in enabledPaymentMethods" :key="method.id" class="rounded-md bg-muted p-4">
                <div class="flex items-start gap-3">
                  <span class="bg-primary-50 text-primary-700 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
                    <UIcon :name="paymentMethodIcon(method.kind)" class="h-5 w-5" />
                  </span>
                  <div class="min-w-0">
                    <p class="font-semibold">{{ method.label }}</p>
                    <p class="text-foreground-muted mt-1 text-sm">{{ method.instructions }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div class="space-y-6">
          <div class="border-border bg-surface rounded-card border p-5">
            <h2 class="text-lg font-bold">Pravidlá revíru</h2>
            <div class="mt-5 grid gap-4">
              <article
                v-for="section in infoSections"
                :key="section.title"
                class="rounded-md border border-border bg-white p-4"
              >
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 class="font-bold">{{ section.title }}</h3>
                </div>
                <ul class="mt-3 space-y-2 text-sm text-foreground-muted">
                  <li v-for="item in section.items" :key="item" class="flex gap-2">
                    <UIcon name="i-heroicons-check-circle" class="text-primary-700 mt-0.5 h-4 w-4 shrink-0" />
                    <span>{{ item }}</span>
                  </li>
                </ul>
              </article>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <h2 class="text-lg font-bold">Povinná výbava</h2>
            <div class="mt-5 grid gap-3 md:grid-cols-2">
              <div
                v-for="item in requiredEquipment"
                :key="item.id"
                class="rounded-md border border-border bg-white p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ item.label }}</p>
                    <p class="text-foreground-muted mt-1 text-sm">{{ item.detail }}</p>
                    <UButton
                      v-if="item.rentable && reservationWithEquipment(item)"
                      :to="reservationWithEquipment(item)"
                      icon="i-heroicons-plus-circle"
                      size="xs"
                      variant="soft"
                      class="mt-3"
                    >
                      Pridať k rezervácii
                    </UButton>
                  </div>
                  <StatusBadge
                    class="shrink-0"
                    :icon="item.rentable ? 'i-heroicons-arrow-path-rounded-square' : 'i-heroicons-shield-check'"
                    :label="item.rentable ? 'požičateľné' : 'vlastné'"
                    size="xs"
                    :tone="item.rentable ? 'primary' : 'warning'"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <h2 class="text-lg font-bold">Chaty pri lovných miestach</h2>
            <div class="mt-5 grid gap-3 md:grid-cols-2">
              <article
                v-for="cabin in displayedCabinProducts"
                :key="cabin.id"
                class="rounded-md border border-border bg-white p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h3 class="font-bold">{{ cabin.label }}</h3>
                    <p class="text-foreground-muted text-sm">
                      {{ cabin.capacity }} osoby · minimum {{ cabin.minimumHours }} h
                    </p>
                  </div>
                  <p class="text-lg font-bold">{{ cabin.pricePer24hEur }} €</p>
                </div>
                <p class="text-primary-800 mt-3 text-sm">{{ cabin.requiresPermitNote }}</p>
                <ul class="mt-3 space-y-1 text-sm text-foreground-muted">
                  <li v-for="equipment in cabin.equipment" :key="equipment">• {{ equipment }}</li>
                </ul>
                <UButton
                  :to="reservationWithCabin(cabin)"
                  icon="i-heroicons-calendar-days"
                  size="sm"
                  variant="soft"
                  class="mt-4"
                >
                  Rezervovať s chatou
                </UButton>
              </article>
            </div>
          </div>

          <div class="grid gap-6 lg:grid-cols-2">
            <div class="border-border bg-surface rounded-card border p-5">
              <h2 class="text-lg font-bold">Požičovňa výbavy</h2>
              <div class="mt-4 space-y-3">
                <div v-for="item in activeRentalItems" :key="item.id" class="rounded-md bg-muted p-4">
                  <div class="flex items-start justify-between gap-3">
                    <p class="font-semibold">{{ item.label }}</p>
                    <StatusBadge
                      icon="i-heroicons-archive-box"
                      :label="`${item.stock} ks`"
                      size="xs"
                      tone="neutral"
                    />
                  </div>
                  <p class="text-foreground-muted mt-1 text-sm">{{ item.description }}</p>
                  <p class="text-primary-800 mt-2 text-xs font-semibold">{{ item.priceLabel }}</p>
                  <UButton
                    :to="reservationWithRental(item.id)"
                    icon="i-heroicons-plus-circle"
                    size="sm"
                    variant="soft"
                    class="mt-3"
                  >
                    Pridať k rezervácii
                  </UButton>
                </div>
              </div>
            </div>

            <div class="border-border bg-surface rounded-card border p-5">
              <h2 class="text-lg font-bold">Doplnky k rezervácii</h2>
              <div class="mt-4 space-y-3">
                <div v-for="extra in activeReservationExtras" :key="extra.id" class="rounded-md bg-muted p-4">
                  <div class="flex items-start justify-between gap-3">
                    <p class="font-semibold">{{ extra.label }}</p>
                    <StatusBadge
                      class="shrink-0"
                      :icon="extra.source === 'web' ? 'i-heroicons-check-badge' : 'i-heroicons-plus-circle'"
                      :label="extra.source === 'web' ? 'služba revíru' : 'doplnok'"
                      size="xs"
                      :tone="extra.source === 'web' ? 'success' : 'warning'"
                    />
                  </div>
                  <p class="text-foreground-muted mt-1 text-sm">{{ extra.description }}</p>
                  <p class="text-primary-800 mt-2 text-xs font-semibold">{{ extra.priceLabel }}</p>
                  <UButton
                    :to="reservationWithExtra(extra)"
                    icon="i-heroicons-plus-circle"
                    size="sm"
                    variant="soft"
                    class="mt-3"
                  >
                    Pridať k rezervácii
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
