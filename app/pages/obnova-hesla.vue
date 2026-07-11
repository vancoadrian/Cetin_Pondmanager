<script setup lang="ts">
import type { PasswordResetConfirmResponse } from '~/services/accountPasswordResetService'

useHead({ title: 'Obnova hesla' })

const route = useRoute()
const password = ref('')
const passwordConfirmation = ref('')
const showPassword = ref(false)
const submitStatus = ref<'idle' | 'submitting' | 'error'>('idle')
const submitMessage = ref('')
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')

function getErrorMessage(error: unknown) {
  const fetchError = error as {
    data?: {
      data?: { messages?: string[] }
      message?: string
      statusMessage?: string
    }
  }
  return fetchError.data?.data?.messages?.join(' ')
    || fetchError.data?.message
    || fetchError.data?.statusMessage
    || 'Heslo sa nepodarilo obnoviť. Vyžiadajte si nový odkaz.'
}

async function submit() {
  submitMessage.value = ''
  if (password.value !== passwordConfirmation.value) {
    submitStatus.value = 'error'
    submitMessage.value = 'Zadané heslá sa nezhodujú.'
    return
  }

  submitStatus.value = 'submitting'
  try {
    await $fetch<PasswordResetConfirmResponse>('/api/auth/password-reset/confirm', {
      body: { password: password.value, token: token.value },
      method: 'POST',
    })
    await navigateTo('/login?stav=heslo-obnovene')
  }
  catch (error) {
    submitStatus.value = 'error'
    submitMessage.value = getErrorMessage(error)
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Používateľský účet"
      title="Nastaviť nové heslo"
      description="Zvoľte nové heslo pre svoj rybársky účet."
    />

    <section class="mx-auto max-w-xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="rounded-card border border-border bg-surface p-5 sm:p-7">
        <DataStatusNotice
          v-if="!token"
          description="V odkaze chýba reset token. Vyžiadajte si nový odkaz na obnovu hesla."
          icon="i-heroicons-link-slash"
          title="Odkaz nie je platný"
          tone="error"
        />

        <form v-else @submit.prevent="submit">
          <div class="flex h-11 w-11 items-center justify-center rounded-md bg-primary-50 text-primary-700">
            <UIcon name="i-heroicons-lock-closed" class="h-6 w-6" />
          </div>
          <h2 class="mt-5 text-2xl font-bold">Nové heslo</h2>
          <p class="mt-2 text-sm leading-6 text-foreground-muted">
            Použite aspoň 10 znakov, malé a veľké písmeno a číslo.
          </p>

          <label class="mt-6 block">
            <span class="text-sm font-semibold">Nové heslo</span>
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
            title="Heslo sa nepodarilo obnoviť"
            tone="error"
          />

          <UButton
            type="submit"
            icon="i-heroicons-check"
            block
            size="lg"
            class="mt-6"
            :loading="submitStatus === 'submitting'"
          >
            Uložiť nové heslo
          </UButton>
        </form>

        <div class="mt-5 text-center">
          <NuxtLink :to="token ? '/login' : '/zabudnute-heslo'" class="text-sm font-semibold text-primary-700 hover:text-primary-900">
            {{ token ? 'Späť na prihlásenie' : 'Vyžiadať nový odkaz' }}
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>
