import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('../supabase/migrations/202605160001_rybolov_cetin_core.sql', import.meta.url)
const migrationSql = await readFile(migrationPath, 'utf8')

const tableNames = [...migrationSql.matchAll(/create table public\.([a-z_]+)/g)].map((match) => match[1]!)

const requiredTables = [
  'venues',
  'lakes',
  'pegs',
  'map_facilities',
  'map_layers',
  'map_shapes',
  'place_issues',
  'reservations',
  'payment_methods',
  'reservation_items',
  'rental_items',
  'rental_bookings',
  'lake_closures',
  'lake_closure_pegs',
  'season_rules',
  'alerts',
  'catch_records',
  'catch_photos',
  'trip_logbooks',
  'trip_logbook_members',
  'trip_logbook_entries',
  'fish_identity_candidates',
  'tournaments',
  'tournament_sectors',
  'tournament_teams',
  'tournament_marshals',
  'tournament_marshal_sectors',
  'tournament_requests',
  'tournament_catches',
  'tournament_penalties',
  'tournament_rule_checks',
  'sponsors',
  'sponsor_placements',
  'push_subscriptions',
  'notification_delivery_logs',
  'user_roles',
  'audit_events',
]

describe('Supabase core migration', () => {
  it('contains the core multi-tenant and product tables', () => {
    for (const table of requiredTables) {
      expect(tableNames, `${table} should be created`).toContain(table)
    }
  })

  it('enables RLS and defines at least one policy for every application table', () => {
    for (const table of tableNames) {
      expect(
        migrationSql,
        `${table} should have row level security enabled`,
      ).toContain(`alter table public.${table} enable row level security;`)
      expect(
        new RegExp(`create policy [^\\n]+ on public\\.${table}\\b`).test(migrationSql),
        `${table} should have at least one policy`,
      ).toBe(true)
    }
  })

  it('keeps role helper functions and venue-scoped policies in place', () => {
    expect(migrationSql).toContain('create or replace function public.current_user_has_venue_role')
    expect(migrationSql).toContain('create or replace function public.current_user_has_tournament_role')
    expect(migrationSql).toContain('reservations_manager_all')
    expect(migrationSql).toContain('tournament_requests_staff_all')
    expect(migrationSql).toContain('push_subscriptions_own_insert')
    expect(migrationSql).toContain('image_settings jsonb not null default')
    expect(migrationSql).toContain('target_audience jsonb not null default')
    expect(migrationSql).toContain('audience_scope jsonb not null default')
    expect(migrationSql).toContain('provider text not null check')
    expect(migrationSql).toContain('status text not null check')
  })

  it('defines the relationships needed by availability, rentals and catches', () => {
    expect(migrationSql).toContain('peg_id uuid not null references public.pegs(id)')
    expect(migrationSql).toContain('permit_product_id uuid not null references public.permit_products(id)')
    expect(migrationSql).toContain('payment_method_id uuid references public.payment_methods(id)')
    expect(migrationSql).toContain('status public.catch_record_status not null default')
    expect(migrationSql).toContain('review_note text not null default')
    expect(migrationSql).toContain('reviewed_at timestamptz')
    expect(migrationSql).toContain('weather_condition text not null default')
    expect(migrationSql).toContain('pressure_hpa integer')
    expect(migrationSql).toContain('weather_cloud_cover_pct integer check')
    expect(migrationSql).toContain('large_fish_threshold_kg numeric')
    expect(migrationSql).toContain('large_fish_availability_windows jsonb')
    expect(migrationSql).toContain('large_fish_outside_availability_instruction text')
    expect(migrationSql).toContain('large_fish_presence_override jsonb')
    expect(migrationSql).toContain('file_name text not null default')
    expect(migrationSql).toContain('ai_fingerprint jsonb')
    expect(migrationSql).toContain('rental_item_id uuid not null references public.rental_items(id)')
    expect(migrationSql).toContain('closure_id uuid not null references public.lake_closures(id)')
    expect(migrationSql).toContain('catch_record_id uuid references public.catch_records(id)')
    expect(migrationSql).toContain('target_peg_id uuid references public.pegs(id)')
    expect(migrationSql).toContain('target_facility_id uuid references public.map_facilities(id)')
    expect(migrationSql).toContain('tournament_id uuid not null references public.tournaments(id)')
    expect(migrationSql).toContain('add column tournament_sector_id uuid references public.tournament_sectors(id)')
  })

  it('adds indexes for the high-traffic calendar and operations queries', () => {
    const expectedIndexes = [
      'reservations_venue_dates_idx',
      'payment_methods_venue_enabled_idx',
      'reservations_peg_dates_idx',
      'map_facilities_lake_type_idx',
      'rental_bookings_item_dates_idx',
      'lake_closures_venue_dates_idx',
      'place_issues_venue_status_idx',
      'catch_records_lake_caught_at_idx',
      'map_shapes_tournament_sector_idx',
      'tournament_requests_status_idx',
      'audit_events_venue_created_idx',
      'push_subscriptions_venue_enabled_idx',
      'push_subscriptions_audience_scope_idx',
      'notification_delivery_logs_venue_attempted_idx',
    ]

    for (const index of expectedIndexes) {
      expect(migrationSql).toContain(`create index ${index}`)
    }
  })
})
