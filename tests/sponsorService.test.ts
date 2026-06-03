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

  it('creates logo metadata and returns a local logo write payload', () => {
    const result = updateSponsorSettings(
      {
        sponsors: [{
          ...sponsor(),
          logoUpload: {
            dataUrl: 'data:image/png;base64,aGVsbG8=',
            fileName: 'carpgear.png',
            height: 180,
            mimeType: 'image/png',
            sizeBytes: 5,
            width: 400,
          },
        }],
      },
      {
        sponsors: [sponsor()],
      },
      '2026-05-21T10:15:30.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Sponsor update should be valid.')

    expect(result.sponsors[0]).toMatchObject({
      logoAssetId: 'logo-sponsor-carpgear-20260521101530',
      logoFileName: 'carpgear.png',
      logoHeight: 180,
      logoMimeType: 'image/png',
      logoSizeBytes: 5,
      logoStoragePath: 'sponsor-assets/logo-sponsor-carpgear-20260521101530.png',
      logoUpdatedAt: '2026-05-21T10:15:30.000Z',
      logoUrl: '/api/sponsor-assets/logo-sponsor-carpgear-20260521101530',
      logoWidth: 400,
    })
    expect(result.logoUploads).toEqual([{
      sponsorId: 'sponsor-carpgear',
      storagePath: 'sponsor-assets/logo-sponsor-carpgear-20260521101530.png',
      upload: {
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        fileName: 'carpgear.png',
        height: 180,
        mimeType: 'image/png',
        sizeBytes: 5,
        width: 400,
      },
    }])
  })

  it('creates reusable source logo metadata for generated variants', () => {
    const upload = {
      dataUrl: 'data:image/png;base64,aGVsbG8=',
      fileName: 'carpgear-source.png',
      height: 420,
      mimeType: 'image/png' as const,
      sizeBytes: 5,
      width: 1280,
    }
    const result = updateSponsorSettings(
      {
        sponsors: [{
          ...sponsor(),
          logoVariantSourceUpload: upload,
        }],
      },
      {
        sponsors: [sponsor()],
      },
      '2026-05-21T10:45:30.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Sponsor update should be valid.')

    expect(result.sponsors[0]).toMatchObject({
      logoSourceAssetId: 'logo-source-sponsor-carpgear-20260521104530',
      logoSourceFileName: 'carpgear-source.png',
      logoSourceHeight: 420,
      logoSourceMimeType: 'image/png',
      logoSourceSizeBytes: 5,
      logoSourceStoragePath: 'sponsor-assets/logo-source-sponsor-carpgear-20260521104530.png',
      logoSourceUpdatedAt: '2026-05-21T10:45:30.000Z',
      logoSourceUrl: '/api/sponsor-assets/logo-source-sponsor-carpgear-20260521104530',
      logoSourceWidth: 1280,
    })
    expect(result.logoUploads).toContainEqual({
      sponsorId: 'sponsor-carpgear',
      storagePath: 'sponsor-assets/logo-source-sponsor-carpgear-20260521104530.png',
      upload,
    })
  })

  it('creates placement-specific logo variants and returns write payloads for them', () => {
    const result = updateSponsorSettings(
      {
        sponsors: [{
          ...sponsor(),
          logoVariants: [{
            logoUpload: {
              dataUrl: 'data:image/webp;base64,aGVsbG8=',
              fileName: 'homepage.webp',
              height: 300,
              mimeType: 'image/webp',
              sizeBytes: 5,
              width: 900,
            },
            placementType: 'homepage',
          }],
        }],
      },
      {
        sponsors: [sponsor()],
      },
      '2026-05-21T11:30:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Sponsor update should be valid.')

    expect(result.sponsors[0]?.logoVariants).toEqual([{
      fileName: 'homepage.webp',
      height: 300,
      mimeType: 'image/webp',
      placementType: 'homepage',
      sizeBytes: 5,
      storagePath: 'sponsor-assets/logo-sponsor-carpgear-homepage-20260521113000.webp',
      updatedAt: '2026-05-21T11:30:00.000Z',
      url: '/api/sponsor-assets/logo-sponsor-carpgear-homepage-20260521113000',
      variantId: 'logo-sponsor-carpgear-homepage-20260521113000',
      width: 900,
    }])
    expect(result.logoUploads).toContainEqual({
      placementType: 'homepage',
      sponsorId: 'sponsor-carpgear',
      storagePath: 'sponsor-assets/logo-sponsor-carpgear-homepage-20260521113000.webp',
      upload: {
        dataUrl: 'data:image/webp;base64,aGVsbG8=',
        fileName: 'homepage.webp',
        height: 300,
        mimeType: 'image/webp',
        sizeBytes: 5,
        width: 900,
      },
    })
  })

  it('stores crop preset metadata for generated logo variants', () => {
    const cropPreset = {
      focusXPercent: 35,
      focusYPercent: 70,
      mode: 'cover' as const,
      paddingPercent: 8,
      sourceFileName: 'carpgear-source.png',
      sourceHeight: 500,
      sourceWidth: 1200,
    }
    const result = updateSponsorSettings(
      {
        sponsors: [{
          ...sponsor(),
          logoVariants: [{
            cropPreset,
            logoUpload: {
              dataUrl: 'data:image/png;base64,aGVsbG8=',
              fileName: 'homepage.png',
              height: 240,
              mimeType: 'image/png',
              sizeBytes: 5,
              width: 720,
            },
            placementType: 'homepage',
          }],
        }],
      },
      {
        sponsors: [sponsor()],
      },
      '2026-05-21T11:40:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Sponsor update should be valid.')

    expect(result.sponsors[0]?.logoVariants?.[0]?.cropPreset).toEqual(cropPreset)
  })

  it('updates existing logo variant crop preset without replacing the asset', () => {
    const result = updateSponsorSettings(
      {
        sponsors: [{
          ...sponsor(),
          logoVariants: [{
            cropPreset: {
              focusXPercent: 80,
              focusYPercent: 45,
              mode: 'cover',
              paddingPercent: 4,
            },
            placementType: 'homepage',
          }],
        }],
      },
      {
        sponsors: [sponsor({
          logoVariants: [{
            cropPreset: {
              focusXPercent: 50,
              focusYPercent: 50,
              mode: 'contain',
              paddingPercent: 8,
            },
            fileName: 'homepage.webp',
            height: 300,
            mimeType: 'image/webp',
            placementType: 'homepage',
            sizeBytes: 5,
            storagePath: 'sponsor-assets/logo-homepage.webp',
            url: '/api/sponsor-assets/logo-homepage',
            variantId: 'logo-homepage',
            width: 900,
          }],
        })],
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Sponsor update should be valid.')

    expect(result.logoUploads).toEqual([])
    expect(result.sponsors[0]?.logoVariants?.[0]).toMatchObject({
      cropPreset: {
        focusXPercent: 80,
        focusYPercent: 45,
        mode: 'cover',
        paddingPercent: 4,
      },
      url: '/api/sponsor-assets/logo-homepage',
      variantId: 'logo-homepage',
    })
  })

  it('rejects logo uploads that do not match placement rules', () => {
    const result = updateSponsorSettings(
      {
        sponsors: [{
          ...sponsor(),
          logoUpload: {
            dataUrl: 'data:image/png;base64,aGVsbG8=',
            fileName: 'tiny.png',
            height: 120,
            mimeType: 'image/png',
            sizeBytes: 5,
            width: 240,
          },
          placementType: 'homepage',
        }],
      },
      {
        sponsors: [sponsor()],
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Sponsor update should be invalid.')

    expect(result.messages).toContain('Logo pre homepage musí mať aspoň 720 x 240 px.')
  })

  it('rejects logo variants that do not match their placement rules', () => {
    const result = updateSponsorSettings(
      {
        sponsors: [{
          ...sponsor(),
          logoVariants: [{
            logoUpload: {
              dataUrl: 'data:image/png;base64,aGVsbG8=',
              fileName: 'sector-wide.png',
              height: 260,
              mimeType: 'image/png',
              sizeBytes: 5,
              width: 900,
            },
            placementType: 'sector',
          }],
        }],
      },
      {
        sponsors: [sponsor()],
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Sponsor update should be invalid.')

    expect(result.messages).toContain('Variant loga pre sektor musí mať pomer strán 7:10 až 14:10.')
  })

  it('preserves existing logo metadata unless the admin removes it', () => {
    const existingSponsor = sponsor({
      logoAssetId: 'logo-sponsor-carpgear-old',
      logoFileName: 'old.webp',
      logoMimeType: 'image/webp',
      logoSizeBytes: 15,
      logoStoragePath: 'sponsor-assets/logo-sponsor-carpgear-old.webp',
      logoUpdatedAt: '2026-05-20T10:00:00.000Z',
      logoUrl: '/api/sponsor-assets/logo-sponsor-carpgear-old',
    })

    const preserved = updateSponsorSettings(
      {
        sponsors: [{
          ...sponsor(),
          name: 'CarpGear Pro SK',
        }],
      },
      {
        sponsors: [existingSponsor],
      },
    )
    const removed = updateSponsorSettings(
      {
        sponsors: [{
          ...sponsor(),
          removeLogo: true,
        }],
      },
      {
        sponsors: [existingSponsor],
      },
    )

    expect(preserved.ok).toBe(true)
    if (!preserved.ok) throw new Error('Sponsor update should be valid.')
    expect(preserved.sponsors[0]?.logoUrl).toBe('/api/sponsor-assets/logo-sponsor-carpgear-old')

    expect(removed.ok).toBe(true)
    if (!removed.ok) throw new Error('Sponsor update should be valid.')
    expect(removed.sponsors[0]?.logoUrl).toBeUndefined()
  })

  it('preserves and removes reusable source logo metadata', () => {
    const existingSponsor = sponsor({
      logoSourceAssetId: 'logo-source-sponsor-carpgear-old',
      logoSourceFileName: 'source-old.png',
      logoSourceHeight: 420,
      logoSourceMimeType: 'image/png',
      logoSourceSizeBytes: 15,
      logoSourceStoragePath: 'sponsor-assets/logo-source-sponsor-carpgear-old.png',
      logoSourceUpdatedAt: '2026-05-20T10:00:00.000Z',
      logoSourceUrl: '/api/sponsor-assets/logo-source-sponsor-carpgear-old',
      logoSourceWidth: 1280,
    })

    const preserved = updateSponsorSettings(
      {
        sponsors: [{
          ...sponsor(),
          name: 'CarpGear Pro SK',
        }],
      },
      {
        sponsors: [existingSponsor],
      },
    )
    const removed = updateSponsorSettings(
      {
        sponsors: [{
          ...sponsor(),
          removeLogoVariantSource: true,
        }],
      },
      {
        sponsors: [existingSponsor],
      },
    )

    expect(preserved.ok).toBe(true)
    if (!preserved.ok) throw new Error('Sponsor update should be valid.')
    expect(preserved.sponsors[0]?.logoSourceUrl).toBe('/api/sponsor-assets/logo-source-sponsor-carpgear-old')

    expect(removed.ok).toBe(true)
    if (!removed.ok) throw new Error('Sponsor update should be valid.')
    expect(removed.sponsors[0]?.logoSourceUrl).toBeUndefined()
  })

  it('removes a placement-specific logo variant without removing the primary logo', () => {
    const result = updateSponsorSettings(
      {
        sponsors: [{
          ...sponsor(),
          logoVariants: [{
            placementType: 'homepage',
            removeLogo: true,
          }],
        }],
      },
      {
        sponsors: [sponsor({
          logoAssetId: 'logo-primary',
          logoFileName: 'primary.png',
          logoHeight: 180,
          logoMimeType: 'image/png',
          logoSizeBytes: 5,
          logoStoragePath: 'sponsor-assets/logo-primary.png',
          logoUrl: '/api/sponsor-assets/logo-primary',
          logoVariants: [{
            fileName: 'homepage.webp',
            height: 300,
            mimeType: 'image/webp',
            placementType: 'homepage',
            sizeBytes: 5,
            storagePath: 'sponsor-assets/logo-homepage.webp',
            url: '/api/sponsor-assets/logo-homepage',
            variantId: 'logo-homepage',
            width: 900,
          }],
          logoWidth: 400,
        })],
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Sponsor update should be valid.')

    expect(result.sponsors[0]?.logoUrl).toBe('/api/sponsor-assets/logo-primary')
    expect(result.sponsors[0]?.logoVariants).toBeUndefined()
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
