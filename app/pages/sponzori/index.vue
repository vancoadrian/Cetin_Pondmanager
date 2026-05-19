<script setup lang="ts">
useHead({ title: 'Sponzori' })

const { sponsors } = usePondData()

const tierLabels = {
  main: 'hlavný partner',
  partner: 'partner revíru',
  sector: 'sektorový partner',
  tournament: 'partner súťaže',
} as const

const activeSponsors = computed(() => sponsors.filter((sponsor) => sponsor.active))
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
          <p class="mt-4 text-sm font-semibold">{{ sponsor.placement }}</p>
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
