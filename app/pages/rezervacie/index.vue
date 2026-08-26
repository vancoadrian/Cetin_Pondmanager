<script setup lang="ts">
useHead({
  bodyAttrs: { class: 'overflow-x-hidden' },
  htmlAttrs: { class: 'overflow-x-hidden' },
})

usePublicSeo({
  title: 'Rezervácie',
  description: 'Vyberte jazero, termín, voľné lovné miesto alebo chatu a odošlite žiadosť o rezerváciu bez skrytých predvolieb.',
})

const {
  actionablePegs,
  availabilityCellClasses,
  availabilityLegend,
  availabilityOverviewDays,
  availabilityOverviewFreeCells,
  availabilityOverviewRangeLabel,
  availabilityOverviewRows,
  availabilityRows,
  availableExtras,
  blockedPegs,
  clearOfflineReservationEdit,
  contactInfo,
  discardOfflineReservation,
  editOfflineReservation,
  editingOfflineReservationId,
  enabledPaymentMethods,
  exportAvailabilityOverviewCsv,
  formatPlaceCount,
  formatReservationItemCount,
  freeCabins,
  getLakeName,
  getLivePegLabel,
  hasReservationDataError,
  isAvailabilityOverviewExpanded,
  isOnline,
  isPlaceListExpanded,
  isReservationDataLoading,
  lakes,
  liveReservations,
  mapTarget,
  offlineReservationEditDescription,
  offlineReservationQueue,
  offlineSyncMessage,
  offlineSyncStatus,
  permitProducts,
  publicAvailabilityReason,
  recommendedAvailableRow,
  recommendedPlaceActionLabel,
  rentalAvailabilityRows,
  requiredEquipment,
  reservationAccountHint,
  reservationCanSubmit,
  reservationChecklist,
  reservationContactEmail,
  reservationContactName,
  reservationContactPhone,
  reservationFrom,
  reservationRangeLabel,
  reservationServiceLines,
  reservationSubmitMessage,
  reservationSubmitNoticeTitle,
  reservationSubmitStatus,
  reservationTo,
  reservationValidationMessages,
  retryReservationData,
  scrollToReservationRequest,
  selectAvailabilityOverviewCell,
  selectRecommendedAvailablePlace,
  selectedAvailability,
  selectedCabin,
  selectedExtraIds,
  selectedLake,
  selectedPaymentMethodId,
  selectedPeg,
  selectedPegId,
  selectedPermitId,
  selectedPlaceIsUnavailable,
  selectedPlaceNoticeDescription,
  selectedPlaceNoticeTitle,
  selectedRentalIds,
  submitReservation,
  syncOfflineReservationQueue,
  syncableOfflineReservations,
} = await useReservationRequest()
</script>

