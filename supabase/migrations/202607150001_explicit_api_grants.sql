-- Supabase CLI 2.109+ no longer auto-exposes new public tables. Keep grants
-- explicit and let the existing RLS policies remain the authorization layer.

grant usage on schema public to anon, authenticated, service_role;

grant select on all tables in schema public to anon, authenticated;
grant insert on table
  public.place_issues,
  public.push_subscriptions,
  public.reservations
to anon, authenticated;

grant insert, update, delete on all tables in schema public to authenticated;
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

-- New tables must opt into Data API access in their own migration. In particular,
-- do not grant future tables to anon by default before their RLS policies exist.
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
