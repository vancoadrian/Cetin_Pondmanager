create extension if not exists pgcrypto;

create type public.venue_role as enum ('owner', 'manager', 'tournament_organizer', 'marshal', 'tournament_team', 'accountant', 'worker', 'angler');
create type public.visibility_scope as enum ('public', 'internal', 'competition');
create type public.peg_type as enum ('shore', 'cabin');
create type public.peg_status as enum ('free', 'reserved', 'weekend_free', 'maintenance');
create type public.reservation_type as enum ('day', 'weekend', 'week', 'custom');
create type public.reservation_status as enum ('pending', 'confirmed', 'blocked', 'cancelled');
create type public.reservation_source as enum ('phone', 'web', 'admin');
create type public.reservation_item_type as enum ('permit', 'cabin', 'rental', 'extra');
create type public.payment_method_kind as enum ('cash', 'bank_transfer', 'card_gateway');
create type public.payment_settlement as enum ('on_site', 'manual', 'gateway');
create type public.payment_status as enum ('unpaid', 'pending', 'paid', 'waived');
create type public.rental_category as enum ('fish_care', 'comfort', 'cabin');
create type public.rental_booking_status as enum ('requested', 'reserved', 'returned', 'unavailable', 'cancelled');
create type public.reservation_extra_scope as enum ('all', 'cabin');
create type public.closure_reason as enum ('maintenance', 'season', 'spawning', 'tournament', 'emergency', 'pandemic');
create type public.alert_severity as enum ('storm', 'info', 'service', 'water');
create type public.trip_logbook_mode as enum ('personal', 'group', 'competition');
create type public.trip_logbook_status as enum ('draft', 'active', 'closed');
create type public.trip_member_role as enum ('owner', 'member', 'guest');
create type public.catch_record_status as enum ('pending', 'approved', 'rejected');
create type public.catch_photo_status as enum ('missing', 'uploaded', 'ai_ready');
create type public.map_layer_kind as enum ('background', 'pegs', 'cabins', 'sectors', 'service');
create type public.map_shape_type as enum ('shoreline', 'island', 'zone', 'sector', 'service');
create type public.map_tone as enum ('water', 'reed', 'warning', 'service', 'sector');
create type public.map_facility_type as enum ('electricity', 'entry', 'first_aid', 'other', 'parking', 'reception', 'shower', 'storage', 'toilet', 'waste', 'wood');
create type public.tournament_status as enum ('planned', 'live', 'closed');
create type public.tournament_marshal_status as enum ('available', 'on_route', 'measuring', 'off_duty');
create type public.tournament_request_type as enum ('catch_measurement', 'rule_report', 'technical_help', 'other');
create type public.tournament_request_priority as enum ('normal', 'high');
create type public.tournament_request_status as enum ('new', 'assigned', 'resolved');
create type public.tournament_catch_status as enum ('waiting', 'verified', 'disputed');
create type public.tournament_penalty_type as enum ('warning', 'fishing_pause', 'rod_reduction', 'review');
create type public.tournament_penalty_status as enum ('active', 'served', 'appealed');
create type public.tournament_rule_check_result as enum ('ok', 'warning', 'penalty');
create type public.sponsor_tier as enum ('main', 'partner', 'sector', 'tournament');
create type public.audit_area as enum ('reservations', 'catches', 'logbooks', 'tournaments', 'map', 'system');
create type public.audit_severity as enum ('info', 'warning', 'critical');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  timezone text not null default 'Europe/Bratislava',
  contact jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lakes (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  slug text not null,
  name text not null,
  area_ha numeric(8, 2),
  mode text not null default '',
  summary text not null default '',
  highlights text[] not null default '{}',
  facilities text[] not null default '{}',
  fish_stock text[] not null default '{}',
  rules text[] not null default '{}',
  image_url text,
  gallery_image_urls text[] not null default '{}',
  map_image_url text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, slug)
);

create table public.pegs (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  lake_id uuid not null references public.lakes(id) on delete cascade,
  code text not null,
  label text not null,
  type public.peg_type not null,
  requires_cabin_reservation boolean not null default false,
  map_x numeric(5, 2) not null check (map_x >= 0 and map_x <= 100),
  map_y numeric(5, 2) not null check (map_y >= 0 and map_y <= 100),
  capacity integer not null check (capacity > 0),
  status public.peg_status not null default 'free',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lake_id, code)
);

