<script setup lang="ts">
import PwaInstallPrompt from '~/components/shared/PwaInstallPrompt.vue'

const colorMode = useColorMode()
colorMode.preference = 'light'
colorMode.value = 'light'

useHead({
  htmlAttrs: { class: 'light' },
  bodyAttrs: {
    class: 'min-h-screen bg-background',
  },
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <PwaInstallPrompt />
  </UApp>
</template>
