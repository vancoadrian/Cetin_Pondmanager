import { describe, expect, it } from 'vitest'
import { pegs, type LakeClosure } from '~/app/data/pond'
import {
  sanitizePublicClosures,
  saveLakeClosure,
} from '~/app/services/closureApiService'

const seedClosure: LakeClosure = {
  affectsReservations: true,
  from: '2026-06-01',
  id: 'closure-existing',
  lake: 'velky-cetin',
  notes: 'Seed uzávierka pre test.',
  reason: 'maintenance',
  title: 'Existujúci servis',
  to: '2026-06-02',
  visibility: 'internal',
}

describe('saveLakeClosure', () => {
  it('creates a reservation-blocking closure for selected pegs', () => {
    const result = saveLakeClosure(
      {
        affectsReservations: true,
        from: '2026-06-10',
        lake: 'velky-cetin',
        notes: 'Servis móla a brehu pri chate.',
        pegIds: ['vc-10'],
        reason: 'maintenance',
        title: 'Servis pri chate 10',
        to: '2026-06-12',
        visibility: 'internal',
      },
      { lakeClosures: [seedClosure] },
      pegs,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Closure should be valid.')

    expect(result.statusCode).toBe(201)
    expect(result.closure.id).toMatch(/^closure-20260610-servis-pri-chate-10/)
    expect(result.closure.pegIds).toEqual(['vc-10'])
    expect(result.lakeClosures[0]?.id).toBe(result.closure.id)
  })

  it('updates an existing closure by id', () => {
    const result = saveLakeClosure(
      {
        ...seedClosure,
        notes: 'Aktualizovaná servisná poznámka.',
        title: 'Aktualizovaný servis',
      },
      { lakeClosures: [seedClosure] },
      pegs,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Closure update should be valid.')

    expect(result.statusCode).toBe(200)
    expect(result.lakeClosures).toHaveLength(1)
    expect(result.closure.title).toBe('Aktualizovaný servis')
  })

  it('rejects pegs outside the selected lake', () => {
    const result = saveLakeClosure(
      {
        affectsReservations: true,
        from: '2026-06-10',
        lake: 'strkovisko-kocka',
        notes: 'Nesprávne priradené lovné miesto.',
        pegIds: ['vc-10'],
        reason: 'maintenance',
        title: 'Zlý výber miesta',
        to: '2026-06-12',
        visibility: 'internal',
      },
      { lakeClosures: [] },
      pegs,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Closure should be invalid.')

    expect(result.messages).toContain('Lovné miesto vc-10 nepatrí k vybranému jazeru.')
  })

  it('rejects an inverted date range', () => {
    const result = saveLakeClosure(
      {
        affectsReservations: true,
        from: '2026-06-12',
        lake: 'velky-cetin',
        notes: 'Chybný rozsah dátumov.',
        pegIds: [],
        reason: 'season',
        title: 'Chybná sezóna',
        to: '2026-06-10',
        visibility: 'public',
      },
      { lakeClosures: [] },
      pegs,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Closure should be invalid.')

    expect(result.messages).toContain('Dátum konca uzávierky musí byť rovnaký alebo neskorší ako začiatok.')
  })
})

describe('sanitizePublicClosures', () => {
  it('keeps blocking scope but hides internal details', () => {
    const sanitized = sanitizePublicClosures([seedClosure])

    expect(sanitized[0]).toMatchObject({
      id: 'closure-existing',
      notes: 'Termín je v internom režime blokovaný správcom revíru.',
      title: 'Interná blokácia termínu',
      visibility: 'internal',
    })
    expect(sanitized[0]?.affectsReservations).toBe(true)
  })
})
