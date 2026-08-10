<script setup lang="ts">
useHead({ title: 'Admin notifikácie' })

const {
  activeAlerts,
  activeNotificationView,
  alertActionId,
  alertActionMessage,
  alertActionNoticeTitle,
  alertActionNoticeTone,
  alertActionStatus,
  alertById,
  availableTopics,
  broadcastEmptyMessage,
  broadcastFilter,
  broadcastForm,
  broadcastLakeScope,
  broadcastLifecycleIcon,
  broadcastLifecycleLabel,
  broadcastLifecycleTone,
  broadcastNoticeTitle,
  broadcastNoticeTone,
  broadcastStatusIcon,
  broadcastStatusTone,
  broadcastSubmitMessage,
  broadcastSubmitStatus,
  broadcasts,
  canOperateNotifications,
  createManagerServiceSubscription,
  deliveryDiagnostics,
  deliveryDiagnosticsIcon,
  deliveryDiagnosticsLabel,
  deliveryDiagnosticsTone,
  deliveryEmptyMessage,
  deliveryFilter,
  deliveryLogs,
  deliveryProviderLabels,
  deliveryStatusIcon,
  deliveryStatusTone,
  disableAdminSubscription,
  enabledSubscriptions,
  endPublicAlert,
  filteredBroadcasts,
  filteredDeliveryLogs,
  filteredSubscriptions,
  formatBroadcastLifecycleDetail,
  formatDateTime,
  formatDeliverySummary,
  formatDeliveryUrgency,
  formatDurationSeconds,
  formatLakes,
  formatNotificationAudience,
  formatNotificationBroadcastStatus,
  formatNotificationDeliveryStatus,
  formatPushEndpoint,
  formatStoredNotificationMessage,
  formatSubscriptionAudience,
  formatTopics,
  getBroadcastFilterCount,
  getDeliveryFilterCount,
  getSubscriptionScopeFilterCount,
  getSubscriptionStatusFilterCount,
  getSubscriptionTopicFilterCount,
  inactiveAlertCount,
  internalAudienceRoles,
  internalDeviceNoticeTitle,
  internalDeviceNoticeTone,
  isMockSectorScopedRole,
  isTestBroadcast,
  lakes,
  largeFishBroadcasts,
  largeFishReadinessLabel,
  largeFishReadinessTone,
  largeFishServiceSubscriptions,
  latestLargeFishBroadcast,
  latestLargeFishDeliveryLogs,
  managerDeviceNoticeTitle,
  managerDeviceNoticeTone,
  managerServiceSubscriptionMessage,
  managerServiceSubscriptionStatus,
  minimumNotificationExpiryInput,
  missingDeliveryConfig,
  mockSubscriptionForm,
  mockSubscriptionSubmitMessage,
  mockSubscriptionSubmitStatus,
  mockSubscriptionTargetPreview,
  mockTournamentSectors,
  notificationAccessLabel,
  notificationAudienceRoleLabels,
  notificationReadOnlyMessage,
  notificationViewTabClass,
  notificationViewTabs,
  notificationsReadOnly,
  publicBroadcasts,
  publicDeliveryLogs,
  pushSubscriptionTopicLabels,
  selectNotificationView,
  serviceBroadcasts,
  serviceSubscriptions,
  severityIcon,
  severityTone,
  submitBroadcast,
  submitMockSubscription,
  submitTestBroadcast,
  submitTestCleanup,
  subscriptionActionId,
  subscriptionActionMessage,
  subscriptionActionNoticeTitle,
  subscriptionActionNoticeTone,
  subscriptionActionStatus,
  subscriptionEmptyMessage,
  subscriptionScopeFilter,
  subscriptionScopeFilters,
  subscriptionStatusFilter,
  subscriptionStatusFilters,
  subscriptionStatusIcon,
  subscriptionStatusTone,
  subscriptionTopicFilter,
  subscriptionTopicFilters,
  subscriptions,
  testBroadcastForm,
  testBroadcastNoticeTitle,
  testBroadcastNoticeTone,
  testBroadcastSubmitMessage,
  testBroadcastSubmitStatus,
  testBroadcasts,
  testCleanupForm,
  testCleanupNoticeTitle,
  testCleanupNoticeTone,
  testCleanupSubmitMessage,
  testCleanupSubmitStatus,
  testDeliveryLogs,
  timelineFilterButtonClass,
  timelineFilters,
  tournamentMarshals,
  tournaments,
} = await useAdminNotifications()
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Interná zóna"
      title="Notifikácie a výstrahy"
      description="Správca vie pripraviť búrkovú výstrahu, servisný oznam alebo správu k rezerváciám pre PWA odbery."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <DataStatusNotice
        v-if="notificationsReadOnly"
        class="mb-5"
        :description="notificationReadOnlyMessage"
        icon="i-heroicons-lock-closed"
        :title="`Režim prístupu: ${notificationAccessLabel}`"
        tone="info"
      />

      <nav class="mb-5 overflow-x-auto border-b border-border" aria-label="Pracovné pohľady notifikácií">
        <div class="flex min-w-max gap-6" role="tablist" aria-label="Notifikácie">
          <button
            v-for="tab in notificationViewTabs"
            :id="`notification-tab-${tab.value}`"
            :key="tab.value"
            type="button"
            role="tab"
            class="inline-flex min-h-11 items-center gap-2 border-b-2 px-1 py-3 text-sm font-bold transition-colors"
            :class="notificationViewTabClass(activeNotificationView === tab.value)"
            aria-controls="notification-panel"
            :aria-label="`${tab.label}: ${tab.count}`"
            :aria-selected="activeNotificationView === tab.value"
            @click="selectNotificationView(tab.value)"
          >
            <UIcon :name="tab.icon" class="h-4 w-4 shrink-0" />
            <span>{{ tab.label }}</span>
            <span class="text-xs tabular-nums opacity-70" aria-hidden="true">{{ tab.count }}</span>
          </button>
        </div>
      </nav>

      <div class="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-xs sm:text-sm">Aktívne odbery</p>
          <p class="mt-2 text-2xl font-bold sm:text-3xl">{{ enabledSubscriptions.length }}</p>
          <p class="text-foreground-muted mt-1 text-xs sm:text-sm">zariadenia s povolenými notifikáciami</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-xs sm:text-sm">Verejné oznamy</p>
          <p class="mt-2 text-2xl font-bold sm:text-3xl">{{ activeAlerts.length }}</p>
          <p class="text-foreground-muted mt-1 text-xs sm:text-sm">
            aktuálne zobrazené · v histórii: {{ inactiveAlertCount }}
          </p>
        </div>
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-xs sm:text-sm">Rozoslania</p>
          <p class="mt-2 text-2xl font-bold sm:text-3xl">{{ broadcasts.length }}</p>
          <p class="text-foreground-muted mt-1 text-xs sm:text-sm">
            {{ publicBroadcasts.length }} verejné · {{ testBroadcasts.length }} kontrolné
          </p>
        </div>
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-xs sm:text-sm">Záznamy doručenia</p>
          <p class="mt-2 text-2xl font-bold sm:text-3xl">{{ deliveryLogs.length }}</p>
          <p class="text-foreground-muted mt-1 text-xs sm:text-sm">
            {{ publicDeliveryLogs.length }} verejné · {{ testDeliveryLogs.length }} kontrolné
          </p>
        </div>
      </div>

      <div
        id="notification-panel"
        class="mt-5"
        role="tabpanel"
        :aria-labelledby="`notification-tab-${activeNotificationView}`"
      >
      <div v-show="activeNotificationView === 'dorucovanie'" class="rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-lg font-bold">Stav doručovania</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Stav doručovania podľa aktuálneho serverového nastavenia.
            </p>
          </div>
          <StatusBadge
            class="w-fit"
            :icon="deliveryDiagnosticsIcon()"
            :label="deliveryDiagnosticsLabel()"
            :tone="deliveryDiagnosticsTone()"
          />
        </div>

        <dl class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-md bg-muted px-3 py-3">
            <dt class="text-foreground-muted text-xs font-semibold uppercase">Režim</dt>
            <dd class="mt-1 text-sm font-bold">{{ deliveryProviderLabels[deliveryDiagnostics.provider] }}</dd>
          </div>
          <div class="rounded-md bg-muted px-3 py-3">
            <dt class="text-foreground-muted text-xs font-semibold uppercase">Kľúče</dt>
            <dd class="mt-1 text-sm font-bold">{{ deliveryDiagnostics.hasVapidConfig ? 'kompletný' : 'nekompletný' }}</dd>
          </div>
          <div class="rounded-md bg-muted px-3 py-3">
            <dt class="text-foreground-muted text-xs font-semibold uppercase">Platnosť pokusu</dt>
            <dd class="mt-1 text-sm font-bold">{{ formatDurationSeconds(deliveryDiagnostics.ttlSeconds) }}</dd>
          </div>
          <div class="rounded-md bg-muted px-3 py-3">
            <dt class="text-foreground-muted text-xs font-semibold uppercase">Urgentnosť</dt>
            <dd class="mt-1 text-sm font-bold">{{ formatDeliveryUrgency(deliveryDiagnostics.urgency) }}</dd>
          </div>
        </dl>

        <div class="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
          <p class="rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground-muted">
            Kontakt odosielateľa: <span class="font-semibold text-foreground">{{ deliveryDiagnostics.subject || 'nenastavený' }}</span>
          </p>
          <p class="rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground-muted">
            Časový limit: <span class="font-semibold text-foreground">{{ formatDurationSeconds(deliveryDiagnostics.timeoutMs / 1000) }}</span>
          </p>
        </div>

        <DataStatusNotice
          v-if="missingDeliveryConfig.length > 0"
          class="mt-4"
          :description="`Chýba konfigurácia: ${missingDeliveryConfig.join(', ')}`"
          title="Doručovanie čaká na nastavenie"
          tone="warning"
        />
      </div>

      <section v-show="activeNotificationView === 'dorucovanie'" class="mt-5 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Servisné notifikácie</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Privolanie správcu k veľkej rybe cieli na interné odbery témy prevádzka pre správcu a majiteľa.
            </p>
          </div>
          <StatusBadge
            icon="i-heroicons-bell-alert"
            :label="largeFishReadinessLabel"
            :tone="largeFishReadinessTone"
          />
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-md bg-muted px-3 py-3">
            <p class="text-xs font-semibold uppercase text-foreground-muted">Prevádzkové odbery</p>
            <p class="mt-1 text-2xl font-bold">{{ serviceSubscriptions.length }}</p>
            <p class="mt-1 text-xs text-foreground-muted">aktívne zariadenia pre okruh prevádzka</p>
          </div>
          <div class="rounded-md bg-muted px-3 py-3">
            <p class="text-xs font-semibold uppercase text-foreground-muted">Správca / majiteľ</p>
            <p class="mt-1 text-2xl font-bold">{{ largeFishServiceSubscriptions.length }}</p>
            <p class="mt-1 text-xs text-foreground-muted">cieľ veľkej ryby</p>
          </div>
          <div class="rounded-md bg-muted px-3 py-3">
            <p class="text-xs font-semibold uppercase text-foreground-muted">Servisné rozoslania</p>
            <p class="mt-1 text-2xl font-bold">{{ serviceBroadcasts.length }}</p>
            <p class="mt-1 text-xs text-foreground-muted">bez kontrolných rozoslaní</p>
          </div>
          <div class="rounded-md bg-muted px-3 py-3">
            <p class="text-xs font-semibold uppercase text-foreground-muted">Veľké ryby</p>
            <p class="mt-1 text-2xl font-bold">{{ largeFishBroadcasts.length }}</p>
            <p class="mt-1 text-xs text-foreground-muted">privolania a veľké úlovky</p>
          </div>
        </div>

        <div class="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div class="rounded-md border border-border bg-white p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="font-bold">Zariadenia pre veľkú rybu</h3>
                <p class="mt-1 text-sm text-foreground-muted">
                  Tieto odbery spĺňajú rolu a okruh pre privolanie správcu.
                </p>
              </div>
              <StatusBadge
                :label="`${largeFishServiceSubscriptions.length} aktívne`"
                :tone="largeFishServiceSubscriptions.length > 0 ? 'success' : 'warning'"
                size="xs"
              />
            </div>

            <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <UButton
                icon="i-heroicons-device-phone-mobile"
                variant="soft"
                :disabled="!canOperateNotifications"
                :loading="managerServiceSubscriptionStatus === 'submitting'"
                @click="createManagerServiceSubscription"
              >
                {{ largeFishServiceSubscriptions.length > 0 ? 'Pridať ďalšie zariadenie správcu' : 'Pridať zariadenie správcu' }}
              </UButton>
              <DataStatusNotice
                v-if="managerServiceSubscriptionMessage"
                class="flex-1"
                :description="managerServiceSubscriptionMessage"
                :loading="managerServiceSubscriptionStatus === 'submitting'"
                :title="managerDeviceNoticeTitle"
                :tone="managerDeviceNoticeTone"
              />
            </div>

            <div v-if="largeFishServiceSubscriptions.length" class="mt-4 space-y-2">
              <div
                v-for="subscription in largeFishServiceSubscriptions.slice(0, 4)"
                :key="subscription.id"
                class="rounded-md bg-muted px-3 py-2"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-bold">{{ subscription.deviceLabel }}</p>
                    <p class="mt-0.5 text-xs text-foreground-muted">
                      {{ subscription.audienceRole ? notificationAudienceRoleLabels[subscription.audienceRole] : 'interný odber' }}
                      · {{ formatTopics(subscription.topics) }}
                    </p>
                  </div>
                  <StatusBadge label="povolené" tone="success" size="xs" />
                </div>
              </div>
              <p v-if="largeFishServiceSubscriptions.length > 4" class="text-xs text-foreground-muted">
                Ďalších {{ largeFishServiceSubscriptions.length - 4 }} zariadení je v zozname odberov nižšie.
              </p>
            </div>
            <p v-else class="mt-4 rounded-md border border-dashed border-warning-500/30 bg-warning-500/10 p-3 text-sm text-warning-800">
              Privolanie veľkej ryby by teraz nemalo komu poslať internú notifikáciu. Pridajte zariadenie správcu, aby mal rybár po odoslaní požiadavky reálnu odpoveď.
            </p>
          </div>

          <div class="rounded-md border border-border bg-white p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="font-bold">Posledná veľká ryba</h3>
                <p class="mt-1 text-sm text-foreground-muted">
                  Rýchla kontrola, či doručenie skončilo ako odoslané, pripravené alebo preskočené.
                </p>
              </div>
              <StatusBadge
                v-if="latestLargeFishBroadcast"
                :label="formatNotificationBroadcastStatus(latestLargeFishBroadcast.status)"
                :tone="broadcastStatusTone(latestLargeFishBroadcast.status)"
                size="xs"
              />
            </div>

            <article v-if="latestLargeFishBroadcast" class="mt-4 rounded-md bg-muted p-3">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-bold">{{ latestLargeFishBroadcast.title }}</p>
                  <p class="mt-1 text-sm text-foreground-muted">{{ formatStoredNotificationMessage(latestLargeFishBroadcast.message) }}</p>
                  <p class="mt-2 text-xs text-foreground-muted">
                    {{ formatDateTime(latestLargeFishBroadcast.createdAt) }} ·
                    {{ latestLargeFishBroadcast.recipientCount }} odberov ·
                    {{ formatDeliverySummary(latestLargeFishBroadcast.id) }}
                  </p>
                  <p v-if="latestLargeFishBroadcast.targetAudience" class="mt-1 text-xs text-foreground-muted">
                    {{ formatNotificationAudience(latestLargeFishBroadcast.targetAudience) }}
                  </p>
                </div>
              </div>

              <div v-if="latestLargeFishDeliveryLogs.length" class="mt-3 space-y-2">
                <div
                  v-for="delivery in latestLargeFishDeliveryLogs.slice(0, 3)"
                  :key="delivery.id"
                  class="flex items-start justify-between gap-3 rounded-md bg-white px-3 py-2"
                >
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold">{{ delivery.deviceLabel }}</p>
                    <p class="mt-0.5 text-xs text-foreground-muted">{{ formatStoredNotificationMessage(delivery.message) }}</p>
                  </div>
                  <StatusBadge
                    class="shrink-0"
                    :icon="deliveryStatusIcon(delivery.status)"
                    :label="formatNotificationDeliveryStatus(delivery.status)"
                    size="xs"
                    :tone="deliveryStatusTone(delivery.status)"
                  />
                </div>
              </div>
            </article>
            <p v-else class="mt-4 rounded-md border border-dashed border-border p-3 text-sm text-foreground-muted">
              Zatiaľ nie je uložená žiadna správa k veľkej rybe.
            </p>
          </div>
        </div>
      </section>

      <div class="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div class="grid content-start gap-6">
          <div v-show="activeNotificationView === 'dorucovanie'" class="rounded-card border border-border bg-surface p-5">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Kontrola doručenia</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Overí interné doručenie bez pridania verejného oznamu do výstrah.
                </p>
              </div>
              <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                bez verejnej výstrahy
              </span>
            </div>

            <fieldset :disabled="!canOperateNotifications" class="contents">
              <div class="mt-5 grid gap-3">
                <label class="block">
                  <span class="text-sm font-semibold">Nadpis</span>
                  <input
                    v-model="testBroadcastForm.title"
                    type="text"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Text</span>
                  <textarea
                    v-model="testBroadcastForm.body"
                    rows="3"
                    class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                  />
                </label>
                <div>
                  <p class="text-sm font-semibold">Okruhy kontroly</p>
                  <div class="mt-2 flex flex-wrap gap-3 text-sm">
                    <label v-for="topic in availableTopics" :key="topic" class="flex items-center gap-2">
                      <input
                        v-model="testBroadcastForm.targetTopics"
                        :value="topic"
                        type="checkbox"
                        class="h-4 w-4 accent-primary-700"
                      >
                      {{ pushSubscriptionTopicLabels[topic] }}
                    </label>
                  </div>
                </div>
              </div>
            </fieldset>

            <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <UButton
                icon="i-heroicons-signal"
                :disabled="!canOperateNotifications"
                :loading="testBroadcastSubmitStatus === 'submitting'"
                @click="submitTestBroadcast"
              >
                Spustiť kontrolu
              </UButton>
              <DataStatusNotice
                v-if="testBroadcastSubmitMessage"
                class="flex-1"
                :description="testBroadcastSubmitMessage"
                :loading="testBroadcastSubmitStatus === 'submitting'"
                :title="testBroadcastNoticeTitle"
                :tone="testBroadcastNoticeTone"
              />
            </div>
          </div>

          <div v-show="activeNotificationView === 'dorucovanie'" class="rounded-card border border-border bg-surface p-5">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Údržba kontrolných rozoslaní</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Vyčistí staré interné kontroly a ich záznamy doručenia.
                </p>
              </div>
              <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                iba kontrolné
              </span>
            </div>

            <fieldset :disabled="!canOperateNotifications" class="contents">
              <div class="mt-5 grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Staršie ako dní</span>
                  <input
                    v-model.number="testCleanupForm.olderThanDays"
                    type="number"
                    min="0"
                    max="365"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Ponechať posledné</span>
                  <input
                    v-model.number="testCleanupForm.keepRecentTestBroadcasts"
                    type="number"
                    min="0"
                    max="50"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
              </div>
            </fieldset>

            <p class="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-foreground-muted">
              Aktuálne: {{ testBroadcasts.length }} kontrolných rozoslaní · {{ testDeliveryLogs.length }} kontrolných doručení
            </p>

            <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <UButton
                icon="i-heroicons-trash"
                color="neutral"
                variant="soft"
                :disabled="!canOperateNotifications"
                :loading="testCleanupSubmitStatus === 'submitting'"
                @click="submitTestCleanup"
              >
                Vyčistiť staré kontroly
              </UButton>
              <DataStatusNotice
                v-if="testCleanupSubmitMessage"
                class="flex-1"
                :description="testCleanupSubmitMessage"
                :loading="testCleanupSubmitStatus === 'submitting'"
                :title="testCleanupNoticeTitle"
                :tone="testCleanupNoticeTone"
              />
            </div>
          </div>

          <div v-show="activeNotificationView === 'oznamy'" class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Nová notifikácia</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Vytvorí verejný oznam a pripraví odoslanie notifikácie pre zvolené okruhy.
            </p>

            <fieldset :disabled="!canOperateNotifications" class="contents">
              <div class="mt-5 grid gap-3">
                <label class="block">
                  <span class="text-sm font-semibold">Nadpis</span>
                  <input
                    v-model="broadcastForm.title"
                    type="text"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Text</span>
                  <textarea
                    v-model="broadcastForm.body"
                    rows="4"
                    class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                  />
                </label>
                <div class="grid gap-3 md:grid-cols-3">
                  <label class="block">
                    <span class="text-sm font-semibold">Typ</span>
                    <select
                      v-model="broadcastForm.severity"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                      <option value="storm">búrka</option>
                      <option value="water">voda/vietor</option>
                      <option value="service">prevádzka</option>
                      <option value="info">info</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Platné do</span>
                    <input
                      v-model="broadcastForm.expiresAt"
                      type="datetime-local"
                      :min="minimumNotificationExpiryInput()"
                      required
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Jazero</span>
                    <select
                      v-model="broadcastLakeScope"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                      <option value="all">všetky jazerá</option>
                      <option v-for="lake in lakes" :key="lake.slug" :value="lake.slug">
                        {{ lake.name }}
                      </option>
                    </select>
                  </label>
                </div>
                <div>
                  <p class="text-sm font-semibold">Okruhy</p>
                  <div class="mt-2 flex flex-wrap gap-3 text-sm">
                    <label v-for="topic in availableTopics" :key="topic" class="flex items-center gap-2">
                      <input
                        v-model="broadcastForm.targetTopics"
                        :value="topic"
                        type="checkbox"
                        class="h-4 w-4 accent-primary-700"
                      >
                      {{ pushSubscriptionTopicLabels[topic] }}
                    </label>
                  </div>
                </div>
              </div>
            </fieldset>

            <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <UButton
                icon="i-heroicons-paper-airplane"
                :disabled="!canOperateNotifications"
                :loading="broadcastSubmitStatus === 'submitting'"
                @click="submitBroadcast"
              >
                Pripraviť odoslanie
              </UButton>
              <DataStatusNotice
                v-if="broadcastSubmitMessage"
                class="flex-1"
                :description="broadcastSubmitMessage"
                :loading="broadcastSubmitStatus === 'submitting'"
                :title="broadcastNoticeTitle"
                :tone="broadcastNoticeTone"
              />
            </div>
          </div>

          <div v-show="activeNotificationView === 'zariadenia'" class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Interné zariadenie</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Odber pre interné role, súťažné sektory a kontrolórov.
            </p>

            <fieldset :disabled="!canOperateNotifications" class="contents">
              <div class="mt-5 grid gap-3">
                <label class="block">
                  <span class="text-sm font-semibold">Zariadenie</span>
                  <input
                    v-model="mockSubscriptionForm.deviceLabel"
                    type="text"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="block">
                    <span class="text-sm font-semibold">Rola</span>
                    <select
                      v-model="mockSubscriptionForm.audienceRole"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                      <option v-for="role in internalAudienceRoles" :key="role" :value="role">
                        {{ notificationAudienceRoleLabels[role] }}
                      </option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Turnaj</span>
                    <select
                      v-model="mockSubscriptionForm.tournamentId"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                      <option value="">všetky turnaje</option>
                      <option v-for="tournament in tournaments" :key="tournament.id" :value="tournament.id">
                        {{ tournament.name }}
                      </option>
                    </select>
                  </label>
                </div>
                <label v-if="mockSubscriptionForm.audienceRole === 'marshal'" class="block">
                  <span class="text-sm font-semibold">Kontrolór</span>
                  <select
                    v-model="mockSubscriptionForm.marshalId"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option v-for="marshal in tournamentMarshals" :key="marshal.id" :value="marshal.id">
                      {{ marshal.name }}
                    </option>
                  </select>
                </label>
                <div v-if="isMockSectorScopedRole">
                  <p class="text-sm font-semibold">Sektory</p>
                  <div class="mt-2 flex flex-wrap gap-2 text-sm">
                    <label
                      v-for="sector in mockTournamentSectors"
                      :key="sector.id"
                      class="rounded-md border border-border bg-white px-2.5 py-1.5"
                    >
                      <input
                        v-model="mockSubscriptionForm.sectorIds"
                        :value="sector.id"
                        type="checkbox"
                        class="mr-2 h-4 w-4 accent-primary-700"
                      >
                      {{ sector.label }}
                    </label>
                  </div>
                </div>
                <div>
                  <p class="text-sm font-semibold">Okruhy</p>
                  <div class="mt-2 flex flex-wrap gap-3 text-sm">
                    <label v-for="topic in availableTopics" :key="topic" class="flex items-center gap-2">
                      <input
                        v-model="mockSubscriptionForm.topics"
                        :value="topic"
                        type="checkbox"
                        class="h-4 w-4 accent-primary-700"
                      >
                      {{ pushSubscriptionTopicLabels[topic] }}
                    </label>
                  </div>
                </div>
                <p class="rounded-md bg-muted px-3 py-2 text-xs text-foreground-muted">
                  {{ mockSubscriptionTargetPreview }}
                </p>
              </div>
            </fieldset>

            <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <UButton
                class="min-h-11 w-full justify-center sm:min-h-8 sm:w-auto"
                icon="i-heroicons-device-phone-mobile"
                :disabled="!canOperateNotifications"
                :loading="mockSubscriptionSubmitStatus === 'submitting'"
                @click="submitMockSubscription"
              >
                Uložiť interné zariadenie
              </UButton>
              <DataStatusNotice
                v-if="mockSubscriptionSubmitMessage"
                class="flex-1"
                :description="mockSubscriptionSubmitMessage"
                :loading="mockSubscriptionSubmitStatus === 'submitting'"
                :title="internalDeviceNoticeTitle"
                :tone="internalDeviceNoticeTone"
              />
            </div>
          </div>
        </div>

        <div class="grid content-start gap-6">
          <section v-show="activeNotificationView === 'oznamy'" class="border-y border-border py-5">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Aktívne verejné oznamy</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Na verejnej stránke zostávajú iba do skončenia platnosti alebo ručného ukončenia.
                </p>
              </div>
              <StatusBadge
                class="w-fit shrink-0"
                icon="i-heroicons-eye"
                :label="`aktívne: ${activeAlerts.length}`"
                tone="success"
              />
            </div>

            <div v-if="activeAlerts.length > 0" class="mt-4 divide-y divide-border border-y border-border">
              <article v-for="alert in activeAlerts.slice(0, 6)" :key="alert.id" class="py-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="font-bold">{{ alert.title }}</h3>
                      <StatusBadge
                        :icon="severityIcon(alert.severity)"
                        :label="alert.severity === 'storm' ? 'búrka' : alert.severity === 'water' ? 'voda' : alert.severity === 'service' ? 'servis' : 'oznam'"
                        size="xs"
                        :tone="severityTone(alert.severity)"
                      />
                    </div>
                    <p class="text-foreground-muted mt-1 text-sm">{{ alert.body }}</p>
                    <p class="text-foreground-muted mt-2 text-xs">
                      {{ formatLakes(alert.lakeIds) }} · platné do {{ alert.expiresAt ? formatDateTime(alert.expiresAt) : alert.validUntil }}
                    </p>
                    <DataStatusNotice
                      v-if="alertActionId === alert.id && alertActionMessage"
                      class="mt-3"
                      :description="alertActionMessage"
                      :loading="alertActionStatus === 'submitting'"
                      :title="alertActionNoticeTitle"
                      :tone="alertActionNoticeTone"
                    />
                  </div>
                  <UButton
                    class="min-h-11 w-full shrink-0 justify-center sm:min-h-7 sm:w-auto"
                    icon="i-heroicons-stop-circle"
                    color="neutral"
                    variant="soft"
                    size="xs"
                    :disabled="!canOperateNotifications"
                    :loading="alertActionId === alert.id && alertActionStatus === 'submitting'"
                    @click="endPublicAlert(alert)"
                  >
                    Ukončiť oznam
                  </UButton>
                </div>
              </article>
            </div>
            <p v-else class="text-foreground-muted mt-4 border-y border-dashed border-border py-4 text-sm">
              Na verejnej stránke momentálne nie je aktívny žiadny oznam.
            </p>
          </section>

          <div v-show="activeNotificationView === 'oznamy'" class="rounded-card border border-border bg-surface p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Posledné rozoslania</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Verejné oznamy a kontrolné interné rozoslania sú oddelené pre čistejšiu prevádzku.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="filter in timelineFilters"
                  :key="`broadcast-${filter.value}`"
                  type="button"
                  class="min-h-11 rounded-md border px-2.5 py-1 text-xs font-bold transition sm:min-h-7"
                  :class="timelineFilterButtonClass(broadcastFilter === filter.value)"
                  @click="broadcastFilter = filter.value"
                >
                  {{ filter.label }} · {{ getBroadcastFilterCount(filter.value) }}
                </button>
              </div>
            </div>
            <div class="mt-4 space-y-3">
              <article v-for="broadcast in filteredBroadcasts.slice(0, 5)" :key="broadcast.id" class="rounded-md border border-border bg-white p-4">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="font-bold">{{ broadcast.title }}</h3>
                      <StatusBadge
                        v-if="isTestBroadcast(broadcast)"
                        icon="i-heroicons-signal"
                        label="kontrolné"
                        size="xs"
                        tone="muted"
                      />
                    </div>
                    <p class="text-foreground-muted mt-1 text-sm">{{ formatStoredNotificationMessage(broadcast.message) }}</p>
                    <p class="text-foreground-muted mt-2 text-xs">
                      {{ formatTopics(broadcast.targetTopics) }} · {{ formatLakes(broadcast.targetLakeIds) }} · {{ broadcast.recipientCount }} odberov
                    </p>
                    <p v-if="broadcast.targetAudience" class="text-foreground-muted mt-1 text-xs">
                      {{ formatNotificationAudience(broadcast.targetAudience) }}
                    </p>
                    <p v-if="alertById.has(broadcast.alertId)" class="text-foreground-muted mt-1 text-xs">
                      {{ formatBroadcastLifecycleDetail(broadcast) }}
                    </p>
                  </div>
                  <div class="flex w-fit flex-wrap justify-start gap-2 sm:justify-end">
                    <StatusBadge
                      v-if="alertById.has(broadcast.alertId)"
                      :icon="broadcastLifecycleIcon(broadcast)"
                      :label="broadcastLifecycleLabel(broadcast)"
                      size="xs"
                      :tone="broadcastLifecycleTone(broadcast)"
                    />
                    <StatusBadge
                      :icon="broadcastStatusIcon(broadcast.status)"
                      :label="formatNotificationBroadcastStatus(broadcast.status)"
                      size="xs"
                      :tone="broadcastStatusTone(broadcast.status)"
                    />
                    <StatusBadge
                      :icon="severityIcon(broadcast.severity)"
                      :label="broadcast.severity === 'storm' ? 'búrka' : broadcast.severity === 'water' ? 'voda' : broadcast.severity === 'service' ? 'servis' : 'oznam'"
                      size="xs"
                      :tone="severityTone(broadcast.severity)"
                    />
                  </div>
                </div>
              </article>
              <p v-if="filteredBroadcasts.length === 0" class="rounded-md border border-dashed border-border p-4 text-sm text-foreground-muted">
                {{ broadcastEmptyMessage() }}
              </p>
            </div>
          </div>

          <div v-show="activeNotificationView === 'dorucovanie'" class="rounded-card border border-border bg-surface p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Záznamy doručenia</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Záznamy po zariadeniach používajú rovnaký filter ako rozoslania.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="filter in timelineFilters"
                  :key="`delivery-${filter.value}`"
                  type="button"
                  class="min-h-11 rounded-md border px-2.5 py-1 text-xs font-bold transition sm:min-h-7"
                  :class="timelineFilterButtonClass(deliveryFilter === filter.value)"
                  @click="deliveryFilter = filter.value"
                >
                  {{ filter.label }} · {{ getDeliveryFilterCount(filter.value) }}
                </button>
              </div>
            </div>
            <div class="mt-4 space-y-3">
              <article v-for="delivery in filteredDeliveryLogs.slice(0, 6)" :key="delivery.id" class="rounded-md border border-border bg-white p-4">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-semibold">{{ delivery.deviceLabel }}</p>
                    <p class="text-foreground-muted mt-1 text-sm">{{ formatStoredNotificationMessage(delivery.message) }}</p>
                    <p class="text-foreground-muted mt-2 text-xs">
                      {{ deliveryProviderLabels[delivery.provider] }} · {{ formatPushEndpoint(delivery.endpoint) }}
                    </p>
                  </div>
                  <StatusBadge
                    class="w-fit"
                    :icon="deliveryStatusIcon(delivery.status)"
                    :label="formatNotificationDeliveryStatus(delivery.status)"
                    size="xs"
                    :tone="deliveryStatusTone(delivery.status)"
                  />
                </div>
              </article>
              <p v-if="filteredDeliveryLogs.length === 0" class="rounded-md border border-dashed border-border p-4 text-sm text-foreground-muted">
                {{ deliveryEmptyMessage() }}
              </p>
            </div>
          </div>

          <div v-show="activeNotificationView === 'zariadenia'" class="rounded-card border border-border bg-surface p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Odbery zariadení</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Filtrovanie podľa stavu, typu a odoberaného okruhu.
                </p>
              </div>
              <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                {{ filteredSubscriptions.length }} / {{ subscriptions.length }}
              </span>
            </div>

            <div class="mt-4 grid gap-3">
              <div>
                <p class="text-foreground-muted text-xs font-semibold uppercase">Stav</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    v-for="filter in subscriptionStatusFilters"
                    :key="`subscription-status-${filter.value}`"
                    type="button"
                    class="min-h-11 rounded-md border px-2.5 py-1 text-xs font-bold transition sm:min-h-7"
                    :class="timelineFilterButtonClass(subscriptionStatusFilter === filter.value)"
                    @click="subscriptionStatusFilter = filter.value"
                  >
                    {{ filter.label }} · {{ getSubscriptionStatusFilterCount(filter.value) }}
                  </button>
                </div>
              </div>
              <div>
                <p class="text-foreground-muted text-xs font-semibold uppercase">Typ</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    v-for="filter in subscriptionScopeFilters"
                    :key="`subscription-scope-${filter.value}`"
                    type="button"
                    class="min-h-11 rounded-md border px-2.5 py-1 text-xs font-bold transition sm:min-h-7"
                    :class="timelineFilterButtonClass(subscriptionScopeFilter === filter.value)"
                    @click="subscriptionScopeFilter = filter.value"
                  >
                    {{ filter.label }} · {{ getSubscriptionScopeFilterCount(filter.value) }}
                  </button>
                </div>
              </div>
              <div>
                <p class="text-foreground-muted text-xs font-semibold uppercase">Okruh</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    v-for="filter in subscriptionTopicFilters"
                    :key="`subscription-topic-${filter.value}`"
                    type="button"
                    class="min-h-11 rounded-md border px-2.5 py-1 text-xs font-bold transition sm:min-h-7"
                    :class="timelineFilterButtonClass(subscriptionTopicFilter === filter.value)"
                    @click="subscriptionTopicFilter = filter.value"
                  >
                    {{ filter.label }} · {{ getSubscriptionTopicFilterCount(filter.value) }}
                  </button>
                </div>
              </div>
            </div>

            <div class="mt-4 space-y-3">
              <article v-for="subscription in filteredSubscriptions.slice(0, 6)" :key="subscription.id" class="rounded-md bg-muted p-4">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-semibold">{{ subscription.deviceLabel }}</p>
                    <p class="text-foreground-muted mt-1 text-xs">{{ formatPushEndpoint(subscription.endpoint) }}</p>
                    <p class="text-foreground-muted mt-2 text-xs">
                      {{ formatTopics(subscription.topics) }} · {{ formatLakes(subscription.lakeIds) }}
                    </p>
                    <p v-if="formatSubscriptionAudience(subscription)" class="text-foreground-muted mt-1 text-xs">
                      {{ formatSubscriptionAudience(subscription) }}
                    </p>
                    <DataStatusNotice
                      v-if="subscriptionActionId === subscription.id && subscriptionActionMessage"
                      class="mt-3"
                      :description="subscriptionActionMessage"
                      :loading="subscriptionActionStatus === 'submitting'"
                      :title="subscriptionActionNoticeTitle"
                      :tone="subscriptionActionNoticeTone"
                    />
                  </div>
                  <div class="flex w-fit flex-col items-start gap-2 sm:items-end">
                    <StatusBadge
                      :icon="subscriptionStatusIcon(subscription.enabled)"
                      :label="subscription.enabled ? 'aktívny' : 'vypnutý'"
                      size="xs"
                      :tone="subscriptionStatusTone(subscription.enabled)"
                    />
                    <UButton
                      v-if="subscription.enabled"
                      class="min-h-11 sm:min-h-7"
                      icon="i-heroicons-bell-slash"
                      size="xs"
                      color="neutral"
                      variant="soft"
                      :disabled="!canOperateNotifications"
                      :loading="subscriptionActionId === subscription.id && subscriptionActionStatus === 'submitting'"
                      @click="disableAdminSubscription(subscription)"
                    >
                      Vypnúť odber
                    </UButton>
                  </div>
                </div>
              </article>
              <p
                v-if="filteredSubscriptions.length > 6"
                class="text-foreground-muted text-xs"
              >
                Zobrazených 6 z {{ filteredSubscriptions.length }} odberov pre zvolený filter.
              </p>
              <p v-if="filteredSubscriptions.length === 0" class="rounded-md border border-dashed border-border p-4 text-sm text-foreground-muted">
                {{ subscriptionEmptyMessage() }}
              </p>
            </div>
          </div>
        </div>
      </div>
      </div>
    </section>
  </div>
</template>
