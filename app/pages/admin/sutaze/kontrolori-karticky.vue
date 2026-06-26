<script setup lang="ts">
import type { TournamentStateResponse } from '~/services/tournamentApiService'
import { createQrCodeDataUrl } from '~/utils/qrCode'
import { getTournamentMarshalAccessRows } from '~/utils/tournamentMarshalAccess'

useHead({ title: 'Kartičky kontrolórov' })

const route = useRoute()
const requestUrl = useRequestURL()

const {
  getLakeName,
  tournaments: seedTournaments,
  tournamentCatches: seedTournamentCatches,
  tournamentMarshals: seedTournamentMarshals,
  tournamentMarshalStatusLabels,
  tournamentPenalties: seedTournamentPenalties,
  tournamentRequests: seedTournamentRequests,
  tournamentRuleChecks: seedTournamentRuleChecks,
  tournamentTeamRegistrations: seedTournamentTeamRegistrations,
} = usePondData()

const fallbackTournamentState = (): TournamentStateResponse => ({
  ok: true,
  tournamentCatches: seedTournamentCatches,
  tournamentMarshals: seedTournamentMarshals,
  tournamentPenalties: seedTournamentPenalties,
  tournamentRequests: seedTournamentRequests,
  tournamentRuleChecks: seedTournamentRuleChecks,
  tournamentTeamRegistrations: seedTournamentTeamRegistrations,
  tournaments: seedTournaments,
  updatedAt: 'seed',
})

const requestFetch = useRequestFetch()
const { data: tournamentState } = await useAsyncData<TournamentStateResponse>(
  'admin-tournament-marshal-cards-state',
  () => requestFetch<TournamentStateResponse>('/api/admin/tournaments'),
  {
    default: fallbackTournamentState,
  },
)

const liveTournaments = computed(() => tournamentState.value?.tournaments ?? seedTournaments)
const liveTournamentMarshals = computed(() => tournamentState.value?.tournamentMarshals ?? seedTournamentMarshals)
const requestedTournamentId = computed(() =>
  Array.isArray(route.query.turnaj) ? route.query.turnaj[0] : route.query.turnaj,
)
const activeTournament = computed(() =>
  liveTournaments.value.find((tournament) => tournament.id === requestedTournamentId.value)
  ?? liveTournaments.value.find((tournament) => tournament.status === 'live')
  ?? liveTournaments.value[0]
  ?? seedTournaments[0]!,
)
const marshalAccessRows = computed(() =>
  getTournamentMarshalAccessRows(activeTournament.value, liveTournamentMarshals.value),
)
const adminTournamentUrl = computed(() => `/admin/sutaze?turnaj=${encodeURIComponent(activeTournament.value.id)}`)

const absoluteMarshalAccessUrl = (path: string) =>
  new URL(path, import.meta.client ? window.location.origin : requestUrl.origin).toString()

const { data: qrCodeByMarshal, refresh: refreshQrCodes } = await useAsyncData<Record<string, string>>(
  'admin-tournament-marshal-cards-qr',
  async () => Object.fromEntries(
    await Promise.all(
      getTournamentMarshalAccessRows(activeTournament.value, liveTournamentMarshals.value).map(async (row) => [
        row.marshalId,
        await createQrCodeDataUrl(absoluteMarshalAccessUrl(row.url), { scale: 7 }),
      ]),
    ),
  ),
  {
    default: () => ({}),
  },
)

const printCards = () => {
  if (!import.meta.client) return

  window.print()
}

watch([activeTournament, liveTournamentMarshals], () => {
  void refreshQrCodes()
})
</script>

