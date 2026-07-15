<template>
  <div class="flex min-h-screen flex-col">
    <a
      href="#main-content"
      class="bg-surface text-primary-900 fixed top-2 left-2 z-[60] -translate-y-20 rounded-md px-4 py-3 font-semibold shadow-lg focus:translate-y-0"
    >
      Preskočiť na hlavný obsah
    </a>
    <AppHeader />
    <main id="main-content" tabindex="-1" class="flex-1">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>
