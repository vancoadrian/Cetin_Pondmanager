import { describe, expect, it } from 'vitest'
import {
  catches,
  pegs,
  tournamentCatches,
  tournaments,
} from '~/app/data/pond'
import {
  addFishObservation,
  createFishCatchCandidates,
  createDefaultFishRegistrySettings,
  exportFishRegistryCsv,
  formatFishManagerAvailability,
  getFishManagerAvailability,
  importFishRegistryCsv,
  parseCsvRows,
  registerTaggedFish,
  searchFishRegistry,
  setFishManagerPresence,
  updateTaggedFishIdentity,
  type FishRegistryState,
} from '~/app/services/fishRegistryService'

const emptyState = (): FishRegistryState => ({
  fish: [],
  observations: [],
})

const registration = {
  anglerName: 'Testovací rybár',
  bait: 'scopex boilies',
  chipCode: '985141000999001',
  lake: 'velky-cetin',
  name: 'Testovacia',
  notes: 'Ryba pre unit test.',
  species: 'Kapor lysec',
  status: 'active',
  taggedAt: '2026-06-20T08:30:00.000Z',
  taggedLengthCm: 101,
  taggedPegId: 'vc-05',
  taggedWeightKg: 22.4,
  taggerName: 'Správca',
  taggingContext: 'capture',
}

