import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

/**
 * One-time, idempotent import of the legacy `.data/rybolov-cetin` filesystem
 * state into Supabase (runtime_store_states + Storage buckets).
 *
 * Safety contract:
 * - without --force nothing existing is ever overwritten (existing documents
 *   and objects are reported and skipped),
 * - --dry-run only reports what would happen,
 * - content-identical documents are reported as such and left untouched,
 * - secrets are read from env (.env) and never printed.
 *
 * Usage:
 *   pnpm data:import                # import from .data/rybolov-cetin
 *   pnpm data:import -- --dry-run
 *   pnpm data:import -- --source /path/to/data --force
 */

interface StoreFileDefinition {
  fileName: string
  storeKey: string
}

const storeFiles: StoreFileDefinition[] = [
  { fileName: 'account-state.json', storeKey: 'account-state' },
  { fileName: 'audit-log.json', storeKey: 'audit-log' },
  { fileName: 'cabin-catalog-state.json', storeKey: 'cabin-catalog-state' },
  { fileName: 'catch-reports.json', storeKey: 'catch-reports' },
  { fileName: 'catch-state.json', storeKey: 'catch-state' },
  { fileName: 'closure-state.json', storeKey: 'closure-state' },
  { fileName: 'error-log.json', storeKey: 'error-log' },
  { fileName: 'fish-registry-state.json', storeKey: 'fish-registry-state' },
  { fileName: 'large-fish-assistance-state.json', storeKey: 'large-fish-assistance-state' },
  { fileName: 'map-draft-state.json', storeKey: 'map-draft-state' },
  { fileName: 'map-state.json', storeKey: 'map-state' },
  { fileName: 'notification-state.json', storeKey: 'notification-state' },
  { fileName: 'payment-method-state.json', storeKey: 'payment-method-state' },
  { fileName: 'place-issue-state.json', storeKey: 'place-issue-state' },
  { fileName: 'rental-catalog-state.json', storeKey: 'rental-catalog-state' },
  { fileName: 'reservation-state.json', storeKey: 'reservation-state' },
  { fileName: 'sponsor-state.json', storeKey: 'sponsor-state' },
  { fileName: 'tournament-state.json', storeKey: 'tournament-state' },
]

const assetDirectories = [
  { bucket: 'catch-photos', directory: 'catch-photos' },
  { bucket: 'map-assets', directory: 'map-assets' },
  { bucket: 'sponsor-assets', directory: 'sponsor-assets' },
  { bucket: 'data-backups', directory: 'backups' },
]

const contentTypesByExtension: Record<string, string> = {
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

function guessContentType(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''

  return contentTypesByExtension[extension] ?? 'application/octet-stream'
}

function readArgValue(name: string) {
  const index = process.argv.indexOf(name)

  return index >= 0 ? process.argv[index + 1] : undefined
}

const force = process.argv.includes('--force')
const dryRun = process.argv.includes('--dry-run')
const sourceDir = resolve(
  readArgValue('--source')
    ?? (process.env.RYBOLOV_LOCAL_DATA_DIR?.trim() || join(process.cwd(), '.data', 'rybolov-cetin')),
)

const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL?.trim()
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!supabaseUrl || !secretKey) {
  console.error('Chýba NUXT_PUBLIC_SUPABASE_URL alebo SUPABASE_SECRET_KEY. Spusti `pnpm supabase:start` a `pnpm local:setup` (alebo `pnpm dev:stack`).')
  process.exit(1)
}

const client = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type Outcome = 'created' | 'failed' | 'identical' | 'missing-source' | 'overwritten' | 'skipped-existing' | 'would-create' | 'would-overwrite'

const rows: { name: string, outcome: Outcome, note?: string }[] = []

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

