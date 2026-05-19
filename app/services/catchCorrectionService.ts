import type { CatchPhoto, CatchRecord, TripLogbook, TripLogbookEntry } from '~/data/pond'
import { catchCorrectionInputSchema, getValidationMessages } from '~/schemas/pondSchemas'
import type { ApiValidationFailure, CatchWorkflowState } from '~/services/catchApiService'
import {
  createCatchWeatherResolver,
  type CatchWeatherResolver,
} from '~/services/catchWeatherService'
import { pondService, type PondService } from '~/services/pondService'

export interface CatchCorrectionSuccess extends CatchWorkflowState {
  catch: CatchRecord
  logbookLinkMode: CatchLogbookLinkMode
  logbookEntry?: TripLogbookEntry
  message: string
  ok: true
  statusCode: 200
}

export type CatchLogbookLinkMode = 'keep' | 'move' | 'detach'
export type CatchCorrectionResult = ApiValidationFailure | CatchCorrectionSuccess

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

function uniqueId(baseId: string, existingIds: Set<string>) {
  if (!existingIds.has(baseId)) return baseId

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1
  }

  return `${baseId}-${index}`
}

function cloneCatchPhotos(items: CatchPhoto[]) {
  return items.map((item) => ({ ...item }))
}

function cloneTripLogbooks(items: TripLogbook[]) {
  return items.map((item) => ({
    ...item,
    members: item.members.map((member) => ({ ...member })),
    pegIds: [...item.pegIds],
  }))
}

function updateLinkedLogbookEntry(entry: TripLogbookEntry, catchRecord: CatchRecord): TripLogbookEntry {
  return {
    ...entry,
    angler: catchRecord.angler,
    bait: catchRecord.bait,
    caughtAt: catchRecord.caughtAt,
    lake: catchRecord.lake,
    lengthCm: catchRecord.lengthCm,
    pegId: catchRecord.pegId,
    released: catchRecord.released,
    species: catchRecord.species,
    weightKg: catchRecord.weightKg,
  }
}

function resolveEntryPhotoStatus(catchRecord: CatchRecord, state: CatchWorkflowState): TripLogbookEntry['photoStatus'] {
  const photo = state.catchPhotos.find((item) => item.catchId === catchRecord.id)
  if (photo?.status === 'ai-ready') return 'ai-ready'
  if (photo || catchRecord.photoId) return 'uploaded'

  return 'missing'
}

function createLogbookEntry(
  catchRecord: CatchRecord,
  logbook: TripLogbook,
  state: CatchWorkflowState,
): TripLogbookEntry {
  return {
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
    photoStatus: resolveEntryPhotoStatus(catchRecord, state),
    released: catchRecord.released,
    species: catchRecord.species,
    verified: false,
    weightKg: catchRecord.weightKg,
  }
}

