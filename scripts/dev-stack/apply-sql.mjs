import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { repoRoot, stackConfig } from './lib.mjs'

/**
 * Applies the dev-stack bootstrap, the versioned supabase/migrations and the
 * seed to a plain Postgres instance, tracking applied versions the same way
 * `supabase db reset` does (supabase_migrations.schema_migrations).
 *
 * Usage: node scripts/dev-stack/apply-sql.mjs [--reset] [--skip-seed]
 */

const shouldReset = process.argv.includes('--reset')
const skipSeed = process.argv.includes('--skip-seed')

const sql = postgres(stackConfig.dbSuperuserUrl, { max: 1, onnotice: () => {} })

async function runSqlFile(label, filePath) {
  const content = readFileSync(filePath, 'utf8')
  await sql.unsafe(content)
  console.log(`[dev-stack] applied ${label}`)
}

try {
  if (shouldReset) {
    console.log('[dev-stack] resetting database schemas...')
    await sql.unsafe(`
      drop schema if exists public cascade;
      drop schema if exists auth cascade;
      drop schema if exists storage cascade;
      drop schema if exists extensions cascade;
      drop schema if exists supabase_migrations cascade;
      create schema public;
      grant usage, create on schema public to postgres;
      grant usage on schema public to public;
    `)
  }

  await sql.unsafe(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      name text,
      applied_at timestamptz not null default now()
    );
  `)

  await runSqlFile('dev-stack bootstrap', resolve(repoRoot, 'scripts/dev-stack/bootstrap.sql'))

  const migrationsDir = resolve(repoRoot, 'supabase/migrations')
  const migrationFiles = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
  const appliedRows = await sql`select version from supabase_migrations.schema_migrations`
  const appliedVersions = new Set(appliedRows.map((row) => row.version))

  for (const file of migrationFiles) {
    const version = file.split('_')[0]
    if (appliedVersions.has(version)) continue

    await runSqlFile(`migration ${file}`, resolve(migrationsDir, file))
    await sql`
      insert into supabase_migrations.schema_migrations (version, name)
      values (${version}, ${file})
      on conflict (version) do nothing
    `
  }

  if (!skipSeed && !appliedVersions.has('seed')) {
    await runSqlFile('seed supabase/seed.sql', resolve(repoRoot, 'supabase/seed.sql'))
    await sql`
      insert into supabase_migrations.schema_migrations (version, name)
      values ('seed', 'supabase/seed.sql')
      on conflict (version) do nothing
    `
  }

  console.log('[dev-stack] database is up to date')
}
finally {
  await sql.end()
}