async function importStoreDocument(definition: StoreFileDefinition) {
  const filePath = join(sourceDir, definition.fileName)
  let payload: unknown

  try {
    payload = JSON.parse(await readFile(filePath, 'utf8')) as unknown
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    rows.push({
      name: `store ${definition.storeKey}`,
      note: maybeNodeError.code === 'ENOENT' ? undefined : `nečitateľný súbor: ${maybeNodeError.message}`,
      outcome: maybeNodeError.code === 'ENOENT' ? 'missing-source' : 'failed',
    })

    return
  }

  const { data: existing, error: readError } = await client
    .from('runtime_store_states')
    .select('payload')
    .eq('name', definition.storeKey)
    .maybeSingle<{ payload: unknown }>()

  if (readError) {
    rows.push({ name: `store ${definition.storeKey}`, note: readError.message, outcome: 'failed' })

    return
  }

  if (existing) {
    if (stableStringify(existing.payload) === stableStringify(payload)) {
      rows.push({ name: `store ${definition.storeKey}`, outcome: 'identical' })

      return
    }

    if (!force) {
      rows.push({
        name: `store ${definition.storeKey}`,
        note: 'existuje s iným obsahom; použi --force na prepis',
        outcome: 'skipped-existing',
      })

      return
    }

    if (dryRun) {
      rows.push({ name: `store ${definition.storeKey}`, outcome: 'would-overwrite' })

      return
    }

    const { error } = await client.rpc('runtime_store_upsert', {
      store_name: definition.storeKey,
      store_payload: payload,
    })
    rows.push(error
      ? { name: `store ${definition.storeKey}`, note: error.message, outcome: 'failed' }
      : { name: `store ${definition.storeKey}`, outcome: 'overwritten' })

    return
  }

  if (dryRun) {
    rows.push({ name: `store ${definition.storeKey}`, outcome: 'would-create' })

    return
  }

  const { data: created, error } = await client.rpc('runtime_store_compare_and_set', {
    expected_revision: null,
    store_name: definition.storeKey,
    store_payload: payload,
  })

  if (error) {
    rows.push({ name: `store ${definition.storeKey}`, note: error.message, outcome: 'failed' })
  }
  else if (created === true) {
    rows.push({ name: `store ${definition.storeKey}`, outcome: 'created' })
  }
  else {
    rows.push({
      name: `store ${definition.storeKey}`,
      note: 'medzičasom vznikol iný záznam; spusti import znova',
      outcome: 'skipped-existing',
    })
  }
}

async function importAssetDirectory(bucket: string, directory: string) {
  const directoryPath = join(sourceDir, directory)
  let fileNames: string[]

  try {
    fileNames = (await readdir(directoryPath)).sort((a, b) => a.localeCompare(b, 'sk'))
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    rows.push({
      name: `bucket ${bucket}`,
      note: maybeNodeError.code === 'ENOENT' ? undefined : maybeNodeError.message,
      outcome: maybeNodeError.code === 'ENOENT' ? 'missing-source' : 'failed',
    })

    return
  }

  const existingNames = new Set<string>()
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(bucket).list('', { limit: 1000, offset })
    if (error) {
      rows.push({ name: `bucket ${bucket}`, note: `list zlyhal: ${error.message}`, outcome: 'failed' })

      return
    }
    for (const object of data ?? []) existingNames.add(object.name)
    if (!data || data.length < 1000) break
  }

  for (const fileName of fileNames) {
    const filePath = join(directoryPath, fileName)
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) continue

    const label = `objekt ${bucket}/${fileName}`

    if (existingNames.has(fileName) && !force) {
      rows.push({ name: label, note: 'existuje; použi --force na prepis', outcome: 'skipped-existing' })
      continue
    }

    if (dryRun) {
      rows.push({ name: label, outcome: existingNames.has(fileName) ? 'would-overwrite' : 'would-create' })
      continue
    }

    const { error } = await client.storage.from(bucket).upload(fileName, await readFile(filePath), {
      contentType: guessContentType(fileName),
      upsert: existingNames.has(fileName),
    })

    rows.push(error
      ? { name: label, note: error.message, outcome: 'failed' }
      : { name: label, outcome: existingNames.has(fileName) ? 'overwritten' : 'created' })
  }
}

console.log(`Import lokálnych dát do Supabase (${dryRun ? 'dry-run' : force ? 'force' : 'bezpečný režim'})`)
console.log(`Zdroj: ${sourceDir}`)

for (const definition of storeFiles) {
  await importStoreDocument(definition)
}

rows.push({
  name: 'store session-state',
  note: 'sessions žijú v tabuľke app_sessions a zámerne sa neimportujú',
  outcome: 'missing-source',
})

for (const { bucket, directory } of assetDirectories) {
  await importAssetDirectory(bucket, directory)
}

const outcomeLabels: Record<Outcome, string> = {
  created: 'vytvorené',
  failed: 'ZLYHALO',
  identical: 'zhodné (bez zmeny)',
  'missing-source': 'bez zdroja',
  overwritten: 'prepísané (--force)',
  'skipped-existing': 'preskočené (existuje)',
  'would-create': 'vytvorí sa (dry-run)',
  'would-overwrite': 'prepíše sa (dry-run + --force)',
}

console.log('')
for (const row of rows) {
  console.log(`- ${row.name}: ${outcomeLabels[row.outcome]}${row.note ? ` — ${row.note}` : ''}`)
}

const failed = rows.filter((row) => row.outcome === 'failed').length
const summary = (['created', 'overwritten', 'identical', 'skipped-existing', 'missing-source', 'would-create', 'would-overwrite', 'failed'] as Outcome[])
  .map((outcome) => `${outcomeLabels[outcome]}: ${rows.filter((row) => row.outcome === outcome).length}`)
  .join(', ')

console.log('')
console.log(`Súhrn — ${summary}`)

if (failed > 0) {
  process.exit(1)
}
