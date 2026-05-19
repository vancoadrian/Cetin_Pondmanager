<script setup lang="ts">
interface Props {
  title: string
  description?: string
  eyebrow?: string
}

withDefaults(defineProps<Props>(), {
  description: undefined,
  eyebrow: undefined,
})
</script>

<template>
  <section class="border-border bg-muted border-b">
    <div class="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <p v-if="eyebrow" class="text-primary-700 mb-2 text-sm font-semibold tracking-wide uppercase">
        {{ eyebrow }}
      </p>
      <h1 class="text-foreground text-3xl font-bold tracking-tight sm:text-4xl">
        {{ title }}
      </h1>
      <p v-if="description" class="text-foreground-muted mt-3 max-w-3xl text-base">
        {{ description }}
      </p>
    </div>
  </section>
</template>
