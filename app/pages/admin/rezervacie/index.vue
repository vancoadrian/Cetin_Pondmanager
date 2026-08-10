<script setup lang="ts">
import {
  reservationCommunicationDeliveryProviderLabels,
  reservationCommunicationDeliveryStatusLabels,
} from '~/services/reservationWorkflowService'

useHead({ title: 'Admin rezervácie' })

const {
  activeReservationAdminView,
  adminNoteDraft,
  adminReservationAvailability,
  adminReservationAvailableExtras,
  adminReservationCabin,
  adminReservationCanSubmit,
  adminReservationDraft,
  adminReservationPegs,
  adminReservationRentalRows,
  adminReservationSubmitMessage,
  adminReservationSubmitStatus,
  buildMailtoHref,
  buildSmsHref,
  calendarCellClass,
  calendarDays,
  calendarDaySummaries,
  calendarGridTemplate,
  calendarLake,
  calendarMode,
  calendarRangeLabel,
  calendarRows,
  calendarStart,
  calendarSummary,
  calendarTableMinWidth,
  canOperateReservations,
  conflictingClosures,
  decisionCommunicationDelivery,
  decisionCommunicationDraft,
  decisionMode,
  decisionSubmitMessage,
  decisionSubmitStatus,
  decisionSummary,
  deliveryStatusIcon,
  deliveryStatusTone,
  draftReservationStatusIcon,
  draftReservationStatusTone,
  enabledPaymentMethods,
  filteredReservations,
  formatDateTime,
  getLakeName,
  getLivePegLabel,
  getReservationNotificationDeliveryBadges,
  handlePaymentMethodToggle,
  handleReservationAdminTabKeydown,
  moveCalendar,
  notificationBroadcastStatusLabels,
  paymentMethodDraft,
  paymentMethodIcon,
  paymentMethodSubmitMessage,
  paymentMethodSubmitStatus,
  paymentMethodTone,
  pegAvailabilityRows,
  permitProducts,
  rentalAvailabilityIcon,
  rentalAvailabilityTone,
  rentalBookingStatusLabel,
  reservationAccessLabel,
  reservationAdminTabClass,
  reservationAdminTabScrollerElement,
  reservationAdminViewTabs,
  reservationDetailElement,
  reservationLakeFilter,
  reservationReadOnlyMessage,
  reservationsReadOnly,
  reservationStats,
  saveDecision,
  savePaymentMethodSettings,
  selectCalendarCell,
  selectedAvailability,
  selectedCabin,
  selectedClosureConflicts,
  selectedExtras,
  selectedPeg,
  selectedPermit,
  selectedRentalRows,
  selectedReservation,
  selectedReservationId,
  selectedReservationNotification,
  selectReservation,
  selectReservationAdminView,
  setCalendarMode,
  showCalendarContext,
  sourceIcon,
  sourceLabel,
  statusIcon,
  statusLabel,
  statusTone,
  submitAdminReservation,
  workflowMessage,
} = await useAdminReservationCalendar()
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Rezervácie a dostupnosť"
      description="Pracovisko správcu pre schvaľovanie rezervácií, kontrolu konfliktov, doplnkov a interných poznámok."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div
        v-if="reservationsReadOnly"
        class="mb-5 rounded-card border border-info-500/25 bg-info-500/10 p-4 text-info-700"
      >
        <p class="text-sm font-bold">Režim prístupu: {{ reservationAccessLabel }}</p>
        <p class="mt-1 text-sm">{{ reservationReadOnlyMessage }}</p>
      </div>

      <nav
        ref="reservationAdminTabScrollerElement"
        aria-label="Pracovné pohľady rezervácií"
        class="mt-6 overflow-x-auto border-b border-border"
      >
        <div role="tablist" aria-label="Rezervácie" class="flex min-w-max gap-1">
          <button
            v-for="(view, index) in reservationAdminViewTabs"
            :id="`reservation-admin-tab-${view.value}`"
            :key="view.value"
            type="button"
            role="tab"
            aria-controls="reservation-admin-panel"
            :aria-selected="activeReservationAdminView === view.value"
            :tabindex="activeReservationAdminView === view.value ? 0 : -1"
            class="flex min-h-11 items-center gap-2 border-b-2 px-3 py-2 text-sm font-bold transition-colors"
            :class="reservationAdminTabClass(activeReservationAdminView === view.value)"
            @click="selectReservationAdminView(view.value)"
            @keydown="handleReservationAdminTabKeydown($event, index)"
          >
            <UIcon :name="view.icon" class="h-4 w-4 shrink-0" />
            <span>{{ view.label }}</span>
            <span
              v-if="view.count !== undefined"
              class="min-w-5 rounded-full bg-warning-500/15 px-1.5 py-0.5 text-center text-xs font-bold text-warning-800"
            >
              {{ view.count }}
            </span>
          </button>
        </div>
      </nav>

      <div
        id="reservation-admin-panel"
        role="tabpanel"
        :aria-labelledby="`reservation-admin-tab-${activeReservationAdminView}`"
      >
        <div
          v-if="activeReservationAdminView === 'ziadosti'"
          class="mt-5 flex flex-col gap-4 rounded-md border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <span class="flex items-center gap-2">
              <UIcon name="i-heroicons-clock" class="h-4 w-4 text-warning-700" />
              <strong>{{ reservationStats.pending }}</strong> čaká
            </span>
            <span class="flex items-center gap-2">
              <UIcon name="i-heroicons-check-circle" class="h-4 w-4 text-success-700" />
              <strong>{{ reservationStats.confirmed }}</strong> potvrdené
            </span>
            <span class="flex items-center gap-2">
              <UIcon name="i-heroicons-globe-alt" class="h-4 w-4 text-primary-700" />
              <strong>{{ reservationStats.web }}</strong> z webu
            </span>
            <span v-if="reservationStats.blocked" class="flex items-center gap-2">
              <UIcon name="i-heroicons-no-symbol" class="h-4 w-4 text-error-700" />
              <strong>{{ reservationStats.blocked }}</strong> blokované
            </span>
          </div>
          <UButton icon="i-heroicons-plus" variant="soft" @click="selectReservationAdminView('nova')">
            Nová rezervácia
          </UButton>
        </div>

      <div
        v-if="activeReservationAdminView === 'nastavenia'"
        class="mt-5 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Platobné metódy rezervácií</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Zapnuté možnosti sa zobrazia rybárom aj správcovi pri vytváraní rezervácie.
            </p>
          </div>
          <UButton
            icon="i-heroicons-check"
            variant="soft"
            :disabled="!canOperateReservations || paymentMethodSubmitStatus === 'submitting'"
            :loading="paymentMethodSubmitStatus === 'submitting'"
            @click="savePaymentMethodSettings"
          >
            Uložiť platby
          </UButton>
        </div>
        <div class="mt-4 grid gap-3 md:grid-cols-3">
          <label
            v-for="method in paymentMethodDraft"
            :key="method.id"
            class="flex min-h-32 flex-col justify-between rounded-md border border-border bg-white p-4"
          >
            <span>
              <span class="flex items-start justify-between gap-3">
                <span>
                  <span class="block font-bold">{{ method.label }}</span>
                  <span class="text-foreground-muted mt-1 block text-sm">{{ method.instructions }}</span>
                </span>
                <input
                  :checked="method.enabled"
                  type="checkbox"
                  :disabled="!canOperateReservations"
                  class="mt-1 h-5 w-5 accent-primary-700"
                  @change="handlePaymentMethodToggle(method.id, $event)"
                >
              </span>
            </span>
            <StatusBadge
              class="mt-4 w-fit"
              :icon="paymentMethodIcon(method.enabled)"
              :label="method.enabled ? 'zapnuté' : 'vypnuté'"
              size="xs"
              :tone="paymentMethodTone(method.enabled)"
            />
          </label>
        </div>
        <DataStatusNotice
          v-if="paymentMethodSubmitMessage"
          class="mt-4"
          :description="paymentMethodSubmitMessage"
          :title="paymentMethodSubmitStatus === 'error' ? 'Platobné metódy sa nepodarilo uložiť' : 'Platobné metódy sú uložené'"
          :tone="paymentMethodSubmitStatus === 'error' ? 'error' : 'success'"
        />
      </div>

      <div
        v-if="activeReservationAdminView === 'nova'"
        class="mt-5 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Nová rezervácia správcu</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Pre telefonát, osobnú dohodu alebo internú blokáciu bez toho, aby správca vypĺňal public formulár.
            </p>
          </div>
          <StatusBadge
            class="w-fit"
            :icon="draftReservationStatusIcon"
            :label="adminReservationDraft.status === 'confirmed' ? 'uloží sa ako potvrdená' : 'uloží sa ako čakajúca'"
            :tone="draftReservationStatusTone"
          />
        </div>

        <form class="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]" @submit.prevent="submitAdminReservation">
          <fieldset :disabled="!canOperateReservations" class="grid gap-4 md:grid-cols-2">
            <label class="block">
              <span class="text-sm font-semibold">Meno hosťa</span>
              <input
                v-model="adminReservationDraft.contactName"
                required
                class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                placeholder="napr. Peter Novák"
              >
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Telefón</span>
              <input
                v-model="adminReservationDraft.contactPhone"
                required
                class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                placeholder="+421 ..."
              >
            </label>
            <label class="block">
              <span class="text-sm font-semibold">E-mail</span>
              <input
                v-model="adminReservationDraft.contactEmail"
                type="email"
                autocomplete="email"
                class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                placeholder="meno@example.com"
              >
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Zdroj</span>
              <select v-model="adminReservationDraft.source" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                <option value="phone">Telefonát</option>
                <option value="admin">Admin / osobne</option>
              </select>
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Stav po uložení</span>
              <select v-model="adminReservationDraft.status" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                <option value="pending">Čaká na potvrdenie</option>
                <option value="confirmed">Rovno potvrdená</option>
              </select>
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Jazero</span>
              <select v-model="adminReservationDraft.lake" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                <option value="velky-cetin">Veľký Cetín</option>
                <option value="strkovisko-kocka">Štrkovisko Kocka</option>
              </select>
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Lovné miesto</span>
              <select v-model="adminReservationDraft.pegId" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                <option v-for="peg in adminReservationPegs" :key="peg.id" :value="peg.id">
                  {{ peg.label }} · {{ peg.type === 'cabin' ? 's chatou' : 'miesto' }}
                </option>
              </select>
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Od</span>
              <input v-model="adminReservationDraft.dateFrom" required type="date" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Do</span>
              <input v-model="adminReservationDraft.dateTo" required type="date" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Povolenka</span>
              <select v-model="adminReservationDraft.permitId" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                <option v-for="permit in permitProducts" :key="permit.id" :value="permit.id">
                  {{ permit.label }} · {{ permit.priceEur }} €
                </option>
              </select>
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Platba</span>
              <select v-model="adminReservationDraft.paymentMethodId" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                <option value="">Bez platby v zázname</option>
                <option v-for="method in enabledPaymentMethods" :key="method.id" :value="method.id">
                  {{ method.label }}
                </option>
              </select>
            </label>
            <label class="block md:col-span-2">
              <span class="text-sm font-semibold">Interná poznámka</span>
              <textarea
                v-model="adminReservationDraft.internalNote"
                rows="3"
                class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                placeholder="napr. potvrdené telefonicky, príchod večer, drevo pripraviť pri chate..."
              />
            </label>
          </fieldset>

          <div class="space-y-4">
            <div
              v-if="adminReservationAvailability"
              class="rounded-md border p-4"
              :class="adminReservationAvailability.classes"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-bold">{{ adminReservationAvailability.label }}</p>
                  <p class="mt-1 text-sm">{{ adminReservationAvailability.description }}</p>
                  <p class="mt-2 text-xs font-semibold">{{ adminReservationAvailability.reasons[0] }}</p>
                </div>
                <UIcon :name="adminReservationAvailability.icon" class="mt-0.5 h-5 w-5 shrink-0" />
              </div>
            </div>

            <div v-if="adminReservationCabin" class="rounded-md bg-primary-50 p-4 text-primary-900">
              <p class="text-sm font-bold">{{ adminReservationCabin.label }}</p>
              <p class="mt-1 text-xs text-primary-800">
                {{ adminReservationCabin.pricePer24hEur }} € / 24 h · kapacita {{ adminReservationCabin.capacity }}
              </p>
            </div>

            <div>
              <p class="text-sm font-semibold">Požičovňa</p>
              <div class="mt-2 grid gap-2 sm:grid-cols-2">
                <label
                  v-for="row in adminReservationRentalRows"
                  :key="row.item.id"
                  class="flex items-start gap-2 rounded-md border border-border bg-white p-3 text-sm"
                  :class="!row.availability.reservable ? 'opacity-55' : ''"
                >
                  <input
                    v-model="adminReservationDraft.rentalIds"
                    type="checkbox"
                    :value="row.item.id"
                    :disabled="!canOperateReservations || !row.availability.reservable"
                    class="mt-0.5 h-4 w-4 accent-primary-700"
                  >
                  <span>
                    <span class="block font-semibold">{{ row.item.label }}</span>
                    <span class="text-foreground-muted block text-xs">
                      {{ row.availability.label }} · {{ row.item.priceLabel }}
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div>
              <p class="text-sm font-semibold">Doplnky</p>
              <div class="mt-2 grid gap-2 sm:grid-cols-2">
                <label
                  v-for="extra in adminReservationAvailableExtras"
                  :key="extra.id"
                  class="flex items-start gap-2 rounded-md border border-border bg-white p-3 text-sm"
                >
                  <input
                    v-model="adminReservationDraft.extraIds"
                    type="checkbox"
                    :value="extra.id"
                    :disabled="!canOperateReservations"
                    class="mt-0.5 h-4 w-4 accent-primary-700"
                  >
                  <span>
                    <span class="block font-semibold">{{ extra.label }}</span>
                    <span class="text-foreground-muted block text-xs">{{ extra.priceLabel }}</span>
                  </span>
                </label>
              </div>
            </div>

            <UButton
              type="submit"
              icon="i-heroicons-calendar-days"
              block
              :disabled="!canOperateReservations || !adminReservationCanSubmit || adminReservationSubmitStatus === 'submitting'"
              :loading="adminReservationSubmitStatus === 'submitting'"
            >
              Vytvoriť rezerváciu
            </UButton>
            <DataStatusNotice
              v-if="adminReservationSubmitMessage"
              :description="adminReservationSubmitMessage"
              :title="adminReservationSubmitStatus === 'error' ? 'Rezerváciu sa nepodarilo vytvoriť' : 'Rezervácia je vytvorená'"
              :tone="adminReservationSubmitStatus === 'error' ? 'error' : 'success'"
            />
          </div>
        </form>
      </div>

      <div
        v-if="activeReservationAdminView === 'kalendar'"
        class="mt-5 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">
              {{ calendarMode === 'month' ? 'Mesačný kalendár obsadenosti' : 'Týždenný kalendár obsadenosti' }}
            </h2>
            <p class="text-foreground-muted mt-1 text-sm">
              {{ getLakeName(calendarLake) }} · {{ calendarRangeLabel }} · bunky používajú rovnaké pravidlá dostupnosti ako mapa.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <select
              v-model="calendarLake"
              aria-label="Jazero v kalendári"
              class="h-11 rounded-md border border-border bg-white px-3 text-sm"
            >
              <option value="velky-cetin">Veľký Cetín</option>
              <option value="strkovisko-kocka">Štrkovisko Kocka</option>
            </select>
            <div class="flex rounded-md border border-border bg-white p-1">
              <button
                type="button"
                class="min-h-9 rounded px-3 py-1.5 text-sm font-semibold"
                :class="calendarMode === 'week' ? 'bg-primary-700 text-white' : 'text-foreground-muted hover:bg-muted'"
                @click="setCalendarMode('week')"
              >
                Týždeň
              </button>
              <button
                type="button"
                class="min-h-9 rounded px-3 py-1.5 text-sm font-semibold"
                :class="calendarMode === 'month' ? 'bg-primary-700 text-white' : 'text-foreground-muted hover:bg-muted'"
                @click="setCalendarMode('month')"
              >
                Mesiac
              </button>
            </div>
            <UButton icon="i-heroicons-chevron-left" color="neutral" variant="soft" @click="moveCalendar(-7)">
              {{ calendarMode === 'month' ? 'Mesiac späť' : 'Týždeň späť' }}
            </UButton>
            <input
              v-model="calendarStart"
              type="date"
              class="h-11 rounded-md border border-border bg-white px-3 text-sm"
              aria-label="Začiatok kalendára"
            >
            <UButton icon="i-heroicons-chevron-right" color="neutral" variant="soft" @click="moveCalendar(7)">
              {{ calendarMode === 'month' ? 'Mesiac ďalej' : 'Týždeň ďalej' }}
            </UButton>
          </div>
        </div>

        <div class="mt-4 grid gap-3 text-sm sm:grid-cols-4">
          <div class="rounded-md bg-success-500/10 p-3 text-success-700">
            <p class="text-xs font-semibold">Rezervovateľné dni</p>
            <p class="mt-1 text-2xl font-bold">{{ calendarSummary.available }}</p>
          </div>
          <div class="rounded-md bg-error-500/10 p-3 text-error-700">
            <p class="text-xs font-semibold">Obsadené</p>
            <p class="mt-1 text-2xl font-bold">{{ calendarSummary.reserved }}</p>
          </div>
          <div class="rounded-md bg-warning-500/10 p-3 text-warning-800">
            <p class="text-xs font-semibold">Čaká / obmedzené</p>
            <p class="mt-1 text-2xl font-bold">{{ calendarSummary.pending }}</p>
          </div>
          <div class="rounded-md bg-foreground-muted/10 p-3 text-foreground-muted">
            <p class="text-xs font-semibold">Blokované</p>
            <p class="mt-1 text-2xl font-bold">{{ calendarSummary.blocked }}</p>
          </div>
        </div>

        <div class="mt-5 grid gap-3 md:hidden">
          <div
            v-for="summary in calendarDaySummaries"
            :key="summary.day.iso"
            class="rounded-md border border-border bg-white p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-bold">{{ summary.day.dayName }} {{ summary.day.dayNumber }} {{ summary.day.monthName }}</p>
                <p class="text-foreground-muted mt-1 text-xs">{{ getLakeName(calendarLake) }}</p>
              </div>
              <span class="rounded-md bg-muted px-2 py-1 text-xs font-bold text-foreground-muted">
                {{ summary.reserved }} obs.
              </span>
            </div>
            <div class="mt-3 grid grid-cols-4 gap-2 text-center text-xs font-semibold">
              <div class="rounded bg-success-500/10 px-2 py-1 text-success-700">{{ summary.available }} voľné</div>
              <div class="rounded bg-error-500/10 px-2 py-1 text-error-700">{{ summary.reserved }} obs.</div>
              <div class="rounded bg-warning-500/10 px-2 py-1 text-warning-800">{{ summary.pending }} čaká</div>
              <div class="rounded bg-foreground-muted/10 px-2 py-1 text-foreground-muted">{{ summary.blocked }} blok.</div>
            </div>
            <div v-if="summary.reservations.length" class="mt-3 space-y-2">
              <button
                v-for="item in summary.reservations"
                :key="`${summary.day.iso}-${item.reservation.id}-${item.peg.id}`"
                type="button"
                class="w-full rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-left text-sm text-primary-900"
                @click="selectCalendarCell(item.reservation)"
              >
                <span class="block font-semibold">{{ item.reservation.guest }}</span>
                <span class="mt-0.5 block text-xs text-primary-800">
                  {{ item.peg.label }} · {{ statusLabel(item.reservation.status) }}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div class="mt-5 hidden overflow-x-auto rounded-md border border-border md:block">
          <div :style="{ minWidth: calendarTableMinWidth }">
            <div
              class="grid border-b border-border bg-muted"
              :style="{ gridTemplateColumns: calendarGridTemplate }"
            >
              <div class="px-3 py-3 text-xs font-bold uppercase text-foreground-muted">Miesto</div>
              <div
                v-for="day in calendarDays"
                :key="day.iso"
                class="border-l border-border px-3 py-3 text-center"
              >
                <p class="text-xs font-bold uppercase text-foreground-muted">{{ day.dayName }}</p>
                <p class="font-bold">{{ day.dayNumber }} {{ day.monthName }}</p>
              </div>
            </div>

            <div
              v-for="row in calendarRows"
              :key="row.peg.id"
              class="grid border-b border-border last:border-b-0"
              :style="{ gridTemplateColumns: calendarGridTemplate }"
            >
              <div class="bg-white px-3 py-3">
                <p class="font-semibold">{{ row.peg.label }}</p>
                <p class="text-foreground-muted text-xs">
                  {{ row.peg.type === 'cabin' ? 'chata' : 'miesto' }} · {{ row.peg.capacity }} osoby
                </p>
              </div>
              <div
                v-for="cell in row.cells"
                :key="`${row.peg.id}-${cell.day.iso}`"
                class="border-l border-border bg-white p-1.5"
              >
                <button
                  type="button"
                  class="h-20 w-full rounded-md border px-2 py-1.5 text-left text-xs leading-tight transition-colors"
                  :class="[
                    calendarCellClass(cell.availability.status, cell.reservation?.id === selectedReservationId),
                    cell.reservation ? 'hover:ring-2 hover:ring-primary-200' : 'cursor-default',
                  ]"
                  :aria-label="`${row.peg.label} ${cell.day.iso}: ${cell.availability.label}`"
                  @click="selectCalendarCell(cell.reservation)"
                >
                  <span class="block truncate font-bold">{{ cell.availability.label }}</span>
                  <span class="mt-1 block truncate">
                    {{ cell.reservation?.guest ?? cell.availability.reasons[0] }}
                  </span>
                  <span v-if="cell.reservation" class="mt-1 block truncate opacity-80">
                    {{ statusLabel(cell.reservation.status) }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="activeReservationAdminView === 'kalendar'" class="mt-4">
        <UButton
          icon="i-heroicons-adjustments-horizontal"
          color="neutral"
          variant="soft"
          :aria-expanded="showCalendarContext"
          @click="showCalendarContext = !showCalendarContext"
        >
          {{ showCalendarContext ? 'Skryť prevádzkové obmedzenia' : 'Prevádzkové obmedzenia a stav miest' }}
        </UButton>

        <div v-if="showCalendarContext" class="mt-4 grid gap-6 xl:grid-cols-2">
          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Konflikty dostupnosti</h2>
            <div class="mt-4 space-y-3">
              <div v-for="closure in conflictingClosures" :key="closure.id" class="rounded-md bg-muted p-4">
                <p class="font-semibold">{{ closure.title }}</p>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ closure.lake === 'all' ? 'Všetky jazerá' : getLakeName(closure.lake) }} ·
                  {{ closure.from }} až {{ closure.to }}
                </p>
                <p class="text-foreground-muted mt-2 text-sm">{{ closure.notes }}</p>
              </div>
              <AppState
                v-if="conflictingClosures.length === 0"
                compact
                title="Bez konfliktov"
                description="Dostupnosť zatiaľ nehlási žiadnu uzávierku blokujúcu rezervácie."
              />
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Miesta podľa stavu</h2>
            <p class="text-foreground-muted mt-1 text-sm">{{ getLakeName(calendarLake) }}</p>
            <div class="mt-4 grid gap-2">
              <div
                v-for="row in pegAvailabilityRows"
                :key="row.peg.id"
                class="flex items-center justify-between gap-3 rounded-md bg-muted p-3"
              >
                <div>
                  <p class="font-semibold">{{ row.peg.label }}</p>
                  <p class="text-foreground-muted text-xs">{{ row.availability.reasons[0] }}</p>
                </div>
                <AvailabilityBadge :availability="row.availability" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="activeReservationAdminView === 'ziadosti'"
        class="mt-5 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]"
      >
        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Rezervácie</h2>
              <p class="text-foreground-muted text-sm">Čakajúce žiadosti sú vždy navrchu.</p>
            </div>
            <select
              v-model="reservationLakeFilter"
              aria-label="Filtrovať rezervácie podľa jazera"
              class="h-11 rounded-md border border-border bg-white px-3 text-sm"
            >
              <option value="all">Všetky jazerá</option>
              <option value="velky-cetin">Veľký Cetín</option>
              <option value="strkovisko-kocka">Štrkovisko Kocka</option>
            </select>
          </div>

          <div class="mt-5 space-y-3">
            <button
              v-for="reservation in filteredReservations"
              :key="reservation.id"
              type="button"
              class="w-full rounded-md border p-4 text-left transition-colors hover:bg-muted"
              :class="selectedReservationId === reservation.id ? 'border-primary-600 bg-primary-50' : 'border-border bg-white'"
              @click="selectReservation(reservation)"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-bold">{{ reservation.guest }}</p>
                  <p class="text-foreground-muted text-sm">
                    {{ getLakeName(reservation.lake) }} · {{ getLivePegLabel(reservation.pegId) }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <StatusBadge
                    :icon="statusIcon(reservation.status)"
                    :label="statusLabel(reservation.status)"
                    size="xs"
                    :tone="statusTone(reservation.status)"
                  />
                  <StatusBadge
                    :icon="sourceIcon(reservation.source)"
                    :label="sourceLabel(reservation.source)"
                    size="xs"
                    tone="muted"
                  />
                </div>
              </div>
              <div class="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div class="rounded-md bg-muted p-3">
                  <p class="text-foreground-muted text-xs">Od</p>
                  <p class="font-semibold">{{ reservation.from }}</p>
                </div>
                <div class="rounded-md bg-muted p-3">
                  <p class="text-foreground-muted text-xs">Do</p>
                  <p class="font-semibold">{{ reservation.to }}</p>
                </div>
                <div class="rounded-md bg-muted p-3">
                  <p class="text-foreground-muted text-xs">Typ</p>
                  <p class="font-semibold">{{ reservation.type }}</p>
                </div>
              </div>
            </button>
            <AppState
              v-if="filteredReservations.length === 0"
              title="Žiadne rezervácie"
              description="Pre vybraný filter zatiaľ nie je žiadna žiadosť ani potvrdený termín."
            />
          </div>
        </div>

        <aside class="space-y-6">
          <div
            v-if="selectedReservation"
            ref="reservationDetailElement"
            class="scroll-mt-24 rounded-card border border-border bg-surface p-5"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Detail rezervácie</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ selectedReservation.guest }} · {{ selectedReservation.contactPhone }}
                  <span v-if="selectedReservation.contactEmail"> · {{ selectedReservation.contactEmail }}</span>
                </p>
              </div>
              <StatusBadge
                class="w-fit"
                :icon="statusIcon(selectedReservation.status)"
                :label="statusLabel(selectedReservation.status)"
                :tone="statusTone(selectedReservation.status)"
              />
            </div>

            <div class="mt-5 grid gap-3 sm:grid-cols-2">
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Miesto</p>
                <p class="font-semibold">{{ getLivePegLabel(selectedReservation.pegId) }}</p>
                <p v-if="selectedPeg" class="text-foreground-muted mt-1 text-xs">{{ selectedPeg.notes }}</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Povolenka</p>
                <p class="font-semibold">{{ selectedPermit?.label ?? selectedReservation.permitId }}</p>
                <p v-if="selectedPermit" class="text-foreground-muted mt-1 text-xs">
                  {{ selectedPermit.priceEur }} € · {{ selectedPermit.durationHours }} h
                </p>
              </div>
              <div v-if="selectedCabin" class="rounded-md bg-primary-50 p-3 text-primary-900">
                <p class="text-xs font-semibold text-primary-800">Chata</p>
                <p class="font-semibold">{{ selectedCabin.label }}</p>
                <p class="mt-1 text-xs text-primary-800">
                  {{ selectedCabin.pricePer24hEur }} € / 24 h · kapacita {{ selectedCabin.capacity }}
                </p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Zdroj</p>
                <p class="font-semibold">{{ sourceLabel(selectedReservation.source) }}</p>
                <p class="text-foreground-muted mt-1 text-xs">ID {{ selectedReservation.id }}</p>
              </div>
            </div>

            <div v-if="selectedAvailability" class="mt-5 rounded-md border p-4" :class="selectedAvailability.classes">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-bold">Kontrola miesta bez aktuálnej rezervácie</p>
                  <p class="mt-1 text-sm">{{ selectedAvailability.description }}</p>
                  <p class="mt-2 text-xs font-semibold">{{ selectedAvailability.reasons[0] }}</p>
                </div>
                <UIcon :name="selectedAvailability.icon" class="mt-0.5 h-5 w-5 shrink-0" />
              </div>
            </div>

            <div
              v-if="selectedReservationNotification"
              class="mt-5 rounded-md border border-primary-200 bg-primary-50 p-4 text-primary-900"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-sm font-bold">Interná notifikácia</p>
                  <p class="mt-1 text-sm">
                    {{ selectedReservationNotification.title }}
                  </p>
                  <p class="mt-1 text-xs text-primary-800">
                    {{ formatDateTime(selectedReservationNotification.createdAt) }} ·
                    {{ selectedReservationNotification.recipientCount }} zariadení ·
                    {{ selectedReservationNotification.message }}
                  </p>
                </div>
                <StatusBadge
                  class="w-fit"
                  :icon="deliveryStatusIcon(selectedReservationNotification.status)"
                  :label="notificationBroadcastStatusLabels[selectedReservationNotification.status]"
                  :tone="deliveryStatusTone(selectedReservationNotification.status)"
                />
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <StatusBadge
                  v-for="badge in getReservationNotificationDeliveryBadges(selectedReservationNotification)"
                  :key="badge.status"
                  :icon="deliveryStatusIcon(badge.status)"
                  :label="`${badge.count}× ${badge.label}`"
                  size="xs"
                  :tone="deliveryStatusTone(badge.status)"
                />
                <StatusBadge
                  v-if="getReservationNotificationDeliveryBadges(selectedReservationNotification).length === 0"
                  icon="i-heroicons-minus-circle"
                  label="Bez pokusu doručenia"
                  size="xs"
                  tone="muted"
                />
              </div>
            </div>
            <div
              v-else-if="selectedReservation.source === 'web'"
              class="mt-5 rounded-md border border-warning-500/25 bg-warning-500/10 p-4 text-warning-900"
            >
              <p class="text-sm font-bold">Interná notifikácia</p>
              <p class="mt-1 text-sm">
                K tejto webovej žiadosti zatiaľ nie je uložený záznam push upozornenia.
              </p>
            </div>

            <div v-if="selectedClosureConflicts.length" class="mt-5 rounded-md border border-warning-500/25 bg-warning-500/10 p-4">
              <p class="text-sm font-bold text-warning-800">Konflikty a uzávierky</p>
              <div class="mt-3 space-y-2">
                <div v-for="closure in selectedClosureConflicts" :key="closure.id">
                  <p class="text-sm font-semibold text-warning-900">{{ closure.title }}</p>
                  <p class="text-xs text-warning-800">{{ closure.from }} až {{ closure.to }} · {{ closure.notes }}</p>
                </div>
              </div>
            </div>

            <div class="mt-5">
              <h3 class="text-sm font-bold">Požičovňa</h3>
              <div class="mt-2 grid gap-2">
                <div
                  v-for="row in selectedRentalRows"
                  :key="row.item.id"
                  class="rounded-md border border-border bg-white p-3"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="font-semibold">{{ row.item.label }}</p>
                      <p class="text-foreground-muted mt-1 text-xs">
                        {{ rentalBookingStatusLabel(row.booking?.status) }} ·
                        {{ row.availability.availableQuantity }} ks voľné po ostatných rezerváciách
                      </p>
                    </div>
                    <StatusBadge
                      class="shrink-0"
                      :icon="rentalAvailabilityIcon(row.availability.status)"
                      :label="row.availability.label"
                      size="xs"
                      :tone="rentalAvailabilityTone(row.availability.status)"
                    />
                  </div>
                </div>
                <AppState
                  v-if="selectedRentalRows.length === 0"
                  compact
                  title="Bez výbavy"
                  description="K tejto rezervácii nie je priradená žiadna položka požičovne."
                />
              </div>
            </div>

            <div class="mt-5">
              <h3 class="text-sm font-bold">Doplnky</h3>
              <div class="mt-2 flex flex-wrap gap-2">
                <span
                  v-for="extra in selectedExtras"
                  :key="extra.id"
                  class="rounded-md bg-muted px-3 py-2 text-sm font-semibold"
                >
                  {{ extra.label }}
                </span>
                <span v-if="selectedExtras.length === 0" class="text-foreground-muted text-sm">
                  Bez doplnkov.
                </span>
              </div>
            </div>

            <div class="mt-5 rounded-md border border-border bg-white p-4">
              <p class="text-sm font-bold">Pracovné rozhodnutie</p>
              <div class="mt-3 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  class="rounded-md border px-3 py-2 text-sm font-semibold"
                  :disabled="!canOperateReservations"
                  :class="decisionMode === 'approve' ? 'border-success-500 bg-success-500/10 text-success-700' : 'border-border bg-white'"
                  @click="decisionMode = 'approve'"
                >
                  Schváliť
                </button>
                <button
                  type="button"
                  class="rounded-md border px-3 py-2 text-sm font-semibold"
                  :disabled="!canOperateReservations"
                  :class="decisionMode === 'call' ? 'border-warning-500 bg-warning-500/10 text-warning-800' : 'border-border bg-white'"
                  @click="decisionMode = 'call'"
                >
                  Telefonát
                </button>
                <button
                  type="button"
                  class="rounded-md border px-3 py-2 text-sm font-semibold"
                  :disabled="!canOperateReservations"
                  :class="decisionMode === 'reject' ? 'border-error-500 bg-error-500/10 text-error-700' : 'border-border bg-white'"
                  @click="decisionMode = 'reject'"
                >
                  Zamietnuť
                </button>
              </div>
              <p class="text-foreground-muted mt-3 text-sm">{{ decisionSummary }}</p>
              <label class="mt-4 block">
                <span class="text-sm font-semibold">Interná poznámka</span>
                <textarea
                  v-model="adminNoteDraft"
                  rows="4"
                  :readonly="!canOperateReservations"
                  class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                />
              </label>
              <div class="mt-4 flex flex-wrap gap-2">
                <UButton
                  data-testid="save-reservation-decision"
                  icon="i-heroicons-check"
                  variant="soft"
                  :disabled="!canOperateReservations || decisionSubmitStatus === 'submitting'"
                  :loading="decisionSubmitStatus === 'submitting'"
                  @click="saveDecision"
                >
                  Uložiť rozhodnutie
                </UButton>
                <UButton :to="`tel:${selectedReservation.contactPhone}`" icon="i-heroicons-phone" color="neutral" variant="soft">
                  Zavolať hosťovi
                </UButton>
              </div>
              <DataStatusNotice
                v-if="decisionSubmitMessage"
                class="mt-3"
                :description="decisionSubmitMessage"
                title="Rozhodnutie sa nepodarilo uložiť"
                tone="error"
              />
              <DataStatusNotice
                v-if="workflowMessage"
                class="mt-3"
                :description="workflowMessage"
                title="Rozhodnutie je uložené"
                tone="success"
              />
              <div
                v-if="decisionCommunicationDraft"
                class="mt-4 rounded-md border border-border bg-white p-4"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="text-sm font-bold">Správa pre hosťa</p>
                    <p class="text-foreground-muted mt-1 text-xs">
                      {{ decisionCommunicationDelivery?.message ?? (decisionCommunicationDraft.channel === 'email' ? 'E-mailový draft je pripravený.' : 'E-mail chýba, použi SMS alebo telefonát.') }}
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <StatusBadge
                      v-if="decisionCommunicationDelivery"
                      :icon="deliveryStatusIcon(decisionCommunicationDelivery.status)"
                      :label="reservationCommunicationDeliveryStatusLabels[decisionCommunicationDelivery.status]"
                      :tone="deliveryStatusTone(decisionCommunicationDelivery.status)"
                    />
                    <StatusBadge
                      v-if="decisionCommunicationDelivery"
                      icon="i-heroicons-server-stack"
                      :label="reservationCommunicationDeliveryProviderLabels[decisionCommunicationDelivery.provider]"
                      tone="muted"
                    />
                    <UButton
                      :to="buildSmsHref(decisionCommunicationDraft)"
                      icon="i-heroicons-chat-bubble-left-right"
                      size="xs"
                      variant="soft"
                    >
                      SMS
                    </UButton>
                    <UButton
                      v-if="decisionCommunicationDraft.emailTo"
                      :to="buildMailtoHref(decisionCommunicationDraft)"
                      icon="i-heroicons-envelope"
                      size="xs"
                      variant="soft"
                    >
                      E-mail
                    </UButton>
                  </div>
                </div>
                <div class="mt-3 grid gap-3">
                  <div class="rounded-md bg-muted p-3">
                    <p class="text-foreground-muted text-xs font-semibold uppercase">SMS text</p>
                    <p class="mt-1 text-sm">{{ decisionCommunicationDraft.smsBody }}</p>
                  </div>
                  <div v-if="decisionCommunicationDraft.emailBody" class="rounded-md bg-muted p-3">
                    <p class="text-foreground-muted text-xs font-semibold uppercase">{{ decisionCommunicationDraft.emailSubject }}</p>
                    <p class="mt-1 whitespace-pre-line text-sm">{{ decisionCommunicationDraft.emailBody }}</p>
                  </div>
                  <div class="rounded-md bg-muted p-3">
                    <p class="text-foreground-muted text-xs font-semibold uppercase">Telefonát</p>
                    <p class="mt-1 text-sm">{{ decisionCommunicationDraft.callScript }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <AppState
            v-else
            title="Vyberte rezerváciu"
            description="Detail sa zobrazí po kliknutí na rezerváciu v zozname."
          />
        </aside>
      </div>
      </div>
    </section>
  </div>
</template>
