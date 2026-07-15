<script setup lang="ts">
import { getOptimizedImageSrcset } from '~/utils/responsiveImage'

usePublicSeo({
  title: 'Revíry',
  description: 'Prehľad jazier Veľký Cetín a Štrkovisko Kocka vrátane lovných miest, chát, vybavenia, pravidiel a možností rezervácie.',
})

const { lakes, pegs } = usePondData()
const lakeCards = computed(() =>
  lakes.map((lake) => {
    const lakePegs = pegs.filter((peg) => peg.lake === lake.slug)

    return {
      cabinCount: lakePegs.filter((peg) => peg.type === 'cabin').length,
      detailTarget: `/reviry/${lake.slug}`,
      lake,
      mapTarget: {
        path: '/mapa',
        query: { jazero: lake.slug },
      },
      pegCount: lakePegs.length,
      reservationTarget: {
        path: '/rezervacie',
        query: { jazero: lake.slug },
      },
    }
  }),
)
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
        <article
          v-for="(card, cardIndex) in lakeCards"
          :key="card.lake.slug"
          class="group relative overflow-hidden rounded-card border border-border bg-surface transition-transform hover:-translate-y-0.5 hover:shadow-lg"
        >
          <NuxtLink
            :to="card.detailTarget"
            data-testid="lake-detail-link"
            class="absolute inset-0 z-10 rounded-card outline-none focus-visible:ring-3 focus-visible:ring-primary-500 focus-visible:ring-offset-3"
            :aria-label="`Otvoriť detail revíru ${card.lake.name}`"
          />
          <div class="relative min-h-72 overflow-hidden bg-primary-950 p-5 text-white">
            <picture>
              <source
                type="image/avif"
                :srcset="getOptimizedImageSrcset(card.lake.image, [320, 500])"
                sizes="(min-width: 1024px) 50vw, 100vw"
              >
              <source
                type="image/webp"
                :srcset="getOptimizedImageSrcset(card.lake.image, [320, 500], 'webp')"
                sizes="(min-width: 1024px) 50vw, 100vw"
              >
              <img
                :src="card.lake.image"
                :alt="card.lake.name"
                width="500"
                height="400"
                :loading="cardIndex === 0 ? 'eager' : 'lazy'"
                :fetchpriority="cardIndex === 0 ? 'high' : 'auto'"
                class="absolute inset-0 h-full w-full object-cover opacity-75 transition-transform duration-500 group-hover:scale-[1.03]"
              >
            </picture>
            <div class="absolute inset-0 bg-linear-to-t from-primary-950 via-primary-950/45 to-transparent" />
            <div class="relative flex min-h-60 flex-col justify-end">
              <p class="text-accent-200 text-sm font-semibold uppercase">
                {{ card.lake.areaHa }} ha · {{ card.lake.mode }}
              </p>
              <h2 class="mt-2 text-2xl font-bold">{{ card.lake.name }}</h2>
              <p class="mt-3 text-sm text-white/80">{{ card.lake.summary }}</p>
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
                <li v-for="highlight in card.lake.highlights" :key="highlight" class="flex gap-2">
                  <UIcon name="i-heroicons-check-circle" class="text-success-500 mt-0.5 h-5 w-5 shrink-0" />
                  <span>{{ highlight }}</span>
                </li>
              </ul>
            </div>

            <div class="p-5">
              <h3 class="font-semibold">Ryby a výbava</h3>
              <div class="mt-3 flex flex-wrap gap-2">
                <StatusBadge
                  v-for="fish in card.lake.fishStock"
                  :key="fish"
                  :label="fish"
                  tone="neutral"
                  size="xs"
                />
              </div>
              <div class="mt-4 flex flex-wrap gap-2">
                <StatusBadge
                  icon="i-heroicons-map-pin"
                  :label="`${card.pegCount} lovných miest`"
                  tone="primary"
                  size="xs"
                />
                <StatusBadge
                  icon="i-heroicons-home-modern"
                  :label="`${card.cabinCount} s chatou`"
                  tone="warning"
                  size="xs"
                />
              </div>
            </div>
          </div>

          <div class="border-border bg-muted/50 border-t p-5">
            <h3 class="font-semibold">Prevádzkové pravidlá</h3>
            <ul class="mt-3 grid gap-2 text-sm md:grid-cols-3">
              <li v-for="rule in card.lake.rules" :key="rule" class="rounded-md bg-white p-3">
                {{ rule }}
              </li>
            </ul>
          </div>

          <div class="border-border relative z-20 flex flex-col gap-3 border-t p-5 sm:flex-row">
            <UButton :to="card.detailTarget" icon="i-heroicons-information-circle" variant="soft">
              Detail
            </UButton>
            <UButton :to="card.mapTarget" icon="i-heroicons-map-pin" variant="soft">
              Mapa
            </UButton>
            <UButton :to="card.reservationTarget" icon="i-heroicons-calendar-days">
              Rezervovať
            </UButton>
          </div>

          <div class="border-border grid grid-cols-4 gap-2 border-t p-3">
            <picture
              v-for="(image, imageIndex) in card.lake.galleryImages"
              :key="image"
              class="block min-w-0"
            >
              <source
                type="image/avif"
                :srcset="getOptimizedImageSrcset(image, [320, 640, 1080])"
                sizes="(min-width: 1024px) 12vw, 25vw"
              >
              <source
                type="image/webp"
                :srcset="getOptimizedImageSrcset(image, [320, 640, 1080], 'webp')"
                sizes="(min-width: 1024px) 12vw, 25vw"
              >
              <img
                :src="image"
                :alt="`${card.lake.name} – pohľad ${imageIndex + 1}`"
                width="1080"
                height="247"
                class="h-20 w-full rounded-md object-cover"
                loading="lazy"
                decoding="async"
              >
            </picture>
          </div>
        </article>
      </div>

    </section>
  </div>
</template>
