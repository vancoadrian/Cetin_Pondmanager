import type { CatchPhoto, CatchRecord, TripLogbook, TripLogbookEntry } from '~/data/pond'
import {
  catchRecordInputSchema,
  getValidationMessages,
  tripLogbookInputSchema,
} from '~/schemas/pondSchemas'
import {
  createCatchWeatherResolver,
  type CatchWeatherResolver,
} from '~/services/catchWeatherService'
import { pondService, type PondService } from '~/services/pondService'

export interface CatchWorkflowState {
  catchPhotos: CatchPhoto[]
  catches: CatchRecord[]
  tripLogbookEntries: TripLogbookEntry[]
  tripLogbooks: TripLogbook[]
}

export interface CatchStateResponse extends CatchWorkflowState {
  ok: true
  updatedAt: string
}

export interface ApiValidationFailure {
  ok: false
  messages: string[]
  statusCode: 400 | 404 | 422
}

export interface CatchSubmissionSuccess {
  catch: CatchRecord
  catchPhoto?: CatchPhoto
  logbookEntry?: TripLogbookEntry
  message: string
  ok: true
  photoUpload?: CatchPhotoUpload
  statusCode: 201
}

export interface TripLogbookSubmissionSuccess {
  logbook: TripLogbook
  message: string
  ok: true
  statusCode: 201
}

export interface AnglerLogbooksResponse {
  account: {
    email: string
    id: string
    name: string
  }
  ok: true
  tripLogbookEntries: TripLogbookEntry[]
  tripLogbooks: TripLogbook[]
  updatedAt: string
}

export interface TripLogbookLookupSuccess {
  catchPhotos: CatchPhoto[]
  catches: CatchRecord[]
  logbook: TripLogbook
  message: string
  ok: true
  statusCode: 200
  tripLogbookEntries: TripLogbookEntry[]
}

export type CatchSubmissionResult = ApiValidationFailure | CatchSubmissionSuccess
export type TripLogbookLookupResult = ApiValidationFailure | TripLogbookLookupSuccess
export type TripLogbookSubmissionResult = ApiValidationFailure | TripLogbookSubmissionSuccess
type ShareCodeRandomPartFactory = () => string

export interface TripLogbookOwnerIdentity {
  id: string
  name: string
}

export interface CatchPhotoUpload {
  dataUrl: string
  fileName: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  sizeBytes: number
}

const SHARE_CODE_RANDOM_LENGTH = 6
const SHARE_CODE_RANDOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const SHARE_CODE_MAX_ATTEMPTS = 32

function sanitizePublicCatch(catchItem: CatchRecord): CatchRecord {
  const publicCatch = { ...catchItem }
  delete publicCatch.reviewNote
  delete publicCatch.reviewedAt
  delete publicCatch.reviewedBy

  return publicCatch
}

function sanitizeSharedTripLogbook(logbook: TripLogbook): TripLogbook {
  const sharedLogbook: TripLogbook = {
    ...logbook,
    members: logbook.members.map((member) => {
      const sharedMember = { ...member }
      delete sharedMember.userId
      return sharedMember
    }),
    pegIds: [...logbook.pegIds],
  }
  delete sharedLogbook.ownerUserId
  return sharedLogbook
}

export function filterPublicCatchWorkflowState(state: CatchWorkflowState): CatchWorkflowState {
  const approvedCatchIds = new Set(
    state.catches
      .filter((catchItem) => catchItem.status === 'approved')
      .map((catchItem) => catchItem.id),
  )

  return {
    catchPhotos: state.catchPhotos.filter((photo) => approvedCatchIds.has(photo.catchId)),
    catches: state.catches
      .filter((catchItem) => approvedCatchIds.has(catchItem.id))
      .map(sanitizePublicCatch),
    tripLogbookEntries: [],
    tripLogbooks: [],
  }
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function failure(messages: string[], statusCode: ApiValidationFailure['statusCode'] = 422): ApiValidationFailure {
  return {
    messages: unique(messages),
    ok: false,
    statusCode,
  }
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'zapis'
}

function compactDate(value: string, fallback: string) {
  const parsed = Date.parse(value)
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date(fallback)

  return date.toISOString().slice(0, 10).replaceAll('-', '')
}

function uniqueId(baseId: string, existingIds: Set<string>) {
  if (!existingIds.has(baseId)) return baseId

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1
  }

  return `${baseId}-${index}`
}

