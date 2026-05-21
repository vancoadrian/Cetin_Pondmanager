<script setup lang="ts">
import type { Sponsor } from '~/data/pond'
import type { SponsorMutationSuccess } from '~/services/sponsorService'

useHead({ title: 'Admin sponzori' })

const { tournaments } = usePondData()
const {
  canOperate: canOperateSponsors,
  isReadOnly: sponsorsReadOnly,
  label: sponsorAccessLabel,
  readOnlyMessage: sponsorReadOnlyMessage,
} = useAdminModuleAccess('sponsors')
const {
  liveSponsors,
  refresh: refreshSponsorState,
} = await useSponsorState({ admin: true, key: 'admin-sponsors-page-state' })

const tierLabels = {
  main: 'hlavný',
  partner: 'partner',
  sector: 'sektor',
  tournament: 'súťaž',
} as const
const placementTypeLabels: Record<NonNullable<Sponsor['placementType']>, string> = {
  footer: 'footer',
  homepage: 'homepage',
  scoreboard: 'výsledkovka',
  sector: 'sektor',
  sponsors: 'stránka sponzorov',
  tournament: 'súťaž',
}

const sponsorDraft = ref<Sponsor[]>([])
const sponsorSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const sponsorSubmitMessage = ref('')
const sponsorDraftStatus = ref<'idle' | 'success' | 'error'>('idle')
const sponsorDraftMessage = ref('')
const newSponsorDraft = reactive({
  description: '',
  logoText: '',
  name: '',
  placement: '',
  placementType: 'sponsors' as NonNullable<Sponsor['placementType']>,
  sectorId: '',
  sortOrder: 10,
  tier: 'partner' as Sponsor['tier'],
  tournamentId: '',
  validFrom: '',
  validTo: '',
  website: '',
})

const activeSponsors = computed(() => sponsorDraft.value.filter((sponsor) => sponsor.active))
const inactiveSponsors = computed(() => sponsorDraft.value.filter((sponsor) => !sponsor.active))
const sectorOptions = computed(() =>
  tournaments.flatMap((tournament) =>
    tournament.sectors.map((sector) => ({
      id: sector.id,
      label: `${tournament.name} · ${sector.label}`,
      tournamentId: tournament.id,
    })),
  ),
)

watch(
  liveSponsors,
  (sponsors) => {
    sponsorDraft.value = sponsors.map((sponsor, index) => ({
      ...sponsor,
      placementType: sponsor.placementType ?? (
        sponsor.tier === 'tournament'
          ? 'tournament'
          : sponsor.tier === 'sector' ? 'sector' : 'sponsors'
      ),
      sortOrder: sponsor.sortOrder ?? index + 1,
    }))
  },
  { immediate: true },
)

watch(
  sponsorDraft,
  () => {
    if (sponsorSubmitStatus.value !== 'submitting') {
      sponsorSubmitStatus.value = 'idle'
      sponsorSubmitMessage.value = ''
    }
  },
  { deep: true },
)

function slugifySponsorName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'sponzor'
}

function createSponsorDraftId(name: string, existingIds: Set<string>) {
  const baseId = `sponsor-${slugifySponsorName(name)}`
  if (!existingIds.has(baseId)) return baseId

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1
  }

  return `${baseId}-${index}`
}

function markSponsorDraftError(message: string) {
  sponsorDraftStatus.value = 'error'
  sponsorDraftMessage.value = message
}

function markSponsorDraftSuccess(message: string) {
  sponsorDraftStatus.value = 'success'
  sponsorDraftMessage.value = message
}

