# RLS politiky

Návod, ako sú a majú byť postavené Row Level Security politiky v `supabase/migrations/`, kým sa Supabase zapojí ako reálny backend.

## Princípy

- RLS je zapnuté na **každej** tabuľke v `202605160001_rybolov_cetin_core.sql` (`alter table ... enable row level security`). Nová tabuľka bez RLS je vždy chyba, nie výnimka.
- `202607150001_explicit_api_grants.sql` rieši Supabase CLI ≥2.109 správanie, kde nové tabuľky už nie sú automaticky dostupné cez `anon`/`authenticated` role. GRANT je brána, RLS je skutočná autorizácia — obe vrstvy musia sedieť, inak dostane klient `42501` skôr, než sa RLS vôbec vyhodnotí (pozri `tests/integration/rls.test.ts`, test `never exposes venues to write from an anonymous client`).
- Frontend route guard (`app/middleware/admin-auth.global.ts`) aj mock admin guard (`server/utils/adminAccessGuard.ts`) sú **iba UX**. Skutočná hranica je RLS politika a GRANT v databáze — guard nikdy politiku nenahrádza.

## Šablóna politiky

Pre bežnú prevádzkovú tabuľku s `venue_id`:

```sql
create policy <table>_staff_read on public.<table> for select using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);
create policy <table>_manager_all on public.<table> for all using (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
) with check (
  public.current_user_has_venue_role(venue_id, array['owner', 'manager']::public.venue_role[])
);
```

`current_user_has_venue_role` a `current_user_has_tournament_role` (oba `security definer`) sú jediné miesto, kde sa rola aktuálneho používateľa vyhodnocuje — nový kód má tieto funkcie volať, nie opakovať vlastný `exists (...)` na `user_roles`.

Pre verejný formulár (napr. `place_issues`, `reservations`, `push_subscriptions`) platí vzor s `with check`, ktorý zabráni klientovi poslať si rovno schválený/potvrdený stav:

```sql
create policy place_issues_public_insert on public.place_issues for insert with check (status = 'new');
create policy reservations_public_insert on public.reservations for insert with check (
  source = 'web' and status = 'pending'
);
```

Bez tohto `with check` by anonymný klient mohol rovno vložiť `status = 'resolved'` alebo `status = 'confirmed'` a obísť schvaľovací workflow — presne toto overujú testy `place_issues public insert` a `reservations public insert` v `tests/integration/rls.test.ts`.

Pre tabuľku bez vlastného `venue_id` (napr. `trip_logbook_entries`, ktorá má iba `logbook_id`), politika ide cez `exists (...)` na rodičovskú tabuľku:

```sql
create policy trip_logbook_entries_own_write on public.trip_logbook_entries for all using (
  exists (
    select 1 from public.trip_logbooks logbook
    where logbook.id = trip_logbook_entries.logbook_id
      and logbook.owner_user_id = auth.uid()
  )
) with check (...)
```

## Auto-provisioning profilu

`202608090001_profile_trigger_and_logbook_entry_policy.sql` pridáva `on_auth_user_created` trigger na `auth.users`, ktorý pri registrácii cez Supabase Auth založí zodpovedajúci `public.profiles` riadok (`security definer`, `set search_path = public`). Bez tohto triggeru by po prepnutí na reálny Supabase Auth zostal nový účet bez profilu, kým by ho niekto ručne nezaložil.

## Testovanie politík

`tests/integration/rls.test.ts` (`pnpm test:integration`) beží proti reálnemu lokálnemu Postgresu, nie proti mockom:

1. `pnpm supabase:start` — spustí lokálny stack cez Docker.
2. `pnpm supabase:reset` — aplikuje všetky migrácie a `supabase/seed.sql` na čisto.
3. `pnpm local:setup` — zapíše lokálne Supabase URL/kľúče do `.env`.
4. `pnpm test:integration` — anon aj service-role klient (`tests/integration/_client.ts`), assercie na to, čo politika skutočne prepustí.
5. `pnpm supabase:stop` — vypne kontajnery, keď skončíš.

Táto sada nie je súčasťou `pnpm test` ani CI (`.github/workflows/ci.yml`) — vyžaduje Docker, ktorý CI runner v tomto repe zatiaľ nemá. Spúšťaj ju lokálne pri každej zmene `supabase/migrations/`.

## Čo skontrolovať pri novej tabuľke

- RLS zapnuté hneď v tej istej migrácii, kde sa tabuľka vytvára.
- Aspoň jedna politika na `select`, inak je tabuľka pre všetky role neviditeľná (často správne pre interné/service-role-only tabuľky, ale over si to vedome).
- Verejný `insert` má vždy `with check`, ktorý fixuje stav/rolu/pôvod na bezpečnú hodnotu.
- `authenticated`/`anon` GRANT v `202607150001_explicit_api_grants.sql` (alebo novšej grants migrácii) pokrýva novú tabuľku — inak RLS vôbec nedostane šancu sa vyhodnotiť.
- Pridaj aspoň jeden `tests/integration/rls.test.ts` prípad pre nový public-facing insert alebo staff-only read/write.