describe('fish registry service', () => {
  it('registers a unique chip with an initial observation', () => {
    const result = registerTaggedFish(registration, emptyState(), pegs, '2026-06-20T09:00:00.000Z')

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Registration should be valid.')

    expect(result.fishRecord.chipCode).toBe('985141000999001')
    expect(result.observation).toMatchObject({
      anglerName: 'Testovací rybár',
      bait: 'scopex boilies',
      lengthCm: 101,
      pegId: 'vc-05',
      weightKg: 22.4,
    })
    expect(result.observations).toHaveLength(1)
  })

  it('rejects duplicate chip numbers and pegs from another lake', () => {
    const created = registerTaggedFish(registration, emptyState(), pegs)
    if (!created.ok) throw new Error('Registration should be valid.')

    const duplicate = registerTaggedFish(registration, created, pegs)
    expect(duplicate.ok).toBe(false)
    if (duplicate.ok) throw new Error('Duplicate registration should fail.')
    expect(duplicate.statusCode).toBe(409)

    const wrongPeg = registerTaggedFish({
      ...registration,
      chipCode: '985141000999002',
      taggedPegId: 'sk-01',
    }, emptyState(), pegs)
    expect(wrongPeg.ok).toBe(false)
    if (wrongPeg.ok) throw new Error('Wrong lake peg should fail.')
    expect(wrongPeg.messages[0]).toContain('nepatrí')
  })

  it('adds an observation and searches by chip or name', () => {
    const created = registerTaggedFish(registration, emptyState(), pegs)
    if (!created.ok) throw new Error('Registration should be valid.')

    const observation = addFishObservation(created.fishRecord.id, {
      anglerName: 'Rybár',
      bait: 'boilies',
      chipReadBy: 'Kontrolór',
      lake: 'velky-cetin',
      lengthCm: 103,
      notes: 'Dobrá kondícia.',
      observedAt: '2026-06-21T05:45:00.000Z',
      pegId: 'vc-09',
      source: 'tournament',
      weightKg: 23.1,
    }, created, pegs)

    expect(observation.ok).toBe(true)
    if (!observation.ok) throw new Error('Observation should be valid.')

    expect(observation.observations).toHaveLength(2)
    expect(searchFishRegistry(observation.fish, '999001')).toHaveLength(1)
    expect(searchFishRegistry(observation.fish, 'testovacia')).toHaveLength(1)
  })

  it('updates editable fish identity fields while preserving its chip and history', () => {
    const created = registerTaggedFish(registration, emptyState(), pegs)
    if (!created.ok) throw new Error('Registration should be valid.')

    const updated = updateTaggedFishIdentity(created.fishRecord.id, {
      changeNote: 'Ryba nebola potvrdená počas sezónnej inventúry.',
      chipCode: '999999999999999',
      name: 'Testovacia II',
      notes: 'Overiť pri najbližšom načítaní čipu.',
      species: 'Kapor obyčajný',
      status: 'missing',
      taggedAt: '2030-01-01T00:00:00.000Z',
    }, created, '2026-06-22T10:00:00.000Z')

    expect(updated.ok).toBe(true)
    if (!updated.ok) throw new Error('Fish update should be valid.')
    expect(updated.previousStatus).toBe('active')
    expect(updated.fishRecord).toMatchObject({
      chipCode: registration.chipCode,
      name: 'Testovacia II',
      species: 'Kapor obyčajný',
      status: 'missing',
      taggedAt: registration.taggedAt,
      taggedPegId: registration.taggedPegId,
    })
    expect(updated.observations).toEqual(created.observations)
  })

  it('requires a reason for status changes and rejects empty updates', () => {
    const created = registerTaggedFish(registration, emptyState(), pegs)
    if (!created.ok) throw new Error('Registration should be valid.')

    const withoutReason = updateTaggedFishIdentity(created.fishRecord.id, {
      changeNote: '',
      name: created.fishRecord.name,
      notes: created.fishRecord.notes,
      species: created.fishRecord.species,
      status: 'dead',
    }, created)
    expect(withoutReason.ok).toBe(false)
    if (withoutReason.ok) throw new Error('Status change without reason should fail.')
    expect(withoutReason.messages[0]).toContain('dôvod')

    const unchanged = updateTaggedFishIdentity(created.fishRecord.id, {
      changeNote: '',
      name: created.fishRecord.name,
      notes: created.fishRecord.notes,
      species: created.fishRecord.species,
      status: created.fishRecord.status,
    }, created)
    expect(unchanged.ok).toBe(false)
    if (unchanged.ok) throw new Error('Unchanged identity should fail.')
    expect(unchanged.messages[0]).toContain('žiadne zmeny')
  })

  it('derives only large catches that are not linked to a fish observation', () => {
    const candidates = createFishCatchCandidates(
      catches,
      tournamentCatches,
      tournaments,
      [],
    )

    expect(candidates).toEqual([
      expect.objectContaining({
        catchId: 'c-2401',
        pegId: 'vc-05',
        source: 'public-catch',
        weightKg: 18.6,
      }),
    ])

    const linkedCandidates = createFishCatchCandidates(
      catches,
      tournamentCatches,
      tournaments,
      [{
        anglerName: 'Marek H.',
        bait: 'scopex',
        catchId: 'c-2401',
        chipReadBy: 'Správca',
        createdAt: '2026-06-21T10:00:00.000Z',
        fishId: 'fish-test',
        id: 'observation-test',
        lake: 'velky-cetin',
        lengthCm: 92,
        notes: '',
        observedAt: '2026-05-16T05:40:00+02:00',
        pegId: 'vc-05',
        source: 'public-catch',
        weightKg: 18.6,
      }],
    )

    expect(linkedCandidates).toHaveLength(0)
  })

  it('uses a separate large-fish threshold for each lake', () => {
    const settings = createDefaultFishRegistrySettings()
    settings.largeCatchRules = settings.largeCatchRules.map((rule) =>
      rule.lake === 'velky-cetin'
        ? { ...rule, thresholdKg: 19 }
        : rule,
    )

    const candidates = createFishCatchCandidates(
      catches,
      tournamentCatches,
      tournaments,
      [],
      settings,
    )

    expect(candidates).toHaveLength(0)
  })

  it('evaluates the manager weekend service from the catch time', () => {
    const rule = createDefaultFishRegistrySettings().largeCatchRules[0]!

    expect(formatFishManagerAvailability(rule)).toBe('So-Ne 07:00-18:00')
    expect(getFishManagerAvailability(rule, '2026-05-16T10:30').available).toBe(true)
    expect(getFishManagerAvailability(rule, '2026-05-16T05:40').available).toBe(false)
    expect(getFishManagerAvailability(rule, '2026-05-18T10:30').available).toBe(false)
    expect(getFishManagerAvailability(rule, '2026-05-17T16:30:00+02:00').available).toBe(true)
  })

  it('supports a service window crossing midnight', () => {
    const rule = createDefaultFishRegistrySettings().largeCatchRules[0]!
    rule.availabilityWindows = [{
      daysOfWeek: [6],
      endsAt: '02:00',
      id: 'night',
      label: 'Nočná služba',
      startsAt: '20:00',
    }]

    expect(getFishManagerAvailability(rule, '2026-05-16T23:00').available).toBe(true)
    expect(getFishManagerAvailability(rule, '2026-05-17T01:30').available).toBe(true)
    expect(getFishManagerAvailability(rule, '2026-05-17T03:00').available).toBe(false)
  })

  it('temporarily overrides the regular schedule when the manager confirms presence', () => {
    const settings = createDefaultFishRegistrySettings()
    const started = setFishManagerPresence({
      action: 'start',
      durationHours: 4,
      lake: 'velky-cetin',
    }, settings, 'Správca pri vode', '2026-05-18T08:00:00.000Z')

    expect(started.ok).toBe(true)
    if (!started.ok) throw new Error('Presence should be valid.')
    const rule = started.settings.largeCatchRules.find((item) => item.lake === 'velky-cetin')!
    expect(rule.presenceOverride).toMatchObject({
      endsAt: '2026-05-18T12:00:00.000Z',
      setBy: 'Správca pri vode',
      startedAt: '2026-05-18T08:00:00.000Z',
    })
    expect(getFishManagerAvailability(rule, '2026-05-18T10:00:00.000Z')).toMatchObject({
      available: true,
      source: 'presence',
    })
    expect(getFishManagerAvailability(rule, '2026-05-18T13:00:00.000Z')).toMatchObject({
      available: false,
      source: 'none',
    })

    const stopped = setFishManagerPresence({
      action: 'stop',
      durationHours: 4,
      lake: 'velky-cetin',
    }, started.settings, 'Správca pri vode', '2026-05-18T10:30:00.000Z')
    expect(stopped.ok).toBe(true)
    if (!stopped.ok) throw new Error('Presence stop should be valid.')
    expect(stopped.settings.largeCatchRules[0]?.presenceOverride).toBeUndefined()
  })

  it('confirms the same temporary presence for multiple nearby lakes atomically', () => {
    const settings = createDefaultFishRegistrySettings()
    const started = setFishManagerPresence({
      action: 'start',
      durationHours: 8,
      lakes: ['velky-cetin', 'strkovisko-kocka'],
    }, settings, 'Správca pri vode', '2026-05-18T08:00:00.000Z')

    expect(started.ok).toBe(true)
    if (!started.ok) throw new Error('Bulk presence should be valid.')
    expect(started.settings.largeCatchRules.map((rule) => rule.presenceOverride)).toEqual([
      {
        endsAt: '2026-05-18T16:00:00.000Z',
        setBy: 'Správca pri vode',
        startedAt: '2026-05-18T08:00:00.000Z',
      },
      {
        endsAt: '2026-05-18T16:00:00.000Z',
        setBy: 'Správca pri vode',
        startedAt: '2026-05-18T08:00:00.000Z',
      },
    ])

    const stopped = setFishManagerPresence({
      action: 'stop',
      durationHours: 8,
      lakes: ['velky-cetin', 'strkovisko-kocka'],
    }, started.settings, 'Správca pri vode', '2026-05-18T09:00:00.000Z')
    expect(stopped.ok).toBe(true)
    if (!stopped.ok) throw new Error('Bulk presence stop should be valid.')
    expect(stopped.settings.largeCatchRules.every((rule) => !rule.presenceOverride)).toBe(true)
  })

  it('keeps the source catch link on the first observation of a new fish', () => {
    const result = registerTaggedFish({
      ...registration,
      catchId: 'c-2401',
      observationSource: 'public-catch',
    }, emptyState(), pegs)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Registration should be valid.')
    expect(result.observation).toMatchObject({
      catchId: 'c-2401',
      source: 'public-catch',
    })
  })

  it('exports and imports quoted CSV values without duplicating observations', () => {
    const quotedRows = parseCsvRows('first,second\r\n"hodnota, s čiarkou",test\r\n')
    expect(quotedRows[1]).toContain('hodnota, s čiarkou')

    const created = registerTaggedFish(registration, emptyState(), pegs)
    if (!created.ok) throw new Error('Registration should be valid.')

    const csv = exportFishRegistryCsv(created)
    const imported = importFishRegistryCsv(csv, emptyState(), pegs, '2026-06-21T10:00:00.000Z')
    expect(imported.ok).toBe(true)
    if (!imported.ok) throw new Error('CSV import should be valid.')
    expect(imported.createdFishCount).toBe(1)
    expect(imported.importedObservationCount).toBe(1)

    const secondImport = importFishRegistryCsv(csv, imported, pegs, '2026-06-21T11:00:00.000Z')
    expect(secondImport.ok).toBe(true)
    if (!secondImport.ok) throw new Error('Second CSV import should be valid.')
    expect(secondImport.skippedObservationCount).toBe(1)
  })
})