export function submitCatchCorrection(
  rawInput: unknown,
  state: CatchWorkflowState,
  service: PondService = pondService,
  weatherResolver: CatchWeatherResolver = createCatchWeatherResolver(),
): CatchCorrectionResult {
  const inputResult = catchCorrectionInputSchema.safeParse(rawInput)
  if (!inputResult.success) {
    return failure(getValidationMessages(inputResult))
  }

  const input = inputResult.data
  const currentCatch = state.catches.find((catchItem) => catchItem.id === input.catchId)
  if (!currentCatch) {
    return failure(['Úlovok sa nenašiel v lokálnom mock stave.'], 404)
  }

  const peg = service.pegs.find((item) => item.id === input.pegId && item.lake === input.lake)
  if (!peg) {
    return failure(['Vybrané lovné miesto neexistuje pre zvolené jazero.'], 404)
  }

  if (!Number.isFinite(Date.parse(input.caughtAt))) {
    return failure(['Čas úlovku nemá platný formát.'])
  }

  const linkedEntry = state.tripLogbookEntries.find((entry) => entry.catchId === input.catchId)
  const linkedLogbook = linkedEntry
    ? state.tripLogbooks.find((logbook) => logbook.id === linkedEntry.logbookId)
    : undefined

  if (
    input.logbookLinkMode === 'keep' &&
    linkedLogbook &&
    (linkedLogbook.lake !== input.lake || !linkedLogbook.pegIds.includes(input.pegId))
  ) {
    return failure([
      'Opravený úlovok nepatrí do jazera alebo miesta pôvodného zápisníka. Vyberte presun do iného zápisníka alebo úlovok od zápisníka odpojte.',
    ])
  }

  const targetLogbook = input.logbookLinkMode === 'move'
    ? state.tripLogbooks.find((logbook) => logbook.id === input.targetLogbookId)
    : undefined

  if (input.logbookLinkMode === 'move' && !targetLogbook) {
    return failure(['Cieľový zápisník sa v lokálnom store nenašiel.'], 404)
  }

  if (targetLogbook?.status === 'closed') {
    return failure(['Uzavretý zápisník už neprijíma presunuté úlovky.'])
  }

  if (targetLogbook && (targetLogbook.lake !== input.lake || !targetLogbook.pegIds.includes(input.pegId))) {
    return failure(['Úlovok nepatrí do jazera alebo miesta vybraného cieľového zápisníka.'])
  }

  const weatherContextChanged =
    currentCatch.caughtAt !== input.caughtAt ||
    currentCatch.lake !== input.lake ||
    currentCatch.pegId !== input.pegId
  const weather = weatherContextChanged || !currentCatch.weather
    ? weatherResolver({
        caughtAt: input.caughtAt,
        lake: input.lake,
        pegId: input.pegId,
      }) ?? currentCatch.weather
    : currentCatch.weather

  const nextCatch: CatchRecord = {
    ...currentCatch,
    angler: input.angler,
    bait: input.bait,
    caughtAt: input.caughtAt,
    lake: input.lake,
    lengthCm: input.lengthCm,
    notes: input.notes,
    pegId: input.pegId,
    released: input.released,
    species: input.species,
    weather,
    weightKg: input.weightKg,
  }
  const nextCatches = state.catches.map((catchItem) =>
    catchItem.id === input.catchId ? nextCatch : { ...catchItem },
  )
  let logbookEntry: TripLogbookEntry | undefined
  let message = 'Údaje úlovku sú opravené a pripravené na rozhodnutie správcu.'
  let nextTripLogbookEntries: TripLogbookEntry[]

  if (input.logbookLinkMode === 'detach') {
    nextTripLogbookEntries = state.tripLogbookEntries
      .filter((entry) => entry.catchId !== input.catchId)
      .map((entry) => ({ ...entry }))
    message = linkedEntry
      ? 'Údaje úlovku sú opravené a úlovok je odpojený od zápisníka výpravy.'
      : 'Údaje úlovku sú opravené a úlovok ostáva bez zápisníka výpravy.'
  }
  else if (targetLogbook) {
    const movedEntry = updateLinkedLogbookEntry(
      linkedEntry
        ? { ...linkedEntry, logbookId: targetLogbook.id }
        : createLogbookEntry(nextCatch, targetLogbook, state),
      nextCatch,
    )

    logbookEntry = movedEntry
    nextTripLogbookEntries = [
      movedEntry,
      ...state.tripLogbookEntries
        .filter((entry) => entry.catchId !== input.catchId)
        .map((entry) => ({ ...entry })),
    ]
    message = linkedEntry
      ? `Údaje úlovku sú opravené a presunuté do zápisníka ${targetLogbook.shareCode}.`
      : `Údaje úlovku sú opravené a pridané do zápisníka ${targetLogbook.shareCode}.`
  }
  else {
    nextTripLogbookEntries = state.tripLogbookEntries.map((entry) =>
      entry.catchId === input.catchId ? updateLinkedLogbookEntry(entry, nextCatch) : { ...entry },
    )
    logbookEntry = nextTripLogbookEntries.find((entry) => entry.catchId === input.catchId)
    message = logbookEntry
      ? 'Údaje úlovku sú opravené a riadok zápisníka je zosúladený.'
      : message
  }

  return {
    catch: nextCatch,
    catchPhotos: cloneCatchPhotos(state.catchPhotos),
    catches: nextCatches,
    logbookEntry,
    logbookLinkMode: input.logbookLinkMode,
    message,
    ok: true,
    statusCode: 200,
    tripLogbookEntries: nextTripLogbookEntries,
    tripLogbooks: cloneTripLogbooks(state.tripLogbooks),
  }
}