create table public.map_layers (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  lake_id uuid not null references public.lakes(id) on delete cascade,
  name text not null,
  kind public.map_layer_kind not null,
  source_url text,
  image_settings jsonb not null default '{}'::jsonb check (jsonb_typeof(image_settings) = 'object'),
  visibility public.visibility_scope not null default 'public',
  editable boolean not null default false,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.map_facilities (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  lake_id uuid not null references public.lakes(id) on delete cascade,
  label text not null,
  type public.map_facility_type not null,
  map_x numeric(5, 2) not null check (map_x >= 0 and map_x <= 100),
  map_y numeric(5, 2) not null check (map_y >= 0 and map_y <= 100),
  visibility public.visibility_scope not null default 'public',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.map_shapes (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  lake_id uuid not null references public.lakes(id) on delete cascade,
  layer_id uuid references public.map_layers(id) on delete set null,
  label text not null,
  type public.map_shape_type not null,
  points jsonb not null default '[]'::jsonb,
  visibility public.visibility_scope not null default 'public',
  tone public.map_tone not null default 'water',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permit_products (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  code text not null,
  label text not null,
  duration_hours integer not null check (duration_hours > 0),
  price_eur numeric(10, 2) not null check (price_eur >= 0),
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, code)
);

create table public.cabin_products (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  code text not null,
  label text not null,
  capacity integer not null check (capacity > 0),
  price_per_24h_eur numeric(10, 2) not null check (price_per_24h_eur >= 0),
  minimum_hours integer not null default 24 check (minimum_hours > 0),
  requires_permit_note text not null default '',
  extra_person_fee_eur numeric(10, 2),
  equipment text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, code)
);

create table public.cabin_product_pegs (
  cabin_product_id uuid not null references public.cabin_products(id) on delete cascade,
  peg_id uuid not null references public.pegs(id) on delete cascade,
  primary key (cabin_product_id, peg_id)
);

create table public.required_equipment_items (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  code text not null,
  label text not null,
  detail text not null,
  rentable boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, code)
);

create table public.rental_items (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  code text not null,
  label text not null,
  category public.rental_category not null,
  description text not null default '',
  stock integer not null check (stock >= 0),
  price_label text not null default '',
  recommended boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, code)
);

create table public.reservation_extras (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  lake_id uuid references public.lakes(id) on delete cascade,
  code text not null,
  label text not null,
  description text not null default '',
  applies_to public.reservation_extra_scope not null default 'all',
  price_label text not null default '',
  source text not null default 'proposal' check (source in ('web', 'proposal')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, code)
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  code text not null,
  label text not null,
  kind public.payment_method_kind not null,
  settlement public.payment_settlement not null,
  instructions text not null default '',
  enabled boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, code)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  lake_id uuid not null references public.lakes(id) on delete restrict,
  peg_id uuid not null references public.pegs(id) on delete restrict,
  guest_name text not null,
  contact_phone text not null,
  starts_on date not null,
  ends_on date not null,
  type public.reservation_type not null default 'day',
  status public.reservation_status not null default 'pending',
  permit_product_id uuid not null references public.permit_products(id) on delete restrict,
  cabin_product_id uuid references public.cabin_products(id) on delete restrict,
  source public.reservation_source not null default 'web',
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  payment_status public.payment_status not null default 'unpaid',
  internal_note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.reservation_items (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  type public.reservation_item_type not null,
  item_id uuid,
  label text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price_eur numeric(10, 2),
  created_at timestamptz not null default now()
);

