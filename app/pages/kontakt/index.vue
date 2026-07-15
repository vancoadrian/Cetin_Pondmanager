<script setup lang="ts">
import type { StatusBadgeTone } from '~/utils/ui'

usePublicSeo({
  title: 'Kontakt',
  description: 'Kontakt na prevádzkovateľa revírov Rybolov Cetín pre rezervácie, úlovky, výbavu, hlásenia problémov a súťaže.',
})

const { contactInfo } = usePondData()

const contactTopics: Array<{
  actionLabel: string
  actionTarget: string
  detail: string
  icon: string
  label: string
  prefix: string
  suggestedMessage: string
  tone: StatusBadgeTone
  urgent?: boolean
}> = [
  {
    actionLabel: 'Otvoriť rezervácie',
    actionTarget: '/rezervacie',
    detail: 'termín, miesto, chata, výbava alebo doplnky',
    icon: 'i-heroicons-calendar-days',
    label: 'Rezervácia',
    prefix: 'Rezervácia',
    suggestedMessage: 'Chcem sa informovať k rezervácii. Termín: ____. Jazero/miesto: ____. Počet osôb: ____.',
    tone: 'primary',
  },
  {
    actionLabel: 'Zapísať úlovok',
    actionTarget: '/ulovky',
    detail: 'veľká ryba, čip, fotka alebo zápis do zápisníka',
    icon: 'i-heroicons-camera',
    label: 'Úlovok alebo fotka',
    prefix: 'Úlovok',
    suggestedMessage: 'Chytil som rybu. Jazero/miesto: ____. Váha/dĺžka: ____. Potrebujem riešiť čip alebo fotku.',
    tone: 'warning',
    urgent: true,
  },
  {
    actionLabel: 'Pozrieť výbavu',
    actionTarget: '/info',
    detail: 'podberák, podložka, drevo, gril alebo veci k chate',
    icon: 'i-heroicons-archive-box',
    label: 'Požičovňa výbavy',
    prefix: 'Požičovňa',
    suggestedMessage: 'Potrebujem pripraviť alebo overiť výbavu k rezervácii. Termín: ____. Položky: ____.',
    tone: 'success',
  },
  {
    actionLabel: 'Otvoriť mapu',
    actionTarget: '/mapa',
    detail: 'pokazené, chýba, nesvieti, problém s miestom',
    icon: 'i-heroicons-wrench-screwdriver',
    label: 'Problém pri vode',
    prefix: 'Hlásenie pri vode',
    suggestedMessage: 'Hlásim problém pri vode. Jazero/miesto: ____. Čo sa stalo alebo chýba: ____.',
    tone: 'error',
    urgent: true,
  },
  {
    actionLabel: 'Pozrieť súťaže',
    actionTarget: '/sutaze',
    detail: 'registrácia tímu, sektor, program alebo organizačná otázka',
    icon: 'i-heroicons-trophy',
    label: 'Súťaž',
    prefix: 'Súťaž',
    suggestedMessage: 'Mám otázku k súťaži. Názov súťaže/tím: ____. Čo potrebujem: ____.',
    tone: 'accent',
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
const urgentContactNotice = computed(() =>
  selectedTopic.value.urgent
    ? 'Pri veľkej rybe, úraze, búrke alebo probléme s bezpečnosťou volajte správcu priamo. SMS použite ako doplnok, keď hovor neprejde.'
    : 'Správu si môžete pripraviť ako SMS a pri rezervácii si rovno otvoriť príslušnú časť aplikácie.',
)

function selectTopic(label: string) {
  const nextTopic = contactTopics.find((topic) => topic.label === label) ?? contactTopics[0]!
  const previousTopic = selectedTopic.value
  const canReplaceMessage = !contactForm.message.trim() || contactForm.message === previousTopic.suggestedMessage

  contactForm.topic = nextTopic.label
  if (canReplaceMessage) {
    contactForm.message = nextTopic.suggestedMessage
  }
}

function handleTopicSelect(event: Event) {
  selectTopic((event.target as HTMLSelectElement).value)
}

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

        <DataStatusNotice
          :description="urgentContactNotice"
          :icon="selectedTopic.urgent ? 'i-heroicons-phone-arrow-up-right' : 'i-heroicons-chat-bubble-left-right'"
          :title="selectedTopic.urgent ? 'Pri urgentnej veci volajte' : 'Správu pripravíme ako SMS'"
          :tone="selectedTopic.urgent ? 'warning' : 'info'"
        />

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
          <div>
            <p class="text-sm font-semibold">Vyberte dôvod</p>
            <div class="mt-2 grid gap-2 sm:grid-cols-2">
              <button
                v-for="topic in contactTopics"
                :key="topic.label"
                type="button"
                class="rounded-md border p-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50"
                :class="contactForm.topic === topic.label ? 'border-primary-600 bg-primary-50' : 'border-border bg-white'"
                :aria-pressed="contactForm.topic === topic.label"
                @click="selectTopic(topic.label)"
              >
                <div class="flex items-start gap-2">
                  <UIcon :name="topic.icon" class="mt-0.5 h-5 w-5 shrink-0 text-primary-700" />
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-bold">{{ topic.label }}</p>
                      <StatusBadge v-if="topic.urgent" label="volať" tone="warning" size="xs" />
                    </div>
                    <p class="mt-1 text-xs text-foreground-muted">{{ topic.detail }}</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <label class="block">
            <span class="text-sm font-semibold">Typ správy</span>
            <select
              :value="contactForm.topic"
              class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
              @change="handleTopicSelect"
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
                :icon="selectedTopic.icon"
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
          <DataStatusNotice
            v-if="copyMessage"
            :description="copyMessage"
            :title="copyStatus === 'success' ? 'Text je pripravený' : 'Text sa nedá pripraviť'"
            :tone="copyStatus === 'success' ? 'success' : 'error'"
          />
        </form>
      </div>
    </section>
  </div>
</template>
