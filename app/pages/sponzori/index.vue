<script setup lang="ts">
import type { Sponsor } from '~/data/pond'

useHead({ title: 'Sponzori' })

const { activeSponsors } = await useSponsorState({ key: 'public-sponsors-page-state' })

const tierLabels = {
  main: 'hlavný partner',
  partner: 'partner revíru',
  sector: 'sektorový partner',
  tournament: 'partner súťaže',
} as const
const placementTypeLabels = {
  footer: 'footer',
  homepage: 'homepage',
  scoreboard: 'výsledkovka',
  sector: 'sektor',
  sponsors: 'stránka sponzorov',
  tournament: 'súťaž',
} as const

function campaignRange(sponsor: Sponsor) {
  if (sponsor.validFrom && sponsor.validTo) return `${sponsor.validFrom} až ${sponsor.validTo}`
  if (sponsor.validFrom) return `od ${sponsor.validFrom}`
  if (sponsor.validTo) return `do ${sponsor.validTo}`

  return ''
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Sponzori"
      title="Partneri revíru a súťaží"
      description="Verejný priestor pre partnerov revíru, partnerov konkrétnej súťaže aj budúce sektorové sponzoringy."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="grid gap-4 md:grid-cols-3">
        <div
          v-for="sponsor in activeSponsors"
          :key="sponsor.id"
          class="border-border bg-surface rounded-card border p-5"
        >
          <div class="flex items-start gap-4">
            <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-primary-900 text-lg font-black text-accent-300">
              {{ sponsor.logoText }}
            </div>
            <div class="min-w-0">
              <p class="text-primary-700 text-sm font-semibold">{{ tierLabels[sponsor.tier] }}</p>
              <h2 class="mt-1 text-xl font-bold">{{ sponsor.name }}</h2>
            </div>
          </div>
          <p class="text-foreground-muted mt-4 text-sm">{{ sponsor.description }}</p>
          <div class="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <span class="rounded-md bg-primary-50 px-2 py-1 text-primary-800">
              {{ sponsor.placementType ? placementTypeLabels[sponsor.placementType] : placementTypeLabels.sponsors }}
            </span>
            <span v-if="campaignRange(sponsor)" class="rounded-md bg-muted px-2 py-1 text-foreground-muted">
              {{ campaignRange(sponsor) }}
            </span>
          </div>
          <p class="mt-3 text-sm font-semibold">{{ sponsor.placement }}</p>
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
