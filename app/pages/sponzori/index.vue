<script setup lang="ts">
import type { Sponsor } from '~/data/pond'
import type { StatusBadgeTone } from '~/utils/ui'

useHead({ title: 'Sponzori' })

type SponsorTier = Sponsor['tier']

interface SponsorTierMeta {
  description: string
  icon: string
  label: string
  title: string
  tone: StatusBadgeTone
}

interface SponsorGroup {
  description: string
  icon: string
  id: SponsorTier
  sponsors: Sponsor[]
  title: string
  tone: StatusBadgeTone
}

const {
  activeSponsors,
  refresh: refreshSponsors,
  sponsorStateError,
  sponsorStateStatus,
} = await useSponsorState({ key: 'public-sponsors-page-state' })

const isSponsorsLoading = computed(() => sponsorStateStatus.value === 'pending')
const hasSponsorsError = computed(() => Boolean(sponsorStateError.value))

const tierMeta = {
  main: {
    description: 'Najviditeľnejšie partnerstvo naprieč revírom, súťažami a hlavnými výstupmi.',
    icon: 'i-heroicons-star',
    label: 'hlavný partner',
    title: 'Hlavní partneri',
    tone: 'accent',
  },
  partner: {
    description: 'Partneri, ktorí podporujú bežnú prevádzku, služby pri vode a komunitné aktivity.',
    icon: 'i-heroicons-building-storefront',
    label: 'partner revíru',
    title: 'Partneri revíru',
    tone: 'primary',
  },
  sector: {
    description: 'Partneri naviazaní na konkrétne sektory, lovné miesta alebo mapové označenia.',
    icon: 'i-heroicons-map-pin',
    label: 'sektorový partner',
    title: 'Sektoroví partneri',
    tone: 'success',
  },
  tournament: {
    description: 'Partneri pretekov, cien, výsledkových tabúľ a súťažného servisu.',
    icon: 'i-heroicons-trophy',
    label: 'partner súťaže',
    title: 'Partneri súťaží',
    tone: 'warning',
  },
} satisfies Record<SponsorTier, SponsorTierMeta>