function extractLogbookId(rawInput: unknown) {
  const candidate = rawInput as Partial<{ logbookId: unknown }>

  return typeof candidate.logbookId === 'string' && candidate.logbookId.trim()
    ? candidate.logbookId.trim()
    : undefined
}

function createPhotoId(catchId: string, state: CatchWorkflowState) {
  return uniqueId(`photo-${catchId}`, new Set(state.catchPhotos.map((photo) => photo.id)))
}

function extensionForMimeType(mimeType: CatchPhotoUpload['mimeType']) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'

  return 'jpg'
}

function createCatchId(input: Pick<CatchRecord, 'angler' | 'caughtAt' | 'pegId'>, state: CatchWorkflowState, now: string) {
  const datePart = compactDate(input.caughtAt, now)
  const baseId = `catch-${datePart}-${input.pegId}-${slugify(input.angler).slice(0, 18)}`

  return uniqueId(baseId, new Set(state.catches.map((catchItem) => catchItem.id)))
}

function createLogbookId(title: string, state: CatchWorkflowState, now: string) {
  const datePart = compactDate(now, now)
  const baseId = `logbook-${datePart}-${slugify(title).slice(0, 28)}`

  return uniqueId(baseId, new Set(state.tripLogbooks.map((logbook) => logbook.id)))
}

function createSecureShareCodeRandomPart() {
  const cryptoApi = globalThis.crypto

  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(SHARE_CODE_RANDOM_LENGTH)
    cryptoApi.getRandomValues(values)

    return [...values]
      .map((value) => SHARE_CODE_RANDOM_ALPHABET[value % SHARE_CODE_RANDOM_ALPHABET.length])
      .join('')
  }

  return Array.from({ length: SHARE_CODE_RANDOM_LENGTH }, () =>
    SHARE_CODE_RANDOM_ALPHABET[Math.floor(Math.random() * SHARE_CODE_RANDOM_ALPHABET.length)])
    .join('')
}

function normalizeShareCodeRandomPart(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, SHARE_CODE_RANDOM_LENGTH)
}

function createShareCode(
  logbook: Pick<TripLogbook, 'lake' | 'title'>,
  state: CatchWorkflowState,
  randomPartFactory: ShareCodeRandomPartFactory = createSecureShareCodeRandomPart,
) {
  const prefix = logbook.lake === 'velky-cetin' ? 'CETIN' : 'KOCKA'
  const titlePart = slugify(logbook.title).replaceAll('-', '').slice(0, 4).toUpperCase() || 'RYBA'
  const existingCodes = new Set(state.tripLogbooks.map((item) => item.shareCode.toUpperCase()))

  for (let attempt = 0; attempt < SHARE_CODE_MAX_ATTEMPTS; attempt += 1) {
    const randomPart = normalizeShareCodeRandomPart(randomPartFactory())

    if (randomPart.length < SHARE_CODE_RANDOM_LENGTH) continue

    const candidate = `${prefix}-${titlePart}-${randomPart}`
    if (!existingCodes.has(candidate)) return candidate
  }

  const fallbackBase = `${prefix}-${titlePart}-LOCAL`
  if (!existingCodes.has(fallbackBase)) return fallbackBase

  let index = 2
  while (existingCodes.has(`${fallbackBase}-${index}`)) {
    index += 1
  }

  return `${fallbackBase}-${index}`
}

