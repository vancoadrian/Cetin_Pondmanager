<script setup lang="ts">
import type { LakeSlug, RentalItem, ReservationExtra } from '~/data/pond'
import type { ReservationStateResponse } from '~/services/reservationApiService'
import type { RentalCatalogMutationSuccess } from '~/services/rentalCatalogService'
import { getRentalAvailability, type RentalAvailabilityStatus } from '~/utils/rentals'
import type { StatusBadgeTone } from '~/utils/ui'

useHead({ title: 'Admin požičovňa' })

const { getLakeName, getPegLabel, rentalBookings, reservations } = usePondData()
const {
  canOperate: canOperateRentals,
  isReadOnly: rentalsReadOnly,
  label: rentalAccessLabel,
  readOnlyMessage: rentalReadOnlyMessage,
} = useAdminModuleAccess('rentals')

const fallbackReservationState = (): ReservationStateResponse => ({
  ok: true,
  rentalBookings,
  reservations,
  updatedAt: 'seed',
})
const { data: reservationState } = await useAsyncData<ReservationStateResponse>(
  'admin-rentals-reservation-state',
  () => $fetch<ReservationStateResponse>('/api/reservations'),
  {
    default: fallbackReservationState,
  },
)
const {
  liveRentalItems,
  liveReservationExtras,
  refresh: refreshRentalCatalogState,
} = await useRentalCatalogState({ admin: true, key: 'admin-rentals-catalog-state' })

const rangeFrom = ref('2026-05-16')
const rangeTo = ref('2026-05-18')
const rentalItemDraft = ref<RentalItem[]>([])
const reservationExtraDraft = ref<ReservationExtra[]>([])
const removedRentalItemIds = ref<string[]>([])
const removedReservationExtraIds = ref<string[]>([])
const catalogSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const catalogSubmitMessage = ref('')
const catalogDraftStatus = ref<'idle' | 'success' | 'error'>('idle')
const catalogDraftMessage = ref('')
const newRentalItemDraft = reactive({
  category: 'fish-care' as RentalItem['category'],
  description: '',
  label: '',
  priceLabel: 'cena po potvrdení správcom',
  recommended: false,
  stock: 1,
})
const newReservationExtraDraft = reactive({
  appliesTo: 'all' as ReservationExtra['appliesTo'],
  description: '',
  label: '',
  lake: 'all' as LakeSlug | 'all',
  priceLabel: 'cena dohodou',
  source: 'proposal' as ReservationExtra['source'],
})
const liveReservations = computed(() => reservationState.value?.reservations ?? reservations)
const liveRentalBookings = computed(() => reservationState.value?.rentalBookings ?? rentalBookings)
const usedRentalItemIds = computed(() =>
  new Set([
    ...liveReservations.value.flatMap((reservation) => reservation.rentalIds),
    ...liveRentalBookings.value.map((booking) => booking.rentalItemId),
  ]),
)
const usedReservationExtraIds = computed(() =>
  new Set(liveReservations.value.flatMap((reservation) => reservation.extraIds)),
)
const activeRentalItemDraft = computed(() => rentalItemDraft.value.filter((item) => item.active))
const totalStock = computed(() => activeRentalItemDraft.value.reduce((sum, item) => sum + item.stock, 0))
const recommendedItems = computed(() => activeRentalItemDraft.value.filter((item) => item.recommended))
const cabinExtras = computed(() => reservationExtraDraft.value.filter((extra) => extra.active && extra.appliesTo === 'cabin'))
const rentalAvailabilityRows = computed(() =>
  rentalItemDraft.value.map((item) => ({
    availability: getRentalAvailability(item, {
      bookings: liveRentalBookings.value,
      dateFrom: rangeFrom.value,
      dateTo: rangeTo.value,
    }),
    item,
  })),
)
const unavailableItems = computed(() =>
  rentalAvailabilityRows.value.filter((row) => row.availability.status === 'unavailable'),
)
const activeRentalBookings = computed(() =>
  rentalAvailabilityRows.value.flatMap((row) =>
    row.availability.bookings.map((booking) => ({
      booking,
      item: row.item,
      reservation: liveReservations.value.find((reservation) => reservation.id === booking.reservationId),
    })),
  ),
)
const rangeAvailableStock = computed(() =>
  rentalAvailabilityRows.value.reduce((sum, row) => sum + row.availability.availableQuantity, 0),
)

