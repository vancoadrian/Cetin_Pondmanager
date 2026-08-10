import type { Sponsor, SponsorLogoVariant } from '~/data/pond'
import { MAX_SPONSOR_LOGO_BYTES, sponsorLogoPlacementRules } from '~/schemas/pondSchemas'
import type { SponsorLogoUpload, SponsorMutationSuccess } from '~/services/sponsorService'
import {
  calculateSponsorLogoDrawBox,
  getSponsorLogoVariantTargets,
  normalizeSponsorLogoFocusPercent,
  sponsorLogoVariantPlacementOrder,
  type SponsorLogoVariantMode,
} from '~/utils/sponsorLogoVariants'

type SponsorPlacementType = NonNullable<Sponsor['placementType']>
type SponsorLogoVariantDraft = SponsorLogoVariant & {
  generateFocusX?: number
  generateFocusY?: number
  logoPreviewUrl?: string
  logoUpload?: SponsorLogoUpload
  removeLogo?: boolean
}
type SponsorDraft = Omit<Sponsor, 'logoVariants'> & {
  logoPreviewUrl?: string
  logoUpload?: SponsorLogoUpload
  logoVariantSourceDataUrl?: string
  logoVariantSourceFileName?: string
  logoVariantSourcePreviewUrl?: string
  logoVariantSourceUpload?: SponsorLogoUpload
  logoVariantSourceHeight?: number
  logoVariantSourceWidth?: number
  logoVariantGenerateMode?: SponsorLogoVariantMode
  logoVariantGeneratePadding?: number
  logoVariants?: SponsorLogoVariantDraft[]
  removeLogo?: boolean
  removeLogoVariantSource?: boolean
}

/**
 * Owns sponsor CRUD, logo upload/variant generation (including the
 * crop-preset canvas math) and placement/campaign field state for the
 * sponsor admin screen. Extracted from app/pages/admin/sponzori/index.vue so
 * the page only wires template bindings. The canvas draw sequence in
 * renderSponsorLogoVariantUpload is relocated verbatim — do not alter the
 * pixel math.
 */
