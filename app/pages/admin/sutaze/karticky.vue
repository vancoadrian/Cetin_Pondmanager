<script setup lang="ts">
import type { TournamentStateResponse } from '~/services/tournamentApiService'
import { createQrCodeDataUrl } from '~/utils/qrCode'
import {
  getTournamentTeamAccessRows,
} from '~/utils/tournamentTeamAccess'

useHead({ title: 'Tímové kartičky' })

const route = useRoute()
const requestUrl = useRequestURL()

const {
  getLakeName,
  tournaments: seedTournaments,
  tournamentCatches: seedTournamentCatches,
  tournamentMarshals: seedTournamentMarshals,
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
  'admin-tournament-team-cards-state',
  () => requestFetch<TournamentStateResponse>('/api/admin/tournaments'),
  {
    default: fallbackTournamentState,
  },
)

const liveTournaments = computed(() => tournamentState.value?.tournaments ?? seedTournaments)
const requestedTournamentId = computed(() =>
  Array.isArray(route.query.turnaj) ? route.query.turnaj[0] : route.query.turnaj,
)
const activeTournament = computed(() =>
  liveTournaments.value.find((tournament) => tournament.id === requestedTournamentId.value)
  ?? liveTournaments.value.find((tournament) => tournament.status === 'live')
  ?? liveTournaments.value[0]
  ?? seedTournaments[0]!,
)
const teamAccessRows = computed(() => getTournamentTeamAccessRows(activeTournament.value))
const adminTournamentUrl = computed(() => `/admin/sutaze?turnaj=${encodeURIComponent(activeTournament.value.id)}`)

const absoluteTeamAccessUrl = (path: string) =>
  new URL(path, import.meta.client ? window.location.origin : requestUrl.origin).toString()

const { data: qrCodeBySector, refresh: refreshQrCodes } = await useAsyncData<Record<string, string>>(
  'admin-tournament-team-cards-qr',
  async () => Object.fromEntries(
    await Promise.all(
      getTournamentTeamAccessRows(activeTournament.value).map(async (row) => [
        row.sectorId,
        await createQrCodeDataUrl(absoluteTeamAccessUrl(row.codeUrl), { scale: 7 }),
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

watch(activeTournament, () => {
  void refreshQrCodes()
})
</script>

<template>
  <div>
    <div class="screen-only">
      <PageHeader
        eyebrow="Admin súťaže"
        title="Tímové kartičky"
        :description="`${activeTournament.name} · ${getLakeName(activeTournament.lake)} · ${activeTournament.dateRange}`"
      />

      <section class="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        <AdminModuleNav />

        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 class="text-lg font-bold">Tlačové podklady pre tímy</h2>
              <p class="text-foreground-muted mt-1 text-sm">
                Každá kartička obsahuje sektor, tímový kód, QR link a stručné pokyny pre tím.
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
          v-for="row in teamAccessRows"
          :key="row.sectorId"
          class="team-card"
        >
          <div class="team-card__header">
            <div>
              <p class="team-card__eyebrow">Rybolov Cetín · súťažný panel</p>
              <h2>{{ row.sectorLabel }}</h2>
              <p>{{ row.teamName }}</p>
            </div>
            <span>{{ activeTournament.name }}</span>
          </div>

          <div class="team-card__body">
            <div class="team-card__qr">
              <img
                v-if="qrCodeBySector?.[row.sectorId]"
                :src="qrCodeBySector[row.sectorId]"
                :alt="`QR kód pre sektor ${row.sectorLabel}`"
              >
              <div v-else class="team-card__qr-placeholder">
                QR sa pripravuje
              </div>
            </div>

            <div class="team-card__access">
              <p class="team-card__label">Tímový kód</p>
              <p class="team-card__code">{{ row.code }}</p>
              <p class="team-card__url">{{ absoluteTeamAccessUrl(row.codeUrl) }}</p>
            </div>
          </div>

          <div class="team-card__footer">
            <span>Meranie úlovku</span>
            <span>Porušenie pravidiel</span>
            <span>Technická pomoc</span>
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

.team-card {
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

.team-card__header {
  align-items: flex-start;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.team-card__header h2 {
  font-size: 34px;
  font-weight: 900;
  line-height: 1;
  margin: 3px 0 4px;
}

.team-card__header p {
  color: #4f6560;
  font-size: 13px;
  font-weight: 700;
  margin: 0;
}

.team-card__header span {
  background: #e7f4ee;
  border-radius: 6px;
  color: #16483f;
  font-size: 11px;
  font-weight: 800;
  max-width: 130px;
  padding: 6px 8px;
  text-align: right;
}

.team-card__eyebrow {
  color: #1a7466 !important;
  font-size: 11px !important;
  letter-spacing: 0 !important;
  text-transform: uppercase;
}

.team-card__body {
  align-items: center;
  display: grid;
  gap: 18px;
  grid-template-columns: 136px 1fr;
}

.team-card__qr {
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

.team-card__qr img {
  height: 100%;
  width: 100%;
}

.team-card__qr-placeholder {
  color: #4f6560;
  font-size: 12px;
  font-weight: 800;
  text-align: center;
}

.team-card__access {
  min-width: 0;
}

.team-card__label {
  color: #4f6560;
  font-size: 11px;
  font-weight: 800;
  margin: 0;
  text-transform: uppercase;
}

.team-card__code {
  background: #062523;
  border-radius: 6px;
  color: #f5c057;
  font-size: 22px;
  font-weight: 900;
  margin: 8px 0;
  overflow-wrap: anywhere;
  padding: 10px 12px;
}

.team-card__url {
  color: #4f6560;
  font-size: 11px;
  font-weight: 700;
  margin: 0;
  overflow-wrap: anywhere;
}

.team-card__footer {
  border-top: 1px solid #d8e1de;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 12px;
}

.team-card__footer span {
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

  .team-card {
    break-inside: avoid;
    box-shadow: none;
    min-height: 0;
    page-break-inside: avoid;
  }
}
</style>
