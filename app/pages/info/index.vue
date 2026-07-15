<script setup lang="ts">
import type { CabinProduct, RequiredEquipmentItem, ReservationExtra } from '~/data/pond'

usePublicSeo({
  title: 'Pravidlá a výbava',
  description: 'Pravidlá rybolovu, cenník, povinná výbava, chaty, požičovňa a služby pre revíry Veľký Cetín a Štrkovisko Kocka.',
})

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
const rentableRequiredEquipmentCount = computed(() =>
  requiredEquipment.filter((item) => item.rentable).length,
)
const activeCatalogView = ref<'rentals' | 'extras'>('rentals')
const expandedRuleSections = ref<number[]>([0])
const allRuleSectionsExpanded = computed(
  () => expandedRuleSections.value.length === infoSections.length,
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
const sectionNavigation = [
  { id: 'pravidla', icon: 'i-heroicons-clipboard-document-check', label: 'Pravidlá' },
  { id: 'cennik', icon: 'i-heroicons-banknotes', label: 'Cenník' },
  { id: 'vybava', icon: 'i-heroicons-shield-check', label: 'Výbava' },
  { id: 'chaty', icon: 'i-heroicons-home-modern', label: 'Chaty' },
  { id: 'sluzby', icon: 'i-heroicons-archive-box', label: 'Služby' },
  { id: 'kontakt', icon: 'i-heroicons-phone', label: 'Kontakt' },
]

function paymentMethodIcon(kind: string) {
  if (kind === 'cash') return 'i-heroicons-banknotes'
  if (kind === 'bank-transfer') return 'i-heroicons-building-library'
  if (kind === 'card-gateway') return 'i-heroicons-credit-card'

  return 'i-heroicons-receipt-percent'
}

function ruleCountLabel(count: number) {
  if (count === 1) return '1 pravidlo'
  if (count >= 2 && count <= 4) return `${count} pravidlá`

  return `${count} pravidiel`
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

function toggleRuleSection(index: number) {
  expandedRuleSections.value = expandedRuleSections.value.includes(index)
    ? expandedRuleSections.value.filter((item) => item !== index)
    : [...expandedRuleSections.value, index]
}

function toggleAllRuleSections() {
  expandedRuleSections.value = allRuleSectionsExpanded.value
    ? []
    : infoSections.map((_, index) => index)
}

async function selectCatalogView(view: 'rentals' | 'extras', focusTab = false) {
  activeCatalogView.value = view

  if (!focusTab) return

  await nextTick()
  document.getElementById(`catalog-tab-${view}`)?.focus()
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Pravidlá"
      title="Pravidlá, cenník a výbava"
      description="Povolenky, podmienky rybolovu, povinná výbava, chaty a služby pre obe jazerá na jednom mieste."
    />

    <section class="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div class="rounded-card border border-primary-200 bg-primary-50 p-4 sm:p-5">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex min-w-0 items-start gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-900 text-white">
              <UIcon name="i-heroicons-clipboard-document-check" class="h-5 w-5" />
            </span>
            <div class="min-w-0">
              <h2 class="text-lg font-bold sm:text-xl">Pred príchodom k vode</h2>
              <p class="mt-1 max-w-2xl text-sm text-foreground-muted">
                Vyberte si voľné miesto, skontrolujte povinnú výbavu a odošlite žiadosť. Rezervácia platí až po potvrdení správcom.
              </p>
              <p class="mt-3 text-xs font-semibold text-primary-900">
                {{ permitProducts.length }} dĺžky povoleniek · {{ rentableRequiredEquipmentCount }} povinné položky sa dajú požičať · {{ enabledPaymentMethods.length }} možnosti platby
              </p>
            </div>
          </div>

          <div class="flex shrink-0 flex-wrap gap-2">
            <UButton :to="reservationTarget" icon="i-heroicons-calendar-days" color="warning">
              Začať rezerváciu
            </UButton>
            <UButton :to="mapTarget" icon="i-heroicons-map" variant="soft">
              Mapa miest
            </UButton>
          </div>
        </div>
      </div>

      <nav
        aria-label="Obsah stránky"
        class="-mx-4 mt-6 border-y border-border bg-surface sm:mx-0 sm:rounded-card sm:border"
      >
        <div class="flex overflow-x-auto px-2 sm:grid sm:grid-cols-6 sm:px-0">
          <a
            v-for="item in sectionNavigation"
            :key="item.id"
            :href="`#${item.id}`"
            class="flex min-h-12 min-w-24 shrink-0 items-center justify-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm font-semibold text-foreground-muted transition-colors hover:border-primary-600 hover:text-primary-900 focus-visible:border-primary-600 focus-visible:text-primary-900"
          >
            <UIcon :name="item.icon" class="h-4 w-4 shrink-0" />
            {{ item.label }}
          </a>
        </div>
      </nav>

      <div class="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <section id="pravidla" class="min-w-0 scroll-mt-24">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p class="text-xs font-bold text-primary-800">PODMIENKY PRI VODE</p>
              <h2 class="mt-1 text-2xl font-bold">Pravidlá revíru</h2>
              <p class="mt-1 text-sm text-foreground-muted">Vyberte oblasť, ktorú si potrebujete overiť.</p>
            </div>
            <UButton
              :icon="allRuleSectionsExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
              size="sm"
              variant="ghost"
              @click="toggleAllRuleSections"
            >
              {{ allRuleSectionsExpanded ? 'Zbaliť všetko' : 'Rozbaliť všetko' }}
            </UButton>
          </div>

          <div class="mt-5 space-y-3">
            <article
              v-for="(section, index) in infoSections"
              :key="section.title"
              class="overflow-hidden rounded-card border border-border bg-surface"
            >
              <button
                type="button"
                class="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted"
                :aria-expanded="expandedRuleSections.includes(index)"
                :aria-controls="`rule-section-${index}`"
                @click="toggleRuleSection(index)"
              >
                <span class="min-w-0">
                  <span class="block font-bold">{{ section.title }}</span>
                  <span class="mt-0.5 block text-xs text-foreground-muted">{{ ruleCountLabel(section.items.length) }}</span>
                </span>
                <UIcon
                  name="i-heroicons-chevron-down"
                  class="h-5 w-5 shrink-0 text-primary-800 transition-transform"
                  :class="expandedRuleSections.includes(index) ? 'rotate-180' : ''"
                />
              </button>
              <div
                v-show="expandedRuleSections.includes(index)"
                :id="`rule-section-${index}`"
                class="border-t border-border px-4 py-4"
              >
                <ul class="space-y-3 text-sm text-foreground-muted">
                  <li v-for="item in section.items" :key="item" class="flex gap-2.5">
                    <UIcon name="i-heroicons-check-circle" class="mt-0.5 h-4 w-4 shrink-0 text-primary-700" />
                    <span>{{ item }}</span>
                  </li>
                </ul>
              </div>
            </article>
          </div>
        </section>

        <section id="cennik" class="min-w-0 scroll-mt-24">
          <p class="text-xs font-bold text-primary-800">CENNÍK A ÚHRADA</p>
          <h2 class="mt-1 text-2xl font-bold">Povolenky</h2>
          <p class="mt-1 text-sm text-foreground-muted">Základná cena za rybolov podľa dĺžky pobytu.</p>

          <div class="mt-5 divide-y divide-border rounded-card border border-border bg-surface">
            <div v-for="permit in permitProducts" :key="permit.id" class="p-4">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="font-semibold">{{ permit.label }}</p>
                  <p class="mt-0.5 text-sm text-foreground-muted">{{ permit.durationHours }} hodín</p>
                </div>
                <p class="shrink-0 text-xl font-bold">{{ permit.priceEur }} €</p>
              </div>
              <p v-if="permit.note" class="mt-2 text-sm text-primary-800">{{ permit.note }}</p>
            </div>
          </div>

          <h3 class="mt-8 text-lg font-bold">Platba rezervácie</h3>
          <div class="mt-3 space-y-3">
            <div v-for="method in enabledPaymentMethods" :key="method.id" class="flex items-start gap-3 rounded-card bg-muted p-4">
              <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-primary-700">
                <UIcon :name="paymentMethodIcon(method.kind)" class="h-5 w-5" />
              </span>
              <div class="min-w-0">
                <p class="font-semibold">{{ method.label }}</p>
                <p class="mt-1 text-sm text-foreground-muted">{{ method.instructions }}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section id="vybava" class="scroll-mt-24 border-t border-border pt-10 mt-12">
        <div class="max-w-3xl">
          <p class="text-xs font-bold text-primary-800">PRED ZAČATÍM LOVU</p>
          <h2 class="mt-1 text-2xl font-bold">Povinná výbava</h2>
          <p class="mt-1 text-sm text-foreground-muted">
            Výbavu majte pripravenú pri lovnom mieste. Označené položky si môžete vyžiadať spolu s rezerváciou.
          </p>
        </div>

        <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <article
            v-for="item in requiredEquipment"
            :key="item.id"
            class="flex min-w-0 flex-col rounded-card border border-border bg-surface p-4"
          >
            <div class="flex items-start gap-3">
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                :class="item.rentable ? 'bg-primary-50 text-primary-800' : 'bg-warning-500/10 text-warning-900'"
              >
                <UIcon :name="item.rentable ? 'i-heroicons-arrow-path-rounded-square' : 'i-heroicons-ticket'" class="h-5 w-5" />
              </span>
              <div class="min-w-0">
                <h3 class="font-bold">{{ item.label }}</h3>
                <p class="mt-1 text-sm text-foreground-muted">{{ item.detail }}</p>
              </div>
            </div>
            <div class="mt-auto pt-4">
              <UButton
                v-if="item.rentable && reservationWithEquipment(item)"
                :to="reservationWithEquipment(item)"
                icon="i-heroicons-plus-circle"
                size="sm"
                variant="soft"
              >
                Požičať k rezervácii
              </UButton>
              <p v-else class="flex items-center gap-1.5 text-xs font-semibold text-warning-900">
                <UIcon name="i-heroicons-information-circle" class="h-4 w-4" />
                Prineste si vlastné
              </p>
            </div>
          </article>
        </div>
      </section>

      <section id="chaty" class="scroll-mt-24 border-t border-border pt-10 mt-12">
        <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div class="max-w-3xl">
            <p class="text-xs font-bold text-primary-800">POBYT PRI VODE</p>
            <h2 class="mt-1 text-2xl font-bold">Chaty pri lovných miestach</h2>
            <p class="mt-1 text-sm text-foreground-muted">Chata sa rezervuje spolu s priradeným lovným miestom.</p>
          </div>
          <UButton :to="mapTarget" icon="i-heroicons-map" size="sm" variant="ghost">
            Zobraziť na mape
          </UButton>
        </div>

        <div class="mt-5 grid gap-4 lg:grid-cols-2">
          <article
            v-for="cabin in displayedCabinProducts"
            :key="cabin.id"
            class="rounded-card border border-border bg-surface p-5"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <h3 class="text-lg font-bold">{{ cabin.label }}</h3>
                <p class="mt-1 text-sm text-foreground-muted">{{ cabin.capacity }} osoby · minimum {{ cabin.minimumHours }} h</p>
              </div>
              <div class="shrink-0 text-right">
                <p class="text-xl font-bold">{{ cabin.pricePer24hEur }} €</p>
                <p class="text-xs text-foreground-muted">za 24 h</p>
              </div>
            </div>
            <p class="mt-4 text-sm text-primary-800">{{ cabin.requiresPermitNote }}</p>
            <p class="mt-3 text-sm text-foreground-muted">{{ cabin.equipment.join(' · ') }}</p>
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
      </section>

      <section id="sluzby" class="scroll-mt-24 border-t border-border pt-10 mt-12">
        <p class="text-xs font-bold text-primary-800">VOLITEĽNÉ SLUŽBY</p>
        <h2 class="mt-1 text-2xl font-bold">Výbava a doplnky</h2>
        <p class="mt-1 max-w-3xl text-sm text-foreground-muted">
          Položku pridajte do žiadosti. Dostupnosť a konečnú cenu potvrdí správca spolu s rezerváciou.
        </p>

        <div
          role="tablist"
          aria-label="Katalóg služieb"
          class="mt-5 grid max-w-xl grid-cols-2 rounded-card border border-border bg-muted p-1"
        >
          <button
            id="catalog-tab-rentals"
            type="button"
            role="tab"
            :aria-selected="activeCatalogView === 'rentals'"
            aria-controls="catalog-panel-rentals"
            :tabindex="activeCatalogView === 'rentals' ? 0 : -1"
            class="flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors"
            :class="activeCatalogView === 'rentals' ? 'bg-white text-primary-900 shadow-sm' : 'text-foreground-muted hover:text-foreground'"
            @click="selectCatalogView('rentals')"
            @keydown.left.prevent="selectCatalogView('extras', true)"
            @keydown.right.prevent="selectCatalogView('extras', true)"
            @keydown.end.prevent="selectCatalogView('extras', true)"
          >
            <UIcon name="i-heroicons-archive-box" class="h-4 w-4" />
            Požičovňa ({{ activeRentalItems.length }})
          </button>
          <button
            id="catalog-tab-extras"
            type="button"
            role="tab"
            :aria-selected="activeCatalogView === 'extras'"
            aria-controls="catalog-panel-extras"
            :tabindex="activeCatalogView === 'extras' ? 0 : -1"
            class="flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors"
            :class="activeCatalogView === 'extras' ? 'bg-white text-primary-900 shadow-sm' : 'text-foreground-muted hover:text-foreground'"
            @click="selectCatalogView('extras')"
            @keydown.left.prevent="selectCatalogView('rentals', true)"
            @keydown.right.prevent="selectCatalogView('rentals', true)"
            @keydown.home.prevent="selectCatalogView('rentals', true)"
          >
            <UIcon name="i-heroicons-plus-circle" class="h-4 w-4" />
            Doplnky ({{ activeReservationExtras.length }})
          </button>
        </div>

        <div
          v-show="activeCatalogView === 'rentals'"
          id="catalog-panel-rentals"
          role="tabpanel"
          aria-labelledby="catalog-tab-rentals"
          class="mt-4 grid gap-3 lg:grid-cols-2"
        >
          <article
            v-for="item in activeRentalItems"
            :key="item.id"
            class="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 class="font-bold">{{ item.label }}</h3>
                <span class="flex items-center gap-1 text-xs font-semibold text-foreground-muted">
                  <UIcon name="i-heroicons-cube" class="h-3.5 w-3.5" />
                  {{ item.stock }} ks
                </span>
              </div>
              <p class="mt-1 text-sm text-foreground-muted">{{ item.description }}</p>
              <p class="mt-2 text-xs font-semibold text-primary-800">{{ item.priceLabel }}</p>
            </div>
            <UButton
              :to="reservationWithRental(item.id)"
              icon="i-heroicons-plus-circle"
              size="sm"
              variant="soft"
              class="shrink-0 self-start sm:self-center"
            >
              Pridať
            </UButton>
          </article>
        </div>

        <div
          v-show="activeCatalogView === 'extras'"
          id="catalog-panel-extras"
          role="tabpanel"
          aria-labelledby="catalog-tab-extras"
          class="mt-4 grid gap-3 lg:grid-cols-2"
        >
          <article
            v-for="extra in activeReservationExtras"
            :key="extra.id"
            class="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 class="font-bold">{{ extra.label }}</h3>
                <span class="text-xs font-semibold text-foreground-muted">
                  {{ extra.appliesTo === 'cabin' ? 'K chate' : 'K rezervácii' }}
                </span>
              </div>
              <p class="mt-1 text-sm text-foreground-muted">{{ extra.description }}</p>
              <p class="mt-2 text-xs font-semibold text-primary-800">{{ extra.priceLabel }}</p>
            </div>
            <UButton
              :to="reservationWithExtra(extra)"
              icon="i-heroicons-plus-circle"
              size="sm"
              variant="soft"
              class="shrink-0 self-start sm:self-center"
            >
              Pridať
            </UButton>
          </article>
        </div>
      </section>

      <section id="kontakt" class="scroll-mt-24 mt-12 rounded-card bg-primary-900 p-5 text-white sm:p-6">
        <div class="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="text-sm font-semibold text-accent-300">Správca revíru</p>
            <h2 class="mt-1 text-2xl font-bold">{{ contactInfo.managerName }}</h2>
            <p class="mt-1 text-sm text-white/75">{{ contactInfo.role }}</p>
            <div class="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/75">
              <p v-for="hour in contactInfo.phoneHours" :key="hour" class="flex items-center gap-2">
                <UIcon name="i-heroicons-clock" class="h-4 w-4" />
                {{ hour }}
              </p>
            </div>
          </div>
          <a
            :href="`tel:${contactInfo.phoneHref}`"
            class="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-white px-5 py-3 text-base font-bold text-primary-900 transition-colors hover:bg-primary-50"
          >
            <UIcon name="i-heroicons-phone" class="h-5 w-5" />
            {{ contactInfo.phoneDisplay }}
          </a>
        </div>
      </section>
    </section>
  </div>
</template>
