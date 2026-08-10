-- Auto-provision a public.profiles row whenever a new Supabase Auth user
-- signs up. Without this, every new auth.users row needs a manual profile
-- insert before any profile-dependent query works.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email, 'Rybár'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- trip_logbook_entries only had trip_logbook_entries_member_read (select).
-- A logged-in angler could read their own trip's catch entries but never
-- write one directly under RLS; every write had to go through a
-- server-role bypass. Add owner-of-logbook and venue-manager write access,
-- mirroring the trip_logbooks_own_write / trip_logbooks_manager_all pattern.
create policy trip_logbook_entries_own_write on public.trip_logbook_entries for all using (
  exists (
    select 1 from public.trip_logbooks logbook
    where logbook.id = trip_logbook_entries.logbook_id
      and logbook.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.trip_logbooks logbook
    where logbook.id = trip_logbook_entries.logbook_id
      and logbook.owner_user_id = auth.uid()
  )
);

create policy trip_logbook_entries_manager_all on public.trip_logbook_entries for all using (
  exists (
    select 1 from public.trip_logbooks logbook
    where logbook.id = trip_logbook_entries.logbook_id
      and public.current_user_has_venue_role(logbook.venue_id, array['owner', 'manager']::public.venue_role[])
  )
) with check (
  exists (
    select 1 from public.trip_logbooks logbook
    where logbook.id = trip_logbook_entries.logbook_id
      and public.current_user_has_venue_role(logbook.venue_id, array['owner', 'manager']::public.venue_role[])
  )
);