<template>
  <div class="overflow-x-clip">
    <PageHeader
      eyebrow="Rezervácie"
      title="Vyberte si miesto a služby"
      description="Zvoľte termín, jazero, lovné miesto, povolenku a vybavenie, ktoré chcete mať pripravené pri príchode."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AvailabilityRangePicker
        id="vyber-rezervacie"
        v-model:date-from="reservationFrom"
        v-model:date-to="reservationTo"
        class="mb-5 scroll-mt-24"
      />

      <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="inline-flex rounded-lg bg-muted p-1">
          <button
            v-for="lake in lakes"
            :key="lake.slug"
            type="button"
            class="min-h-11 rounded-md px-4 py-2 text-sm font-semibold transition-colors"
            :class="
              selectedLake === lake.slug
                ? 'bg-surface text-primary-900 dark:text-primary-100 shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            "
            :aria-pressed="selectedLake === lake.slug"
            @click="selectedLake = lake.slug"
          >
            {{ lake.name }}
          </button>
        </div>

        <div class="grid grid-cols-3 gap-2 text-sm">
          <div class="rounded-md border border-border bg-surface px-3 py-2">
            <p class="text-foreground-muted text-xs">Voľné miesta</p>
            <p class="font-bold">{{ formatPlaceCount(actionablePegs.length) }}</p>
          </div>
          <div class="rounded-md border border-border bg-surface px-3 py-2">
            <p class="text-foreground-muted text-xs">Voľné chaty</p>
            <p class="font-bold">{{ freeCabins.length }}</p>
          </div>
          <div class="rounded-md border border-border bg-surface px-3 py-2">
            <p class="text-foreground-muted text-xs">Nedostupné</p>
            <p class="font-bold">{{ formatPlaceCount(blockedPegs.length) }}</p>
          </div>
        </div>
      </div>

      <DataStatusNotice
        v-if="isReservationDataLoading || hasReservationDataError"
        class="mb-5"
        :title="hasReservationDataError ? 'Dostupnosť sa nepodarilo obnoviť' : 'Načítavam dostupnosť miest'"
        :description="hasReservationDataError ? 'Zobrazujeme posledný dostupný stav rezervácií a lovných miest.' : 'Kontrolujeme aktuálne rezervácie, uzávierky a väzby miest na chaty.'"
        :tone="hasReservationDataError ? 'warning' : 'info'"
        :loading="isReservationDataLoading && !hasReservationDataError"
        :action-label="hasReservationDataError ? 'Skúsiť znova' : ''"
        :action-loading="isReservationDataLoading"
        @action="retryReservationData"
      />

      <DataStatusNotice
        v-if="selectedPlaceIsUnavailable || actionablePegs.length === 0"
        class="mb-5"
        :action-label="selectedPlaceIsUnavailable ? recommendedPlaceActionLabel : ''"
        :description="selectedPlaceNoticeDescription"
        :icon="selectedPlaceIsUnavailable ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-calendar-days'"
        :title="selectedPlaceNoticeTitle"
        tone="warning"
        @action="selectRecommendedAvailablePlace"
      />

      <div class="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div class="contents">
          <div class="border-border bg-surface order-1 min-w-0 rounded-card border p-5 lg:col-start-1 lg:row-start-1">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Lovné miesta a chaty</h2>
                <p class="text-foreground-muted text-sm">
                  Vyberte si voľné miesto pre zvolený termín. Pri miestach s povinnou chatou sa
                  ubytovanie pridá automaticky.
                </p>
              </div>
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                <UButton
                  v-if="selectedAvailability?.reservable"
                  data-testid="reservation-continue"
                  type="button"
                  icon="i-heroicons-arrow-right"
                  @click="scrollToReservationRequest"
                >
                  Pokračovať k žiadosti
                </UButton>
                <UButton
                  v-else-if="recommendedAvailableRow"
                  type="button"
                  icon="i-heroicons-check-circle"
                  variant="soft"
                  @click="selectRecommendedAvailablePlace"
                >
                  Vybrať {{ recommendedAvailableRow.peg.label }}
                </UButton>
                <UButton
                  v-if="selectedPeg"
                  type="button"
                  :icon="isPlaceListExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-pencil-square'"
                  variant="soft"
                  class="md:hidden"
                  @click="isPlaceListExpanded = !isPlaceListExpanded"
                >
                  {{ isPlaceListExpanded ? 'Skryť zoznam' : 'Zmeniť miesto' }}
                </UButton>
                <UButton :to="mapTarget" icon="i-heroicons-map-pin" variant="ghost">Mapa</UButton>
              </div>
            </div>

            <div
              v-if="selectedPeg && !isPlaceListExpanded"
              class="mt-5 rounded-md border border-primary-300 bg-primary-50 dark:bg-primary-950/50 p-4 md:hidden"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-bold">{{ selectedPeg.label }}</p>
                  <p class="mt-0.5 text-xs text-foreground-muted">
                    {{ selectedPeg.type === 'cabin' ? 'miesto s chatou' : 'lovné miesto' }} ·
                    {{ selectedPeg.capacity }} osoby
                  </p>
                </div>
                <AvailabilityBadge v-if="selectedAvailability" :availability="selectedAvailability" />
              </div>
              <p class="mt-3 text-sm text-foreground-muted">
                {{ selectedAvailability ? publicAvailabilityReason({ peg: selectedPeg, availability: selectedAvailability }) : '' }}
              </p>
            </div>

            <div
              class="mt-5 gap-3 md:grid md:grid-cols-2 xl:grid-cols-3"
              :class="isPlaceListExpanded || !selectedPeg ? 'grid' : 'hidden'"
            >
              <button
                v-for="row in availabilityRows"
                :key="row.peg.id"
                type="button"
                class="border-border rounded-md border p-4 text-left transition-colors hover:bg-muted"
                :class="selectedPegId === row.peg.id ? 'border-primary-600 bg-primary-50 dark:bg-primary-950/50' : 'bg-surface'"
                :aria-pressed="selectedPegId === row.peg.id"
                @click="selectedPegId = row.peg.id"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ row.peg.label }}</p>
                    <p class="text-foreground-muted text-xs">
                      {{ row.peg.type === 'cabin' ? 'miesto s chatou' : 'lovné miesto' }} ·
                      {{ row.peg.capacity }} osoby
                    </p>
                    <p v-if="row.peg.requiresCabinReservation" class="mt-1 text-xs font-semibold text-primary-800 dark:text-primary-200">
                      chata povinná
                    </p>
                  </div>
                  <AvailabilityBadge :availability="row.availability" />
                </div>
                <p class="text-foreground-muted mt-3 text-sm">
                  {{ publicAvailabilityReason(row) }}
                </p>
              </button>
            </div>
            <AppState
              v-if="availabilityRows.length === 0"
              title="Žiadne miesta"
              description="Pre vybrané jazero ešte nie sú evidované lovné miesta."
            />
          </div>

          <div class="border-border bg-surface order-3 min-w-0 rounded-card border p-5 lg:col-start-1 lg:row-start-2">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Povinná výbava pri vode</h2>
                <p class="text-foreground-muted text-sm">
                  Základ z pravidiel revíru, ktorý má rezervácia pripomenúť pred odoslaním.
                </p>
              </div>
              <UButton to="/info" icon="i-heroicons-information-circle" variant="ghost">
                Pravidlá
              </UButton>
            </div>

            <div class="mt-5 grid gap-3 md:grid-cols-2">
              <div
                v-for="item in requiredEquipment"
                :key="item.id"
                class="rounded-md border border-border bg-surface p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ item.label }}</p>
                    <p class="text-foreground-muted mt-1 text-sm">{{ item.detail }}</p>
                  </div>
                  <StatusBadge
                    class="shrink-0"
                    :icon="item.rentable ? 'i-heroicons-arrow-path-rounded-square' : 'i-heroicons-shield-check'"
                    :label="item.rentable ? 'požičateľné' : 'vlastné'"
                    size="xs"
                    :tone="item.rentable ? 'primary' : 'warning'"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="border-border bg-surface order-4 min-w-0 overflow-hidden rounded-card border p-5 lg:col-start-1 lg:row-start-3">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Dostupnosť po dňoch</h2>
                <p class="text-foreground-muted text-sm">
                  Najbližších 14 dní od zvoleného dátumu. Kliknutím na bunku vyberiete miesto aj deň.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  id="availability-overview-toggle"
                  type="button"
                  :icon="isAvailabilityOverviewExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                  variant="soft"
                  :aria-expanded="isAvailabilityOverviewExpanded"
                  aria-controls="availability-overview-table"
                  @click="isAvailabilityOverviewExpanded = !isAvailabilityOverviewExpanded"
                >
                  {{ isAvailabilityOverviewExpanded ? 'Skryť 14-dňový prehľad' : 'Zobraziť 14-dňový prehľad' }}
                </UButton>
                <UButton
                  icon="i-heroicons-arrow-down-tray"
                  variant="ghost"
                  :disabled="availabilityOverviewRows.length === 0"
                  @click="exportAvailabilityOverviewCsv"
                >
                  Stiahnuť prehľad
                </UButton>
              </div>
            </div>

            <div class="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              <div class="rounded-md border border-border bg-surface px-3 py-2">
                <p class="text-foreground-muted text-xs">Rozsah</p>
                <p class="font-bold">{{ availabilityOverviewRangeLabel }}</p>
              </div>
              <div class="rounded-md border border-border bg-surface px-3 py-2">
                <p class="text-foreground-muted text-xs">Jazero</p>
                <p class="font-bold">{{ getLakeName(selectedLake) }}</p>
              </div>
              <div class="rounded-md border border-border bg-surface px-3 py-2">
                <p class="text-foreground-muted text-xs">Voľné miesto-dni</p>
                <p class="font-bold">{{ availabilityOverviewFreeCells }}</p>
              </div>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <span
                v-for="item in availabilityLegend"
                :key="item.label"
                class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
                :class="item.classes"
              >
                <UIcon :name="item.icon" class="h-4 w-4" />
                {{ item.label }}
              </span>
            </div>

            <div
              v-if="isAvailabilityOverviewExpanded"
              id="availability-overview-table"
              role="region"
              aria-labelledby="availability-overview-toggle"
              class="mt-5 max-w-full overflow-x-auto rounded-md border border-border bg-surface [contain:layout_paint]"
            >
              <table class="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr class="bg-muted text-left">
                    <th class="sticky left-0 z-10 w-44 bg-muted px-3 py-3 font-semibold">
                      Miesto
                    </th>
                    <th
                      v-for="day in availabilityOverviewDays"
                      :key="day.iso"
                      class="border-border border-l px-2 py-3 text-center font-semibold"
                    >
                      <span class="text-foreground-muted block text-xs">{{ day.dayName }}</span>
                      <span>{{ day.dayNumber }} {{ day.monthName }}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in availabilityOverviewRows"
                    :key="row.peg.id"
                    class="border-border border-t"
                  >
                    <th class="sticky left-0 z-10 bg-surface px-3 py-3 text-left align-top">
                      <button
                        type="button"
                        class="text-left font-semibold hover:text-primary-800"
                        @click="selectedPegId = row.peg.id"
                      >
                        {{ row.peg.label }}
                      </button>
                      <p class="text-foreground-muted mt-1 text-xs font-normal">
                        {{ row.peg.type === 'cabin' ? 'miesto s chatou' : 'lovné miesto' }}
                      </p>
                    </th>
                    <td
                      v-for="cell in row.days"
                      :key="`${row.peg.id}-${cell.day.iso}`"
                      class="border-border border-l p-1"
                    >
                      <button
                        type="button"
                        class="flex h-9 w-full items-center justify-center rounded-md border transition-colors"
                        :class="availabilityCellClasses[cell.availability.status]"
                        :title="`${row.peg.label}, ${cell.day.iso}: ${cell.availability.label}. ${cell.availability.reasons[0] ?? ''}`"
                        @click="selectAvailabilityOverviewCell(row.peg.id, cell.day.iso)"
                      >
                        <UIcon :name="cell.availability.icon" class="h-4 w-4" />
                        <span class="sr-only">
                          {{ row.peg.label }} {{ cell.day.iso }} {{ cell.availability.label }}
                        </span>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside class="order-2 min-w-0 space-y-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-start">
          <div
            id="ziadost-rezervacie"
            tabindex="-1"
            aria-labelledby="ziadost-rezervacie-title"
            class="border-border bg-surface scroll-mt-24 rounded-card border p-5"
          >
            <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h2 id="ziadost-rezervacie-title" class="text-lg font-bold">Žiadosť o rezerváciu</h2>
              <UButton
                to="#vyber-rezervacie"
                icon="i-heroicons-pencil-square"
                size="sm"
                variant="ghost"
                class="shrink-0"
              >
                Upraviť výber
              </UButton>
            </div>

            <DataStatusNotice
              v-if="editingOfflineReservationId"
              class="mt-4"
              action-label="Ukončiť úpravu"
              :description="offlineReservationEditDescription"
              icon="i-heroicons-pencil-square"
              title="Upravujete čakajúcu žiadosť"
              tone="warning"
              @action="clearOfflineReservationEdit"
            />

            <div class="border-border mt-4 border-y py-4">
              <p class="text-foreground-muted text-xs font-semibold uppercase">Aktuálny výber</p>
              <div class="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between lg:flex-col xl:flex-row">
                <div class="min-w-0">
                  <p class="truncate text-xl font-black">
                    {{ selectedPeg?.label ?? 'Vyberte miesto' }}
                  </p>
                  <p class="text-foreground-muted mt-1 text-sm">
                    {{ getLakeName(selectedLake) }} · {{ reservationRangeLabel }}
                  </p>
                </div>
                <AvailabilityBadge v-if="selectedAvailability" :availability="selectedAvailability" />
              </div>
              <p class="text-foreground-muted mt-3 text-sm">
                Po odoslaní príde správcovi žiadosť s termínom, miestom, kontaktom a vybranými službami.
              </p>
            </div>

            <div class="border-border divide-border divide-y border-b">
              <div
                v-for="step in reservationChecklist"
                :key="step.id"
                class="flex items-start gap-3 py-3 text-sm"
              >
                <div
                  class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  :class="step.ready ? 'bg-success-500/10 text-success-700' : 'bg-warning-500/10 text-warning-800'"
                >
                  <UIcon :name="step.ready ? 'i-heroicons-check-circle' : step.icon" class="h-4 w-4" />
                </div>
                <div class="min-w-0">
                  <p class="font-bold">{{ step.title }}</p>
                  <p class="text-foreground-muted mt-0.5 break-words">{{ step.description }}</p>
                </div>
              </div>
            </div>

            <div
              v-if="!isOnline || offlineReservationQueue.length > 0 || offlineSyncMessage"
              class="mt-4 space-y-3"
            >
              <DataStatusNotice
                :action-label="syncableOfflineReservations.length > 0 && isOnline ? 'Odoslať ostatné' : ''"
                :action-loading="offlineSyncStatus === 'syncing'"
                :description="offlineSyncMessage || 'Pri výpadku signálu podržíme žiadosť v zariadení a odošleme ju hneď po návrate internetu.'"
                :icon="isOnline ? 'i-heroicons-cloud-arrow-up' : 'i-heroicons-signal-slash'"
                :loading="offlineSyncStatus === 'syncing'"
                :title="
                  !isOnline
                    ? 'Bez pripojenia pri rezervácii'
                    : offlineSyncStatus === 'syncing'
                      ? 'Odosielam čakajúce rezervácie'
                      : 'Čakajúce rezervácie v zariadení'
                "
                :tone="
                  offlineSyncStatus === 'error' || !isOnline
                    ? 'warning'
                    : offlineSyncStatus === 'success'
                      ? 'success'
                      : 'info'
                "
                @action="syncOfflineReservationQueue()"
              />

              <div
                v-if="offlineReservationQueue.length > 0"
                class="space-y-2 rounded-md border border-border bg-muted/50 p-3"
              >
                <div
                  v-for="item in offlineReservationQueue"
                  :key="item.id"
                  class="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm text-foreground"
                  :class="editingOfflineReservationId === item.id ? 'border-warning-300 bg-warning-50' : 'border-transparent bg-white/70'"
                >
                  <div class="min-w-0">
                    <p class="truncate font-bold">
                      {{ item.payload.contactName }} · {{ getLivePegLabel(item.payload.pegId) }}
                    </p>
                    <p class="text-foreground-muted mt-0.5 text-xs">
                      {{ item.payload.dateFrom }} až {{ item.payload.dateTo }} ·
                      {{ getLakeName(item.payload.lake) }}
                    </p>
                    <p v-if="item.lastError" class="mt-1 text-xs font-semibold text-error-700">
                      {{ item.lastError }}
                    </p>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      class="rounded-md p-1.5"
                      :class="editingOfflineReservationId === item.id ? 'text-warning-800' : 'text-foreground-muted hover:text-primary-800'"
                      :aria-label="editingOfflineReservationId === item.id ? 'Táto čakajúca rezervácia sa upravuje' : 'Upraviť čakajúcu rezerváciu'"
                      :title="editingOfflineReservationId === item.id ? 'Práve upravujete' : 'Upraviť žiadosť'"
                      @click="editOfflineReservation(item)"
                    >
                      <UIcon name="i-heroicons-pencil-square" class="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      class="text-foreground-muted hover:text-error-700 rounded-md p-1.5"
                      aria-label="Odstrániť čakajúcu rezerváciu"
                      title="Odstrániť zo zariadenia"
                      @click="discardOfflineReservation(item.id)"
                    >
                      <UIcon name="i-heroicons-trash" class="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <form class="mt-5 space-y-5" @submit.prevent="submitReservation">
              <div
                v-if="selectedAvailability"
                class="rounded-md border p-4"
                :class="selectedAvailability.classes"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-bold">Dostupnosť miesta</p>
                    <p class="mt-1 text-sm">{{ selectedAvailability.description }}</p>
                    <p class="mt-2 text-xs font-semibold">{{ selectedAvailability.reasons[0] }}</p>
                    <p v-if="selectedPeg?.requiresCabinReservation" class="mt-2 text-xs font-semibold">
                      Toto miesto sa rezervuje spolu s chatou.
                    </p>
                    <UButton
                      v-if="selectedPlaceIsUnavailable && recommendedAvailableRow"
                      type="button"
                      class="mt-3"
                      icon="i-heroicons-check-circle"
                      size="sm"
                      variant="soft"
                      @click="selectRecommendedAvailablePlace"
                    >
                      Prepnúť na {{ recommendedAvailableRow.peg.label }}
                    </UButton>
                  </div>
                  <UIcon :name="selectedAvailability.icon" class="mt-0.5 h-5 w-5 shrink-0" />
                </div>
              </div>

              <div v-if="selectedCabin" class="rounded-md border border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/50 p-4">
                <p class="text-sm font-bold text-primary-900 dark:text-primary-100">{{ selectedCabin.label }}</p>
                <p class="text-primary-800 dark:text-primary-200 mt-1 text-sm">
                  {{ selectedCabin.pricePer24hEur }} € / 24 h · minimum
                  {{ selectedCabin.minimumHours }} h · kapacita {{ selectedCabin.capacity }}
                </p>
                <p class="text-primary-800 dark:text-primary-200 mt-2 text-xs">
                  {{ selectedCabin.requiresPermitNote }}
                </p>
              </div>

              <fieldset class="min-w-0">
                <legend class="text-sm font-semibold">Povolenka</legend>
                <div class="mt-2 grid gap-2">
                  <label
                    v-for="permit in permitProducts"
                    :key="permit.id"
                    class="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-3 transition-colors hover:bg-muted"
                    :class="selectedPermitId === permit.id ? 'border-primary-600 bg-primary-50 dark:bg-primary-950/50' : ''"
                  >
                    <input
                      v-model="selectedPermitId"
                      type="radio"
                      name="permit"
                      :value="permit.id"
                      class="mt-1 h-4 w-4 accent-primary-700"
                    >
                    <span class="min-w-0 flex-1">
                      <span class="block font-semibold">{{ permit.label }}</span>
                      <span class="text-foreground-muted block text-sm">
                        {{ permit.priceEur }} € · {{ permit.durationHours }} h
                      </span>
                      <span v-if="permit.note" class="text-primary-800 dark:text-primary-200 mt-1 block text-xs">
                        {{ permit.note }}
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>

              <fieldset class="min-w-0">
                <legend class="text-sm font-semibold">Požičovňa výbavy</legend>
                <div class="mt-2 grid gap-2">
                  <label
                    v-for="row in rentalAvailabilityRows"
                    :key="row.item.id"
                    class="flex items-start gap-3 rounded-md border p-3 transition-colors"
                    :class="
                      selectedRentalIds.includes(row.item.id)
                        ? 'border-primary-600 bg-primary-50 dark:bg-primary-950/50'
                        : !row.availability.reservable
                          ? 'cursor-not-allowed border-error-500/25 bg-error-500/5 opacity-80'
                          : 'cursor-pointer border-border bg-surface hover:bg-muted'
                    "
                    :aria-disabled="!row.availability.reservable"
                  >
                    <input
                      v-model="selectedRentalIds"
                      type="checkbox"
                      :value="row.item.id"
                      :disabled="!row.availability.reservable"
                      class="mt-1 h-4 w-4 rounded accent-primary-700"
                    >
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center justify-between gap-2">
                        <span class="font-semibold">{{ row.item.label }}</span>
                        <span
                          class="rounded-full border px-2 py-0.5 text-xs font-semibold"
                          :class="row.availability.classes"
                        >
                          {{ row.availability.label }}
                        </span>
                      </span>
                      <span class="text-foreground-muted mt-1 block text-sm">
                        {{ row.item.description }}
                      </span>
                      <span class="text-primary-800 dark:text-primary-200 mt-1 block text-xs">{{ row.item.priceLabel }}</span>
                      <span class="text-foreground-muted mt-1 block text-xs">
                        {{ row.availability.availableQuantity }} z {{ row.availability.stock }} ks voľné ·
                        {{ row.availability.reasons[0] }}
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>

              <fieldset v-if="availableExtras.length" class="min-w-0">
                <legend class="text-sm font-semibold">Doplnky k rezervácii</legend>
                <div class="mt-2 grid gap-2">
                  <label
                    v-for="extra in availableExtras"
                    :key="extra.id"
                    class="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-3 transition-colors hover:bg-muted"
                  >
                    <input
                      v-model="selectedExtraIds"
                      type="checkbox"
                      :value="extra.id"
                      class="mt-1 h-4 w-4 rounded accent-primary-700"
                    >
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center justify-between gap-2">
                        <span class="font-semibold">{{ extra.label }}</span>
                        <StatusBadge
                          :icon="extra.source === 'web' ? 'i-heroicons-building-storefront' : 'i-heroicons-plus-circle'"
                          :label="extra.source === 'web' ? 'služba revíru' : 'doplnok'"
                          size="xs"
                          :tone="extra.source === 'web' ? 'success' : 'warning'"
                        />
                      </span>
                      <span class="text-foreground-muted mt-1 block text-sm">
                        {{ extra.description }}
                      </span>
                      <span class="text-primary-800 dark:text-primary-200 mt-1 block text-xs">{{ extra.priceLabel }}</span>
                    </span>
                  </label>
                </div>
              </fieldset>

              <fieldset class="min-w-0">
                <legend class="text-sm font-semibold">Kontaktné údaje</legend>
                <div class="mt-2 grid gap-3 sm:grid-cols-2">
                  <div
                    v-if="reservationAccountHint"
                    class="rounded-md border border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/50 p-3 text-sm text-primary-950 dark:text-primary-100 sm:col-span-2"
                  >
                    <div class="flex items-start gap-2">
                      <UIcon name="i-heroicons-user-circle" class="mt-0.5 h-5 w-5 shrink-0 text-primary-700" />
                      <div>
                        <p class="font-bold">Rezervácia sa uloží k vášmu účtu</p>
                        <p class="mt-1 text-primary-800 dark:text-primary-200">{{ reservationAccountHint }}</p>
                      </div>
                    </div>
                  </div>

                  <label class="block">
                    <span class="text-sm font-semibold">Meno</span>
                    <input
                      v-model="reservationContactName"
                      type="text"
                      autocomplete="name"
                      class="border-border mt-1 h-11 w-full rounded-md border bg-surface px-3 text-sm"
                      placeholder="Meno a priezvisko"
                      required
                    >
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">E-mail</span>
                    <input
                      v-model="reservationContactEmail"
                      type="email"
                      autocomplete="email"
                      class="border-border mt-1 h-11 w-full rounded-md border bg-surface px-3 text-sm"
                      placeholder="meno@example.com"
                    >
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Telefón</span>
                    <input
                      v-model="reservationContactPhone"
                      type="tel"
                      autocomplete="tel"
                      class="border-border mt-1 h-11 w-full rounded-md border bg-surface px-3 text-sm"
                      placeholder="+421 ..."
                      required
                    >
                  </label>
                </div>
              </fieldset>

              <div class="rounded-md bg-muted p-4 text-sm">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-bold">Vybrané služby</p>
                    <p class="text-foreground-muted mt-1">
                      {{ formatReservationItemCount(reservationServiceLines.length) }} v žiadosti.
                    </p>
                  </div>
                  <UIcon name="i-heroicons-clipboard-document-check" class="text-primary-800 dark:text-primary-200 h-5 w-5 shrink-0" />
                </div>
                <div class="border-border divide-border mt-3 divide-y border-y">
                  <div
                    v-for="line in reservationServiceLines"
                    :key="line.id"
                    class="flex items-start gap-3 py-3"
                  >
                    <UIcon :name="line.icon" class="text-primary-800 dark:text-primary-200 mt-0.5 h-4 w-4 shrink-0" />
                    <div class="min-w-0">
                      <p class="font-semibold">{{ line.label }}</p>
                      <p class="text-foreground-muted mt-0.5">{{ line.meta }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <fieldset class="min-w-0 rounded-md border border-border bg-surface p-4 text-sm">
                <legend class="px-1 font-bold">Spôsob platby (povinné)</legend>
                <p id="payment-method-help" class="text-foreground-muted mt-1">
                  Platobné pokyny dostanete až po potvrdení rezervácie správcom.
                </p>
                <div v-if="enabledPaymentMethods.length" class="mt-3 grid gap-2">
                  <label
                    v-for="method in enabledPaymentMethods"
                    :key="method.id"
                    class="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors"
                    :class="selectedPaymentMethodId === method.id ? 'border-primary-600 bg-primary-50 dark:bg-primary-950/50' : 'border-border bg-surface hover:bg-muted'"
                  >
                    <input
                      v-model="selectedPaymentMethodId"
                      :data-testid="`payment-method-${method.id}`"
                      type="radio"
                      name="payment-method"
                      :value="method.id"
                      aria-describedby="payment-method-help"
                      required
                      class="mt-1 h-4 w-4 accent-primary-700"
                    >
                    <UIcon
                      :name="method.kind === 'cash' ? 'i-heroicons-banknotes' : method.kind === 'bank-transfer' ? 'i-heroicons-building-library' : 'i-heroicons-credit-card'"
                      class="text-primary-800 dark:text-primary-200 mt-0.5 h-5 w-5 shrink-0"
                    />
                    <div class="min-w-0">
                      <p class="font-semibold">{{ method.label }}</p>
                      <p class="text-foreground-muted">{{ method.instructions }}</p>
                    </div>
                  </label>
                </div>
                <AppState
                  v-else
                  class="mt-3"
                  title="Platba sa dohodne so správcom"
                  description="Momentálne nie je zapnutý žiadny spôsob platby v aplikácii."
                />
              </fieldset>

              <ValidationSummary
                :messages="reservationValidationMessages"
                valid-title="Žiadosť je pripravená"
                valid-description="Termín, miesto, kontakt a vybrané služby sú vyplnené."
              />

              <DataStatusNotice
                v-if="reservationSubmitMessage"
                :description="reservationSubmitMessage"
                :loading="reservationSubmitStatus === 'submitting'"
                :title="reservationSubmitNoticeTitle"
                :tone="
                  reservationSubmitStatus === 'error'
                    ? 'error'
                    : reservationSubmitStatus === 'submitting'
                      ? 'info'
                      : 'success'
                "
              />

              <UButton
                type="submit"
                icon="i-heroicons-paper-airplane"
                block
                :disabled="!reservationCanSubmit || reservationSubmitStatus === 'submitting'"
                :loading="reservationSubmitStatus === 'submitting'"
              >
                {{ editingOfflineReservationId ? 'Odoslať opravenú žiadosť' : 'Odoslať žiadosť' }}
              </UButton>
            </form>
          </div>

          <div class="border-border bg-primary-900 rounded-card border p-5 text-white">
            <h2 class="text-lg font-bold">Kontakt na rezervácie</h2>
            <p class="mt-3 text-sm text-white/75">
              {{ contactInfo.managerName }} · {{ contactInfo.role }}
            </p>
            <div class="mt-4 space-y-2 text-sm">
              <a :href="`tel:${contactInfo.phoneHref}`" class="flex items-center gap-2 hover:text-accent-300">
                <UIcon name="i-heroicons-phone" class="h-4 w-4" />
                {{ contactInfo.phoneDisplay }}
              </a>
              <p v-for="hour in contactInfo.phoneHours" :key="hour" class="flex items-center gap-2">
                <UIcon name="i-heroicons-clock" class="h-4 w-4" />
                {{ hour }}
              </p>
            </div>
          </div>

          <div class="border-border bg-surface hidden rounded-card border p-5 lg:block">
            <h2 class="text-lg font-bold">Aktuálne rezervácie</h2>
            <div class="mt-4 space-y-3">
              <div v-for="reservation in liveReservations" :key="reservation.id" class="bg-muted rounded-md p-3">
                <p class="font-semibold">{{ getLivePegLabel(reservation.pegId) }}</p>
                <p class="text-foreground-muted text-sm">
                  {{ getLakeName(reservation.lake) }} · {{ reservation.from }} až {{ reservation.to }}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
