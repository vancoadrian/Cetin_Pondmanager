<script setup lang="ts">
import { MAX_SPONSOR_LOGO_BYTES } from '~/schemas/pondSchemas'

useHead({ title: 'Admin sponzori' })

const {
  activeSponsors,
  addSponsorDraft,
  canOperateSponsors,
  canUseLogoVariantCropEditor,
  clearSponsorLogo,
  clearSponsorLogoVariant,
  clearSponsorLogoVariantSource,
  formatLogoSize,
  generateSponsorLogoVariants,
  handleLogoVariantFocusPointerDown,
  handleLogoVariantFocusPointerMove,
  handleNewSponsorLogoFile,
  handleSponsorLogoFile,
  handleSponsorLogoVariantFile,
  handleSponsorLogoVariantSourceFile,
  inactiveSponsors,
  logoRuleHint,
  logoVariantCropPreviewStyle,
  logoVariantDimensions,
  logoVariantFocusX,
  logoVariantFocusY,
  logoVariantModeLabels,
  logoVariantPreview,
  logoVariantTargetSummary,
  newSponsorDraft,
  placementTypeLabels,
  regenerateSponsorLogoVariant,
  saveSponsorSettings,
  sectorOptions,
  sponsorAccessLabel,
  sponsorDraft,
  sponsorDraftMessage,
  sponsorDraftStatus,
  sponsorInitials,
  sponsorLogoAccept,
  sponsorLogoDimensions,
  sponsorLogoPreview,
  sponsorLogoVariantGeneratePadding,
  sponsorLogoVariantSourceDimensions,
  sponsorLogoVariantSourcePreview,
  sponsorReadOnlyMessage,
  sponsorSubmitMessage,
  sponsorSubmitStatus,
  sponsorsReadOnly,
  tierLabels,
  tournaments,
} = await useAdminSponsors()
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Sponzori a umiestnenia"
      description="Správa partnerov revíru, súťaží, sektorových umiestnení a ich logo assetov."
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
          <DataStatusNotice
            v-if="sponsorSubmitMessage"
            class="mt-4"
            :description="sponsorSubmitMessage"
            :title="sponsorSubmitStatus === 'error' ? 'Sponzorov sa nepodarilo uložiť' : 'Sponzori sú uložení'"
            :tone="sponsorSubmitStatus === 'error' ? 'error' : 'success'"
          />

          <div class="mt-5 space-y-3">
            <div v-for="sponsor in sponsorDraft" :key="sponsor.id" class="rounded-md border border-border bg-white p-4" :class="!sponsor.active ? 'opacity-75' : ''">
              <div class="flex items-start gap-4">
                <div class="w-24 shrink-0 space-y-2">
                  <div class="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-primary-900 bg-primary-900 text-lg font-black text-accent-300">
                    <img
                      v-if="sponsorLogoPreview(sponsor)"
                      :src="sponsorLogoPreview(sponsor)"
                      :alt="`Logo ${sponsor.name}`"
                      class="h-full w-full object-contain bg-white p-2"
                    >
                    <span v-else>{{ sponsor.logoText }}</span>
                  </div>
                  <label class="block">
                    <span class="sr-only">Text loga</span>
                    <input
                      v-model="sponsor.logoText"
                      maxlength="6"
                      :disabled="!canOperateSponsors"
                      class="h-9 w-full rounded-md border border-border bg-white px-2 text-center text-xs font-black text-primary-900"
                      aria-label="Text loga sponzora"
                    >
                  </label>
                  <label
                    class="flex h-9 cursor-pointer items-center justify-center gap-1 rounded-md border border-border bg-muted px-2 text-xs font-bold text-primary-800"
                    :class="!canOperateSponsors ? 'pointer-events-none opacity-50' : ''"
                  >
                    <UIcon name="i-heroicons-photo" class="h-4 w-4" />
                    Logo
                    <input
                      type="file"
                      :accept="sponsorLogoAccept"
                      :disabled="!canOperateSponsors"
                      class="sr-only"
                      @change="handleSponsorLogoFile(sponsor, $event)"
                    >
                  </label>
                  <p class="text-foreground-muted text-[11px] leading-snug">
                    {{ logoRuleHint(sponsor.placementType) }}
                  </p>
                  <p v-if="sponsorLogoDimensions(sponsor)" class="text-[11px] font-semibold text-primary-800">
                    {{ sponsorLogoDimensions(sponsor) }}
                  </p>
                  <button
                    v-if="sponsorLogoPreview(sponsor)"
                    type="button"
                    :disabled="!canOperateSponsors"
                    class="h-8 w-full rounded-md text-xs font-bold text-error-700 disabled:opacity-50"
                    @click="clearSponsorLogo(sponsor)"
                  >
                    Odobrať
                  </button>
                </div>
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
                    <StatusBadge
                      class="w-fit"
                      :icon="sponsor.active ? 'i-heroicons-check-circle' : 'i-heroicons-pause-circle'"
                      :label="sponsor.active ? 'aktívny' : 'pauza'"
                      size="xs"
                      :tone="sponsor.active ? 'success' : 'muted'"
                    />
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
              <div class="mt-4 rounded-md border border-border bg-muted p-3">
                <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 class="text-sm font-bold">Varianty loga</h3>
                    <p class="text-foreground-muted text-xs">
                      Hlavné logo ostáva náhradou. Variant sa použije len pre dané umiestnenie.
                    </p>
                  </div>
                </div>
                <div class="mt-3 grid gap-3 rounded-md border border-border bg-white p-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                  <div class="flex items-center gap-3">
                    <div class="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary-900 text-xs font-black text-accent-300">
                      <img
                        v-if="sponsorLogoVariantSourcePreview(sponsor)"
                        :src="sponsorLogoVariantSourcePreview(sponsor)"
                        :alt="`Zdroj loga ${sponsor.name}`"
                        class="h-full w-full bg-white object-contain p-1.5"
                      >
                      <span v-else>{{ sponsor.logoText }}</span>
                    </div>
                    <div class="min-w-0">
                      <p class="text-xs font-bold">Zdroj pre varianty</p>
                      <p class="text-foreground-muted truncate text-[11px]">
                        {{ sponsor.logoVariantSourceFileName || sponsor.logoSourceFileName || sponsor.logoFileName || 'hlavné logo alebo nový zdroj' }}
                      </p>
                      <p v-if="sponsorLogoVariantSourceDimensions(sponsor)" class="mt-0.5 text-[11px] font-semibold text-primary-800">
                        {{ sponsorLogoVariantSourceDimensions(sponsor) }}
                      </p>
                      <p class="text-foreground-muted mt-0.5 line-clamp-2 text-[11px] leading-snug">
                        {{ logoVariantTargetSummary() }}
                      </p>
                    </div>
                  </div>
                  <div class="grid gap-2 sm:grid-cols-2 xl:w-[28rem]">
                    <label
                      class="flex h-9 cursor-pointer items-center justify-center gap-1 rounded-md border border-border bg-muted px-2 text-[11px] font-bold text-primary-800"
                      :class="!canOperateSponsors ? 'pointer-events-none opacity-50' : ''"
                    >
                      <UIcon name="i-heroicons-photo" class="h-3.5 w-3.5" />
                      Zdroj
                      <input
                        type="file"
                        :accept="sponsorLogoAccept"
                        :disabled="!canOperateSponsors"
                        class="sr-only"
                        @change="handleSponsorLogoVariantSourceFile(sponsor, $event)"
                      >
                    </label>
                    <UButton
                      v-if="sponsor.logoVariantSourceUpload || sponsor.logoSourceUrl"
                      type="button"
                      icon="i-heroicons-x-mark"
                      color="error"
                      variant="ghost"
                      size="xs"
                      :disabled="!canOperateSponsors"
                      @click="clearSponsorLogoVariantSource(sponsor)"
                    >
                      Odobrať zdroj
                    </UButton>
                    <label class="block">
                      <span class="sr-only">Režim variantov</span>
                      <select
                        v-model="sponsor.logoVariantGenerateMode"
                        :disabled="!canOperateSponsors"
                        class="h-9 w-full rounded-md border border-border bg-white px-2 text-[11px] font-semibold"
                      >
                        <option
                          v-for="(label, mode) in logoVariantModeLabels"
                          :key="mode"
                          :value="mode"
                        >
                          {{ label }}
                        </option>
                      </select>
                    </label>
                    <label class="block sm:col-span-2">
                      <span class="flex items-center justify-between text-[11px] font-semibold text-foreground-muted">
                        <span>Odsadenie</span>
                        <span>{{ sponsorLogoVariantGeneratePadding(sponsor) }} %</span>
                      </span>
                      <input
                        v-model.number="sponsor.logoVariantGeneratePadding"
                        type="range"
                        min="0"
                        max="20"
                        step="2"
                        :disabled="!canOperateSponsors"
                        class="mt-1 w-full accent-primary-700"
                      >
                    </label>
                    <UButton
                      type="button"
                      icon="i-heroicons-sparkles"
                      size="xs"
                      class="sm:col-span-2"
                      :disabled="!canOperateSponsors || !sponsorLogoVariantSourcePreview(sponsor)"
                      @click="generateSponsorLogoVariants(sponsor)"
                    >
                      Vygenerovať varianty
                    </UButton>
                  </div>
                </div>
                <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <div
                    v-for="variant in sponsor.logoVariants ?? []"
                    :key="variant.placementType"
                    class="rounded-md border border-border bg-white p-3"
                  >
                    <div class="flex items-center gap-3">
                      <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary-900 text-xs font-black text-accent-300">
                        <img
                          v-if="logoVariantPreview(variant)"
                          :src="logoVariantPreview(variant)"
                          :alt="`Variant loga ${sponsor.name} pre ${placementTypeLabels[variant.placementType]}`"
                          class="h-full w-full bg-white object-contain p-1.5"
                        >
                        <span v-else>{{ sponsor.logoText }}</span>
                      </div>
                      <div class="min-w-0 flex-1">
                        <p class="text-xs font-bold">{{ placementTypeLabels[variant.placementType] }}</p>
                        <p class="text-foreground-muted text-[11px] leading-snug">
                          {{ logoRuleHint(variant.placementType) }}
                        </p>
                        <p v-if="logoVariantDimensions(variant)" class="mt-0.5 text-[11px] font-semibold text-primary-800">
                          {{ logoVariantDimensions(variant) }}
                        </p>
                        <p v-if="variant.cropPreset" class="mt-0.5 text-[11px] font-semibold text-success-700">
                          Orez {{ variant.cropPreset.mode === 'cover' ? 'vyplniť' : 'celé' }} · {{ variant.cropPreset.focusXPercent }} / {{ variant.cropPreset.focusYPercent }} %
                        </p>
                      </div>
                    </div>
                    <div class="mt-3 rounded-md border border-border bg-muted p-2">
                      <button
                        type="button"
                        class="relative mb-3 w-full touch-none overflow-hidden rounded-md border border-border bg-white bg-center shadow-inner disabled:cursor-not-allowed disabled:opacity-60"
                        :aria-label="`Nastaviť ohnisko variantu ${placementTypeLabels[variant.placementType]}`"
                        :disabled="!canUseLogoVariantCropEditor(sponsor)"
                        :style="logoVariantCropPreviewStyle(sponsor, variant)"
                        @pointerdown="handleLogoVariantFocusPointerDown(variant, $event)"
                        @pointermove="handleLogoVariantFocusPointerMove(variant, $event)"
                      >
                        <span
                          class="absolute h-4 w-4 rounded-full border-2 border-white bg-accent-500 shadow-[0_0_0_1px_rgba(9,56,52,0.8)]"
                          :style="{
                            left: `${logoVariantFocusX(variant)}%`,
                            top: `${logoVariantFocusY(variant)}%`,
                            transform: 'translate(-50%, -50%)',
                          }"
                        />
                        <span class="absolute inset-x-0 top-1/2 border-t border-white/70" />
                        <span class="absolute inset-y-0 left-1/2 border-l border-white/70" />
                        <span class="sr-only">Kliknutím alebo potiahnutím nastavíte ohnisko orezu.</span>
                      </button>
                      <div class="grid gap-2 sm:grid-cols-2">
                        <label class="block">
                          <span class="flex items-center justify-between text-[11px] font-semibold text-foreground-muted">
                            <span>Ohnisko X</span>
                            <span>{{ logoVariantFocusX(variant) }} %</span>
                          </span>
                          <input
                            v-model.number="variant.generateFocusX"
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            :disabled="!canOperateSponsors || !sponsorLogoVariantSourcePreview(sponsor)"
                            class="mt-1 w-full accent-primary-700"
                          >
                        </label>
                        <label class="block">
                          <span class="flex items-center justify-between text-[11px] font-semibold text-foreground-muted">
                            <span>Ohnisko Y</span>
                            <span>{{ logoVariantFocusY(variant) }} %</span>
                          </span>
                          <input
                            v-model.number="variant.generateFocusY"
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            :disabled="!canOperateSponsors || !sponsorLogoVariantSourcePreview(sponsor)"
                            class="mt-1 w-full accent-primary-700"
                          >
                        </label>
                      </div>
                      <UButton
                        type="button"
                        icon="i-heroicons-arrow-path"
                        size="xs"
                        variant="soft"
                        block
                        class="mt-2"
                        :disabled="!canOperateSponsors || !sponsorLogoVariantSourcePreview(sponsor)"
                        @click="regenerateSponsorLogoVariant(sponsor, variant.placementType)"
                      >
                        Prepočítať orez
                      </UButton>
                    </div>
                    <div class="mt-2 flex gap-2">
                      <label
                        class="flex h-8 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-border bg-muted px-2 text-[11px] font-bold text-primary-800"
                        :class="!canOperateSponsors ? 'pointer-events-none opacity-50' : ''"
                      >
                        <UIcon name="i-heroicons-arrow-up-tray" class="h-3.5 w-3.5" />
                        Nahrať
                        <input
                          type="file"
                          :accept="sponsorLogoAccept"
                          :disabled="!canOperateSponsors"
                          class="sr-only"
                          @change="handleSponsorLogoVariantFile(sponsor, variant.placementType, $event)"
                        >
                      </label>
                      <button
                        v-if="logoVariantPreview(variant)"
                        type="button"
                        :disabled="!canOperateSponsors"
                        class="h-8 rounded-md px-2 text-[11px] font-bold text-error-700 disabled:opacity-50"
                        @click="clearSponsorLogoVariant(sponsor, variant.placementType)"
                      >
                        Odobrať
                      </button>
                    </div>
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
                    placeholder="napr. RC, pri prázdnom sa doplnia iniciály"
                  >
                </label>
                <div class="rounded-md border border-border bg-muted p-3">
                  <div class="flex items-center gap-3">
                    <div class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md bg-primary-900 text-sm font-black text-accent-300">
                      <img
                        v-if="newSponsorDraft.logoPreviewUrl"
                        :src="newSponsorDraft.logoPreviewUrl"
                        alt="Náhľad loga nového partnera"
                        class="h-full w-full bg-white object-contain p-2"
                      >
                      <span v-else>{{ newSponsorDraft.logoText || sponsorInitials(newSponsorDraft.name) }}</span>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-semibold">Logo partnera</p>
                      <p class="text-foreground-muted text-xs">JPG, PNG alebo WebP do {{ formatLogoSize(MAX_SPONSOR_LOGO_BYTES) }}.</p>
                      <p class="text-foreground-muted mt-1 text-xs">{{ logoRuleHint(newSponsorDraft.placementType) }}</p>
                      <p v-if="newSponsorDraft.logoUpload" class="mt-1 text-xs font-semibold text-primary-800">
                        {{ newSponsorDraft.logoUpload.width }} x {{ newSponsorDraft.logoUpload.height }} px
                      </p>
                    </div>
                  </div>
                  <label class="mt-3 flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-bold text-primary-800">
                    <UIcon name="i-heroicons-arrow-up-tray" class="h-4 w-4" />
                    Nahrať logo
                    <input
                      type="file"
                      :accept="sponsorLogoAccept"
                      class="sr-only"
                      @change="handleNewSponsorLogoFile"
                    >
                  </label>
                </div>
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
            <DataStatusNotice
              v-if="sponsorDraftMessage"
              class="mt-4"
              :description="sponsorDraftMessage"
              :title="sponsorDraftStatus === 'error' ? 'Partnera sa nepodarilo pridať' : 'Partner je pripravený'"
              :tone="sponsorDraftStatus === 'error' ? 'error' : 'success'"
            />
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
