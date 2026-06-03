<script setup lang="ts">
useHead({ title: 'Pravidlá a výbava' })

const {
  cabinProducts: seedCabinProducts,
  contactInfo,
  infoSections,
  permitProducts,
  requiredEquipment,
} = usePondData()

const { liveCabinProducts } = await useCabinCatalogState({ key: 'info-cabin-catalog-state' })
const { livePaymentMethods: sortedPaymentMethods } = await usePaymentMethodState({ key: 'info-payment-method-state' })
const {
  activeRentalItems,
  activeReservationExtras,
} = await useRentalCatalogState({ key: 'info-rental-catalog-state' })

const displayedCabinProducts = computed(() =>
  liveCabinProducts.value.length > 0 ? liveCabinProducts.value : seedCabinProducts,
)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Informácie"
      title="Pravidlá, cenník a výbava"
      description="Jedno miesto pre overené prevádzkové údaje z webu, povinnú výbavu a návrh služieb, ktoré si rybár môže pridať k rezervácii."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
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
              <div v-for="method in sortedPaymentMethods" :key="method.id" class="rounded-md bg-muted p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ method.label }}</p>
                    <p class="text-foreground-muted mt-1 text-sm">{{ method.instructions }}</p>
                  </div>
                  <span
                    class="rounded-md px-2 py-1 text-xs font-bold"
                    :class="method.enabled ? 'bg-success-500/10 text-success-700' : 'bg-warning-100 text-warning-800'"
                  >
                    {{ method.enabled ? 'zapnuté' : 'neskôr' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div class="space-y-6">
          <div class="border-border bg-surface rounded-card border p-5">
            <h2 class="text-lg font-bold">Prevádzkové pravidlá z webu</h2>
            <div class="mt-5 grid gap-4">
              <article
                v-for="section in infoSections"
                :key="section.title"
                class="rounded-md border border-border bg-white p-4"
              >
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 class="font-bold">{{ section.title }}</h3>
                  <a
                    v-if="section.sourceUrl"
                    :href="section.sourceUrl"
                    target="_blank"
                    rel="noreferrer"
                    class="text-primary-700 text-sm font-semibold hover:text-primary-900"
                  >
                    Zdroj
                  </a>
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
                  </div>
                  <span
                    class="rounded-full px-2.5 py-1 text-xs font-semibold"
                    :class="
                      item.rentable
                        ? 'bg-primary-50 text-primary-800'
                        : 'bg-warning-100 text-warning-800'
                    "
                  >
                    {{ item.rentable ? 'požičateľné' : 'vlastné' }}
                  </span>
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
              </article>
            </div>
          </div>

          <div class="grid gap-6 lg:grid-cols-2">
            <div class="border-border bg-surface rounded-card border p-5">
              <h2 class="text-lg font-bold">Návrh požičovne</h2>
              <div class="mt-4 space-y-3">
                <div v-for="item in activeRentalItems" :key="item.id" class="rounded-md bg-muted p-4">
                  <div class="flex items-start justify-between gap-3">
                    <p class="font-semibold">{{ item.label }}</p>
                    <span class="text-foreground-muted text-xs">{{ item.stock }} ks</span>
                  </div>
                  <p class="text-foreground-muted mt-1 text-sm">{{ item.description }}</p>
                  <p class="text-primary-800 mt-2 text-xs font-semibold">{{ item.priceLabel }}</p>
                </div>
              </div>
            </div>

            <div class="border-border bg-surface rounded-card border p-5">
              <h2 class="text-lg font-bold">Doplnky k rezervácii</h2>
              <div class="mt-4 space-y-3">
                <div v-for="extra in activeReservationExtras" :key="extra.id" class="rounded-md bg-muted p-4">
                  <div class="flex items-start justify-between gap-3">
                    <p class="font-semibold">{{ extra.label }}</p>
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-semibold"
                      :class="
                        extra.source === 'web'
                          ? 'bg-success-500/10 text-success-700'
                          : 'bg-warning-100 text-warning-800'
                      "
                    >
                      {{ extra.source === 'web' ? 'z webu' : 'návrh' }}
                    </span>
                  </div>
                  <p class="text-foreground-muted mt-1 text-sm">{{ extra.description }}</p>
                  <p class="text-primary-800 mt-2 text-xs font-semibold">{{ extra.priceLabel }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
