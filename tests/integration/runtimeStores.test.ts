import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAnonClient, createAuthenticatedClient, createServiceRoleClient } from './_client'

/**
 * RLS + grants assertions for the runtime persistence layer added by
 * 202608260001_runtime_state_sessions_and_buckets.sql: the
 * runtime_store_states document table, the app_sessions table and the
 * private Storage buckets. All of them are server-only — anonymous and
 * authenticated clients must be denied outright; only the service role may
 * touch them.
 */

const PRIVATE_BUCKETS = ['catch-photos', 'sponsor-assets', 'map-assets', 'data-backups'] as const

let serviceRole: SupabaseClient
const testDocName = `itest-${randomUUID().slice(0, 8)}`

beforeAll(() => {
  serviceRole = createServiceRoleClient()
})

afterAll(async () => {
  await serviceRole.from('runtime_store_states').delete().eq('name', testDocName)
  await serviceRole.from('app_sessions').delete().eq('account_id', `itest-${testDocName}`)
})

describe('runtime_store_states access', () => {
  it('lets the service role create, read and update documents through the RPC helpers', async () => {
    const { error: upsertError } = await serviceRole.rpc('runtime_store_upsert', {
      store_name: testDocName,
      store_payload: { value: 1 },
    })
    expect(upsertError).toBeNull()

    const first = await serviceRole
      .from('runtime_store_states')
      .select('payload, revision')
      .eq('name', testDocName)
      .single()
    expect(first.error).toBeNull()
    expect(first.data?.payload).toEqual({ value: 1 })

    const cas = await serviceRole.rpc('runtime_store_compare_and_set', {
      expected_revision: first.data?.revision,
      store_name: testDocName,
      store_payload: { value: 2 },
    })
    expect(cas.error).toBeNull()
    expect(cas.data).toBe(true)

    const staleCas = await serviceRole.rpc('runtime_store_compare_and_set', {
      expected_revision: first.data?.revision,
      store_name: testDocName,
      store_payload: { value: 3 },
    })
    expect(staleCas.error).toBeNull()
    expect(staleCas.data).toBe(false)

    const second = await serviceRole
      .from('runtime_store_states')
      .select('payload')
      .eq('name', testDocName)
      .single()
    expect(second.data?.payload).toEqual({ value: 2 })
  })

  it('denies anonymous reads, writes and RPC access', async () => {
    const anon = createAnonClient()

    const read = await anon.from('runtime_store_states').select('name').limit(1)
    expect(read.error?.code).toBe('42501')

    const write = await anon.from('runtime_store_states').insert({ name: 'anon-doc', payload: {} })
    expect(write.error?.code).toBe('42501')

    const rpc = await anon.rpc('runtime_store_upsert', { store_name: 'anon-doc', store_payload: {} })
    expect(rpc.error).not.toBeNull()
  })

  it('denies authenticated users as well — runtime state is server-only', async () => {
    const { client } = await createAuthenticatedClient('runtime-store')

    const read = await client.from('runtime_store_states').select('name').limit(1)
    expect(read.error?.code).toBe('42501')

    const write = await client.from('runtime_store_states').insert({ name: 'auth-doc', payload: {} })
    expect(write.error?.code).toBe('42501')
  })
})

describe('app_sessions access', () => {
  it('lets the service role manage sessions', async () => {
    const tokenHash = randomUUID().replaceAll('-', '')
    const { error: insertError } = await serviceRole.from('app_sessions').insert({
      account_id: `itest-${testDocName}`,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      role: 'angler',
      token_hash: tokenHash,
    })
    expect(insertError).toBeNull()

    const { data, error } = await serviceRole
      .from('app_sessions')
      .select('account_id, role')
      .eq('token_hash', tokenHash)
      .single()
    expect(error).toBeNull()
    expect(data?.role).toBe('angler')

    const { error: deleteError } = await serviceRole.from('app_sessions').delete().eq('token_hash', tokenHash)
    expect(deleteError).toBeNull()
  })

  it('denies anonymous and authenticated access to sessions', async () => {
    const anon = createAnonClient()
    const anonRead = await anon.from('app_sessions').select('token_hash').limit(1)
    expect(anonRead.error?.code).toBe('42501')

    const { client } = await createAuthenticatedClient('sessions')
    const authRead = await client.from('app_sessions').select('token_hash').limit(1)
    expect(authRead.error?.code).toBe('42501')
  })
})

describe('private storage buckets', () => {
  it.each([...PRIVATE_BUCKETS])('bucket %s: service role has the full object lifecycle', async (bucket) => {
    const objectName = `itest-${randomUUID().slice(0, 8)}.${bucket === 'data-backups' ? 'json' : 'png'}`
    const body = bucket === 'data-backups'
      ? Buffer.from(JSON.stringify({ itest: true }))
      : Buffer.from(`png-bytes-${bucket}`)
    const contentType = bucket === 'data-backups' ? 'application/json' : 'image/png'

    const upload = await serviceRole.storage.from(bucket).upload(objectName, body, { contentType })
    expect(upload.error).toBeNull()

    const download = await serviceRole.storage.from(bucket).download(objectName)
    expect(download.error).toBeNull()
    expect(Buffer.from(await download.data!.arrayBuffer())).toEqual(body)

    const list = await serviceRole.storage.from(bucket).list('')
    expect(list.error).toBeNull()
    expect(list.data?.some((object) => object.name === objectName)).toBe(true)

    const remove = await serviceRole.storage.from(bucket).remove([objectName])
    expect(remove.error).toBeNull()

    const downloadAfterRemove = await serviceRole.storage.from(bucket).download(objectName)
    expect(downloadAfterRemove.error).not.toBeNull()
  })

  it.each([...PRIVATE_BUCKETS])('bucket %s: anonymous clients cannot upload or download', async (bucket) => {
    const anon = createAnonClient()
    const objectName = `anon-${randomUUID().slice(0, 8)}.png`

    const upload = await anon.storage.from(bucket).upload(objectName, Buffer.from('nope'), {
      contentType: bucket === 'data-backups' ? 'application/json' : 'image/png',
    })
    expect(upload.error).not.toBeNull()

    const download = await anon.storage.from(bucket).download('whatever.png')
    expect(download.error).not.toBeNull()
  })
})
