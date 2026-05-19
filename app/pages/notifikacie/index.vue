<script setup lang="ts">
useHead({ title: 'Výstrahy' })

const { alerts } = usePondData()

const notificationStatus = ref<'unknown' | 'granted' | 'denied' | 'unsupported'>('unknown')
const requesting = ref(false)

onMounted(() => {
  if (!('Notification' in window)) {
    notificationStatus.value = 'unsupported'
    return
  }
  notificationStatus.value = Notification.permission as 'granted' | 'denied' | 'unknown'
})

async function requestNotifications() {
  if (!('Notification' in window)) {
    notificationStatus.value = 'unsupported'
    return
  }
  requesting.value = true
  try {
    const permission = await Notification.requestPermission()
    notificationStatus.value = permission as 'granted' | 'denied'
  } finally {
    requesting.value = false
  }
}

function alertClass(severity: string) {
  switch (severity) {
    case 'storm':
      return 'bg-error-500/10 text-error-500'
    case 'water':
      return 'bg-info-500/10 text-info-500'
    case 'service':
      return 'bg-warning-500/10 text-warning-500'
    default:
      return 'bg-primary-50 text-primary-700'
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Výstrahy"
      title="Push notifikácie pre situácie pri vode"
      description="Búrka, vietor, zmena rezervácie, servis chaty alebo súťažný oznam. PWA vie po povolení posielať upozornenia aj mimo otvoreného prehliadača."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div class="border-border bg-surface rounded-card border p-5">
          <div class="flex items-start gap-3">
            <div class="bg-primary-50 text-primary-700 rounded-full p-2">
              <UIcon name="i-heroicons-bell-alert" class="h-6 w-6" />
            </div>
            <div>
              <h2 class="text-xl font-bold">Povolenie notifikácií</h2>
              <p class="text-foreground-muted mt-2 text-sm">
                V prototype sa uloží iba povolenie prehliadača. Reálne odosielanie pôjde cez web
                push subscription a serverový dispatcher.
              </p>
            </div>
          </div>

          <div class="bg-muted mt-5 rounded-md p-4">
            <p class="text-foreground-muted text-sm">Stav</p>
            <p class="mt-1 text-lg font-bold">
              <span v-if="notificationStatus === 'granted'">povolené</span>
              <span v-else-if="notificationStatus === 'denied'">zamietnuté</span>
              <span v-else-if="notificationStatus === 'unsupported'">nepodporované</span>
              <span v-else>neznáme</span>
            </p>
          </div>

          <UButton
            class="mt-5"
            icon="i-heroicons-bell"
            :loading="requesting"
            :disabled="notificationStatus === 'unsupported'"
            block
            @click="requestNotifications"
          >
            Zapnúť upozornenia
          </UButton>
        </div>

        <div class="space-y-4">
          <article
            v-for="alert in alerts"
            :key="alert.id"
            class="border-border bg-surface rounded-card border p-5"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-xl font-bold">{{ alert.title }}</h2>
                <p class="text-foreground-muted mt-2 text-sm">{{ alert.body }}</p>
              </div>
              <span class="rounded-full px-3 py-1 text-xs font-semibold" :class="alertClass(alert.severity)">
                do {{ alert.validUntil }}
              </span>
            </div>
          </article>
        </div>
      </div>

      <div class="mt-8 grid gap-6 md:grid-cols-3">
        <div class="border-border bg-surface rounded-card border p-5">
          <h3 class="font-bold">Počasie</h3>
          <p class="text-foreground-muted mt-2 text-sm">
            búrky, vietor, nárazový dážď, bezpečnosť člnov a bivakov
          </p>
        </div>
        <div class="border-border bg-surface rounded-card border p-5">
          <h3 class="font-bold">Revír</h3>
          <p class="text-foreground-muted mt-2 text-sm">
            údržba chaty, zákaz vjazdu, zmena pravidiel, zvýšený pohyb techniky
          </p>
        </div>
        <div class="border-border bg-surface rounded-card border p-5">
          <h3 class="font-bold">Rezervácie</h3>
          <p class="text-foreground-muted mt-2 text-sm">
            potvrdenie, presun termínu, pripomenutie príchodu a odchodu
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