function activeStateTone(active: boolean): StatusBadgeTone {
  return active ? 'success' : 'muted'
}

function activeStateIcon(active: boolean) {
  return active ? 'i-heroicons-check-circle' : 'i-heroicons-pause-circle'
}

function bookingStatusTone(status: string): StatusBadgeTone {
  return status === 'reserved' ? 'success' : 'warning'
}

function bookingStatusIcon(status: string) {
  return status === 'reserved' ? 'i-heroicons-check-circle' : 'i-heroicons-clock'
}

function reservationExtraSourceTone(source: ReservationExtra['source']): StatusBadgeTone {
  return source === 'web' ? 'success' : 'warning'
}

function reservationExtraSourceIcon(source: ReservationExtra['source']) {
  return source === 'web' ? 'i-heroicons-globe-alt' : 'i-heroicons-pencil-square'
}

function availabilityTone(status: RentalAvailabilityStatus): StatusBadgeTone {
  if (status === 'available') return 'success'
  if (status === 'limited') return 'warning'
  if (status === 'unavailable') return 'error'

  return 'muted'
}

function availabilityIcon(status: RentalAvailabilityStatus) {
  if (status === 'available') return 'i-heroicons-check-circle'
  if (status === 'limited') return 'i-heroicons-exclamation-triangle'
  if (status === 'unavailable') return 'i-heroicons-x-circle'

  return 'i-heroicons-minus-circle'
}

watch(
  liveRentalItems,
  (items) => {
    rentalItemDraft.value = items.map((item) => ({ ...item }))
    removedRentalItemIds.value = []
  },
  { immediate: true },
)

watch(
  liveReservationExtras,
  (extras) => {
    reservationExtraDraft.value = extras.map((extra) => ({ ...extra }))
    removedReservationExtraIds.value = []
  },
  { immediate: true },
)

watch(
  [rentalItemDraft, reservationExtraDraft],
  () => {
    if (catalogSubmitStatus.value !== 'submitting') {
      catalogSubmitStatus.value = 'idle'
      catalogSubmitMessage.value = ''
    }
  },
  { deep: true },
)

function slugifyCatalogLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'polozka'
}

function createDraftId(prefix: string, label: string, existingIds: Set<string>) {
  const baseId = `${prefix}-${slugifyCatalogLabel(label)}`
  if (!existingIds.has(baseId)) return baseId

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1
  }

  return `${baseId}-${index}`
}

function markDraftError(message: string) {
  catalogDraftStatus.value = 'error'
  catalogDraftMessage.value = message
}

function markDraftSuccess(message: string) {
  catalogDraftStatus.value = 'success'
  catalogDraftMessage.value = message
}

function isRentalItemUsed(id: string) {
  return usedRentalItemIds.value.has(id)
}

function isReservationExtraUsed(id: string) {
  return usedReservationExtraIds.value.has(id)
}

function addRentalItemDraft() {
  const label = newRentalItemDraft.label.trim()
  const description = newRentalItemDraft.description.trim()
  const priceLabel = newRentalItemDraft.priceLabel.trim()
  const stock = Number(newRentalItemDraft.stock)

  if (label.length < 2) {
    markDraftError('Doplňte názov novej výbavy.')
    return
  }
  if (description.length < 5) {
    markDraftError('Doplňte krátky popis novej výbavy.')
    return
  }
  if (!Number.isInteger(stock) || stock < 0) {
    markDraftError('Sklad novej výbavy musí byť nezáporné celé číslo.')
    return
  }
  if (!priceLabel) {
    markDraftError('Doplňte cenníkový text novej výbavy.')
    return
  }

  const existingIds = new Set(rentalItemDraft.value.map((item) => item.id))
  rentalItemDraft.value = [
    ...rentalItemDraft.value,
    {
      active: true,
      category: newRentalItemDraft.category,
      description,
      id: createDraftId('rental', label, existingIds),
      label,
      priceLabel,
      recommended: newRentalItemDraft.recommended,
      stock,
    },
  ]
  newRentalItemDraft.description = ''
  newRentalItemDraft.label = ''
  newRentalItemDraft.priceLabel = 'cena po potvrdení správcom'
  newRentalItemDraft.recommended = false
  newRentalItemDraft.stock = 1
  markDraftSuccess('Nová výbava je pridaná do rozpracovaného katalógu. Uložte požičovňu.')
}