export function submitCatchRecord(
  rawInput: unknown,
  state: CatchWorkflowState,
  service: PondService = pondService,
  now = new Date().toISOString(),
  weatherResolver: CatchWeatherResolver = createCatchWeatherResolver(),
): CatchSubmissionResult {
  const inputResult = catchRecordInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const peg = service.pegs.find((item) => item.id === input.pegId && item.lake === input.lake)
  if (!peg) {
    return failure(['Vybrané lovné miesto neexistuje pre zvolené jazero.'], 404)
  }

  if (!Number.isFinite(Date.parse(input.caughtAt))) {
    return failure(['Čas úlovku nemá platný formát.'])
  }

  const logbookId = extractLogbookId(rawInput)
  const logbook = logbookId
    ? state.tripLogbooks.find((item) => item.id === logbookId)
    : undefined

  if (logbookId && !logbook) {
    return failure(['Zápisník sa v lokálnom store nenašiel.'], 404)
  }

  if (logbook && logbook.status === 'closed') {
    return failure(['Uzavretý zápisník už neprijíma nové úlovky.'])
  }

  if (logbook && (logbook.lake !== input.lake || !logbook.pegIds.includes(input.pegId))) {
    return failure(['Úlovok nepatrí do jazera alebo miesta vybraného zápisníka.'])
  }

  const { photo, ...catchInput } = input
  const weather = weatherResolver({
    caughtAt: input.caughtAt,
    lake: input.lake,
    pegId: input.pegId,
  })
  const catchRecord: CatchRecord = {
    ...catchInput,
    id: createCatchId(input, state, now),
    notes: photo
      ? 'Záznam uložený cez verejný lokálny formulár. Fotka čaká na schválenie a budúce AI spracovanie.'
      : 'Záznam uložený cez verejný lokálny formulár. Fotku bude možné doplniť po napojení storage.',
    photoLabel: photo?.fileName ?? 'bez fotky',
    status: 'pending',
    weather,
  }
  const photoUpload = photo as CatchPhotoUpload | undefined
  const catchPhoto: CatchPhoto | undefined = photoUpload
    ? {
        aiNotes: 'Fotka je uložená lokálne a pripravená na budúce porovnanie rýb.',
        aiStatus: 'queued',
        catchId: catchRecord.id,
        fileName: photoUpload.fileName,
        id: createPhotoId(catchRecord.id, state),
        label: photoUpload.fileName,
        mimeType: photoUpload.mimeType,
        publicUrl: '',
        sizeBytes: photoUpload.sizeBytes,
        status: 'uploaded',
        storagePath: '',
        uploadedAt: now,
      }
    : undefined

  if (catchPhoto) {
    const extension = extensionForMimeType(photoUpload!.mimeType)
    catchPhoto.storagePath = `catch-photos/${catchPhoto.id}.${extension}`
    catchPhoto.publicUrl = `/api/catch-photos/${catchPhoto.id}`
    catchRecord.photoId = catchPhoto.id
    catchRecord.photoStoragePath = catchPhoto.storagePath
    catchRecord.photoUrl = catchPhoto.publicUrl
  }

  const logbookEntry: TripLogbookEntry | undefined = logbook
    ? {
        angler: catchRecord.angler,
        bait: catchRecord.bait,
        caughtAt: catchRecord.caughtAt,
        catchId: catchRecord.id,
        id: uniqueId(
          `entry-${catchRecord.id}`,
          new Set(state.tripLogbookEntries.map((entry) => entry.id)),
        ),
        lake: catchRecord.lake,
        lengthCm: catchRecord.lengthCm,
        logbookId: logbook.id,
        pegId: catchRecord.pegId,
        photoStatus: catchPhoto ? 'uploaded' : 'missing',
        released: catchRecord.released,
        species: catchRecord.species,
        verified: false,
        weightKg: catchRecord.weightKg,
      }
    : undefined

  return {
    catch: catchRecord,
    catchPhoto,
    logbookEntry,
    message: logbookEntry
      ? catchPhoto
        ? 'Úlovok aj fotka sú uložené v aktívnom zápisníku a čakajú na schválenie pred verejným zobrazením.'
        : 'Úlovok je uložený v aktívnom zápisníku a čaká na schválenie pred verejným zobrazením.'
      : catchPhoto
        ? 'Úlovok aj fotka sú uložené a čakajú na schválenie pred verejným zobrazením.'
        : 'Úlovok je uložený a čaká na schválenie pred verejným zobrazením.',
    ok: true,
    photoUpload,
    statusCode: 201,
  }
}

