<script setup lang="ts">
import type { PasswordResetRequestResponse } from '~/services/accountPasswordResetService'

useHead({ title: 'Zabudnuté heslo' })

const email = ref('')
const submitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const submitMessage = ref('')

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
    || 'Požiadavku sa nepodarilo odoslať. Skúste to znova.'
}

async function submit() {
  submitStatus.value = 'submitting'
  submitMessage.value = ''

  try {
    const response = await $fetch<PasswordResetRequestResponse>('/api/auth/password-reset/request', {
      body: { email: email.value },
      method: 'POST',
    })
    submitStatus.value = 'success'
    submitMessage.value = response.message
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
      title="Zabudnuté heslo"
      description="Pošleme vám jednorazový odkaz na nastavenie nového hesla."
    />

    <section class="mx-auto max-w-xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="rounded-card border border-border bg-surface p-5 sm:p-7">
        <div class="flex h-11 w-11 items-center justify-center rounded-md bg-primary-50 text-primary-700">
          <UIcon name="i-heroicons-key" class="h-6 w-6" />
        </div>
        <h2 class="mt-5 text-2xl font-bold">Obnoviť prístup k účtu</h2>
        <p class="mt-2 text-sm leading-6 text-foreground-muted">
          Zadajte e-mail použitý pri registrácii. Odkaz bude platný 30 minút.
        </p>

        <DataStatusNotice
          v-if="submitMessage"
          class="mt-5"
          :description="submitMessage"
          :icon="submitStatus === 'success' ? 'i-heroicons-envelope-open' : 'i-heroicons-exclamation-triangle'"
          :title="submitStatus === 'success' ? 'Skontrolujte e-mail' : 'Odoslanie sa nepodarilo'"
          :tone="submitStatus === 'success' ? 'success' : 'error'"
        />

        <form v-if="submitStatus !== 'success'" class="mt-6" @submit.prevent="submit">
          <label class="block">
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

          <UButton
            type="submit"
            icon="i-heroicons-paper-airplane"
            block
            size="lg"
            class="mt-6"
            :loading="submitStatus === 'submitting'"
          >
            Poslať odkaz
          </UButton>
        </form>

        <div class="mt-5 text-center">
          <NuxtLink to="/login" class="text-sm font-semibold text-primary-700 hover:text-primary-900">
            Späť na prihlásenie
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>