function addReservationExtraDraft() {
  const label = newReservationExtraDraft.label.trim()
  const description = newReservationExtraDraft.description.trim()
  const priceLabel = newReservationExtraDraft.priceLabel.trim()

  if (label.length < 2) {
    markDraftError('Doplňte názov nového doplnku.')
    return
  }
  if (description.length < 5) {
    markDraftError('Doplňte krátky popis nového doplnku.')
    return
  }
  if (!priceLabel) {
    markDraftError('Doplňte cenníkový text nového doplnku.')
    return
  }

  const existingIds = new Set(reservationExtraDraft.value.map((extra) => extra.id))
  reservationExtraDraft.value = [
    ...reservationExtraDraft.value,
    {
      active: true,
      appliesTo: newReservationExtraDraft.appliesTo,
      description,
      id: createDraftId('extra', label, existingIds),
      label,
      lake: newReservationExtraDraft.lake === 'all' ? undefined : newReservationExtraDraft.lake,
      priceLabel,
      source: newReservationExtraDraft.source,
    },
  ]
  newReservationExtraDraft.appliesTo = 'all'
  newReservationExtraDraft.description = ''
  newReservationExtraDraft.label = ''
  newReservationExtraDraft.lake = 'all'
  newReservationExtraDraft.priceLabel = 'cena dohodou'
  newReservationExtraDraft.source = 'proposal'
  markDraftSuccess('Nový doplnok je pridaný do rozpracovaného katalógu. Uložte požičovňu.')
}

function removeRentalItemDraft(id: string) {
  const item = rentalItemDraft.value.find((candidate) => candidate.id === id)
  if (!item) return

  if (isRentalItemUsed(id)) {
    markDraftError('Výbava je už použitá v rezervácii alebo výpožičke. Položku radšej vypnite, aby zostala história čistá.')
    return
  }

  rentalItemDraft.value = rentalItemDraft.value.filter((candidate) => candidate.id !== id)
  if (liveRentalItems.value.some((candidate) => candidate.id === id)) {
    removedRentalItemIds.value = [...new Set([...removedRentalItemIds.value, id])]
  }

  markDraftSuccess(`${item.label} bude odstránená po uložení požičovne.`)
}

function removeReservationExtraDraft(id: string) {
  const extra = reservationExtraDraft.value.find((candidate) => candidate.id === id)
  if (!extra) return

  if (isReservationExtraUsed(id)) {
    markDraftError('Doplnok je už použitý v rezervácii. Doplnok radšej vypnite, aby zostala história rezervácií čitateľná.')
    return
  }

  reservationExtraDraft.value = reservationExtraDraft.value.filter((candidate) => candidate.id !== id)
  if (liveReservationExtras.value.some((candidate) => candidate.id === id)) {
    removedReservationExtraIds.value = [...new Set([...removedReservationExtraIds.value, id])]
  }

  markDraftSuccess(`${extra.label} bude odstránený po uložení požičovne.`)
}

