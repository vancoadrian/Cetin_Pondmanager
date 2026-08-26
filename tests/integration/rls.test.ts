import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAnonClient, createAuthenticatedClient, createServiceRoleClient } from './_client'

/**
 * Exercises the RLS policies in supabase/migrations against a real local
 * Postgres instance, the way test/integration/rls.test.ts does in the
 * FK_KNV_Clubhouse reference project. This is the first pass covering the
 * patterns the audit flagged as untested: public-insert privilege-escalation
 * guards, staff-only read/write, the new profiles auto-provisioning trigger,
 * and the new trip_logbook_entries write policy.
 *
 * Run with `pnpm test:integration` after `pnpm supabase:start` (and
 * `pnpm supabase:reset` if migrations changed) and `pnpm local:setup`.
 */

const VENUE_ID = '61a5fb8f-cc01-5690-af9c-1128c5485d91'
const LAKE_ID = '76df028a-aee5-5dbf-8fe6-3c1195354118'
const PEG_ID = '35d73254-85d1-55ab-ba4a-1db2161cb0d4'
const PERMIT_PRODUCT_ID = '1ea1c38c-242b-57d2-aeb4-fe16e7e66107'

let serviceRole: SupabaseClient

beforeAll(() => {
  serviceRole = createServiceRoleClient()
})

describe('public read access', () => {
  it('lets an anonymous client read active lakes', async () => {
    const anon = createAnonClient()
    const { data, error } = await anon.from('lakes').select('id, name').eq('id', LAKE_ID)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.name).toBe('Veľký Cetín')
  })

  it('never exposes venues to write from an anonymous client', async () => {
    const anon = createAnonClient()
    const { data: written, error } = await anon
      .from('venues')
      .update({ name: 'Hacked' })
      .eq('id', VENUE_ID)
      .select('name')

    // 202607150001_explicit_api_grants.sql grants write only to `authenticated`,
    // takže starší stack vráti tvrdé 42501 ešte pred RLS; novšie Supabase verzie
    // ten istý pokus prepustia ako tichý RLS no-op (0 riadkov). Obe správania sú
    // bezpečné — podstatné je, že anonym nezmenil ani jeden riadok.
    if (error) {
      expect(error.code).toBe('42501')
    }
    else {
      expect(written).toHaveLength(0)
    }
    const { data: after } = await serviceRole.from('venues').select('name').eq('id', VENUE_ID).single()
    expect(after?.name).not.toBe('Hacked')
  })
})

describe('place_issues public insert', () => {
  it('accepts a new report from an anonymous client but only in "new" status', async () => {
    const anon = createAnonClient()

    const { error: validInsertError } = await anon.from('place_issues').insert({
      category: 'lighting',
      description: 'Nesvieti svetlo pri móle.',
      id: randomUUID(),
      lake_id: LAKE_ID,
      status: 'new',
      target_label: 'Mólo',
      target_type: 'lake',
      title: 'Chýba osvetlenie',
      venue_id: VENUE_ID,
    })
    expect(validInsertError).toBeNull()

    const { error: escalationError } = await anon.from('place_issues').insert({
      category: 'lighting',
      description: 'Pokus obísť moderáciu.',
      id: randomUUID(),
      lake_id: LAKE_ID,
      status: 'resolved',
      target_label: 'Mólo',
      target_type: 'lake',
      title: 'Rovno vyriešené',
      venue_id: VENUE_ID,
    })
    expect(escalationError).not.toBeNull()
  })

  it('does not let an anonymous client read place_issues back (staff-only read)', async () => {
    const anon = createAnonClient()
    const { data, error } = await anon.from('place_issues').select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('reservations public insert', () => {
  it('accepts a pending web reservation but rejects a self-confirmed one', async () => {
    const anon = createAnonClient()

    const { error: pendingError } = await anon.from('reservations').insert({
      contact_phone: '+421900000000',
      ends_on: '2026-09-02',
      guest_name: 'Test Rybár',
      id: randomUUID(),
      lake_id: LAKE_ID,
      peg_id: PEG_ID,
      permit_product_id: PERMIT_PRODUCT_ID,
      source: 'web',
      starts_on: '2026-09-01',
      status: 'pending',
      venue_id: VENUE_ID,
    })
    expect(pendingError).toBeNull()

    const { error: escalationError } = await anon.from('reservations').insert({
      contact_phone: '+421900000000',
      ends_on: '2026-09-04',
      guest_name: 'Test Rybár Escalation',
      id: randomUUID(),
      lake_id: LAKE_ID,
      peg_id: PEG_ID,
      permit_product_id: PERMIT_PRODUCT_ID,
      source: 'web',
      starts_on: '2026-09-03',
      status: 'confirmed',
      venue_id: VENUE_ID,
    })
    expect(escalationError).not.toBeNull()
  })
})

describe('profiles auto-provisioning trigger', () => {
  it('creates a profiles row automatically when a new auth user signs up', async () => {
    const { userId } = await createAuthenticatedClient('rls-profile')

    const { data, error } = await serviceRole.from('profiles').select('id, display_name').eq('id', userId).single()

    expect(error).toBeNull()
    expect(data?.id).toBe(userId)
    expect(data?.display_name).toBeTruthy()
  })
})

describe('trip_logbook_entries write access', () => {
  const logbookId = randomUUID()
  let ownerUserId: string
  let ownerClient: SupabaseClient

  beforeAll(async () => {
    const owner = await createAuthenticatedClient('rls-logbook-owner')
    ownerUserId = owner.userId
    ownerClient = owner.client

    const { error } = await serviceRole.from('trip_logbooks').insert({
      id: logbookId,
      lake_id: LAKE_ID,
      mode: 'personal',
      owner_name: 'RLS Owner',
      owner_user_id: ownerUserId,
      share_code: `RLS-${randomUUID().slice(0, 8)}`,
      starts_on: '2026-09-01',
      ends_on: '2026-09-02',
      title: 'RLS integration test logbook',
      venue_id: VENUE_ID,
    })
    if (error) throw error
  })

  it('lets the logbook owner insert their own catch entry', async () => {
    const { error } = await ownerClient.from('trip_logbook_entries').insert({
      angler_name: 'RLS Owner',
      bait: 'boilies',
      caught_at: new Date().toISOString(),
      id: randomUUID(),
      lake_id: LAKE_ID,
      length_cm: 80,
      logbook_id: logbookId,
      peg_id: PEG_ID,
      species: 'Kapor',
      weight_kg: 12.5,
    })

    expect(error).toBeNull()
  })

  it('rejects a different authenticated user writing into someone else\'s logbook', async () => {
    const other = await createAuthenticatedClient('rls-logbook-intruder')

    const { error } = await other.client.from('trip_logbook_entries').insert({
      angler_name: 'Intruder',
      bait: 'corn',
      caught_at: new Date().toISOString(),
      id: randomUUID(),
      lake_id: LAKE_ID,
      length_cm: 60,
      logbook_id: logbookId,
      peg_id: PEG_ID,
      species: 'Amur',
      weight_kg: 8,
    })

    expect(error).not.toBeNull()
  })

  afterAll(async () => {
    await serviceRole.from('trip_logbooks').delete().eq('id', logbookId)
  })
})
