<script setup lang="ts">
import type { LakeClosure } from '~/data/pond'

useHead({ title: 'Admin uzávierky' })

const { getLakeName, lakeClosures, lakes } = usePondData()

const reasonLabels: Record<LakeClosure['reason'], string> = {
  emergency: 'mimoriadna situácia',
  maintenance: 'údržba',
  pandemic: 'pandémia',
  season: 'sezóna',
  spawning: 'neres',
  tournament: 'preteky',
}

const publicClosures = computed(() => lakeClosures.filter((closure) => closure.visibility === 'public'))
const internalClosures = computed(() => lakeClosures.filter((closure) => closure.visibility === 'internal'))
const blockingClosures = computed(() => lakeClosures.filter((closure) => closure.affectsReservations))
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Uzávierky, sezóny a výnimky"
      description="Miesto pre neres, údržbu, zimný režim, pandémiu, preteky aj interné servisné blokácie."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div class="grid gap-4 md:grid-cols-3">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Public uzávierky</p>
          <p class="mt-2 text-3xl font-bold">{{ publicClosures.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Interné blokácie</p>
          <p class="mt-2 text-3xl font-bold">{{ internalClosures.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Blokujú rezervácie</p>
          <p class="mt-2 text-3xl font-bold">{{ blockingClosures.length }}</p>
        </div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_0.75fr]">
        <div class="rounded-card border border-border bg-surface p-5">
          <h2 class="text-lg font-bold">Kalendár uzávierok</h2>
          <div class="mt-5 space-y-3">
            <div v-for="closure in lakeClosures" :key="closure.id" class="rounded-md border border-border bg-white p-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-bold">{{ closure.title }}</p>
                  <p class="text-foreground-muted text-sm">
                    {{ closure.lake === 'all' ? 'Všetky jazerá' : getLakeName(closure.lake) }} ·
                    {{ closure.from }} až {{ closure.to }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <span class="rounded-md bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-800">
                    {{ reasonLabels[closure.reason] }}
                  </span>
                  <span
                    class="rounded-md px-2.5 py-1 text-xs font-bold"
                    :class="
                      closure.visibility === 'public'
                        ? 'bg-success-500/10 text-success-700'
                        : 'bg-warning-500/10 text-warning-700'
                    "
                  >
                    {{ closure.visibility === 'public' ? 'public' : 'interné' }}
                  </span>
                </div>
              </div>
              <p class="text-foreground-muted mt-3 text-sm">{{ closure.notes }}</p>
              <p v-if="closure.organization" class="text-primary-800 mt-3 text-sm font-semibold">
                Organizácia: {{ closure.organization }}
              </p>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Nová uzávierka</h2>
            <form class="mt-4 space-y-4">
              <label class="block">
                <span class="text-sm font-semibold">Názov</span>
                <input class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm" value="Servisné práce pri brehu">
              </label>
              <label class="block">
                <span class="text-sm font-semibold">Jazero</span>
                <select class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                  <option>Všetky jazerá</option>
                  <option v-for="lake in lakes" :key="lake.slug">{{ lake.name }}</option>
                </select>
              </label>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Od</span>
                  <input type="date" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Do</span>
                  <input type="date" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                </label>
              </div>
              <label class="flex items-center gap-2 rounded-md bg-muted p-3 text-sm font-semibold">
                <input type="checkbox" checked class="h-4 w-4 accent-primary-700">
                Blokuje rezervácie
              </label>
              <UButton type="button" icon="i-heroicons-plus" block>Uložiť mock uzávierku</UButton>
            </form>
          </div>

          <div class="rounded-card border border-border bg-primary-900 p-5 text-white">
            <h2 class="text-lg font-bold">Pravidlo dostupnosti</h2>
            <p class="mt-3 text-sm text-white/75">
              Availability engine musí tieto uzávierky vyhodnocovať pred každou rezerváciou.
              Public uzávierka sa zobrazí rybárovi, interná iba správcovi, ale obe vedia blokovať termín.
            </p>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
