<script setup lang="ts">
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const STORAGE_KEY = 'rybolov-cetin-install-dismissed-at'
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000

const deferred = ref<BeforeInstallPromptEvent | null>(null)
const visible = ref(false)
const installing = ref(false)
const mode = ref<'native' | 'ios' | null>(null)

interface StandaloneNavigator extends Navigator {
  standalone?: boolean
}

function recentlyDismissed() {
  if (typeof window === 'undefined') return true
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return false
  const ts = Number(raw)
  return Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS
}

function onBeforeInstallPrompt(event: Event) {
  event.preventDefault()
  if (recentlyDismissed()) return
  deferred.value = event as BeforeInstallPromptEvent
  mode.value = 'native'
  visible.value = true
}

function onAppInstalled() {
  deferred.value = null
  mode.value = null
  visible.value = false
}

async function install() {
  const event = deferred.value
  if (!event) return
  installing.value = true
  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    if (outcome === 'dismissed') {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()))
    }
    deferred.value = null
    mode.value = null
    visible.value = false
  } finally {
    installing.value = false
  }
}

function dismiss() {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()))
  }
  deferred.value = null
  mode.value = null
  visible.value = false
}

function isIosDevice() {
  const platform = window.navigator.platform || ''
  const userAgent = window.navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
}

function isStandaloneMode() {
  const navigatorWithStandalone = window.navigator as StandaloneNavigator
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
}

onMounted(() => {
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)

  if (isIosDevice() && !isStandaloneMode() && !recentlyDismissed()) {
    mode.value = 'ios'
    visible.value = true
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.removeEventListener('appinstalled', onAppInstalled)
})

const showing = computed(() => visible.value && (deferred.value !== null || mode.value === 'ios'))
const title = computed(() => (mode.value === 'ios' ? 'Pridať Rybolov Cetín na plochu' : 'Inštalovať Rybolov Cetín'))
const body = computed(() =>
  mode.value === 'ios'
    ? 'Na iPhone alebo iPade použite Zdieľať a zvoľte Pridať na plochu.'
    : 'Rezervácie, obsadenosť a výstrahy otvoríte rýchlo z plochy aj pri slabšom signále.',
)
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-full opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-full opacity-0"
  >
    <div
      v-if="showing"
      class="border-border bg-surface fixed inset-x-3 bottom-3 z-50 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border p-4 shadow-lg sm:right-6 sm:bottom-6 sm:left-auto sm:max-w-sm"
      role="dialog"
      aria-labelledby="pwa-install-title"
    >
      <div class="flex items-start gap-3">
        <div class="bg-primary-50 text-primary-700 shrink-0 rounded-full p-2">
          <UIcon name="i-heroicons-device-phone-mobile" class="h-5 w-5" />
        </div>
        <div class="min-w-0 flex-1">
          <p id="pwa-install-title" class="text-foreground break-words text-sm font-semibold">
            {{ title }}
          </p>
          <p class="text-foreground-muted mt-0.5 break-words text-xs">
            {{ body }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              v-if="mode === 'native'"
              size="xs"
              color="primary"
              :loading="installing"
              @click="install"
            >
              Inštalovať
            </UButton>
            <UButton size="xs" color="neutral" variant="ghost" @click="dismiss">
              {{ mode === 'ios' ? 'Rozumiem' : 'Neskôr' }}
            </UButton>
          </div>
        </div>
        <button
          type="button"
          class="text-foreground-muted hover:text-foreground -mt-1 -mr-1 shrink-0 p-1"
          aria-label="Zavrieť"
          @click="dismiss"
        >
          <UIcon name="i-heroicons-x-mark" class="h-4 w-4" />
        </button>
      </div>
    </div>
  </Transition>
</template>
