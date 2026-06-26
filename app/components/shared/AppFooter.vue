<script setup lang="ts">
const config = useRuntimeConfig()
const year = new Date().getFullYear()
</script>

<template>
  <footer class="bg-primary-950 text-white/85">
    <div class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div class="grid gap-10 md:grid-cols-3">
        <div>
          <div class="flex items-center gap-3">
            <img
              src="/logo.svg"
              alt="Rybolov Cetín"
              class="h-12 w-12 shrink-0 rounded bg-white/5 object-contain"
            >
            <span class="font-semibold text-white">{{ config.public.appName }}</span>
          </div>
          <p class="mt-4 max-w-sm text-sm text-white/70">
            Informácie o revíri, voľných miestach, rezerváciách, úlovkoch, súťažiach a dôležitých
            oznamoch pri vode.
          </p>
        </div>

        <div>
          <h3 class="text-accent-300 text-sm font-semibold tracking-wide uppercase">Revír</h3>
          <ul class="mt-4 space-y-2 text-sm">
            <li><NuxtLink to="/reviry" class="hover:text-accent-300">Jazerá</NuxtLink></li>
            <li><NuxtLink to="/mapa" class="hover:text-accent-300">Lovné miesta</NuxtLink></li>
            <li><NuxtLink to="/info" class="hover:text-accent-300">Pravidlá a cenník</NuxtLink></li>
            <li><NuxtLink to="/sutaze" class="hover:text-accent-300">Súťaže</NuxtLink></li>
            <li><NuxtLink to="/notifikacie" class="hover:text-accent-300">Výstrahy</NuxtLink></li>
            <li><NuxtLink to="/sponzori" class="hover:text-accent-300">Sponzori</NuxtLink></li>
          </ul>
        </div>

        <div>
          <h3 class="text-accent-300 text-sm font-semibold tracking-wide uppercase">Rybári</h3>
          <ul class="mt-4 space-y-2 text-sm">
            <li><NuxtLink to="/rezervacie" class="hover:text-accent-300">Rezervácie</NuxtLink></li>
            <li><NuxtLink to="/ulovky" class="hover:text-accent-300">Evidencia úlovkov</NuxtLink></li>
            <li><NuxtLink to="/login" class="hover:text-accent-300">Prihlásenie</NuxtLink></li>
            <li><NuxtLink to="/info" class="hover:text-accent-300">Povinná výbava</NuxtLink></li>
            <li><NuxtLink to="/kontakt" class="hover:text-accent-300">Kontakt</NuxtLink></li>
          </ul>
        </div>
      </div>

      <div
        class="mt-10 flex flex-col items-start gap-2 border-t border-white/10 pt-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between"
      >
        <p>© {{ year }} {{ config.public.venueName }}.</p>
        <p>Rybolov Cetín · informácie, rezervácie a služby pri vode</p>
      </div>
    </div>
  </footer>
</template>
