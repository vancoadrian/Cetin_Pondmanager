<script setup lang="ts">
useHead({ title: 'Kontakt' })

const { contactInfo } = usePondData()
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Kontakt"
      title="Správa revíru a rezervácie"
      description="Kontaktná obrazovka pre rybárov, ktorí potrebujú potvrdiť termín, nahlásiť úlovok alebo riešiť prevádzkový problém."
    />

    <section class="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
      <div class="space-y-6">
        <div class="border-border bg-surface rounded-card border p-5">
          <h2 class="text-xl font-bold">Rezervácie</h2>
          <p class="text-foreground-muted mt-2 text-sm">
            {{ contactInfo.reservationNote }}
          </p>
          <div class="mt-5 space-y-4">
            <a
              :href="`tel:${contactInfo.phoneHref}`"
              class="bg-muted flex items-center gap-3 rounded-md p-4 hover:bg-primary-50"
            >
              <UIcon name="i-heroicons-phone" class="text-primary-700 h-5 w-5" />
              <span class="font-bold">{{ contactInfo.phoneDisplay }}</span>
            </a>
            <div class="bg-muted rounded-md p-4">
              <p class="font-semibold">{{ contactInfo.managerName }}</p>
              <p class="text-foreground-muted text-sm">{{ contactInfo.role }}</p>
              <div class="mt-3 space-y-2 text-sm text-foreground-muted">
                <p v-for="hour in contactInfo.phoneHours" :key="hour" class="flex items-center gap-2">
                  <UIcon name="i-heroicons-clock" class="text-primary-700 h-4 w-4" />
                  {{ hour }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="border-border bg-surface rounded-card border p-5">
          <h2 class="text-xl font-bold">Rýchle odkazy</h2>
          <div class="mt-5 grid gap-3">
            <UButton to="/rezervacie" icon="i-heroicons-calendar-days" variant="soft">
              Vytvoriť žiadosť o rezerváciu
            </UButton>
            <UButton to="/info" icon="i-heroicons-information-circle" variant="soft">
              Pravidlá, cenník a povinná výbava
            </UButton>
          </div>
        </div>
      </div>

      <div class="border-border bg-surface rounded-card border p-5">
        <h2 class="text-xl font-bold">Správa z appky</h2>
        <form class="mt-5 grid gap-4">
          <label class="block">
            <span class="text-sm font-semibold">Typ správy</span>
            <select class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm">
              <option>Rezervácia</option>
              <option>Úlovok alebo fotka</option>
              <option>Požičovňa výbavy</option>
              <option>Problém pri vode</option>
              <option>Súťaž</option>
            </select>
          </label>
          <label class="block">
            <span class="text-sm font-semibold">Kontakt</span>
            <input
              placeholder="Meno, telefón alebo email"
              class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
            >
          </label>
          <label class="block">
            <span class="text-sm font-semibold">Správa</span>
            <textarea
              rows="5"
              placeholder="Napíšte, čo potrebujete..."
              class="border-border mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <UButton type="button" icon="i-heroicons-paper-airplane">Odoslať správu</UButton>
        </form>
      </div>
    </section>
  </div>
</template>