create table public.rental_bookings (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  rental_item_id uuid not null references public.rental_items(id) on delete restrict,
  lake_id uuid not null references public.lakes(id) on delete restrict,
  starts_on date not null,
  ends_on date not null,
  quantity integer not null check (quantity > 0),
  status public.rental_booking_status not null default 'requested',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.lake_closures (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  lake_id uuid references public.lakes(id) on delete cascade,
  title text not null,
  reason public.closure_reason not null,
  starts_on date not null,
  ends_on date not null,
  affects_reservations boolean not null default true,
  visibility public.visibility_scope not null default 'public',
  organization text,
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.lake_closure_pegs (
  closure_id uuid not null references public.lake_closures(id) on delete cascade,
  peg_id uuid not null references public.pegs(id) on delete cascade,
  primary key (closure_id, peg_id)
);

create table public.season_rules (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  lake_id uuid references public.lakes(id) on delete cascade,
  title text not null,
  reason public.closure_reason not null,
  month_day_from text not null,
  month_day_to text not null,
  affects_reservations boolean not null default true,
  requires_approval boolean not null default false,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  lake_id uuid references public.lakes(id) on delete cascade,
  severity public.alert_severity not null,
  title text not null,
  body text not null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  target_topics text[] not null default '{}'::text[],
  target_audience jsonb not null default '{}'::jsonb check (jsonb_typeof(target_audience) = 'object'),
  visibility public.visibility_scope not null default 'public',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until >= valid_from)
);

create table public.catch_records (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  lake_id uuid not null references public.lakes(id) on delete restrict,
  peg_id uuid not null references public.pegs(id) on delete restrict,
  angler_user_id uuid references auth.users(id) on delete set null,
  angler_name text not null,
  species text not null,
  weight_kg numeric(8, 2) not null check (weight_kg > 0),
  length_cm integer not null check (length_cm > 0),
  bait text not null,
  caught_at timestamptz not null,
  released boolean not null default true,
  photo_label text not null default '',
  notes text not null default '',
  weather_condition text not null default '',
  weather_air_temp_c numeric(5, 2),
  weather_water_temp_c numeric(5, 2),
  pressure_hpa integer,
  pressure_trend text not null default '',
  wind_kph numeric(5, 2),
  wind_direction text not null default '',
  weather_cloud_cover_pct integer check (weather_cloud_cover_pct is null or (weather_cloud_cover_pct >= 0 and weather_cloud_cover_pct <= 100)),
  weather_source text not null default '',
  visibility public.visibility_scope not null default 'public',
  status public.catch_record_status not null default 'pending',
  review_note text not null default '',
  reviewed_at timestamptz,
  reviewed_by_label text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catch_photos (
  id uuid primary key default gen_random_uuid(),
  catch_record_id uuid not null references public.catch_records(id) on delete cascade,
  file_name text not null default '',
  mime_type text not null default '',
  size_bytes integer not null default 0 check (size_bytes >= 0),
  storage_path text not null,
  public_url text not null default '',
  status public.catch_photo_status not null default 'uploaded',
  ai_fingerprint jsonb,
  created_at timestamptz not null default now()
);

create table public.trip_logbooks (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  lake_id uuid not null references public.lakes(id) on delete restrict,
  title text not null,
  mode public.trip_logbook_mode not null,
  status public.trip_logbook_status not null default 'draft',
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_name text not null,
  share_code text not null unique,
  starts_on date not null,
  ends_on date not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.trip_logbook_pegs (
  logbook_id uuid not null references public.trip_logbooks(id) on delete cascade,
  peg_id uuid not null references public.pegs(id) on delete cascade,
  primary key (logbook_id, peg_id)
);

create table public.trip_logbook_members (
  id uuid primary key default gen_random_uuid(),
  logbook_id uuid not null references public.trip_logbooks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  role public.trip_member_role not null default 'member',
  created_at timestamptz not null default now()
);

create table public.trip_logbook_entries (
  id uuid primary key default gen_random_uuid(),
  logbook_id uuid not null references public.trip_logbooks(id) on delete cascade,
  catch_record_id uuid references public.catch_records(id) on delete set null,
  lake_id uuid not null references public.lakes(id) on delete restrict,
  peg_id uuid not null references public.pegs(id) on delete restrict,
  angler_name text not null,
  species text not null,
  weight_kg numeric(8, 2) not null check (weight_kg > 0),
  length_cm integer not null check (length_cm > 0),
  bait text not null,
  caught_at timestamptz not null,
  released boolean not null default true,
  photo_status public.catch_photo_status not null default 'missing',
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fish_identity_candidates (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  catch_record_id uuid not null references public.catch_records(id) on delete cascade,
  candidate_catch_record_id uuid references public.catch_records(id) on delete cascade,
  confidence numeric(5, 4) check (confidence >= 0 and confidence <= 1),
  model_version text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.tournament_organizations (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  contact jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  lake_id uuid not null references public.lakes(id) on delete restrict,
  organization_id uuid references public.tournament_organizations(id) on delete set null,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.tournament_status not null default 'planned',
  rules text not null default '',
  allow_external_tools boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create table public.tournament_sectors (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  peg_id uuid references public.pegs(id) on delete set null,
  label text not null,
  map_x numeric(5, 2) not null check (map_x >= 0 and map_x <= 100),
  map_y numeric(5, 2) not null check (map_y >= 0 and map_y <= 100),
  starting_weight_kg numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  sector_id uuid references public.tournament_sectors(id) on delete set null,
  name text not null,
  contact_name text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.map_shapes
  add column tournament_id uuid references public.tournaments(id) on delete set null,
  add column tournament_sector_id uuid references public.tournament_sectors(id) on delete set null;

create table public.tournament_marshals (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  phone text,
  status public.tournament_marshal_status not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_marshal_sectors (
  marshal_id uuid not null references public.tournament_marshals(id) on delete cascade,
  sector_id uuid not null references public.tournament_sectors(id) on delete cascade,
  primary key (marshal_id, sector_id)
);

create table public.tournament_requests (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  sector_id uuid not null references public.tournament_sectors(id) on delete cascade,
  team_id uuid references public.tournament_teams(id) on delete set null,
  type public.tournament_request_type not null,
  priority public.tournament_request_priority not null default 'normal',
  status public.tournament_request_status not null default 'new',
  created_at timestamptz not null default now(),
  assigned_marshal_id uuid references public.tournament_marshals(id) on delete set null,
  action_client_mutation_id text,
  description text not null default '',
  updated_at timestamptz not null default now()
);

create table public.tournament_catches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  sector_id uuid not null references public.tournament_sectors(id) on delete cascade,
  team_id uuid references public.tournament_teams(id) on delete set null,
  species text not null,
  weight_kg numeric(8, 2) not null check (weight_kg > 0),
  length_cm integer not null check (length_cm > 0),
  caught_at timestamptz not null,
  measured_at timestamptz,
  verified_by_marshal_id uuid references public.tournament_marshals(id) on delete set null,
  status public.tournament_catch_status not null default 'waiting',
  photo_label text not null default '',
  notes text not null default '',
  verification_client_mutation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_penalties (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  sector_id uuid not null references public.tournament_sectors(id) on delete cascade,
  team_id uuid references public.tournament_teams(id) on delete set null,
  type public.tournament_penalty_type not null,
  reason text not null,
  issued_by_marshal_id uuid references public.tournament_marshals(id) on delete set null,
  issued_at timestamptz not null default now(),
  duration_hours numeric(6, 2),
  rods_less integer,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.tournament_penalty_status not null default 'active',
  client_mutation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_rule_checks (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  sector_id uuid not null references public.tournament_sectors(id) on delete cascade,
  marshal_id uuid not null references public.tournament_marshals(id) on delete cascade,
  checked_at timestamptz not null default now(),
  result public.tournament_rule_check_result not null,
  note text not null default '',
  client_mutation_id text,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.venue_role not null,
  lake_id uuid references public.lakes(id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_label text not null default '',
  actor_role text not null default 'system',
  area public.audit_area not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  entity_label text not null default '',
  lake_id uuid references public.lakes(id) on delete set null,
  tournament_id uuid references public.tournaments(id) on delete set null,
  summary text not null,
  severity public.audit_severity not null default 'info',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  tier public.sponsor_tier not null default 'partner',
  logo_text text not null default '',
  website text,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sponsor_assets (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  storage_path text not null,
  alt_text text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.sponsor_placements (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  lake_id uuid references public.lakes(id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete cascade,
  placement text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  topics text[] not null default array['weather', 'service']::text[],
  audience_role public.venue_role,
  audience_scope jsonb not null default '{}'::jsonb check (jsonb_typeof(audience_scope) = 'object'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  alert_id uuid references public.alerts(id) on delete set null,
  push_subscription_id uuid references public.push_subscriptions(id) on delete set null,
  provider text not null check (provider in ('disabled', 'mock', 'web-push')),
  status text not null check (status in ('failed', 'prepared', 'sent', 'skipped')),
  endpoint text not null,
  device_label text not null,
  message text not null default '',
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index lakes_venue_id_idx on public.lakes (venue_id);
create index pegs_lake_id_idx on public.pegs (lake_id);
create index map_facilities_lake_type_idx on public.map_facilities (lake_id, type);
create index payment_methods_venue_enabled_idx on public.payment_methods (venue_id, enabled, sort_order);
create index reservations_venue_dates_idx on public.reservations (venue_id, starts_on, ends_on, status);
create index reservations_peg_dates_idx on public.reservations (peg_id, starts_on, ends_on);
create index rental_bookings_item_dates_idx on public.rental_bookings (rental_item_id, starts_on, ends_on, status);
create index lake_closures_venue_dates_idx on public.lake_closures (venue_id, starts_on, ends_on);
create index catch_records_lake_caught_at_idx on public.catch_records (lake_id, caught_at desc);
create index trip_logbook_entries_logbook_idx on public.trip_logbook_entries (logbook_id, caught_at desc);
create index map_shapes_tournament_sector_idx on public.map_shapes (tournament_id, tournament_sector_id);
create index tournament_requests_status_idx on public.tournament_requests (tournament_id, status, priority);
create unique index tournament_requests_action_client_mutation_idx on public.tournament_requests (tournament_id, action_client_mutation_id) where action_client_mutation_id is not null;
create index tournament_catches_score_idx on public.tournament_catches (tournament_id, team_id, status, weight_kg desc);
create unique index tournament_catches_verification_client_mutation_idx on public.tournament_catches (tournament_id, verification_client_mutation_id) where verification_client_mutation_id is not null;
create unique index tournament_penalties_client_mutation_idx on public.tournament_penalties (tournament_id, client_mutation_id) where client_mutation_id is not null;
create unique index tournament_rule_checks_client_mutation_idx on public.tournament_rule_checks (tournament_id, client_mutation_id) where client_mutation_id is not null;
create index user_roles_user_venue_idx on public.user_roles (user_id, venue_id, role);
create index audit_events_venue_created_idx on public.audit_events (venue_id, created_at desc);
create index audit_events_area_created_idx on public.audit_events (venue_id, area, created_at desc);
create index push_subscriptions_venue_enabled_idx on public.push_subscriptions (venue_id, enabled);
create index push_subscriptions_audience_scope_idx on public.push_subscriptions using gin (audience_scope);
create index notification_delivery_logs_venue_attempted_idx on public.notification_delivery_logs (venue_id, attempted_at desc);

create trigger venues_set_updated_at before update on public.venues for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger lakes_set_updated_at before update on public.lakes for each row execute function public.set_updated_at();
create trigger pegs_set_updated_at before update on public.pegs for each row execute function public.set_updated_at();
create trigger map_layers_set_updated_at before update on public.map_layers for each row execute function public.set_updated_at();
create trigger map_facilities_set_updated_at before update on public.map_facilities for each row execute function public.set_updated_at();
create trigger map_shapes_set_updated_at before update on public.map_shapes for each row execute function public.set_updated_at();
create trigger permit_products_set_updated_at before update on public.permit_products for each row execute function public.set_updated_at();
create trigger cabin_products_set_updated_at before update on public.cabin_products for each row execute function public.set_updated_at();
create trigger required_equipment_items_set_updated_at before update on public.required_equipment_items for each row execute function public.set_updated_at();
create trigger rental_items_set_updated_at before update on public.rental_items for each row execute function public.set_updated_at();
create trigger reservation_extras_set_updated_at before update on public.reservation_extras for each row execute function public.set_updated_at();
create trigger payment_methods_set_updated_at before update on public.payment_methods for each row execute function public.set_updated_at();
create trigger reservations_set_updated_at before update on public.reservations for each row execute function public.set_updated_at();
create trigger rental_bookings_set_updated_at before update on public.rental_bookings for each row execute function public.set_updated_at();
create trigger lake_closures_set_updated_at before update on public.lake_closures for each row execute function public.set_updated_at();
create trigger season_rules_set_updated_at before update on public.season_rules for each row execute function public.set_updated_at();
create trigger alerts_set_updated_at before update on public.alerts for each row execute function public.set_updated_at();
create trigger catch_records_set_updated_at before update on public.catch_records for each row execute function public.set_updated_at();
create trigger trip_logbooks_set_updated_at before update on public.trip_logbooks for each row execute function public.set_updated_at();
create trigger trip_logbook_entries_set_updated_at before update on public.trip_logbook_entries for each row execute function public.set_updated_at();
create trigger tournament_organizations_set_updated_at before update on public.tournament_organizations for each row execute function public.set_updated_at();
create trigger tournaments_set_updated_at before update on public.tournaments for each row execute function public.set_updated_at();
create trigger tournament_sectors_set_updated_at before update on public.tournament_sectors for each row execute function public.set_updated_at();
create trigger tournament_teams_set_updated_at before update on public.tournament_teams for each row execute function public.set_updated_at();
create trigger tournament_marshals_set_updated_at before update on public.tournament_marshals for each row execute function public.set_updated_at();
create trigger tournament_requests_set_updated_at before update on public.tournament_requests for each row execute function public.set_updated_at();
create trigger tournament_catches_set_updated_at before update on public.tournament_catches for each row execute function public.set_updated_at();
create trigger tournament_penalties_set_updated_at before update on public.tournament_penalties for each row execute function public.set_updated_at();
create trigger sponsors_set_updated_at before update on public.sponsors for each row execute function public.set_updated_at();
create trigger sponsor_placements_set_updated_at before update on public.sponsor_placements for each row execute function public.set_updated_at();
create trigger push_subscriptions_set_updated_at before update on public.push_subscriptions for each row execute function public.set_updated_at();

create or replace function public.current_user_has_venue_role(target_venue_id uuid, allowed_roles public.venue_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles role
    where role.user_id = auth.uid()
      and role.venue_id = target_venue_id
      and role.role = any(allowed_roles)
  );
$$;

create or replace function public.current_user_has_tournament_role(target_tournament_id uuid, allowed_roles public.venue_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles role
    join public.tournaments tournament on tournament.id = target_tournament_id
    where role.user_id = auth.uid()
      and role.venue_id = tournament.venue_id
      and role.role = any(allowed_roles)
      and (role.tournament_id is null or role.tournament_id = target_tournament_id)
  );
$$;

alter table public.venues enable row level security;
alter table public.profiles enable row level security;
alter table public.lakes enable row level security;
alter table public.pegs enable row level security;
alter table public.map_layers enable row level security;
alter table public.map_facilities enable row level security;
alter table public.map_shapes enable row level security;
alter table public.permit_products enable row level security;
alter table public.cabin_products enable row level security;
alter table public.cabin_product_pegs enable row level security;
alter table public.required_equipment_items enable row level security;
alter table public.rental_items enable row level security;
alter table public.reservation_extras enable row level security;
alter table public.payment_methods enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_items enable row level security;
alter table public.rental_bookings enable row level security;
alter table public.lake_closures enable row level security;
alter table public.lake_closure_pegs enable row level security;
alter table public.season_rules enable row level security;
alter table public.alerts enable row level security;
alter table public.catch_records enable row level security;
alter table public.catch_photos enable row level security;
alter table public.trip_logbooks enable row level security;
alter table public.trip_logbook_pegs enable row level security;
alter table public.trip_logbook_members enable row level security;
alter table public.trip_logbook_entries enable row level security;
alter table public.fish_identity_candidates enable row level security;
alter table public.tournament_organizations enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_sectors enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_marshals enable row level security;
alter table public.tournament_marshal_sectors enable row level security;
alter table public.tournament_requests enable row level security;
alter table public.tournament_catches enable row level security;
alter table public.tournament_penalties enable row level security;
alter table public.tournament_rule_checks enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_events enable row level security;
alter table public.sponsors enable row level security;
alter table public.sponsor_assets enable row level security;
alter table public.sponsor_placements enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_delivery_logs enable row level security;

create policy venues_public_read on public.venues for select using (active);
create policy venues_manager_all on public.venues for all using (
  public.current_user_has_venue_role(id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(id, array['owner', 'manager']::public.venue_role[])
);

create policy profiles_own_read on public.profiles for select using (id = auth.uid());
create policy profiles_own_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy lakes_public_read on public.lakes for select using (
  active and exists (select 1 from public.venues venue where venue.id = lakes.venue_id and venue.active)
);
create policy lakes_manager_all on public.lakes for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy pegs_public_read on public.pegs for select using (
  active and exists (select 1 from public.lakes lake where lake.id = pegs.lake_id and lake.active)
);
create policy pegs_manager_all on public.pegs for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy map_layers_public_read on public.map_layers for select using (enabled and visibility = 'public');
create policy map_layers_manager_all on public.map_layers for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy map_facilities_public_read on public.map_facilities for select using (visibility = 'public');
create policy map_facilities_manager_all on public.map_facilities for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy map_shapes_public_read on public.map_shapes for select using (visibility = 'public');
create policy map_shapes_manager_all on public.map_shapes for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy permit_products_public_read on public.permit_products for select using (active);
create policy permit_products_manager_all on public.permit_products for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy cabin_products_public_read on public.cabin_products for select using (active);
create policy cabin_products_manager_all on public.cabin_products for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy cabin_product_pegs_public_read on public.cabin_product_pegs for select using (true);

create policy required_equipment_public_read on public.required_equipment_items for select using (active);
create policy required_equipment_manager_all on public.required_equipment_items for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy rental_items_public_read on public.rental_items for select using (active);
create policy rental_items_manager_all on public.rental_items for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy reservation_extras_public_read on public.reservation_extras for select using (active);
create policy reservation_extras_manager_all on public.reservation_extras for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy payment_methods_public_read on public.payment_methods for select using (enabled);
create policy payment_methods_manager_all on public.payment_methods for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);
create policy payment_methods_accountant_read on public.payment_methods for select using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager', 'accountant']::public.venue_role[])
);

create policy reservations_public_insert on public.reservations for insert with check (
  source = 'web' and status = 'pending'
);
create policy reservations_own_read on public.reservations for select using (created_by = auth.uid());
create policy reservations_staff_read on public.reservations for select using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager', 'accountant', 'worker']::public.venue_role[])
);
create policy reservations_manager_all on public.reservations for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy reservation_items_own_read on public.reservation_items for select using (
  exists (
    select 1 from public.reservations reservation
    where reservation.id = reservation_items.reservation_id
      and reservation.created_by = auth.uid()
  )
);
create policy reservation_items_manager_all on public.reservation_items for all using (
  exists (
    select 1 from public.reservations reservation
    where reservation.id = reservation_items.reservation_id
      and public.current_user_has_venue_role(reservation.venue_id, array['owner', 'manager']::public.venue_role[])
  )
) with check (
  exists (
    select 1 from public.reservations reservation
    where reservation.id = reservation_items.reservation_id
      and public.current_user_has_venue_role(reservation.venue_id, array['owner', 'manager']::public.venue_role[])
  )
);

create policy rental_bookings_own_read on public.rental_bookings for select using (
  exists (
    select 1 from public.reservations reservation
    where reservation.id = rental_bookings.reservation_id
      and reservation.created_by = auth.uid()
  )
);
create policy rental_bookings_manager_all on public.rental_bookings for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy lake_closures_public_read on public.lake_closures for select using (visibility = 'public');
create policy lake_closures_manager_all on public.lake_closures for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);
create policy lake_closure_pegs_public_read on public.lake_closure_pegs for select using (true);

create policy season_rules_public_read on public.season_rules for select using (active);
create policy season_rules_manager_all on public.season_rules for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy alerts_public_read on public.alerts for select using (
  visibility = 'public' and valid_until >= now()
);
create policy alerts_manager_all on public.alerts for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy catch_records_public_read on public.catch_records for select using (
  visibility = 'public' and status = 'approved'
);
create policy catch_records_own_insert on public.catch_records for insert with check (angler_user_id = auth.uid());
create policy catch_records_own_update on public.catch_records for update using (angler_user_id = auth.uid()) with check (angler_user_id = auth.uid());
create policy catch_records_manager_all on public.catch_records for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy catch_photos_public_read on public.catch_photos for select using (
  exists (
    select 1 from public.catch_records catch_record
    where catch_record.id = catch_photos.catch_record_id
      and catch_record.visibility = 'public'
      and catch_record.status = 'approved'
  )
);
create policy catch_photos_own_write on public.catch_photos for all using (
  exists (
    select 1 from public.catch_records catch_record
    where catch_record.id = catch_photos.catch_record_id
      and catch_record.angler_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.catch_records catch_record
    where catch_record.id = catch_photos.catch_record_id
      and catch_record.angler_user_id = auth.uid()
  )
);

create policy trip_logbooks_own_read on public.trip_logbooks for select using (owner_user_id = auth.uid());
create policy trip_logbooks_own_write on public.trip_logbooks for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy trip_logbooks_manager_all on public.trip_logbooks for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy trip_logbook_pegs_member_read on public.trip_logbook_pegs for select using (
  exists (
    select 1 from public.trip_logbooks logbook
    where logbook.id = trip_logbook_pegs.logbook_id
      and logbook.owner_user_id = auth.uid()
  )
);

create policy trip_logbook_members_member_read on public.trip_logbook_members for select using (
  user_id = auth.uid()
  or exists (
    select 1 from public.trip_logbooks logbook
    where logbook.id = trip_logbook_members.logbook_id
      and logbook.owner_user_id = auth.uid()
  )
);

create policy trip_logbook_entries_member_read on public.trip_logbook_entries for select using (
  exists (
    select 1 from public.trip_logbooks logbook
    where logbook.id = trip_logbook_entries.logbook_id
      and logbook.owner_user_id = auth.uid()
  )
);

create policy fish_identity_candidates_manager_all on public.fish_identity_candidates for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy tournaments_public_read on public.tournaments for select using (status in ('planned', 'live', 'closed'));
create policy tournaments_manager_all on public.tournaments for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager', 'tournament_organizer']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager', 'tournament_organizer']::public.venue_role[])
);

create policy tournament_organizations_manager_all on public.tournament_organizations for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager', 'tournament_organizer']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager', 'tournament_organizer']::public.venue_role[])
);

create policy tournament_sectors_public_read on public.tournament_sectors for select using (true);
create policy tournament_sectors_manager_all on public.tournament_sectors for all using (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer']::public.venue_role[])
) with check (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer']::public.venue_role[])
);
create policy tournament_teams_public_read on public.tournament_teams for select using (true);
create policy tournament_teams_staff_all on public.tournament_teams for all using (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer']::public.venue_role[])
) with check (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer']::public.venue_role[])
);
create policy tournament_marshals_staff_read on public.tournament_marshals for select using (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer', 'marshal']::public.venue_role[])
);
create policy tournament_marshals_manager_all on public.tournament_marshals for all using (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer']::public.venue_role[])
) with check (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer']::public.venue_role[])
);
create policy tournament_marshal_sectors_staff_read on public.tournament_marshal_sectors for select using (
  exists (
    select 1 from public.tournament_marshals marshal
    where marshal.id = tournament_marshal_sectors.marshal_id
      and public.current_user_has_tournament_role(marshal.tournament_id, array['owner', 'manager', 'tournament_organizer', 'marshal']::public.venue_role[])
  )
);
create policy tournament_requests_staff_all on public.tournament_requests for all using (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer', 'marshal', 'tournament_team']::public.venue_role[])
) with check (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer', 'marshal', 'tournament_team']::public.venue_role[])
);
create policy tournament_catches_public_read on public.tournament_catches for select using (status in ('verified', 'disputed'));
create policy tournament_catches_staff_all on public.tournament_catches for all using (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer', 'marshal']::public.venue_role[])
) with check (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer', 'marshal']::public.venue_role[])
);
create policy tournament_penalties_staff_read on public.tournament_penalties for select using (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer', 'marshal', 'tournament_team']::public.venue_role[])
);
create policy tournament_penalties_staff_all on public.tournament_penalties for all using (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer', 'marshal']::public.venue_role[])
) with check (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer', 'marshal']::public.venue_role[])
);
create policy tournament_rule_checks_staff_read on public.tournament_rule_checks for select using (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer', 'marshal']::public.venue_role[])
);
create policy tournament_rule_checks_staff_all on public.tournament_rule_checks for all using (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer', 'marshal']::public.venue_role[])
) with check (
  public.current_user_has_tournament_role(tournament_id, array['owner', 'manager', 'tournament_organizer', 'marshal']::public.venue_role[])
);

create policy user_roles_own_read on public.user_roles for select using (user_id = auth.uid());
create policy user_roles_manager_all on public.user_roles for all using (
  public.current_user_has_venue_role(venue_id, array['owner']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner']::public.venue_role[])
);

create policy audit_events_manager_read on public.audit_events for select using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);
create policy audit_events_manager_insert on public.audit_events for insert with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy sponsors_public_read on public.sponsors for select using (active);
create policy sponsors_manager_all on public.sponsors for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);
create policy sponsor_assets_public_read on public.sponsor_assets for select using (
  exists (
    select 1 from public.sponsors sponsor
    where sponsor.id = sponsor_assets.sponsor_id
      and sponsor.active
  )
);
create policy sponsor_placements_public_read on public.sponsor_placements for select using (active);
create policy sponsor_placements_manager_all on public.sponsor_placements for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);

create policy push_subscriptions_own_read on public.push_subscriptions for select using (user_id = auth.uid());
create policy push_subscriptions_own_insert on public.push_subscriptions for insert with check (user_id = auth.uid() or user_id is null);
create policy push_subscriptions_own_update on public.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_manager_read on public.push_subscriptions for select using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);
create policy notification_delivery_logs_manager_all on public.notification_delivery_logs for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);
