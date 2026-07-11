<script setup lang="ts">
useHead({ title: 'Vytvoriť účet' })

const route = useRoute()
const { register, user } = useMockAuth()
const name = ref('')
const email = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const showPassword = ref(false)
const submitStatus = ref<'idle' | 'submitting' | 'error'>('idle')
const submitMessage = ref('')

const requestedRedirect = computed(() =>
  isSafeAppRedirect(route.query.redirect) ? route.query.redirect : '',
)

const accountBenefits = [
  {
    description: 'Termíny vytvorené s rovnakým e-mailom sa zobrazia vo vašom účte.',
    icon: 'i-heroicons-calendar-days',
    title: 'Rezervácie',
  },
  {
    description: 'Spoločné výpravy a zápisníky zostanú priradené k vášmu profilu.',
    icon: 'i-heroicons-book-open',
    title: 'Zápisníky výprav',
  },
  {
    description: 'Na jednom mieste uvidíte úlovky, váhy a históriu výprav.',
    icon: 'i-heroicons-chart-bar-square',
    title: 'História úlovkov',
  },
]

async function submit() {
  submitMessage.value = ''
  if (password.value !== passwordConfirmation.value) {
    submitStatus.value = 'error'
    submitMessage.value = 'Zadané heslá sa nezhodujú.'
    return
  }

  submitStatus.value = 'submitting'
  const result = await register(name.value, email.value, password.value)
  if (!result.ok) {
    submitStatus.value = 'error'
    submitMessage.value = result.message ?? 'Účet sa nepodarilo vytvoriť.'
    return
  }

  await navigateTo(requestedRedirect.value || getAuthenticatedHome(user.value?.role))
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Rybársky účet"
      title="Vytvoriť účet"
      description="Uložte si rezervácie, výpravy a úlovky pod vlastným e-mailom."
    />

    <section class="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
      <div class="order-2 rounded-card bg-primary-900 p-6 text-white lg:order-1 lg:p-8">
        <div class="flex h-12 w-12 items-center justify-center rounded-md bg-white/10 text-accent-300">
          <UIcon name="i-heroicons-user-plus" class="h-7 w-7" />
        </div>
        <h2 class="mt-6 text-2xl font-bold">Vaše rybárske dáta zostanú spolu</h2>

        <div class="mt-7 space-y-5">
          <div v-for="item in accountBenefits" :key="item.title" class="flex items-start gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/10 text-accent-300">
              <UIcon :name="item.icon" class="h-5 w-5" />
            </div>
            <div>
              <h3 class="font-semibold">{{ item.title }}</h3>
              <p class="mt-1 text-sm leading-6 text-white/70">{{ item.description }}</p>
            </div>
          </div>
        </div>

        <p class="mt-7 border-t border-white/10 pt-5 text-sm leading-6 text-white/75">
          Členovia vašej partie môžu naďalej zapisovať úlovky cez kód výpravy aj bez vlastného účtu.
        </p>
      </div>

      <form class="order-1 rounded-card border border-border bg-surface p-5 sm:p-7 lg:order-2" @submit.prevent="submit">
        <div>
          <h2 class="text-2xl font-bold">Registračné údaje</h2>
          <p class="mt-2 text-sm text-foreground-muted">
            Po vytvorení účtu vás prihlásime priamo do osobného panelu.
          </p>
        </div>

        <label class="mt-6 block">
          <span class="text-sm font-semibold">Meno</span>
          <div class="relative mt-1">
            <UIcon
              name="i-heroicons-user"
              class="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-foreground-muted"
            />
            <input
              v-model="name"
              type="text"
              autocomplete="name"
              required
              minlength="2"
              maxlength="80"
              class="h-12 w-full rounded-md border border-border bg-white pr-3 pl-10 text-sm"
              placeholder="Vaše meno"
            >
          </div>
        </label>

        <label class="mt-4 block">
          <span class="text-sm font-semibold">E-mail</span>
          <div class="relative mt-1">
            <UIcon
              name="i-heroicons-envelope"
              class="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-foreground-muted"
            />
            <input
              v-model="email"
              type="email"
              autocomplete="email"
              required
              maxlength="120"
              class="h-12 w-full rounded-md border border-border bg-white pr-3 pl-10 text-sm"
              placeholder="vas@email.sk"
            >
          </div>
        </label>

        <label class="mt-4 block">
          <span class="text-sm font-semibold">Heslo</span>
          <div class="relative mt-1">
            <UIcon
              name="i-heroicons-lock-closed"
              class="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-foreground-muted"
            />
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              required
              minlength="10"
              maxlength="128"
              class="h-12 w-full rounded-md border border-border bg-white pr-11 pl-10 text-sm"
              placeholder="Aspoň 10 znakov"
            >
            <button
              type="button"
              class="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-foreground-muted hover:bg-muted hover:text-foreground"
              :aria-label="showPassword ? 'Skryť heslo' : 'Zobraziť heslo'"
              @click="showPassword = !showPassword"
            >
              <UIcon :name="showPassword ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'" class="h-5 w-5" />
            </button>
          </div>
          <span class="mt-2 block text-xs leading-5 text-foreground-muted">
            Aspoň 10 znakov, malé a veľké písmeno a číslo.
          </span>
        </label>

        <label class="mt-4 block">
          <span class="text-sm font-semibold">Zopakujte heslo</span>
          <div class="relative mt-1">
            <UIcon
              name="i-heroicons-lock-closed"
              class="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-foreground-muted"
            />
            <input
              v-model="passwordConfirmation"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              required
              minlength="10"
              maxlength="128"
              class="h-12 w-full rounded-md border border-border bg-white pr-3 pl-10 text-sm"
              placeholder="Rovnaké heslo"
            >
          </div>
        </label>

        <DataStatusNotice
          v-if="submitMessage"
          class="mt-5"
          :description="submitMessage"
          icon="i-heroicons-exclamation-triangle"
          title="Účet sa nepodarilo vytvoriť"
          tone="error"
        />

        <UButton
          type="submit"
          icon="i-heroicons-user-plus"
          block
          size="lg"
          class="mt-6"
          :loading="submitStatus === 'submitting'"
        >
          Vytvoriť účet
        </UButton>

        <p class="mt-5 text-center text-sm text-foreground-muted">
          Už máte účet?
          <NuxtLink to="/login" class="font-semibold text-primary-700 hover:text-primary-900">
            Prihlásiť sa
          </NuxtLink>
        </p>
      </form>
    </section>
  </div>
</template>