export async function useAdminSponsors() {
  const { tournaments } = usePondData()
  const {
    canOperate: canOperateSponsors,
    isReadOnly: sponsorsReadOnly,
    label: sponsorAccessLabel,
    readOnlyMessage: sponsorReadOnlyMessage,
  } = useAdminModuleAccess('sponsors')
  const {
    liveSponsors,
    refresh: refreshSponsorState,
  } = await useSponsorState({ admin: true, key: 'admin-sponsors-page-state' })

  const tierLabels = {
    main: 'hlavný',
    partner: 'partner',
    sector: 'sektor',
    tournament: 'súťaž',
  } as const
  const placementTypeLabels: Record<NonNullable<Sponsor['placementType']>, string> = {
    footer: 'footer',
    homepage: 'homepage',
    scoreboard: 'výsledkovka',
    sector: 'sektor',
    sponsors: 'stránka sponzorov',
    tournament: 'súťaž',
  }

  const sponsorDraft = ref<SponsorDraft[]>([])
  const sponsorSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const sponsorSubmitMessage = ref('')
  const sponsorDraftStatus = ref<'idle' | 'success' | 'error'>('idle')
  const sponsorDraftMessage = ref('')
  const newSponsorDraft = reactive({
    description: '',
    logoPreviewUrl: '',
    logoText: '',
    logoUpload: undefined as SponsorLogoUpload | undefined,
    name: '',
    placement: '',
    placementType: 'sponsors' as NonNullable<Sponsor['placementType']>,
    sectorId: '',
    sortOrder: 10,
    tier: 'partner' as Sponsor['tier'],
    tournamentId: '',
    validFrom: '',
    validTo: '',
    website: '',
  })

  const activeSponsors = computed(() => sponsorDraft.value.filter((sponsor) => sponsor.active))
  const inactiveSponsors = computed(() => sponsorDraft.value.filter((sponsor) => !sponsor.active))
  const sponsorLogoAccept = 'image/jpeg,image/png,image/webp'
  const sponsorLogoMimeTypes: SponsorLogoUpload['mimeType'][] = ['image/jpeg', 'image/png', 'image/webp']
  const logoVariantPlacementTypes: SponsorPlacementType[] = [...sponsorLogoVariantPlacementOrder]
  const logoVariantTargets = getSponsorLogoVariantTargets()
  const logoVariantModeLabels: Record<SponsorLogoVariantMode, string> = {
    contain: 'celé logo',
    cover: 'vyplniť plochu',
  }
  const sectorOptions = computed(() =>
    tournaments.flatMap((tournament) =>
      tournament.sectors.map((sector) => ({
        id: sector.id,
        label: `${tournament.name} · ${sector.label}`,
        tournamentId: tournament.id,
      })),
    ),
  )

  watch(
    liveSponsors,
    (sponsors) => {
      sponsorDraft.value = sponsors.map((sponsor, index) => ({
        ...sponsor,
        logoVariants: createLogoVariantDrafts(sponsor.logoVariants),
        placementType: sponsor.placementType ?? (
          sponsor.tier === 'tournament'
            ? 'tournament'
            : sponsor.tier === 'sector' ? 'sector' : 'sponsors'
        ),
        sortOrder: sponsor.sortOrder ?? index + 1,
      }))
    },
    { immediate: true },
  )

  watch(
    sponsorDraft,
    () => {
      if (sponsorSubmitStatus.value !== 'submitting') {
        sponsorSubmitStatus.value = 'idle'
        sponsorSubmitMessage.value = ''
      }
    },
    { deep: true },
  )

  function slugifySponsorName(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      || 'sponzor'
  }

  function createSponsorDraftId(name: string, existingIds: Set<string>) {
    const baseId = `sponsor-${slugifySponsorName(name)}`
    if (!existingIds.has(baseId)) return baseId

    let index = 2
    while (existingIds.has(`${baseId}-${index}`)) {
      index += 1
    }

    return `${baseId}-${index}`
  }

  function sponsorInitials(value: string) {
    return value
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 4)
      || 'SP'
  }

  function formatLogoSize(bytes: number) {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`

    return `${Math.round(bytes / 1024)} kB`
  }

  function sponsorLogoPreview(sponsor: SponsorDraft) {
    return sponsor.logoPreviewUrl || sponsor.logoUrl || ''
  }

  function createLogoVariantDrafts(variants: SponsorLogoVariant[] = []): SponsorLogoVariantDraft[] {
    return logoVariantPlacementTypes.map((placementType) => {
      const variant = variants.find((item) => item.placementType === placementType)

      return {
        ...variant,
        generateFocusX: variant?.cropPreset?.focusXPercent,
        generateFocusY: variant?.cropPreset?.focusYPercent,
        placementType,
      }
    })
  }

  function getLogoVariantDraft(sponsor: SponsorDraft, placementType: SponsorPlacementType) {
    if (!sponsor.logoVariants) sponsor.logoVariants = createLogoVariantDrafts()
    const variant = sponsor.logoVariants.find((item) => item.placementType === placementType)
    if (variant) return variant

    const nextVariant: SponsorLogoVariantDraft = { placementType }
    sponsor.logoVariants.push(nextVariant)
    return nextVariant
  }

  function logoVariantPreview(variant: SponsorLogoVariantDraft) {
    return variant.logoPreviewUrl || variant.url || ''
  }

  function logoRuleFor(placementType?: Sponsor['placementType']) {
    return sponsorLogoPlacementRules[placementType ?? 'sponsors']
  }

  function logoRuleHint(placementType?: Sponsor['placementType']) {
    const rule = logoRuleFor(placementType)

    return `Min. ${rule.minWidth} x ${rule.minHeight} px, pomer ${rule.ratioLabel}.`
  }

  function sponsorLogoDimensions(sponsor: SponsorDraft) {
    const width = sponsor.logoUpload?.width ?? sponsor.logoWidth
    const height = sponsor.logoUpload?.height ?? sponsor.logoHeight

    return width && height ? `${width} x ${height} px` : ''
  }

  function logoVariantDimensions(variant: SponsorLogoVariantDraft) {
    const width = variant.logoUpload?.width ?? variant.width
    const height = variant.logoUpload?.height ?? variant.height

    return width && height ? `${width} x ${height} px` : ''
  }

  function logoVariantTargetSummary() {
    return logoVariantTargets
      .map((target) => `${placementTypeLabels[target.placementType]} ${target.width}x${target.height}`)
      .join(', ')
  }

  function sponsorLogoVariantSourcePreview(sponsor: SponsorDraft) {
    return sponsor.logoVariantSourcePreviewUrl
      || sponsor.logoVariantSourceDataUrl
      || sponsor.logoSourceUrl
      || sponsorLogoPreview(sponsor)
  }

  function sponsorLogoVariantSourceDimensions(sponsor: SponsorDraft) {
    const width = sponsor.logoVariantSourceWidth
      ?? sponsor.logoVariantSourceUpload?.width
      ?? sponsor.logoSourceWidth
      ?? sponsor.logoUpload?.width
      ?? sponsor.logoWidth
    const height = sponsor.logoVariantSourceHeight
      ?? sponsor.logoVariantSourceUpload?.height
      ?? sponsor.logoSourceHeight
      ?? sponsor.logoUpload?.height
      ?? sponsor.logoHeight

    return width && height ? `${width} x ${height} px` : ''
  }

  function sponsorLogoVariantGenerateMode(sponsor: SponsorDraft): SponsorLogoVariantMode {
    return sponsor.logoVariantGenerateMode
      ?? sponsor.logoVariants?.find((variant) => variant.cropPreset)?.cropPreset?.mode
      ?? 'contain'
  }

  function sponsorLogoVariantGeneratePadding(sponsor: SponsorDraft) {
    return sponsor.logoVariantGeneratePadding
      ?? sponsor.logoVariants?.find((variant) => variant.cropPreset)?.cropPreset?.paddingPercent
      ?? 8
  }

  function logoVariantFocusX(variant: SponsorLogoVariantDraft) {
    return variant.generateFocusX ?? variant.cropPreset?.focusXPercent ?? 50
  }

  function logoVariantFocusY(variant: SponsorLogoVariantDraft) {
    return variant.generateFocusY ?? variant.cropPreset?.focusYPercent ?? 50
  }

  function logoVariantTarget(placementType: SponsorPlacementType) {
    return logoVariantTargets.find((target) => target.placementType === placementType)
      ?? {
          height: sponsorLogoPlacementRules.sponsors.minHeight,
          label: sponsorLogoPlacementRules.sponsors.label,
          placementType: 'sponsors' as const,
          ratio: sponsorLogoPlacementRules.sponsors.minWidth / sponsorLogoPlacementRules.sponsors.minHeight,
          width: sponsorLogoPlacementRules.sponsors.minWidth,
        }
  }

  function logoVariantCropPreviewStyle(sponsor: SponsorDraft, variant: SponsorLogoVariantDraft) {
    const target = logoVariantTarget(variant.placementType)
    const source = sponsorLogoVariantSourcePreview(sponsor)

    return {
      aspectRatio: `${target.width} / ${target.height}`,
      backgroundImage: source ? `url(${source})` : undefined,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: `${logoVariantFocusX(variant)}% ${logoVariantFocusY(variant)}%`,
      backgroundSize: sponsorLogoVariantGenerateMode(sponsor) === 'cover' ? 'cover' : 'contain',
    }
  }

  function canUseLogoVariantCropEditor(sponsor: SponsorDraft) {
    return canOperateSponsors.value && Boolean(sponsorLogoVariantSourcePreview(sponsor))
  }

  function setLogoVariantFocusFromPointer(variant: SponsorLogoVariantDraft, event: PointerEvent) {
    const target = event.currentTarget as HTMLElement | null
    if (!target) return

    const rect = target.getBoundingClientRect()
    const focus = normalizeSponsorLogoFocusPercent({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    })
    variant.generateFocusX = focus.x
    variant.generateFocusY = focus.y
  }

  function handleLogoVariantFocusPointerDown(variant: SponsorLogoVariantDraft, event: PointerEvent) {
    const target = event.currentTarget as HTMLElement | null
    if (!target) return

    target.setPointerCapture?.(event.pointerId)
    setLogoVariantFocusFromPointer(variant, event)
  }

  function handleLogoVariantFocusPointerMove(variant: SponsorLogoVariantDraft, event: PointerEvent) {
    const target = event.currentTarget as HTMLElement | null
    if (!target?.hasPointerCapture?.(event.pointerId)) return

    setLogoVariantFocusFromPointer(variant, event)
  }

  function logoRuleViolation(upload: SponsorLogoUpload, placementType: SponsorPlacementType) {
    const rule = logoRuleFor(placementType)
    const ratio = upload.width / upload.height

    if (upload.width < rule.minWidth || upload.height < rule.minHeight) {
      return `Logo pre ${rule.label} musí mať aspoň ${rule.minWidth} x ${rule.minHeight} px.`
    }
    if (ratio < rule.minRatio || ratio > rule.maxRatio) {
      return `Logo pre ${rule.label} musí mať pomer strán ${rule.ratioLabel}.`
    }

    return ''
  }

  function readFileAsDataUrl(file: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.addEventListener('load', () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result)
          return
        }

        reject(new Error('Logo sa nepodarilo načítať.'))
      })
      reader.addEventListener('error', () => reject(new Error('Logo sa nepodarilo načítať.')))
      reader.readAsDataURL(file)
    })
  }

  function loadImageElement(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.addEventListener('load', () => resolve(image))
      image.addEventListener('error', () => reject(new Error('Zdroj loga sa nepodarilo načítať.')))
      image.crossOrigin = 'anonymous'
      image.src = src
    })
  }

  function readImageDimensions(dataUrl: string) {
    return new Promise<{ height: number, width: number }>((resolve, reject) => {
      const image = new Image()
      image.addEventListener('load', () => {
        resolve({
          height: image.naturalHeight,
          width: image.naturalWidth,
        })
      })
      image.addEventListener('error', () => reject(new Error('Rozmery loga sa nepodarilo načítať.')))
      image.src = dataUrl
    })
  }

  function canvasToBlob(canvas: HTMLCanvasElement, mimeType: SponsorLogoUpload['mimeType']) {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
          return
        }

        reject(new Error('Variant loga sa nepodarilo exportovať.'))
      }, mimeType, 0.92)
    })
  }

  function sponsorLogoVariantFileName(sourceName: string, placementType: SponsorPlacementType) {
    const cleanBase = sourceName
      .replace(/\.[a-z0-9]+$/i, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80)
      || 'logo'

    return `${cleanBase}-${placementType}.png`
  }

  function createLogoVariantCropPreset(
    sponsor: SponsorDraft,
    variant: SponsorLogoVariantDraft,
    image: HTMLImageElement,
  ): NonNullable<SponsorLogoVariant['cropPreset']> {
    const preset: NonNullable<SponsorLogoVariant['cropPreset']> = {
      focusXPercent: logoVariantFocusX(variant),
      focusYPercent: logoVariantFocusY(variant),
      mode: sponsorLogoVariantGenerateMode(sponsor),
      paddingPercent: sponsorLogoVariantGeneratePadding(sponsor),
      sourceHeight: sponsor.logoVariantSourceHeight ?? sponsor.logoSourceHeight ?? sponsor.logoUpload?.height ?? sponsor.logoHeight ?? image.naturalHeight,
      sourceWidth: sponsor.logoVariantSourceWidth ?? sponsor.logoSourceWidth ?? sponsor.logoUpload?.width ?? sponsor.logoWidth ?? image.naturalWidth,
    }
    const sourceFileName = sponsor.logoVariantSourceFileName || sponsor.logoSourceFileName || sponsor.logoFileName
    if (sourceFileName) preset.sourceFileName = sourceFileName

    return preset
  }

  async function renderSponsorLogoVariantUpload(
    image: HTMLImageElement,
    sourceFileName: string,
    placementType: SponsorPlacementType,
    mode: SponsorLogoVariantMode,
    paddingPercent: number,
    focusPercent = { x: 50, y: 50 },
  ): Promise<SponsorLogoUpload> {
    const target = logoVariantTargets.find((item) => item.placementType === placementType)
    if (!target) throw new Error('Neznámy typ variantu loga.')

    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Prehliadač nevie pripraviť variant loga.')

    context.clearRect(0, 0, target.width, target.height)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'

    const drawBox = calculateSponsorLogoDrawBox(
      { height: image.naturalHeight, width: image.naturalWidth },
      { height: target.height, width: target.width },
      mode,
      paddingPercent / 100,
      { x: focusPercent.x / 100, y: focusPercent.y / 100 },
    )

    context.drawImage(
      image,
      drawBox.source.x,
      drawBox.source.y,
      drawBox.source.width,
      drawBox.source.height,
      drawBox.destination.x,
      drawBox.destination.y,
      drawBox.destination.width,
      drawBox.destination.height,
    )

    const mimeType: SponsorLogoUpload['mimeType'] = 'image/png'
    const blob = await canvasToBlob(canvas, mimeType)
    const dataUrl = await readFileAsDataUrl(blob)
    const upload = {
      dataUrl,
      fileName: sponsorLogoVariantFileName(sourceFileName, placementType),
      height: target.height,
      mimeType,
      sizeBytes: blob.size,
      width: target.width,
    }
    const violation = logoRuleViolation(upload, placementType)
    if (violation) throw new Error(violation)
    if (upload.sizeBytes > MAX_SPONSOR_LOGO_BYTES) {
      throw new Error(`Variant ${placementTypeLabels[placementType]} má viac než ${formatLogoSize(MAX_SPONSOR_LOGO_BYTES)}.`)
    }

    return upload
  }

  function applySponsorLogoVariantUpload(
    variant: SponsorLogoVariantDraft,
    upload: SponsorLogoUpload,
    cropPreset?: SponsorLogoVariant['cropPreset'],
  ) {
    if (cropPreset) {
      variant.cropPreset = cropPreset
    }
    else {
      delete variant.cropPreset
    }
    variant.fileName = upload.fileName
    variant.height = upload.height
    variant.logoPreviewUrl = upload.dataUrl
    variant.logoUpload = upload
    variant.mimeType = upload.mimeType
    variant.removeLogo = false
    variant.sizeBytes = upload.sizeBytes
    variant.width = upload.width
  }

  async function createSponsorLogoUpload(file: File, placementType: SponsorPlacementType): Promise<SponsorLogoUpload> {
    if (!sponsorLogoMimeTypes.includes(file.type as SponsorLogoUpload['mimeType'])) {
      throw new Error('Podporované sú iba JPG, PNG alebo WebP logá.')
    }
    if (file.size > MAX_SPONSOR_LOGO_BYTES) {
      throw new Error(`Logo môže mať najviac ${formatLogoSize(MAX_SPONSOR_LOGO_BYTES)}.`)
    }

    const dataUrl = await readFileAsDataUrl(file)
    const dimensions = await readImageDimensions(dataUrl)
    const upload = {
      dataUrl,
      fileName: file.name,
      height: dimensions.height,
      mimeType: file.type as SponsorLogoUpload['mimeType'],
      sizeBytes: file.size,
      width: dimensions.width,
    }
    const violation = logoRuleViolation(upload, placementType)
    if (violation) throw new Error(violation)

    return upload
  }

  async function handleSponsorLogoFile(sponsor: SponsorDraft, event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    try {
      const upload = await createSponsorLogoUpload(file, sponsor.placementType ?? 'sponsors')
      sponsor.logoUpload = upload
      sponsor.logoPreviewUrl = upload.dataUrl
      sponsor.removeLogo = false
      sponsorDraftStatus.value = 'success'
      sponsorDraftMessage.value = `Logo ${upload.fileName} je pripravené. Uložte sponzorov.`
    }
    catch (error) {
      markSponsorDraftError(error instanceof Error ? error.message : 'Logo sa nepodarilo pripraviť.')
    }
  }

  async function handleSponsorLogoVariantFile(sponsor: SponsorDraft, placementType: SponsorPlacementType, event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    try {
      const upload = await createSponsorLogoUpload(file, placementType)
      const variant = getLogoVariantDraft(sponsor, placementType)
      applySponsorLogoVariantUpload(variant, upload)
      sponsorDraftStatus.value = 'success'
      sponsorDraftMessage.value = `Variant ${placementTypeLabels[placementType]} (${upload.fileName}) je pripravený. Uložte sponzorov.`
    }
    catch (error) {
      markSponsorDraftError(error instanceof Error ? error.message : 'Variant loga sa nepodarilo pripraviť.')
    }
  }

  async function handleSponsorLogoVariantSourceFile(sponsor: SponsorDraft, event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    try {
      if (!sponsorLogoMimeTypes.includes(file.type as SponsorLogoUpload['mimeType'])) {
        throw new Error('Podporované sú iba JPG, PNG alebo WebP logá.')
      }
      if (file.size > MAX_SPONSOR_LOGO_BYTES) {
        throw new Error(`Zdrojové logo môže mať najviac ${formatLogoSize(MAX_SPONSOR_LOGO_BYTES)}.`)
      }

      const dataUrl = await readFileAsDataUrl(file)
      const dimensions = await readImageDimensions(dataUrl)
      sponsor.logoVariantSourceDataUrl = dataUrl
      sponsor.logoVariantSourceFileName = file.name
      sponsor.logoVariantSourceHeight = dimensions.height
      sponsor.logoVariantSourcePreviewUrl = dataUrl
      sponsor.logoVariantSourceUpload = {
        dataUrl,
        fileName: file.name,
        height: dimensions.height,
        mimeType: file.type as SponsorLogoUpload['mimeType'],
        sizeBytes: file.size,
        width: dimensions.width,
      }
      sponsor.logoVariantSourceWidth = dimensions.width
      sponsor.logoVariantGenerateMode = sponsor.logoVariantGenerateMode ?? 'contain'
      sponsor.logoVariantGeneratePadding = sponsor.logoVariantGeneratePadding ?? 8
      sponsor.removeLogoVariantSource = false
      markSponsorDraftSuccess(`Zdroj ${file.name} je pripravený pre generovanie variantov.`)
    }
    catch (error) {
      markSponsorDraftError(error instanceof Error ? error.message : 'Zdrojové logo sa nepodarilo pripraviť.')
    }
  }

  function clearSponsorLogoVariantSource(sponsor: SponsorDraft) {
    sponsor.logoSourceAssetId = undefined
    sponsor.logoSourceFileName = undefined
    sponsor.logoSourceHeight = undefined
    sponsor.logoSourceMimeType = undefined
    sponsor.logoSourceSizeBytes = undefined
    sponsor.logoSourceStoragePath = undefined
    sponsor.logoSourceUpdatedAt = undefined
    sponsor.logoSourceUrl = undefined
    sponsor.logoSourceWidth = undefined
    sponsor.logoVariantSourceDataUrl = ''
    sponsor.logoVariantSourceFileName = ''
    sponsor.logoVariantSourceHeight = undefined
    sponsor.logoVariantSourcePreviewUrl = ''
    sponsor.logoVariantSourceUpload = undefined
    sponsor.logoVariantSourceWidth = undefined
    sponsor.removeLogoVariantSource = true
    markSponsorDraftSuccess('Zdroj pre varianty bude po uložení odstránený. Ako náhrada ostane hlavné logo.')
  }

  async function generateSponsorLogoVariants(sponsor: SponsorDraft) {
    if (!import.meta.client) return

    const source = sponsorLogoVariantSourcePreview(sponsor)
    if (!source) {
      markSponsorDraftError('Najprv nahrajte hlavné alebo zdrojové logo.')
      return
    }

    try {
      const image = await loadImageElement(source)
      const sourceFileName = sponsor.logoVariantSourceFileName || sponsor.logoSourceFileName || sponsor.logoFileName || `${sponsor.id}.png`
      const mode = sponsorLogoVariantGenerateMode(sponsor)
      const padding = sponsorLogoVariantGeneratePadding(sponsor)

      for (const placementType of logoVariantPlacementTypes) {
        const variant = getLogoVariantDraft(sponsor, placementType)
        const upload = await renderSponsorLogoVariantUpload(
          image,
          sourceFileName,
          placementType,
          mode,
          padding,
          { x: logoVariantFocusX(variant), y: logoVariantFocusY(variant) },
        )
        applySponsorLogoVariantUpload(variant, upload, createLogoVariantCropPreset(sponsor, variant, image))
      }

      markSponsorDraftSuccess(`Vygenerovaných ${logoVariantPlacementTypes.length} variantov pre ${sponsor.name}. Uložte sponzorov.`)
    }
    catch (error) {
      markSponsorDraftError(error instanceof Error ? error.message : 'Varianty loga sa nepodarilo vygenerovať.')
    }
  }

  async function regenerateSponsorLogoVariant(sponsor: SponsorDraft, placementType: SponsorPlacementType) {
    if (!import.meta.client) return

    const source = sponsorLogoVariantSourcePreview(sponsor)
    if (!source) {
      markSponsorDraftError('Najprv nahrajte hlavné alebo zdrojové logo.')
      return
    }

    try {
      const image = await loadImageElement(source)
      const sourceFileName = sponsor.logoVariantSourceFileName || sponsor.logoSourceFileName || sponsor.logoFileName || `${sponsor.id}.png`
      const variant = getLogoVariantDraft(sponsor, placementType)
      const upload = await renderSponsorLogoVariantUpload(
        image,
        sourceFileName,
        placementType,
        sponsorLogoVariantGenerateMode(sponsor),
        sponsorLogoVariantGeneratePadding(sponsor),
        { x: logoVariantFocusX(variant), y: logoVariantFocusY(variant) },
      )
      applySponsorLogoVariantUpload(variant, upload, createLogoVariantCropPreset(sponsor, variant, image))
      markSponsorDraftSuccess(`Variant ${placementTypeLabels[placementType]} je prepočítaný podľa ohniska. Uložte sponzorov.`)
    }
    catch (error) {
      markSponsorDraftError(error instanceof Error ? error.message : 'Variant loga sa nepodarilo prepočítať.')
    }
  }

  async function handleNewSponsorLogoFile(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    try {
      const upload = await createSponsorLogoUpload(file, newSponsorDraft.placementType)
      newSponsorDraft.logoUpload = upload
      newSponsorDraft.logoPreviewUrl = upload.dataUrl
      markSponsorDraftSuccess(`Logo ${upload.fileName} je pripravené pre nového partnera.`)
    }
    catch (error) {
      markSponsorDraftError(error instanceof Error ? error.message : 'Logo sa nepodarilo pripraviť.')
    }
  }

  function clearSponsorLogo(sponsor: SponsorDraft) {
    sponsor.logoAssetId = undefined
    sponsor.logoFileName = undefined
    sponsor.logoHeight = undefined
    sponsor.logoMimeType = undefined
    sponsor.logoPreviewUrl = ''
    sponsor.logoSizeBytes = undefined
    sponsor.logoStoragePath = undefined
    sponsor.logoUpdatedAt = undefined
    sponsor.logoUpload = undefined
    sponsor.logoUrl = undefined
    sponsor.logoWidth = undefined
    sponsor.removeLogo = true
    markSponsorDraftSuccess('Logo bude po uložení odstránené, ostane textová skratka.')
  }

  function clearSponsorLogoVariant(sponsor: SponsorDraft, placementType: SponsorPlacementType) {
    const variant = getLogoVariantDraft(sponsor, placementType)
    variant.fileName = undefined
    variant.height = undefined
    variant.logoPreviewUrl = ''
    variant.logoUpload = undefined
    variant.mimeType = undefined
    variant.removeLogo = true
    variant.sizeBytes = undefined
    variant.storagePath = undefined
    variant.updatedAt = undefined
    variant.url = undefined
    variant.variantId = undefined
    variant.width = undefined
    markSponsorDraftSuccess(`Variant ${placementTypeLabels[placementType]} bude po uložení odstránený.`)
  }

  function markSponsorDraftError(message: string) {
    sponsorDraftStatus.value = 'error'
    sponsorDraftMessage.value = message
  }

  function markSponsorDraftSuccess(message: string) {
    sponsorDraftStatus.value = 'success'
    sponsorDraftMessage.value = message
  }

  function addSponsorDraft() {
    const name = newSponsorDraft.name.trim()
    const description = newSponsorDraft.description.trim()
    const logoText = (newSponsorDraft.logoText.trim() || sponsorInitials(name)).toUpperCase()
    const placement = newSponsorDraft.placement.trim()
    const website = newSponsorDraft.website.trim()
    const validFrom = newSponsorDraft.validFrom.trim()
    const validTo = newSponsorDraft.validTo.trim()

    if (name.length < 2) {
      markSponsorDraftError('Doplňte názov nového sponzora.')
      return
    }
    if (logoText.length < 1 || logoText.length > 6) {
      markSponsorDraftError('Doplňte krátky text loga, najviac 6 znakov.')
      return
    }
    if (description.length < 8) {
      markSponsorDraftError('Doplňte popis sponzora aspoň 8 znakmi.')
      return
    }
    if (placement.length < 3) {
      markSponsorDraftError('Doplňte umiestnenie sponzora.')
      return
    }
    if (website && !/^https?:\/\/.+/i.test(website)) {
      markSponsorDraftError('Web sponzora musí začínať na http:// alebo https://.')
      return
    }
    if ((newSponsorDraft.placementType === 'tournament' || newSponsorDraft.placementType === 'scoreboard') && !newSponsorDraft.tournamentId) {
      markSponsorDraftError('Pri súťažnom umiestnení vyberte súťaž.')
      return
    }
    if (newSponsorDraft.placementType === 'sector' && !newSponsorDraft.sectorId) {
      markSponsorDraftError('Pri sektorovom umiestnení vyberte sektor.')
      return
    }
    if (validFrom && validTo && validTo < validFrom) {
      markSponsorDraftError('Platnosť kampane musí končiť rovnaký deň alebo neskôr ako začína.')
      return
    }

    const existingIds = new Set(sponsorDraft.value.map((sponsor) => sponsor.id))
    sponsorDraft.value = [
      ...sponsorDraft.value,
      {
        active: true,
        description,
        id: createSponsorDraftId(name, existingIds),
        logoPreviewUrl: newSponsorDraft.logoPreviewUrl,
        logoText,
        logoUpload: newSponsorDraft.logoUpload,
        logoVariants: createLogoVariantDrafts(),
        name,
        placement,
        placementType: newSponsorDraft.placementType,
        sectorId: newSponsorDraft.sectorId || undefined,
        sortOrder: Number(newSponsorDraft.sortOrder),
        tier: newSponsorDraft.tier,
        tournamentId: newSponsorDraft.tournamentId || undefined,
        validFrom: validFrom || undefined,
        validTo: validTo || undefined,
        website: website || undefined,
      },
    ]
    newSponsorDraft.description = ''
    newSponsorDraft.logoPreviewUrl = ''
    newSponsorDraft.logoText = ''
    newSponsorDraft.logoUpload = undefined
    newSponsorDraft.name = ''
    newSponsorDraft.placement = ''
    newSponsorDraft.placementType = 'sponsors'
    newSponsorDraft.sectorId = ''
    newSponsorDraft.sortOrder = 10
    newSponsorDraft.tier = 'partner'
    newSponsorDraft.tournamentId = ''
    newSponsorDraft.validFrom = ''
    newSponsorDraft.validTo = ''
    newSponsorDraft.website = ''
    markSponsorDraftSuccess('Nový sponzor je pridaný do rozpracovaného zoznamu. Uložte sponzorov.')
  }

  async function saveSponsorSettings() {
    if (!canOperateSponsors.value) {
      sponsorSubmitStatus.value = 'error'
      sponsorSubmitMessage.value = sponsorReadOnlyMessage.value
      return
    }

    const invalidLogoDraft = sponsorDraft.value.find((sponsor) =>
      sponsor.logoUpload && logoRuleViolation(sponsor.logoUpload, sponsor.placementType ?? 'sponsors'),
    )
    if (invalidLogoDraft?.logoUpload) {
      sponsorSubmitStatus.value = 'error'
      sponsorSubmitMessage.value = `${invalidLogoDraft.name}: ${logoRuleViolation(invalidLogoDraft.logoUpload, invalidLogoDraft.placementType ?? 'sponsors')}`
      return
    }
    const invalidVariantDraft = sponsorDraft.value
      .flatMap((sponsor) =>
        (sponsor.logoVariants ?? []).map((variant) => ({
          sponsor,
          variant,
          violation: variant.logoUpload ? logoRuleViolation(variant.logoUpload, variant.placementType) : '',
        })),
      )
      .find((item) => item.violation)
    if (invalidVariantDraft) {
      sponsorSubmitStatus.value = 'error'
      sponsorSubmitMessage.value = `${invalidVariantDraft.sponsor.name}: ${invalidVariantDraft.violation}`
      return
    }

    sponsorSubmitStatus.value = 'submitting'
    sponsorSubmitMessage.value = ''

    try {
      const result = await $fetch<SponsorMutationSuccess>('/api/admin/sponsors', {
        body: {
          sponsors: sponsorDraft.value.map((sponsor) => ({
            active: sponsor.active,
            description: sponsor.description,
            id: sponsor.id,
            logoText: sponsor.logoText,
            logoUpload: sponsor.logoUpload,
            logoVariantSourceUpload: sponsor.logoVariantSourceUpload,
            logoVariants: (sponsor.logoVariants ?? []).map((variant) => ({
              cropPreset: variant.cropPreset,
              logoUpload: variant.logoUpload,
              placementType: variant.placementType,
              removeLogo: variant.removeLogo ?? false,
            })),
            name: sponsor.name,
            placement: sponsor.placement,
            placementType: sponsor.placementType ?? 'sponsors',
            removeLogo: sponsor.removeLogo ?? false,
            removeLogoVariantSource: sponsor.removeLogoVariantSource ?? false,
            sectorId: sponsor.sectorId ?? '',
            sortOrder: sponsor.sortOrder ?? 100,
            tier: sponsor.tier,
            tournamentId: sponsor.tournamentId ?? '',
            validFrom: sponsor.validFrom ?? '',
            validTo: sponsor.validTo ?? '',
            website: sponsor.website ?? '',
          })),
        },
        method: 'PUT',
      })

      await refreshSponsorState()
      sponsorSubmitStatus.value = 'success'
      sponsorSubmitMessage.value = result.message
    }
    catch (error) {
      const fetchError = error as {
        data?: {
          data?: {
            messages?: string[]
          }
          message?: string
          statusMessage?: string
        }
      }
      sponsorSubmitStatus.value = 'error'
      sponsorSubmitMessage.value =
        fetchError.data?.data?.messages?.join(' ') ??
        fetchError.data?.message ??
        fetchError.data?.statusMessage ??
        'Sponzorov sa nepodarilo uložiť.'
    }
  }

  return {
    activeSponsors,
    addSponsorDraft,
    canOperateSponsors,
    canUseLogoVariantCropEditor,
    clearSponsorLogo,
    clearSponsorLogoVariant,
    clearSponsorLogoVariantSource,
    formatLogoSize,
    generateSponsorLogoVariants,
    handleLogoVariantFocusPointerDown,
    handleLogoVariantFocusPointerMove,
    handleNewSponsorLogoFile,
    handleSponsorLogoFile,
    handleSponsorLogoVariantFile,
    handleSponsorLogoVariantSourceFile,
    inactiveSponsors,
    logoRuleHint,
    logoVariantCropPreviewStyle,
    logoVariantDimensions,
    logoVariantFocusX,
    logoVariantFocusY,
    logoVariantModeLabels,
    logoVariantPreview,
    logoVariantTargetSummary,
    newSponsorDraft,
    placementTypeLabels,
    regenerateSponsorLogoVariant,
    saveSponsorSettings,
    sectorOptions,
    sponsorAccessLabel,
    sponsorDraft,
    sponsorDraftMessage,
    sponsorDraftStatus,
    sponsorInitials,
    sponsorLogoAccept,
    sponsorLogoDimensions,
    sponsorLogoPreview,
    sponsorLogoVariantGeneratePadding,
    sponsorLogoVariantSourceDimensions,
    sponsorLogoVariantSourcePreview,
    sponsorReadOnlyMessage,
    sponsorSubmitMessage,
    sponsorSubmitStatus,
    sponsorsReadOnly,
    tierLabels,
    tournaments,
  }
}
