<script setup lang="ts">
useHead({ title: 'Kontakt' })

const { contactInfo } = usePondData()

const contactTopics = [
  {
    actionLabel: 'Otvoriť rezervácie',
    actionTarget: '/rezervacie',
    label: 'Rezervácia',
    prefix: 'Rezervácia',
  },
  {
    actionLabel: 'Zapísať úlovok',
    actionTarget: '/ulovky',
    label: 'Úlovok alebo fotka',
    prefix: 'Úlovok',
  },
  {
    actionLabel: 'Pozrieť výbavu',
    actionTarget: '/info',
    label: 'Požičovňa výbavy',
    prefix: 'Požičovňa',
  },
  {
    actionLabel: 'Otvoriť mapu',
    actionTarget: '/mapa',
    label: 'Problém pri vode',
    prefix: 'Hlásenie pri vode',
  },
  {
    actionLabel: 'Pozrieť súťaže',
    actionTarget: '/sutaze',
    label: 'Súťaž',
    prefix: 'Súťaž',
  },
]
const contactForm = reactive({
  contact: '',
  message: '',
  topic: contactTopics[0]!.label,
})
const copyStatus = ref<'error' | 'idle' | 'success'>('idle')
const copyMessage = ref('')
const selectedTopic = computed(
  () => contactTopics.find((topic) => topic.label === contactForm.topic) ?? contactTopics[0]!,
)
const preparedContactMessage = computed(() => [
  `Rybolov Cetín - ${selectedTopic.value.prefix}`,
  contactForm.contact ? `Kontakt: ${contactForm.contact}` : 'Doplňte kontakt.',
  contactForm.message ? `Správa: ${contactForm.message}` : 'Doplňte text správy.',
].join('\n'))
const isContactMessageReady = computed(() =>
  contactForm.contact.trim().length > 0 && contactForm.message.trim().length > 0,
)
const smsHref = computed(() =>
  `sms:${contactInfo.phoneHref}?&body=${encodeURIComponent(preparedContactMessage.value)}`,
)

function openSmsDraft() {
  if (!import.meta.client || !isContactMessageReady.value) return

  window.location.href = smsHref.value
}

async function copyPreparedMessage() {
  if (!isContactMessageReady.value) {
    copyStatus.value = 'error'
    copyMessage.value = 'Najprv doplňte kontakt a text správy.'
    return
  }

  if (!import.meta.client || !navigator.clipboard) {
    copyStatus.value = 'error'
    copyMessage.value = 'Kopírovanie nie je v tomto prehliadači dostupné.'
    return
  }

  try {
    await navigator.clipboard.writeText(preparedContactMessage.value)
    copyStatus.value = 'success'
    copyMessage.value = 'Text správy je skopírovaný.'
  }
  catch {
    copyStatus.value = 'error'
    copyMessage.value = 'Text sa nepodarilo skopírovať.'
  }
}

watch(contactForm, () => {
  copyStatus.value = 'idle'
  copyMessage.value = ''
})
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Kontakt"
      title="Správa revíru a rezervácie"
      description="Kontaktujte správcu pri rezervácii, úlovku, výbave, súťaži alebo prevádzkovom probléme pri vode."
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
        <h2 class="text-xl font-bold">Správa správcovi</h2>
        <p class="text-foreground-muted mt-2 text-sm">
          Správca rezervácie a prevádzkové veci potvrdzuje telefonicky. Správu si môžete pripraviť ako SMS.
        </p>
        <form class="mt-5 grid gap-4" @submit.prevent="openSmsDraft">
          <label class="block">
            <span class="text-sm font-semibold">Typ správy</span>
            <select
              v-model="contactForm.topic"
              class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
            >
              <option v-for="topic in contactTopics" :key="topic.label">
                {{ topic.label }}
              </option>
            </select>
          </label>
          <label class="block">
            <span class="text-sm font-semibold">Kontakt</span>
            <input
              v-model.trim="contactForm.contact"
              placeholder="Meno, telefón alebo email"
              required
              class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
            >
          </label>
          <label class="block">
            <span class="text-sm font-semibold">Správa</span>
            <textarea
              v-model.trim="contactForm.message"
              rows="5"
              placeholder="Napíšte, čo potrebujete..."
              required
              class="border-border mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <div class="rounded-md border border-border bg-muted p-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p class="text-sm font-bold">Náhľad SMS</p>
              <UButton
                :to="selectedTopic.actionTarget"
                icon="i-heroicons-arrow-top-right-on-square"
                size="sm"
                variant="soft"
              >
                {{ selectedTopic.actionLabel }}
              </UButton>
            </div>
            <pre class="mt-3 whitespace-pre-wrap text-sm text-foreground-muted">{{ preparedContactMessage }}</pre>
          </div>
          <div class="flex flex-col gap-3 sm:flex-row">
            <UButton
              type="submit"
              icon="i-heroicons-chat-bubble-left-right"
              :disabled="!isContactMessageReady"
            >
              Pripraviť SMS
            </UButton>
            <UButton
              type="button"
              icon="i-heroicons-clipboard-document"
              variant="soft"
              :disabled="!isContactMessageReady"
              @click="copyPreparedMessage"
            >
              Skopírovať text
            </UButton>
            <UButton
              :to="`tel:${contactInfo.phoneHref}`"
              icon="i-heroicons-phone"
              variant="soft"
            >
              Zavolať
            </UButton>
          </div>
          <p
            v-if="copyMessage"
            class="rounded-md px-3 py-2 text-sm"
            :class="copyStatus === 'success' ? 'bg-success-500/10 text-success-700' : 'bg-error-500/10 text-error-700'"
          >
            {{ copyMessage }}
          </p>
        </form>
      </div>
    </section>
  </div>
</template>
