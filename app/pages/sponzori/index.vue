<script setup lang="ts">
import type { Sponsor } from '~/data/pond'

useHead({ title: 'Sponzori' })

const {
  activeSponsors,
  refresh: refreshSponsors,
  sponsorStateError,
  sponsorStateStatus,
} = await useSponsorState({ key: 'public-sponsors-page-state' })

const isSponsorsLoading = computed(() => sponsorStateStatus.value === 'pending')
const hasSponsorsError = computed(() => Boolean(sponsorStateError.value))

const tierLabels = {
  main: 'hlavný partner',
  partner: 'partner revíru',
  sector: 'sektorový partner',
  tournament: 'partner súťaže',
} as const
function campaignRange(sponsor: Sponsor) {
  if (sponsor.validFrom && sponsor.validTo) return `${sponsor.validFrom} až ${sponsor.validTo}`
  if (sponsor.validFrom) return `od ${sponsor.validFrom}`
  if (sponsor.validTo) return `do ${sponsor.validTo}`

  return ''
}

function cardLogo(sponsor: Sponsor) {
  return getSponsorLogo(sponsor, sponsor.placementType ?? 'sponsors')
}

async function retrySponsors() {
  await refreshSponsors()
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Sponzori"
      title="Partneri revíru a súťaží"
      description="Partneri, ktorí podporujú starostlivosť o revír, rybárske podujatia a služby pre návštevníkov."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AppState
        v-if="isSponsorsLoading"
        title="Načítavam partnerov"
        description="Kontrolujeme aktuálne zverejnených partnerov revíru a súťaží."
        type="loading"
      />
      <AppState
        v-else-if="hasSponsorsError"
        title="Partnerov sa nepodarilo obnoviť"
        description="Zobrazujeme posledný dostupný stav. Skúste načítanie zopakovať."
        type="error"
      >
        <UButton icon="i-heroicons-arrow-path" variant="soft" @click="retrySponsors">
          Skúsiť znova
        </UButton>
      </AppState>
      <AppState
        v-else-if="activeSponsors.length === 0"
        title="Zatiaľ bez zverejnených partnerov"
        description="Partneri revíru a súťaží sa zobrazia po schválení správcom."
        icon="i-heroicons-building-storefront"
      />
      <div v-else class="grid gap-4 md:grid-cols-3">
        <div
          v-for="sponsor in activeSponsors"
          :key="sponsor.id"
          class="border-border bg-surface rounded-card border p-5"
        >
          <div class="flex items-start gap-4">
            <div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary-900 text-lg font-black text-accent-300">
              <img
                v-if="cardLogo(sponsor).url"
                :src="cardLogo(sponsor).url"
                :alt="cardLogo(sponsor).alt"
                class="h-full w-full bg-white object-contain p-2"
              >
              <span v-else>{{ cardLogo(sponsor).text }}</span>
            </div>
            <div class="min-w-0">
              <p class="text-primary-700 text-sm font-semibold">{{ tierLabels[sponsor.tier] }}</p>
              <h2 class="mt-1 text-xl font-bold">{{ sponsor.name }}</h2>
            </div>
          </div>
          <p class="text-foreground-muted mt-4 text-sm">{{ sponsor.description }}</p>
          <div class="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <span v-if="campaignRange(sponsor)" class="rounded-md bg-muted px-2 py-1 text-foreground-muted">
              {{ campaignRange(sponsor) }}
            </span>
          </div>
          <UButton
            v-if="sponsor.website"
            :to="sponsor.website"
            target="_blank"
            rel="noreferrer"
            icon="i-heroicons-arrow-top-right-on-square"
            variant="soft"
            class="mt-5"
          >
            Web partnera
          </UButton>
        </div>
      </div>
    </section>
  </div>
</template>