function addSponsorDraft() {
  const name = newSponsorDraft.name.trim()
  const description = newSponsorDraft.description.trim()
  const logoText = newSponsorDraft.logoText.trim().toUpperCase()
  const placement = newSponsorDraft.placement.trim()
  const website = newSponsorDraft.website.trim()
  const validFrom = newSponsorDraft.validFrom.trim()
  const validTo = newSponsorDraft.validTo.trim()

  if (name.length < 2) {
    markSponsorDraftError('Doplňte názov nového sponzora.')
    return
  }
  if (logoText.length < 1 || logoText.length > 6) {
    markSponsorDraftError('Doplňte krátky text loga, najviac 6 znakov.')
    return
  }
  if (description.length < 8) {
    markSponsorDraftError('Doplňte popis sponzora aspoň 8 znakmi.')
    return
  }
  if (placement.length < 3) {
    markSponsorDraftError('Doplňte umiestnenie sponzora.')
    return
  }
  if (website && !/^https?:\/\/.+/i.test(website)) {
    markSponsorDraftError('Web sponzora musí začínať na http:// alebo https://.')
    return
  }
  if ((newSponsorDraft.placementType === 'tournament' || newSponsorDraft.placementType === 'scoreboard') && !newSponsorDraft.tournamentId) {
    markSponsorDraftError('Pri súťažnom umiestnení vyberte súťaž.')
    return
  }
  if (newSponsorDraft.placementType === 'sector' && !newSponsorDraft.sectorId) {
    markSponsorDraftError('Pri sektorovom umiestnení vyberte sektor.')
    return
  }
  if (validFrom && validTo && validTo < validFrom) {
    markSponsorDraftError('Platnosť kampane musí končiť rovnaký deň alebo neskôr ako začína.')
    return
  }

  const existingIds = new Set(sponsorDraft.value.map((sponsor) => sponsor.id))
  sponsorDraft.value = [
    ...sponsorDraft.value,
    {
      active: true,
      description,
      id: createSponsorDraftId(name, existingIds),
      logoText,
      name,
      placement,
      placementType: newSponsorDraft.placementType,
      sectorId: newSponsorDraft.sectorId || undefined,
      sortOrder: Number(newSponsorDraft.sortOrder),
      tier: newSponsorDraft.tier,
      tournamentId: newSponsorDraft.tournamentId || undefined,
      validFrom: validFrom || undefined,
      validTo: validTo || undefined,
      website: website || undefined,
    },
  ]
  newSponsorDraft.description = ''
  newSponsorDraft.logoText = ''
  newSponsorDraft.name = ''
  newSponsorDraft.placement = ''
  newSponsorDraft.placementType = 'sponsors'
  newSponsorDraft.sectorId = ''
  newSponsorDraft.sortOrder = 10
  newSponsorDraft.tier = 'partner'
  newSponsorDraft.tournamentId = ''
  newSponsorDraft.validFrom = ''
  newSponsorDraft.validTo = ''
  newSponsorDraft.website = ''
  markSponsorDraftSuccess('Nový sponzor je pridaný do rozpracovaného zoznamu. Uložte sponzorov.')
}

