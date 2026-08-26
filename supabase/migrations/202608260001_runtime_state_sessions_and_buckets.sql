-- Runtime persistence for the former `.data/rybolov-cetin` filesystem stores.
--
-- `runtime_store_states` keeps every runtime state document (reservations,
-- catches, tournaments, map editor, audit log, ...) as one versioned jsonb
-- row. `app_sessions` replaces the JSON session store with a real table so
-- cookie sessions survive restarts and scale across server instances.
--
-- Both tables are server-only: RLS is enabled with no policies and no anon /
-- authenticated grants, so only the service-role key used by the Nuxt server
-- can touch them. Client-facing RLS flows keep using the normalized domain
-- tables from 202605160001_rybolov_cetin_core.sql.

create table public.runtime_store_states (
  name text primary key,
  payload jsonb not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint runtime_store_states_name_check check (name ~ '^[a-z0-9][a-z0-9-]{0,120}$')
);

comment on table public.runtime_store_states is
  'Server-only runtime state documents (former .data/rybolov-cetin JSON stores). Access exclusively through the service role.';

alter table public.runtime_store_states enable row level security;

revoke all on table public.runtime_store_states from anon, authenticated;
grant all privileges on table public.runtime_store_states to service_role;

create table public.app_sessions (
  token_hash text primary key,
  account_id text not null,
  role text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table public.app_sessions is
  'Server-only cookie sessions of the application accounts (mock roles + registered anglers). Access exclusively through the service role.';

create index app_sessions_account_id_idx on public.app_sessions (account_id);
create index app_sessions_expires_at_idx on public.app_sessions (expires_at);

alter table public.app_sessions enable row level security;

revoke all on table public.app_sessions from anon, authenticated;
grant all privileges on table public.app_sessions to service_role;

-- Atomic write helpers for the runtime store documents. Both run with the
-- caller's privileges (security invoker), so only roles with table grants —
-- in practice the service role — can use them.

create or replace function public.runtime_store_upsert(
  store_name text,
  store_payload jsonb
)
returns void
language sql
as $$
  insert into public.runtime_store_states as store (name, payload)
  values (store_name, store_payload)
  on conflict (name) do update set
    payload = excluded.payload,
    revision = store.revision + 1,
    updated_at = now();
$$;

create or replace function public.runtime_store_compare_and_set(
  store_name text,
  store_payload jsonb,
  expected_revision bigint
)
returns boolean
language plpgsql
as $$
declare
  did_write boolean := false;
begin
  if expected_revision is null then
    insert into public.runtime_store_states (name, payload)
    values (store_name, store_payload)
    on conflict (name) do nothing;

    get diagnostics did_write = row_count;
  else
    update public.runtime_store_states as store
    set
      payload = store_payload,
      revision = store.revision + 1,
      updated_at = now()
    where store.name = store_name
      and store.revision = expected_revision;

    get diagnostics did_write = row_count;
  end if;

  return did_write;
end;
$$;

-- The explicit-grants migration adds default execute grants for anon and
-- authenticated on new public functions; these helpers are server-only.
revoke execute on function public.runtime_store_upsert(text, jsonb) from public, anon, authenticated;
revoke execute on function public.runtime_store_compare_and_set(text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.runtime_store_upsert(text, jsonb) to service_role;
grant execute on function public.runtime_store_compare_and_set(text, jsonb, bigint) to service_role;

-- Private Storage buckets for binary runtime assets. No storage.objects
-- policies are added on purpose: with RLS enabled and no policies, anon and
-- authenticated clients cannot touch the objects, so every asset flows
-- through the server (service role) endpoints that already enforce the
-- application's own access rules.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('catch-photos', 'catch-photos', false, 15728640, array['image/avif', 'image/jpeg', 'image/png', 'image/webp']),
  ('sponsor-assets', 'sponsor-assets', false, 10485760, array['image/avif', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']),
  ('map-assets', 'map-assets', false, 15728640, array['image/jpeg', 'image/png', 'image/webp']),
  ('data-backups', 'data-backups', false, 52428800, array['application/json'])
on conflict (id) do nothing;
