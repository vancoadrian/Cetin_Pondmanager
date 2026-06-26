<script setup lang="ts">
useHead({ title: 'Revíry' })

const { lakes, pegs } = usePondData()
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Revíry"
      title="Dve vody pri sebe, jeden systém správy"
      description="Vyberte si jazero podľa charakteru vody, lovných miest, vybavenia a pravidiel."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="grid gap-6 lg:grid-cols-2">
        <NuxtLink
          v-for="lake in lakes"
          :key="lake.slug"
          :to="`/reviry/${lake.slug}`"
          data-testid="lake-detail-link"
          class="group block rounded-card outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-primary-500 focus-visible:ring-offset-3"
          :aria-label="`Otvoriť detail revíru ${lake.name}`"
        >
          <article class="h-full overflow-hidden rounded-card border border-border bg-surface transition-shadow group-hover:shadow-lg">
            <div class="relative min-h-72 overflow-hidden bg-primary-950 p-5 text-white">
              <img
                :src="lake.image"
                :alt="lake.name"
                class="absolute inset-0 h-full w-full object-cover opacity-75 transition-transform duration-500 group-hover:scale-[1.03]"
                loading="lazy"
              >
              <div class="absolute inset-0 bg-linear-to-t from-primary-950 via-primary-950/45 to-transparent" />
              <div class="relative flex min-h-60 flex-col justify-end">
                <p class="text-accent-200 text-sm font-semibold tracking-wide uppercase">
                  {{ lake.areaHa }} ha · {{ lake.mode }}
                </p>
                <h2 class="mt-2 text-2xl font-bold">{{ lake.name }}</h2>
                <p class="mt-3 text-sm text-white/80">{{ lake.summary }}</p>
                <span class="mt-5 inline-flex items-center gap-2 font-bold text-accent-200">
                  Detail revíru
                  <UIcon
                    name="i-heroicons-arrow-right"
                    class="h-5 w-5 transition-transform group-hover:translate-x-1"
                  />
                </span>
              </div>
            </div>

            <div class="grid gap-0 md:grid-cols-2">
              <div class="border-border border-b p-5 md:border-r md:border-b-0">
                <h3 class="font-semibold">Charakter vody</h3>
                <ul class="mt-3 space-y-2 text-sm">
                  <li v-for="highlight in lake.highlights" :key="highlight" class="flex gap-2">
                    <UIcon name="i-heroicons-check-circle" class="text-success-500 mt-0.5 h-5 w-5 shrink-0" />
                    <span>{{ highlight }}</span>
                  </li>
                </ul>
              </div>

              <div class="p-5">
                <h3 class="font-semibold">Ryby a výbava</h3>
                <div class="mt-3 flex flex-wrap gap-2">
                  <span
                    v-for="fish in lake.fishStock"
                    :key="fish"
                    class="bg-water-100 text-water-900 rounded-full px-2 py-1 text-xs font-semibold"
                  >
                    {{ fish }}
                  </span>
                </div>
                <p class="text-foreground-muted mt-4 text-sm">
                  {{ pegs.filter((peg) => peg.lake === lake.slug).length }} evidovaných lovných miest.
                </p>
              </div>
            </div>

            <div class="border-border bg-muted/50 border-t p-5">
              <h3 class="font-semibold">Prevádzkové pravidlá</h3>
              <ul class="mt-3 grid gap-2 text-sm md:grid-cols-3">
                <li v-for="rule in lake.rules" :key="rule" class="rounded-md bg-white p-3">
                  {{ rule }}
                </li>
              </ul>
            </div>

            <div class="border-border grid grid-cols-4 gap-2 border-t p-3">
              <img
                v-for="image in lake.galleryImages"
                :key="image"
                :src="image"
                :alt="`${lake.name} fotka`"
                class="h-20 w-full rounded-md object-cover"
                loading="lazy"
              >
            </div>
          </article>
        </NuxtLink>
      </div>

    </section>
  </div>
</template>
