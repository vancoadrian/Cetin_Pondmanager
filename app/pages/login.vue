<script setup lang="ts">
useHead({ title: 'Prihlásenie' })

const route = useRoute()
const { login, user } = useMockAuth()
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const submitStatus = ref<'idle' | 'submitting' | 'error'>('idle')
const submitMessage = ref('')

async function submit() {
  submitStatus.value = 'submitting'
  submitMessage.value = ''

  if (!login(email.value, password.value)) {
    submitStatus.value = 'error'
    submitMessage.value = 'E-mail alebo heslo nie sú správne.'
    return
  }

  const requestedRedirect = isSafeAppRedirect(route.query.redirect)
    ? route.query.redirect
    : ''
  const redirect = requestedRedirect || getAuthenticatedHome(user.value?.role)
  await navigateTo(redirect)
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Používateľský účet"
      title="Prihlásenie"
      description="Po prihlásení sa otvorí váš osobný alebo pracovný priestor podľa pridelenej roly."
    />

    <section class="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
      <div class="bg-primary-900 p-6 text-white lg:p-8">
        <div class="flex h-12 w-12 items-center justify-center rounded-md bg-white/10 text-accent-300">
          <UIcon name="i-heroicons-shield-check" class="h-7 w-7" />
        </div>
        <h2 class="mt-6 text-3xl font-bold">Všetko dôležité na jednom mieste.</h2>
        <p class="mt-4 text-sm leading-6 text-white/75">
          Rybári majú svoje výpravy a úlovky. Súťažné tímy, kontrolóri a organizátori vidia iba
          nástroje potrebné pre priebeh súťaže. Správa revíru je dostupná podľa oprávnení.
        </p>
        <div class="mt-8 space-y-3 text-sm text-white/85">
          <p class="flex items-center gap-3">
            <UIcon name="i-heroicons-lock-closed" class="h-5 w-5 text-accent-300" />
            Súkromné údaje nie sú súčasťou verejnej stránky
          </p>
          <p class="flex items-center gap-3">
            <UIcon name="i-heroicons-device-phone-mobile" class="h-5 w-5 text-accent-300" />
            Účet funguje na mobile aj počítači
          </p>
          <p class="flex items-center gap-3">
            <UIcon name="i-heroicons-user-group" class="h-5 w-5 text-accent-300" />
            Obsah a akcie sa riadia pridelenou rolou
          </p>
        </div>
      </div>

      <form class="rounded-card border border-border bg-surface p-5 sm:p-7" @submit.prevent="submit">
        <div>
          <h2 class="text-2xl font-bold">Prihláste sa do účtu</h2>
          <p class="mt-2 text-sm text-foreground-muted">
            Použite e-mailovú adresu a heslo priradené k vášmu účtu.
          </p>
        </div>

        <label class="mt-6 block">
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
              autocomplete="current-password"
              required
              class="h-12 w-full rounded-md border border-border bg-white pr-11 pl-10 text-sm"
              placeholder="Vaše heslo"
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
        </label>

        <div class="mt-4 flex items-center justify-end">
          <NuxtLink to="/kontakt" class="text-sm font-semibold text-primary-700 hover:text-primary-900">
            Problém s prihlásením?
          </NuxtLink>
        </div>

        <DataStatusNotice
          v-if="submitMessage"
          class="mt-4"
          :description="submitMessage"
          icon="i-heroicons-exclamation-triangle"
          title="Prihlásenie sa nepodarilo"
          tone="error"
        />

        <UButton
          type="submit"
          icon="i-heroicons-arrow-right-on-rectangle"
          block
          size="lg"
          class="mt-6"
          :loading="submitStatus === 'submitting'"
        >
          Prihlásiť sa
        </UButton>

        <p class="mt-5 text-center text-sm text-foreground-muted">
          Nemáte účet?
          <NuxtLink to="/kontakt" class="font-semibold text-primary-700 hover:text-primary-900">
            Kontaktujte správcu revíru
          </NuxtLink>
        </p>
      </form>
    </section>
  </div>
</template>
