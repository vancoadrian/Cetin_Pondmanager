<script setup lang="ts">
useHead({ title: 'Admin sponzori' })

const { sponsors } = usePondData()

const tierLabels = {
  main: 'hlavný',
  partner: 'partner',
  sector: 'sektor',
  tournament: 'súťaž',
} as const

const activeSponsors = computed(() => sponsors.filter((sponsor) => sponsor.active))
const inactiveSponsors = computed(() => sponsors.filter((sponsor) => !sponsor.active))
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
          <p class="mt-2 text-3xl font-bold">{{ sponsors.length }}</p>
        </div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_0.75fr]">
        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Partneri</h2>
              <p class="text-foreground-muted text-sm">Public stránka zobrazuje iba aktívnych partnerov.</p>
            </div>
            <UButton icon="i-heroicons-plus" variant="soft">Pridať sponzora</UButton>
          </div>

          <div class="mt-5 space-y-3">
            <div v-for="sponsor in sponsors" :key="sponsor.id" class="rounded-md border border-border bg-white p-4">
              <div class="flex items-start gap-4">
                <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary-900 font-black text-accent-300">
                  {{ sponsor.logoText }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p class="font-bold">{{ sponsor.name }}</p>
                      <p class="text-foreground-muted text-sm">{{ sponsor.description }}</p>
                    </div>
                    <span
                      class="w-fit rounded-md px-2.5 py-1 text-xs font-bold"
                      :class="sponsor.active ? 'bg-success-500/10 text-success-700' : 'bg-muted text-foreground-muted'"
                    >
                      {{ sponsor.active ? 'aktívny' : 'pauza' }}
                    </span>
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2 text-xs">
                    <span class="rounded-md bg-primary-50 px-2 py-1 font-bold text-primary-800">
                      {{ tierLabels[sponsor.tier] }}
                    </span>
                    <span class="rounded-md bg-muted px-2 py-1 text-foreground-muted">{{ sponsor.placement }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Nový partner</h2>
            <form class="mt-4 space-y-4">
              <label class="block">
                <span class="text-sm font-semibold">Názov</span>
                <input class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm" placeholder="Názov partnera">
              </label>
              <label class="block">
                <span class="text-sm font-semibold">Tier</span>
                <select class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                  <option>hlavný partner</option>
                  <option>partner revíru</option>
                  <option>partner súťaže</option>
                  <option>sektorový partner</option>
                </select>
              </label>
              <label class="block">
                <span class="text-sm font-semibold">Umiestnenie</span>
                <input class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm" placeholder="homepage, sektor B4...">
              </label>
              <UButton type="button" icon="i-heroicons-plus" block>Uložiť mock partnera</UButton>
            </form>
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