<template>
  <div>
    <div class="screen-only">
      <PageHeader
        eyebrow="Admin súťaže"
        title="Kartičky kontrolórov"
        :description="`${activeTournament.name} · ${getLakeName(activeTournament.lake)} · ${activeTournament.dateRange}`"
      />

      <section class="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        <AdminModuleNav />

        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 class="text-lg font-bold">Tlačové podklady pre dozor</h2>
              <p class="text-foreground-muted mt-1 text-sm">
                Každá kartička obsahuje QR link do kontrolórskeho panelu, meno, telefón a pridelené sektory.
              </p>
            </div>
            <div class="flex flex-wrap gap-2 lg:justify-end">
              <UButton :to="adminTournamentUrl" icon="i-heroicons-arrow-left" variant="soft">
                Späť na súťaž
              </UButton>
              <UButton icon="i-heroicons-printer" @click="printCards">
                Tlačiť kartičky
              </UButton>
            </div>
          </div>
        </div>
      </section>
    </div>

    <section class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 print-wrapper">
      <div class="print-grid">
        <article
          v-for="row in marshalAccessRows"
          :key="row.marshalId"
          class="marshal-card"
        >
          <div class="marshal-card__header">
            <div>
              <p class="marshal-card__eyebrow">Rybolov Cetín · kontrolórsky panel</p>
              <h2>{{ row.marshalName }}</h2>
              <p>{{ row.phone }}</p>
            </div>
            <span>{{ tournamentMarshalStatusLabels[row.status] }}</span>
          </div>

          <div class="marshal-card__body">
            <div class="marshal-card__qr">
              <img
                v-if="qrCodeByMarshal?.[row.marshalId]"
                :src="qrCodeByMarshal[row.marshalId]"
                :alt="`QR kód pre kontrolóra ${row.marshalName}`"
              >
              <div v-else class="marshal-card__qr-placeholder">
                QR sa pripravuje
              </div>
            </div>

            <div class="marshal-card__access">
              <p class="marshal-card__label">Pridelené sektory</p>
              <p class="marshal-card__sectors">
                {{ row.sectorLabels.length > 0 ? row.sectorLabels.join(', ') : 'bez sektorov' }}
              </p>
              <p class="marshal-card__url">{{ absoluteMarshalAccessUrl(row.url) }}</p>
            </div>
          </div>

          <div class="marshal-card__footer">
            <span>Hlásenia tímov</span>
            <span>Váženia</span>
            <span>Kontroly</span>
            <span>Tresty</span>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.print-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.marshal-card {
  background: #ffffff;
  border: 1px solid #d8e1de;
  border-radius: 8px;
  color: #062523;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 300px;
  padding: 18px;
}

.marshal-card__header {
  align-items: flex-start;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.marshal-card__header h2 {
  font-size: 30px;
  font-weight: 900;
  line-height: 1.08;
  margin: 3px 0 4px;
}

.marshal-card__header p {
  color: #4f6560;
  font-size: 13px;
  font-weight: 700;
  margin: 0;
}

.marshal-card__header span {
  background: #e7f4ee;
  border-radius: 6px;
  color: #16483f;
  font-size: 11px;
  font-weight: 800;
  max-width: 130px;
  padding: 6px 8px;
  text-align: right;
}

.marshal-card__eyebrow {
  color: #1a7466 !important;
  font-size: 11px !important;
  letter-spacing: 0 !important;
  text-transform: uppercase;
}

.marshal-card__body {
  align-items: center;
  display: grid;
  gap: 18px;
  grid-template-columns: 136px 1fr;
}

.marshal-card__qr {
  align-items: center;
  aspect-ratio: 1;
  background: #ffffff;
  border: 1px solid #d8e1de;
  border-radius: 8px;
  display: flex;
  justify-content: center;
  overflow: hidden;
  padding: 8px;
}

.marshal-card__qr img {
  height: 100%;
  width: 100%;
}

.marshal-card__qr-placeholder {
  color: #4f6560;
  font-size: 12px;
  font-weight: 800;
  text-align: center;
}

.marshal-card__access {
  min-width: 0;
}

.marshal-card__label {
  color: #4f6560;
  font-size: 11px;
  font-weight: 800;
  margin: 0;
  text-transform: uppercase;
}

.marshal-card__sectors {
  background: #062523;
  border-radius: 6px;
  color: #f5c057;
  font-size: 22px;
  font-weight: 900;
  margin: 8px 0;
  overflow-wrap: anywhere;
  padding: 10px 12px;
}

.marshal-card__url {
  color: #4f6560;
  font-size: 11px;
  font-weight: 700;
  margin: 0;
  overflow-wrap: anywhere;
}

.marshal-card__footer {
  border-top: 1px solid #d8e1de;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 12px;
}

.marshal-card__footer span {
  background: #f0f5f3;
  border-radius: 6px;
  color: #16483f;
  font-size: 11px;
  font-weight: 800;
  padding: 6px 8px;
}

@media print {
  :global(header),
  :global(footer),
  .screen-only {
    display: none !important;
  }

  .print-wrapper {
    max-width: none !important;
    padding: 0 !important;
  }

  .print-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .marshal-card {
    break-inside: avoid;
    box-shadow: none;
    min-height: 0;
    page-break-inside: avoid;
  }
}
</style>
