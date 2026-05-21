import { describe, expect, it } from 'vitest'
import type { Sponsor } from '~/app/data/pond'
import { updateSponsorSettings } from '~/app/services/sponsorService'

const sponsor = (overrides: Partial<Sponsor> = {}): Sponsor => ({
  id: 'sponsor-carpgear',
  name: 'CarpGear Pro',
  tier: 'main',
  logoText: 'CG',
  website: 'https://example.com',
  description: 'Hlavný partner testovacieho revíru.',
  placement: 'homepage, súťaže',
  active: true,
  ...overrides,
})

describe('updateSponsorSettings', () => {
  it('updates existing sponsors and normalizes an empty website', () => {
    const result = updateSponsorSettings(
      {
        sponsors: [{
          active: false,
          description: 'Partner lokálnej prevádzky a komunitných akcií.',
          id: 'sponsor-carpgear',
          logoText: 'CGP',
          name: 'CarpGear Pro SK',
          placement: 'footer, stránka sponzorov',
          tier: 'partner',
          website: '',
        }],
      },
      {
        sponsors: [sponsor()],
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Sponsor update should be valid.')

    expect(result.sponsors[0]).toMatchObject({
      active: false,
      description: 'Partner lokálnej prevádzky a komunitných akcií.',
      id: 'sponsor-carpgear',
      logoText: 'CGP',
      name: 'CarpGear Pro SK',
      placement: 'footer, stránka sponzorov',
      tier: 'partner',
    })
    expect(result.sponsors[0]?.website).toBeUndefined()
  })

  it('adds new sponsors and returns created ids', () => {
    const result = updateSponsorSettings(
      {
        sponsors: [
          sponsor(),
          {
            active: true,
            description: 'Partner cien pre najväčšiu rybu súťažného víkendu.',
            id: 'sponsor-baits',
            logoText: 'DB',
            name: 'Danube Baits',
            placement: 'European Carp Cup Junior',
            placementType: 'tournament',
            sortOrder: 2,
            tier: 'tournament',
            tournamentId: 'eccj-2026',
            validFrom: '2026-08-01',
            validTo: '2026-08-31',
            website: 'https://example.com/baits',
          },
        ],
      },
      {
        sponsors: [sponsor()],
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Sponsor update should be valid.')

    expect(result.createdSponsorIds).toEqual(['sponsor-baits'])
    expect(result.sponsors.find((item) => item.id === 'sponsor-baits')).toMatchObject({
      active: true,
      name: 'Danube Baits',
      tier: 'tournament',
      tournamentId: 'eccj-2026',
    })
    expect(result.message).toContain('pribudlo 1 partnerov')
  })

  it('rejects tournament and sector placements without required targets', () => {
    const result = updateSponsorSettings(
      {
        sponsors: [
          {
            ...sponsor(),
            id: 'sponsor-tournament',
            name: 'Súťažný partner',
            placementType: 'tournament',
            sortOrder: 1,
            tournamentId: '',
          },
          {
            ...sponsor(),
            id: 'sponsor-sector',
            name: 'Sektorový partner',
            placementType: 'sector',
            sectorId: '',
            sortOrder: 2,
          },
        ],
      },
      {
        sponsors: [sponsor()],
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Sponsor update should be invalid.')

    expect(result.messages).toContain('Pri súťažnom umiestnení vyberte súťaž.')
    expect(result.messages).toContain('Pri sektorovom umiestnení vyberte sektor.')
  })

  it('rejects campaign validity ranges that end before they start', () => {
    const result = updateSponsorSettings(
      {
        sponsors: [{
          ...sponsor(),
          sortOrder: 1,
          validFrom: '2026-08-31',
          validTo: '2026-08-01',
        }],
      },
      {
        sponsors: [sponsor()],
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Sponsor update should be invalid.')

    expect(result.messages).toContain('Platnosť kampane musí končiť rovnaký deň alebo neskôr ako začína.')
  })

  it('rejects duplicate sponsor ids', () => {
    const result = updateSponsorSettings(
      {
        sponsors: [
          sponsor(),
          sponsor({ name: 'Duplicitný sponzor' }),
        ],
      },
      {
        sponsors: [sponsor()],
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Sponsor update should be invalid.')

    expect(result.messages).toContain('Sponzor je v požiadavke duplicitne: sponsor-carpgear.')
  })

  it('rejects invalid sponsor website urls', () => {
    const result = updateSponsorSettings(
      {
        sponsors: [{
          ...sponsor(),
          website: 'partner.example.com',
        }],
      },
      {
        sponsors: [sponsor()],
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Sponsor update should be invalid.')

    expect(result.messages).toContain('Web sponzora musí byť platná URL adresa.')
  })
})