async function saveRentalCatalogSettings() {
  if (!canOperateRentals.value) {
    catalogSubmitStatus.value = 'error'
    catalogSubmitMessage.value = rentalReadOnlyMessage.value
    return
  }

  catalogSubmitStatus.value = 'submitting'
  catalogSubmitMessage.value = ''

  try {
    const result = await $fetch<RentalCatalogMutationSuccess>('/api/admin/rental-catalog', {
      body: {
        removeRentalItemIds: removedRentalItemIds.value,
        removeReservationExtraIds: removedReservationExtraIds.value,
        rentalItems: rentalItemDraft.value.map((item) => ({
          active: item.active,
          category: item.category,
          description: item.description,
          id: item.id,
          label: item.label,
          priceLabel: item.priceLabel,
          recommended: item.recommended,
          stock: item.stock,
        })),
        reservationExtras: reservationExtraDraft.value.map((extra) => ({
          active: extra.active,
          appliesTo: extra.appliesTo,
          description: extra.description,
          id: extra.id,
          label: extra.label,
          lake: extra.lake,
          priceLabel: extra.priceLabel,
          source: extra.source,
        })),
      },
      method: 'PUT',
    })

    await refreshRentalCatalogState()
    removedRentalItemIds.value = []
    removedReservationExtraIds.value = []
    catalogSubmitStatus.value = 'success'
    catalogSubmitMessage.value = result.message
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
    catalogSubmitStatus.value = 'error'
    catalogSubmitMessage.value =
      fetchError.data?.data?.messages?.join(' ') ??
      fetchError.data?.message ??
      fetchError.data?.statusMessage ??
      'Požičovňu sa nepodarilo uložiť.'
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Požičovňa a doplnky"
      description="Sklad povinnej výbavy, vybavenia k chatám a doplnkov dostupných pri rezervácii."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div
        v-if="rentalsReadOnly"
        class="mb-5 rounded-card border border-info-500/25 bg-info-500/10 p-4 text-info-700"
      >
        <p class="text-sm font-bold">Režim prístupu: {{ rentalAccessLabel }}</p>
        <p class="mt-1 text-sm">{{ rentalReadOnlyMessage }}</p>
      </div>

      <div class="grid gap-4 md:grid-cols-4">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Položky výbavy</p>
          <p class="mt-2 text-3xl font-bold">{{ activeRentalItemDraft.length }}/{{ rentalItemDraft.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Sklad spolu</p>
          <p class="mt-2 text-3xl font-bold">{{ totalStock }} ks</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Odporúčané pri rezervácii</p>
          <p class="mt-2 text-3xl font-bold">{{ recommendedItems.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Voľné v termíne</p>
          <p class="mt-2 text-3xl font-bold">{{ rangeAvailableStock }} ks</p>
        </div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <form class="rounded-card border border-border bg-surface p-5" @submit.prevent="addRentalItemDraft">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Nová výbava</h2>
              <p class="text-foreground-muted text-sm">
                Pridanie položky do požičovne, napríklad ďalší podberák, podložka alebo vybavenie k chate.
              </p>
            </div>
            <UButton
              type="submit"
              icon="i-heroicons-plus"
              variant="soft"
              :disabled="!canOperateRentals"
            >
              Pridať výbavu
            </UButton>
          </div>

          <fieldset :disabled="!canOperateRentals" class="mt-4 grid gap-3 md:grid-cols-2">
            <label class="block">
              <span class="text-xs font-semibold text-foreground-muted">Názov</span>
              <input
                v-model="newRentalItemDraft.label"
                class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                placeholder="napr. Nafukovací čln"
              >
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-foreground-muted">Kategória</span>
              <select
                v-model="newRentalItemDraft.category"
                class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              >
                <option value="fish-care">Starostlivosť o rybu</option>
                <option value="cabin">K chate</option>
                <option value="comfort">Komfort</option>
              </select>
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-foreground-muted">Sklad</span>
              <input
                v-model.number="newRentalItemDraft.stock"
                type="number"
                min="0"
                max="100"
                class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              >
            </label>
            <label class="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm font-semibold">
              <input
                v-model="newRentalItemDraft.recommended"
                type="checkbox"
                class="h-4 w-4 accent-primary-700"
              >
              Odporúčané pri rezervácii
            </label>
            <label class="block md:col-span-2">
              <span class="text-xs font-semibold text-foreground-muted">Popis</span>
              <input
                v-model="newRentalItemDraft.description"
                class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                placeholder="Stručne čo rybár dostane a kedy sa hodí."
              >
            </label>
            <label class="block md:col-span-2">
              <span class="text-xs font-semibold text-foreground-muted">Cenníkový text</span>
              <input
                v-model="newRentalItemDraft.priceLabel"
                class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              >
            </label>
          </fieldset>
        </form>

        <form class="rounded-card border border-border bg-surface p-5" @submit.prevent="addReservationExtraDraft">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Nový doplnok</h2>
              <p class="text-foreground-muted text-sm">
                Doplnok k rezervácii, napríklad bednička dreva, gril, altánok alebo služba k pobytu.
              </p>
            </div>
            <UButton
              type="submit"
              icon="i-heroicons-plus"
              variant="soft"
              :disabled="!canOperateRentals"
            >
              Pridať doplnok
            </UButton>
          </div>

          <fieldset :disabled="!canOperateRentals" class="mt-4 grid gap-3 md:grid-cols-2">
            <label class="block">
              <span class="text-xs font-semibold text-foreground-muted">Názov</span>
              <input
                v-model="newReservationExtraDraft.label"
                class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                placeholder="napr. Bednička dreva"
              >
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-foreground-muted">Dostupnosť</span>
              <select
                v-model="newReservationExtraDraft.appliesTo"
                class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              >
                <option value="all">Všetky rezervácie</option>
                <option value="cabin">Iba chata</option>
              </select>
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-foreground-muted">Jazero</span>
              <select
                v-model="newReservationExtraDraft.lake"
                class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              >
                <option value="all">Všetky jazerá</option>
                <option value="velky-cetin">{{ getLakeName('velky-cetin') }}</option>
                <option value="strkovisko-kocka">{{ getLakeName('strkovisko-kocka') }}</option>
              </select>
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-foreground-muted">Zdroj</span>
              <select
                v-model="newReservationExtraDraft.source"
                class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              >
                <option value="proposal">Návrh správcu</option>
                <option value="web">Z verejného webu</option>
              </select>
            </label>
            <label class="block md:col-span-2">
              <span class="text-xs font-semibold text-foreground-muted">Popis</span>
              <input
                v-model="newReservationExtraDraft.description"
                class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                placeholder="Kedy sa doplnok ponúka a čo má správca pripraviť."
              >
            </label>
            <label class="block md:col-span-2">
              <span class="text-xs font-semibold text-foreground-muted">Cenníkový text</span>
              <input
                v-model="newReservationExtraDraft.priceLabel"
                class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              >
            </label>
          </fieldset>
        </form>
      </div>

      <DataStatusNotice
        v-if="catalogDraftMessage"
        class="mt-4"
        :description="catalogDraftMessage"
        :title="catalogDraftStatus === 'error' ? 'Návrh sa nedá pridať' : 'Návrh je pripravený'"
        :tone="catalogDraftStatus === 'error' ? 'error' : 'success'"
      />

      <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_0.75fr]">
        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Sklad výbavy</h2>
              <p class="text-foreground-muted text-sm">Správca vie vypnúť položku, upraviť sklad a cenníkový text pre rezervácie.</p>
            </div>
            <UButton
              icon="i-heroicons-check"
              variant="soft"
              :disabled="!canOperateRentals || catalogSubmitStatus === 'submitting'"
              :loading="catalogSubmitStatus === 'submitting'"
              @click="saveRentalCatalogSettings"
            >
              Uložiť požičovňu
            </UButton>
          </div>
          <DataStatusNotice
            v-if="catalogSubmitMessage"
            class="mt-4"
            :description="catalogSubmitMessage"
            :title="catalogSubmitStatus === 'error' ? 'Požičovňu sa nepodarilo uložiť' : 'Požičovňa je uložená'"
            :tone="catalogSubmitStatus === 'error' ? 'error' : 'success'"
          />

          <div class="mt-5 grid gap-3 rounded-md bg-muted p-3 sm:grid-cols-2">
            <label class="block">
              <span class="text-xs font-semibold text-foreground-muted">Od</span>
              <input
                v-model="rangeFrom"
                type="date"
                class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              >
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-foreground-muted">Do</span>
              <input
                v-model="rangeTo"
                type="date"
                class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              >
            </label>
          </div>

          <div class="mt-5 overflow-hidden rounded-md border border-border">
            <div
              v-for="row in rentalAvailabilityRows"
              :key="row.item.id"
              class="grid gap-3 border-b border-border bg-white p-4 last:border-b-0 md:grid-cols-[1fr_auto]"
              :class="!row.item.active ? 'opacity-70' : ''"
            >
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <p class="font-bold">{{ row.item.label }}</p>
                  <StatusBadge
                    :icon="activeStateIcon(row.item.active)"
                    :label="row.item.active ? 'aktívne' : 'vypnuté'"
                    size="xs"
                    :tone="activeStateTone(row.item.active)"
                  />
                  <StatusBadge
                    v-if="row.item.recommended"
                    icon="i-heroicons-star"
                    label="odporúčané"
                    size="xs"
                    tone="primary"
                  />
                  <StatusBadge
                    :icon="availabilityIcon(row.availability.status)"
                    :label="row.availability.label"
                    size="xs"
                    :tone="availabilityTone(row.availability.status)"
                  />
                </div>
                <p class="text-foreground-muted mt-1 text-sm">{{ row.item.description }}</p>
                <p class="text-primary-800 mt-2 text-xs font-semibold">{{ row.item.priceLabel }}</p>
                <p class="text-foreground-muted mt-1 text-xs">
                  {{ row.availability.reasons[0] }}
                </p>
                <div class="mt-3 grid gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
                  <label class="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs font-semibold">
                    <input
                      v-model="row.item.active"
                      type="checkbox"
                      :disabled="!canOperateRentals"
                      class="h-4 w-4 accent-primary-700"
                    >
                    Aktívne
                  </label>
                  <label class="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs font-semibold">
                    <input
                      v-model="row.item.recommended"
                      type="checkbox"
                      :disabled="!canOperateRentals || !row.item.active"
                      class="h-4 w-4 accent-primary-700"
                    >
                    Odporúčané
                  </label>
                  <label class="block">
                    <span class="sr-only">Cenníkový text</span>
                    <input
                      v-model="row.item.priceLabel"
                      :disabled="!canOperateRentals"
                      class="h-10 w-full rounded-md border border-border bg-white px-3 text-xs"
                      placeholder="cena po potvrdení správcom"
                    >
                  </label>
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <UButton
                    size="xs"
                    icon="i-heroicons-trash"
                    color="error"
                    variant="soft"
                    :disabled="!canOperateRentals || isRentalItemUsed(row.item.id)"
                    @click="removeRentalItemDraft(row.item.id)"
                  >
                    Odstrániť
                  </UButton>
                  <span
                    v-if="isRentalItemUsed(row.item.id)"
                    class="text-foreground-muted text-xs"
                  >
                    Použité v rezervácii alebo výpožičke, bezpečná voľba je vypnúť položku.
                  </span>
                </div>
              </div>
              <div class="grid grid-cols-4 gap-2 text-center text-xs sm:min-w-72">
                <div class="rounded-md bg-muted p-2">
                  <p class="text-foreground-muted">Sklad</p>
                  <input
                    v-model.number="row.item.stock"
                    type="number"
                    min="0"
                    max="100"
                    :disabled="!canOperateRentals"
                    class="mt-1 h-9 w-full rounded-md border border-border bg-white px-2 text-center text-lg font-bold"
                    aria-label="Sklad"
                  >
                </div>
                <div class="rounded-md bg-muted p-2">
                  <p class="text-foreground-muted">Potvrdené</p>
                  <p class="text-lg font-bold">{{ row.availability.reservedQuantity }}</p>
                </div>
                <div class="rounded-md bg-muted p-2">
                  <p class="text-foreground-muted">Čaká</p>
                  <p class="text-lg font-bold">{{ row.availability.requestedQuantity }}</p>
                </div>
                <div class="rounded-md bg-muted p-2">
                  <p class="text-foreground-muted">Voľné</p>
                  <p class="text-lg font-bold">{{ row.availability.availableQuantity }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Výpožičky v termíne</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Aktívne väzby na rezervácie od {{ rangeFrom }} do {{ rangeTo }}.
                </p>
              </div>
              <StatusBadge
                class="shrink-0"
                :icon="unavailableItems.length ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-check-circle'"
                :label="unavailableItems.length ? `${unavailableItems.length} konflikt` : 'bez konfliktu'"
                :tone="unavailableItems.length ? 'error' : 'success'"
              />
            </div>

            <div class="mt-4 space-y-3">
              <div
                v-for="entry in activeRentalBookings"
                :key="entry.booking.id"
                class="rounded-md bg-muted p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ entry.item.label }} · {{ entry.booking.quantity }} ks</p>
                    <p class="text-foreground-muted mt-1 text-sm">
                      {{ entry.reservation?.guest ?? entry.booking.reservationId }} ·
                      {{ entry.reservation ? getLakeName(entry.reservation.lake) : getLakeName(entry.booking.lake) }}
                    </p>
                    <p v-if="entry.reservation" class="text-foreground-muted mt-1 text-xs">
                      {{ getPegLabel(entry.reservation.pegId) }} · {{ entry.booking.from }} až {{ entry.booking.to }}
                    </p>
                  </div>
                  <StatusBadge
                    class="shrink-0"
                    :icon="bookingStatusIcon(entry.booking.status)"
                    :label="entry.booking.status === 'reserved' ? 'potvrdené' : 'čaká'"
                    size="xs"
                    :tone="bookingStatusTone(entry.booking.status)"
                  />
                </div>
                <p class="text-foreground-muted mt-2 text-xs">{{ entry.booking.note }}</p>
              </div>
              <AppState
                v-if="activeRentalBookings.length === 0"
                title="Bez výpožičiek"
                description="V zvolenom termíne nie je k rezerváciám priradená žiadna výbava."
              />
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Doplnky k rezervácii</h2>
            <div class="mt-4 space-y-3">
              <div v-for="extra in reservationExtraDraft" :key="extra.id" class="rounded-md bg-muted p-4" :class="!extra.active ? 'opacity-70' : ''">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ extra.label }}</p>
                    <p class="text-foreground-muted mt-1 text-sm">{{ extra.description }}</p>
                  </div>
                  <div class="flex flex-wrap justify-end gap-2">
                    <StatusBadge
                      :icon="activeStateIcon(extra.active)"
                      :label="extra.active ? 'aktívne' : 'vypnuté'"
                      size="xs"
                      :tone="activeStateTone(extra.active)"
                    />
                    <StatusBadge
                      :icon="reservationExtraSourceIcon(extra.source)"
                      :label="extra.source === 'web' ? 'web' : 'návrh'"
                      size="xs"
                      :tone="reservationExtraSourceTone(extra.source)"
                    />
                  </div>
                </div>
                <div class="mt-3 grid gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
                  <label class="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-xs font-semibold">
                    <input
                      v-model="extra.active"
                      type="checkbox"
                      :disabled="!canOperateRentals"
                      class="h-4 w-4 accent-primary-700"
                    >
                    Aktívne
                  </label>
                  <label class="block">
                    <span class="sr-only">Zdroj doplnku</span>
                    <select
                      v-model="extra.source"
                      :disabled="!canOperateRentals"
                      class="h-10 w-full rounded-md border border-border bg-white px-2 text-xs"
                    >
                      <option value="web">existujúca ponuka</option>
                      <option value="proposal">nový doplnok</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="sr-only">Cenníkový text doplnku</span>
                    <input
                      v-model="extra.priceLabel"
                      :disabled="!canOperateRentals"
                      class="h-10 w-full rounded-md border border-border bg-white px-3 text-xs"
                    >
                  </label>
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <UButton
                    size="xs"
                    icon="i-heroicons-trash"
                    color="error"
                    variant="soft"
                    :disabled="!canOperateRentals || isReservationExtraUsed(extra.id)"
                    @click="removeReservationExtraDraft(extra.id)"
                  >
                    Odstrániť
                  </UButton>
                  <span
                    v-if="isReservationExtraUsed(extra.id)"
                    class="text-foreground-muted text-xs"
                  >
                    Použité v rezervácii, bezpečná voľba je vypnúť doplnok.
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Chata doplnky</h2>
            <p class="text-foreground-muted mt-2 text-sm">
              {{ cabinExtras.length }} položky sa zobrazia iba pri miestach s chatou. Sem patria drevo, gril alebo vybavenie k pobytu.
            </p>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