const sponsorTierOrder: SponsorTier[] = ['main', 'tournament', 'sector', 'partner']
const dateFormatter = new Intl.DateTimeFormat('sk-SK', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const sponsorsByTier = computed<Record<SponsorTier, Sponsor[]>>(() => {
  const groups: Record<SponsorTier, Sponsor[]> = {
    main: [],
    partner: [],
    sector: [],
    tournament: [],
  }

  for (const sponsor of activeSponsors.value) {
    groups[sponsor.tier].push(sponsor)
  }

  return groups
})

const sponsorGroups = computed<SponsorGroup[]>(() =>
  sponsorTierOrder
    .map((tier) => ({
      description: tierMeta[tier].description,
      icon: tierMeta[tier].icon,
      id: tier,
      sponsors: sponsorsByTier.value[tier],
      title: tierMeta[tier].title,
      tone: tierMeta[tier].tone,
    }))
    .filter((group) => group.sponsors.length > 0),
)

const sponsorSupportItems = computed(() => [
  {
    description: 'Aktívne zverejnené partnerstvá',
    icon: 'i-heroicons-sparkles',
    label: 'Partneri',
    value: activeSponsors.value.length,
  },
  {
    description: 'Partneri súťaží a cien',
    icon: 'i-heroicons-trophy',
    label: 'Súťaže',
    value: sponsorsByTier.value.tournament.length,
  },
  {
    description: 'Sektory a lovné miesta',
    icon: 'i-heroicons-map',
    label: 'Sektory',
    value: sponsorsByTier.value.sector.length,
  },
  {
    description: 'Prevádzka revíru a služby',
    icon: 'i-heroicons-home-modern',
    label: 'Revír',
    value: sponsorsByTier.value.main.length + sponsorsByTier.value.partner.length,
  },
])

function formatSponsorDate(value?: string) {
  if (!value) return ''

  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return dateFormatter.format(date)
}

function campaignRange(sponsor: Sponsor) {
  if (sponsor.validFrom && sponsor.validTo) {
    return `${formatSponsorDate(sponsor.validFrom)} - ${formatSponsorDate(sponsor.validTo)}`
  }
  if (sponsor.validFrom) return `od ${formatSponsorDate(sponsor.validFrom)}`
  if (sponsor.validTo) return `do ${formatSponsorDate(sponsor.validTo)}`

  return ''
}

function cardLogo(sponsor: Sponsor) {
  return getSponsorLogo(sponsor, sponsor.placementType ?? 'sponsors')
}

function sponsorCardClass(group: SponsorGroup) {
  return group.id === 'main'
    ? 'border-accent-500/30 bg-white shadow-sm'
    : 'border-border bg-surface'
}

function sponsorGridClass(group: SponsorGroup) {
  return group.id === 'main'
    ? 'grid gap-4 lg:grid-cols-2'
    : 'grid gap-4 md:grid-cols-2 xl:grid-cols-3'
}

function partnerCountLabel(count: number) {
  if (count === 1) return '1 partner'
  if (count >= 2 && count <= 4) return `${count} partneri`

  return `${count} partnerov`
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
        title="Partneri nie sú zverejnení"
        description="Zoznam partnerov sa zobrazí po schválení správcom."
        icon="i-heroicons-building-storefront"
      />
      <div v-else class="space-y-8">
        <div
          class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div
            v-for="item in sponsorSupportItems"
            :key="item.label"
            class="border-border bg-surface rounded-card flex min-h-28 items-start gap-3 border p-4"
          >
            <div class="bg-primary-50 text-primary-800 flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
              <UIcon :name="item.icon" class="h-5 w-5" />
            </div>
            <div class="min-w-0">
              <p class="text-2xl font-black text-foreground">{{ item.value }}</p>
              <p class="text-sm font-semibold text-foreground">{{ item.label }}</p>
              <p class="text-foreground-muted mt-1 text-xs leading-5">{{ item.description }}</p>
            </div>
          </div>
        </div>

        <div
          v-for="group in sponsorGroups"
          :key="group.id"
          class="space-y-4"
        >
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div class="max-w-3xl">
              <div class="flex items-center gap-2">
                <UIcon :name="group.icon" class="text-primary-700 h-5 w-5" />
                <h2 class="text-2xl font-black tracking-normal text-foreground">{{ group.title }}</h2>
              </div>
              <p class="text-foreground-muted mt-2 text-sm leading-6">{{ group.description }}</p>
            </div>
            <StatusBadge
              :icon="group.icon"
              :label="partnerCountLabel(group.sponsors.length)"
              :tone="group.tone"
              size="xs"
            />
          </div>

          <div :class="sponsorGridClass(group)">
            <article
              v-for="sponsor in group.sponsors"
              :key="sponsor.id"
              class="rounded-card border p-5"
              :class="sponsorCardClass(group)"
            >
              <div class="flex items-start gap-4">
                <div
                  class="flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary-900 font-black text-accent-300"
                  :class="group.id === 'main' ? 'h-20 w-20 text-2xl' : 'h-14 w-14 text-lg'"
                >
                  <img
                    v-if="cardLogo(sponsor).url"
                    :src="cardLogo(sponsor).url"
                    :alt="cardLogo(sponsor).alt"
                    class="h-full w-full bg-white object-contain p-2"
                  >
                  <span v-else>{{ cardLogo(sponsor).text }}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap gap-2">
                    <StatusBadge
                      :icon="tierMeta[sponsor.tier].icon"
                      :label="tierMeta[sponsor.tier].label"
                      :tone="tierMeta[sponsor.tier].tone"
                      size="xs"
                    />
                    <StatusBadge
                      v-if="campaignRange(sponsor)"
                      icon="i-heroicons-calendar-days"
                      :label="campaignRange(sponsor)"
                      tone="neutral"
                      size="xs"
                    />
                  </div>
                  <h3 class="mt-3 text-xl font-black tracking-normal text-foreground">{{ sponsor.name }}</h3>
                </div>
              </div>

              <p class="text-foreground-muted mt-4 text-sm leading-6">{{ sponsor.description }}</p>

              <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0">
                  <p class="text-[11px] font-semibold uppercase tracking-normal text-foreground-subtle">Umiestnenie</p>
                  <p class="mt-1 truncate text-sm font-semibold text-foreground">{{ sponsor.placement }}</p>
                </div>
                <UButton
                  v-if="sponsor.website"
                  :to="sponsor.website"
                  target="_blank"
                  rel="noreferrer"
                  icon="i-heroicons-arrow-top-right-on-square"
                  variant="soft"
                  size="sm"
                >
                  Web partnera
                </UButton>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
