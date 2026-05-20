import type { AdminModuleId } from '~/utils/adminAccess'

export function useAdminModuleAccess(moduleId?: AdminModuleId) {
  const route = useRoute()
  const { user } = useMockAuth()

  const module = computed(() =>
    moduleId ? findAdminModuleById(moduleId) : findAdminModuleByPath(route.path),
  )
  const mode = computed(() => module.value ? getAdminModuleAccess(module.value, user.value?.role) : undefined)
  const label = computed(() => mode.value ? adminAccessModeLabels[mode.value] : 'bez prístupu')
  const description = computed(() =>
    mode.value
      ? adminAccessModeDescriptions[mode.value]
      : 'Táto rola nemá prístup do aktuálneho interného modulu.',
  )
  const canRead = computed(() => Boolean(mode.value))
  const canOperate = computed(() => hasAdminAccessMode(mode.value, 'operate'))
  const canManage = computed(() => hasAdminAccessMode(mode.value, 'full'))
  const isReadOnly = computed(() => mode.value === 'read')
  const readOnlyMessage = computed(() =>
    module.value
      ? `Rola ${user.value?.roleLabel ?? 'bez role'} má v module ${module.value.label} iba prehľad. Zápisové akcie sú vypnuté.`
      : 'Táto rola má iba prehľad. Zápisové akcie sú vypnuté.',
  )

  return {
    canManage,
    canOperate,
    canRead,
    description,
    isReadOnly,
    label,
    mode,
    module,
    readOnlyMessage,
  }
}