export function submitTripLogbook(
  rawInput: unknown,
  state: CatchWorkflowState,
  service: PondService = pondService,
  now = new Date().toISOString(),
  shareCodeRandomPartFactory: ShareCodeRandomPartFactory = createSecureShareCodeRandomPart,
  ownerIdentity?: TripLogbookOwnerIdentity,
): TripLogbookSubmissionResult {
  const inputResult = tripLogbookInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const unknownPegIds = input.pegIds.filter((pegId) =>
    !service.pegs.some((peg) => peg.id === pegId && peg.lake === input.lake),
  )

  if (unknownPegIds.length > 0) {
    return failure(unknownPegIds.map((pegId) => `Lovné miesto neexistuje pre zvolené jazero: ${pegId}.`), 404)
  }

  const fromDate = new Date(now)
  const toDate = new Date(fromDate)
  toDate.setHours(toDate.getHours() + (input.mode === 'personal' ? 12 : 48))

  const id = createLogbookId(input.title, state, now)
  const logbookDraft = {
    id,
    lake: input.lake,
    title: input.title,
  }
  const memberNames = ownerIdentity
    ? [
        ownerIdentity.name,
        ...input.memberNames.filter((name) =>
          name.toLocaleLowerCase('sk') !== ownerIdentity.name.toLocaleLowerCase('sk'),
        ),
      ]
    : input.memberNames
  const memberIds = new Set<string>()
  const members = memberNames.map((name, index) => {
    const memberId = uniqueId(`member-${slugify(name).slice(0, 22)}`, memberIds)
    memberIds.add(memberId)

    return {
      id: memberId,
      name,
      role: index === 0 ? 'owner' as const : 'member' as const,
      userId: index === 0 ? ownerIdentity?.id : undefined,
    }
  })
  const logbook: TripLogbook = {
    ...logbookDraft,
    from: fromDate.toISOString(),
    members,
    mode: input.mode,
    note: 'Lokálne vytvorený zápisník výpravy. Dáta sa neskôr dajú migrovať do účtov a pozvánok.',
    owner: memberNames[0]!,
    ownerUserId: ownerIdentity?.id,
    pegIds: input.pegIds,
    shareCode: createShareCode(logbookDraft, state, shareCodeRandomPartFactory),
    status: 'active',
    to: toDate.toISOString(),
  }

  return {
    logbook,
    message: ownerIdentity
      ? `Zápisník ${logbook.shareCode} je uložený v účte ${ownerIdentity.name}.`
      : `Zápisník ${logbook.shareCode} je uložený lokálne.`,
    ok: true,
    statusCode: 201,
  }
}

export function lookupTripLogbookByShareCode(
  rawCode: unknown,
  state: CatchWorkflowState,
): TripLogbookLookupResult {
  const shareCode = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : ''
  if (!shareCode) {
    return failure(['Chýba kód zápisníka.'], 400)
  }

  const logbook = state.tripLogbooks.find((item) => item.shareCode.toUpperCase() === shareCode)
  if (!logbook) {
    return failure(['Zápisník s týmto kódom sa nenašiel.'], 404)
  }

  const tripLogbookEntries = state.tripLogbookEntries.filter((entry) => entry.logbookId === logbook.id)
  const catchIds = new Set(tripLogbookEntries.map((entry) => entry.catchId).filter(Boolean))
  const catches = state.catches
    .filter((catchItem) => catchIds.has(catchItem.id))
    .map(sanitizePublicCatch)
  const catchPhotos = state.catchPhotos.filter((photo) => catchIds.has(photo.catchId))

  return {
    catchPhotos,
    catches,
    logbook: sanitizeSharedTripLogbook(logbook),
    message: `Zápisník ${logbook.shareCode} je otvorený.`,
    ok: true,
    statusCode: 200,
    tripLogbookEntries,
  }
}