async function saveSponsorSettings() {
  if (!canOperateSponsors.value) {
    sponsorSubmitStatus.value = 'error'
    sponsorSubmitMessage.value = sponsorReadOnlyMessage.value
    return
  }

  sponsorSubmitStatus.value = 'submitting'
  sponsorSubmitMessage.value = ''

  try {
    const result = await $fetch<SponsorMutationSuccess>('/api/admin/sponsors', {
      body: {
        sponsors: sponsorDraft.value.map((sponsor) => ({
          active: sponsor.active,
          description: sponsor.description,
          id: sponsor.id,
          logoText: sponsor.logoText,
          name: sponsor.name,
          placement: sponsor.placement,
          placementType: sponsor.placementType ?? 'sponsors',
          sectorId: sponsor.sectorId ?? '',
          sortOrder: sponsor.sortOrder ?? 100,
          tier: sponsor.tier,
          tournamentId: sponsor.tournamentId ?? '',
          validFrom: sponsor.validFrom ?? '',
          validTo: sponsor.validTo ?? '',
          website: sponsor.website ?? '',
        })),
      },
      method: 'PUT',
    })

    await refreshSponsorState()
    sponsorSubmitStatus.value = 'success'
    sponsorSubmitMessage.value = result.message
  }
  catch (error) {
    const fetchError = error as {
      data?: {
        data?: {
          messages?: string[]
        }
        message?: string
        statusMessage?: string
      }
    }
    sponsorSubmitStatus.value = 'error'
    sponsorSubmitMessage.value =
      fetchError.data?.data?.messages?.join(' ') ??
      fetchError.data?.message ??
      fetchError.data?.statusMessage ??
      'Sponzorov sa nepodarilo uložiť.'
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Sponzori a umiestnenia"
      description="Správa partnerov revíru, súťaží a sektorových umiestnení. Logo upload je zatiaľ mock."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div
        v-if="sponsorsReadOnly"
        class="mb-5 rounded-card border border-info-500/25 bg-info-500/10 p-4 text-info-700"
      >
        <p class="text-sm font-bold">Režim prístupu: {{ sponsorAccessLabel }}</p>
        <p class="mt-1 text-sm">{{ sponsorReadOnlyMessage }}</p>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Aktívni</p>
          <p class="mt-2 text-3xl font-bold">{{ activeSponsors.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">V pauze</p>
          <p class="mt-2 text-3xl font-bold">{{ inactiveSponsors.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Umiestnenia</p>
          <p class="mt-2 text-3xl font-bold">{{ sponsorDraft.length }}</p>
        </div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_0.75fr]">
        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Partneri</h2>
              <p class="text-foreground-muted text-sm">Public stránka zobrazuje iba aktívnych partnerov, interný zoznam drží aj pauzy.</p>
            </div>
            <UButton
              icon="i-heroicons-check"
              variant="soft"
              :disabled="!canOperateSponsors || sponsorSubmitStatus === 'submitting'"
              :loading="sponsorSubmitStatus === 'submitting'"
              @click="saveSponsorSettings"
            >
              Uložiť sponzorov
            </UButton>
          </div>
          <p
            v-if="sponsorSubmitMessage"
            class="mt-4 rounded-md px-3 py-2 text-sm font-semibold"
            :class="
              sponsorSubmitStatus === 'error'
                ? 'bg-error-500/10 text-error-700'
                : 'bg-success-500/10 text-success-700'
            "
          >
            {{ sponsorSubmitMessage }}
          </p>

          <div class="mt-5 space-y-3">
            <div v-for="sponsor in sponsorDraft" :key="sponsor.id" class="rounded-md border border-border bg-white p-4" :class="!sponsor.active ? 'opacity-75' : ''">
              <div class="flex items-start gap-4">
                <label class="block">
                  <span class="sr-only">Text loga</span>
                  <input
                    v-model="sponsor.logoText"
                    maxlength="6"
                    :disabled="!canOperateSponsors"
                    class="flex h-12 w-12 shrink-0 rounded-md border border-primary-900 bg-primary-900 px-1 text-center text-sm font-black text-accent-300"
                    aria-label="Text loga sponzora"
                  >
                </label>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0 flex-1 space-y-2">
                      <label class="block">
                        <span class="sr-only">Názov sponzora</span>
                        <input
                          v-model="sponsor.name"
                          :disabled="!canOperateSponsors"
                          class="h-10 w-full rounded-md border border-border bg-white px-3 text-sm font-bold"
                          placeholder="Názov sponzora"
                        >
                      </label>
                      <label class="block">
                        <span class="sr-only">Popis sponzora</span>
                        <textarea
                          v-model="sponsor.description"
                          rows="2"
                          :disabled="!canOperateSponsors"
                          class="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground-muted"
                          placeholder="Krátky popis partnerstva"
                        />
                      </label>
                    </div>
                    <span
                      class="w-fit rounded-md px-2.5 py-1 text-xs font-bold"
                      :class="sponsor.active ? 'bg-success-500/10 text-success-700' : 'bg-muted text-foreground-muted'"
                    >
                      {{ sponsor.active ? 'aktívny' : 'pauza' }}
                    </span>
                  </div>
                  <div class="mt-3 grid gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
                    <label class="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs font-semibold">
                      <input
                        v-model="sponsor.active"
                        type="checkbox"
                        :disabled="!canOperateSponsors"
                        class="h-4 w-4 accent-primary-700"
                      >
                      Aktívny
                    </label>
                    <label class="block">
                      <span class="sr-only">Tier sponzora</span>
                      <select
                        v-model="sponsor.tier"
                        :disabled="!canOperateSponsors"
                        class="h-10 w-full rounded-md border border-border bg-white px-2 text-xs font-semibold"
                      >
                        <option value="main">{{ tierLabels.main }}</option>
                        <option value="partner">{{ tierLabels.partner }}</option>
                        <option value="tournament">{{ tierLabels.tournament }}</option>
                        <option value="sector">{{ tierLabels.sector }}</option>
                      </select>
                    </label>
                    <label class="block">
                      <span class="sr-only">Umiestnenie</span>
                      <input
                        v-model="sponsor.placement"
                        :disabled="!canOperateSponsors"
                        class="h-10 w-full rounded-md border border-border bg-white px-3 text-xs"
                        placeholder="homepage, súťaž, sektor..."
                      >
                    </label>
                    <label class="block">
                      <span class="sr-only">Typ umiestnenia</span>
                      <select
                        v-model="sponsor.placementType"
                        :disabled="!canOperateSponsors"
                        class="h-10 w-full rounded-md border border-border bg-white px-2 text-xs"
                      >
                        <option
                          v-for="(label, placementType) in placementTypeLabels"
                          :key="placementType"
                          :value="placementType"
                        >
                          {{ label }}
                        </option>
                      </select>
                    </label>
                    <label class="block">
                      <span class="sr-only">Poradie</span>
                      <input
                        v-model.number="sponsor.sortOrder"
                        type="number"
                        min="1"
                        max="999"
                        :disabled="!canOperateSponsors"
                        class="h-10 w-full rounded-md border border-border bg-white px-3 text-xs"
                        placeholder="poradie"
                      >
                    </label>
                    <label
                      v-if="sponsor.placementType === 'tournament' || sponsor.placementType === 'scoreboard' || sponsor.placementType === 'sector'"
                      class="block"
                    >
                      <span class="sr-only">Súťaž</span>
                      <select
                        v-model="sponsor.tournamentId"
                        :disabled="!canOperateSponsors"
                        class="h-10 w-full rounded-md border border-border bg-white px-2 text-xs"
                      >
                        <option value="">Vyberte súťaž</option>
                        <option v-for="tournament in tournaments" :key="tournament.id" :value="tournament.id">
                          {{ tournament.name }}
                        </option>
                      </select>
                    </label>
                    <label
                      v-if="sponsor.placementType === 'sector'"
                      class="block"
                    >
                      <span class="sr-only">Sektor</span>
                      <select
                        v-model="sponsor.sectorId"
                        :disabled="!canOperateSponsors"
                        class="h-10 w-full rounded-md border border-border bg-white px-2 text-xs"
                      >
                        <option value="">Vyberte sektor</option>
                        <option
                          v-for="sector in sectorOptions"
                          :key="`${sector.tournamentId}-${sector.id}`"
                          :value="sector.id"
                        >
                          {{ sector.label }}
                        </option>
                      </select>
                    </label>
                    <label class="block">
                      <span class="sr-only">Platnosť od</span>
                      <input
                        v-model="sponsor.validFrom"
                        type="date"
                        :disabled="!canOperateSponsors"
                        class="h-10 w-full rounded-md border border-border bg-white px-3 text-xs"
                      >
                    </label>
                    <label class="block">
                      <span class="sr-only">Platnosť do</span>
                      <input
                        v-model="sponsor.validTo"
                        type="date"
                        :disabled="!canOperateSponsors"
                        class="h-10 w-full rounded-md border border-border bg-white px-3 text-xs"
                      >
                    </label>
                    <label class="block sm:col-span-3">
                      <span class="sr-only">Web sponzora</span>
                      <input
                        v-model="sponsor.website"
                        :disabled="!canOperateSponsors"
                        class="h-10 w-full rounded-md border border-border bg-white px-3 text-xs"
                        placeholder="https://..."
                      >
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Nový partner</h2>
            <form class="mt-4 space-y-4" @submit.prevent="addSponsorDraft">
              <fieldset :disabled="!canOperateSponsors" class="contents">
                <label class="block">
                  <span class="text-sm font-semibold">Názov</span>
                  <input
                    v-model="newSponsorDraft.name"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                    placeholder="Názov partnera"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Tier</span>
                  <select
                    v-model="newSponsorDraft.tier"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option value="main">hlavný partner</option>
                    <option value="partner">partner revíru</option>
                    <option value="tournament">partner súťaže</option>
                    <option value="sector">sektorový partner</option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Text loga</span>
                  <input
                    v-model="newSponsorDraft.logoText"
                    maxlength="6"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                    placeholder="napr. RC"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Umiestnenie</span>
                  <input
                    v-model="newSponsorDraft.placement"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                    placeholder="homepage, sektor B4..."
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Typ umiestnenia</span>
                  <select
                    v-model="newSponsorDraft.placementType"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option
                      v-for="(label, placementType) in placementTypeLabels"
                      :key="placementType"
                      :value="placementType"
                    >
                      {{ label }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Poradie</span>
                  <input
                    v-model.number="newSponsorDraft.sortOrder"
                    type="number"
                    min="1"
                    max="999"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
                <label
                  v-if="newSponsorDraft.placementType === 'tournament' || newSponsorDraft.placementType === 'scoreboard' || newSponsorDraft.placementType === 'sector'"
                  class="block"
                >
                  <span class="text-sm font-semibold">Súťaž</span>
                  <select
                    v-model="newSponsorDraft.tournamentId"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option value="">Vyberte súťaž</option>
                    <option v-for="tournament in tournaments" :key="tournament.id" :value="tournament.id">
                      {{ tournament.name }}
                    </option>
                  </select>
                </label>
                <label v-if="newSponsorDraft.placementType === 'sector'" class="block">
                  <span class="text-sm font-semibold">Sektor</span>
                  <select
                    v-model="newSponsorDraft.sectorId"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option value="">Vyberte sektor</option>
                    <option
                      v-for="sector in sectorOptions"
                      :key="`${sector.tournamentId}-${sector.id}`"
                      :value="sector.id"
                    >
                      {{ sector.label }}
                    </option>
                  </select>
                </label>
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="block">
                    <span class="text-sm font-semibold">Platnosť od</span>
                    <input
                      v-model="newSponsorDraft.validFrom"
                      type="date"
                      class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Platnosť do</span>
                    <input
                      v-model="newSponsorDraft.validTo"
                      type="date"
                      class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                  </label>
                </div>
                <label class="block">
                  <span class="text-sm font-semibold">Popis</span>
                  <textarea
                    v-model="newSponsorDraft.description"
                    rows="3"
                    class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                    placeholder="Čo partner podporuje a kde sa zobrazí."
                  />
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Web</span>
                  <input
                    v-model="newSponsorDraft.website"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                    placeholder="https://..."
                  >
                </label>
              </fieldset>
              <UButton type="submit" icon="i-heroicons-plus" block :disabled="!canOperateSponsors">Pridať partnera</UButton>
            </form>
            <p
              v-if="sponsorDraftMessage"
              class="mt-4 rounded-md px-3 py-2 text-sm font-semibold"
              :class="
                sponsorDraftStatus === 'error'
                  ? 'bg-error-500/10 text-error-700'
                  : 'bg-success-500/10 text-success-700'
              "
            >
              {{ sponsorDraftMessage }}
            </p>
          </div>

          <div class="rounded-card border border-border bg-primary-900 p-5 text-white">
            <h2 class="text-lg font-bold">Umiestnenia</h2>
            <p class="mt-3 text-sm text-white/75">
              Produkčne sa sponzor bude dať naviazať na homepage, detail súťaže, sektor mapy,
              výsledkovú tabuľu alebo konkrétnu kampaň s platnosťou od-do.
            </p>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
