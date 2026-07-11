<script setup lang="ts">
import type { StatusBadgeTone } from '~/utils/ui'

useHead({ title: 'Prihlásenie' })

interface AccessGroup {
  description: string
  icon: string
  roles: string[]
  title: string
  tone: StatusBadgeTone
}

const route = useRoute()
const requestUrl = useRequestURL()
const { login, user } = useMockAuth()
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const submitStatus = ref<'idle' | 'submitting' | 'error'>('idle')
const submitMessage = ref('')

const accessGroups: AccessGroup[] = [
  {
    description: 'Osobný panel pre výpravy, zápisníky, rezervácie a históriu úlovkov.',
    icon: 'i-heroicons-user-circle',
    roles: ['rybár'],
    title: 'Rybársky účet',
    tone: 'primary',
  },
  {
    description: 'Súťažné hlásenia, privolanie kontrolóra, meranie úlovkov a priebeh pretekov.',
    icon: 'i-heroicons-trophy',
    roles: ['tím', 'kontrolór', 'organizátor'],
    title: 'Súťaž',
    tone: 'warning',
  },
  {
    description: 'Rezervácie, obsadenosť, výbava, hlásenia, sponzori a interné nastavenia.',
    icon: 'i-heroicons-shield-check',
    roles: ['správca', 'majiteľ', 'účtovník', 'brigádnik'],
    title: 'Prevádzka',
    tone: 'success',
  },
]

const loginAssuranceItems = [
  {
    icon: 'i-heroicons-lock-closed',
    label: 'Súkromné údaje nie sú súčasťou verejnej stránky',
  },
  {
    icon: 'i-heroicons-device-phone-mobile',
    label: 'Rovnaký účet funguje na mobile aj počítači',
  },
  {
    icon: 'i-heroicons-user-group',
    label: 'Obsah a akcie sa riadia pridelenou rolou',
  },
]

const requestedRedirect = computed(() =>
  isSafeAppRedirect(route.query.redirect)
    ? route.query.redirect
    : isSafeAppRedirect(requestUrl.searchParams.get('redirect'))
      ? requestUrl.searchParams.get('redirect') ?? ''
      : '',
)
const loginNotice = computed(() => requestedRedirect.value
  ? 'Po prihlásení vás vrátime na požadovanú internú stránku.'
  : 'Po prihlásení sa otvorí priestor podľa pridelenej role.',
)
const accountWasDeleted = computed(() => route.query.stav === 'ucet-zmazany')
const passwordWasReset = computed(() => route.query.stav === 'heslo-obnovene')
const passwordWasChanged = computed(() => route.query.stav === 'heslo-zmenene')
const accountStatusNotice = computed(() => {
  if (accountWasDeleted.value) {
    return {
      description: 'Účet bol zmazaný, osobné väzby boli anonymizované a prihlásenie už nie je aktívne.',
      title: 'Účet je zmazaný',
    }
  }
  if (passwordWasReset.value) {
    return {
      description: 'Heslo bolo úspešne obnovené. Teraz sa môžete prihlásiť novým heslom.',
      title: 'Heslo je obnovené',
    }
  }
  if (passwordWasChanged.value) {
    return {
      description: 'Heslo bolo úspešne zmenené. Prihláste sa novým heslom.',
      title: 'Heslo je zmenené',
    }
  }
  return undefined
})

async function submit() {
  submitStatus.value = 'submitting'
  submitMessage.value = ''

  const result = await login(email.value, password.value)
  if (!result.ok) {
    submitStatus.value = 'error'
    submitMessage.value = result.message ?? 'E-mail alebo heslo nie sú správne.'
    return
  }

  const redirect = requestedRedirect.value || getAuthenticatedHome(user.value?.role)
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
      <div class="rounded-card bg-primary-900 p-6 text-white lg:p-8">
        <div class="flex items-start justify-between gap-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-md bg-white/10 text-accent-300">
            <UIcon name="i-heroicons-shield-check" class="h-7 w-7" />
          </div>
          <StatusBadge icon="i-heroicons-key" label="email + heslo" tone="accent" size="xs" />
        </div>
        <h2 class="mt-6 text-3xl font-bold">Jeden vstup, rôzne pracovné priestory.</h2>
        <p class="mt-4 text-sm leading-6 text-white/75">
          Rybár vidí svoje dáta, súťažný tím svoje hlásenia a správa revíru iba moduly,
          ku ktorým má pridelené oprávnenie.
        </p>

        <div class="mt-7 space-y-3">
          <div
            v-for="group in accessGroups"
            :key="group.title"
            class="rounded-card border border-white/10 bg-white/5 p-4"
          >
            <div class="flex items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/10 text-accent-300">
                <UIcon :name="group.icon" class="h-5 w-5" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="font-semibold text-white">{{ group.title }}</h3>
                  <StatusBadge
                    v-for="role in group.roles"
                    :key="role"
                    :label="role"
                    :tone="group.tone"
                    size="xs"
                  />
                </div>
                <p class="mt-2 text-sm leading-6 text-white/70">{{ group.description }}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-7 space-y-3 text-sm text-white/85">
          <p
            v-for="item in loginAssuranceItems"
            :key="item.label"
            class="flex items-center gap-3"
          >
            <UIcon :name="item.icon" class="h-5 w-5 text-accent-300" />
            {{ item.label }}
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

        <DataStatusNotice
          v-if="accountStatusNotice"
          class="mt-5"
          :description="accountStatusNotice.description"
          icon="i-heroicons-check-circle"
          :title="accountStatusNotice.title"
          tone="success"
        />

        <DataStatusNotice
          :class="accountStatusNotice ? 'mt-3' : 'mt-5'"
          :description="loginNotice"
          icon="i-heroicons-information-circle"
          title="Bezpečný prístup"
          tone="info"
        />

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
          <NuxtLink to="/zabudnute-heslo" class="text-sm font-semibold text-primary-700 hover:text-primary-900">
            Zabudli ste heslo?
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
          <NuxtLink to="/registracia" class="font-semibold text-primary-700 hover:text-primary-900">
            Vytvoriť rybársky účet
          </NuxtLink>
        </p>
      </form>
    </section>
  </div>
</template>
