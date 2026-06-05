# Databázový kontrakt

## Stav

Prvá Supabase migrácia je v `supabase/migrations/202605160001_rybolov_cetin_core.sql`.

Migrácia zatiaľ neslúži ako finálne produkčné rozhodnutie o každom stĺpci. Je to pracovný kontrakt medzi prototypom a budúcim backendom: pomenúva tabuľky, vzťahy, enumy, indexy a základné RLS politiky tak, aby sa dalo pokračovať na repository implementácii bez ďalšieho veľkého prepisu.

Prvý seed export aktuálnych mock dát vzniká cez `pnpm seed:export` do `supabase/seed/rybolov-cetin.seed.json`. Export používa deterministické UUID, takže sa dá opakovane regenerovať bez rozbitia referencií.

## Multi-tenant jadro

- `venues` reprezentuje samostatnú inštanciu jedného majiteľa alebo prevádzkovateľa.
- `lakes` patria pod venue, takže jedna inštancia môže mať 1 až X jazier.
- `pegs` patria pod jazero a nesú mapovú pozíciu, kapacitu, typ miesto/chata a pravidlo `requires_cabin_reservation`.
- `map_layers` držia obrázkový alebo SVG podklad vrátane `image_settings` pre napasovanie obrázka.
- `map_facilities` patria pod jazero a držia servisné body ako WC, sprchy, sklad, drevo, elektrická rozvodňa, vjazd alebo recepcia.
- `map_shapes` patria pod jazero a držia polygonové plochy pre vodnú oblasť, zákaz, súťažný sektor alebo servisnú zónu; sektorový polygon sa môže voliteľne viazať na `tournaments` a `tournament_sectors`.
- `user_roles` viaže používateľa na venue, prípadne jazero alebo súťaž.

Roly sú: `owner`, `manager`, `tournament_organizer`, `marshal`, `tournament_team`, `accountant`, `worker`, `angler`.

Notifikačný kontrakt počíta s verejnými oznamami v `alerts`, topicmi v `target_topics` a interným cieľovaním v `target_audience`. `push_subscriptions` nesú bežné push údaje aj `topics`, `audience_role` a `audience_scope`, aby bolo možné cieliť súťažné správy na organizátora, kontrolóra, konkrétne sektory alebo konkrétneho kontrolóra. `notification_delivery_logs` drží stav doručenia po zariadeniach, provider, endpoint, hlášku a čas pokusu.

## Prevádzka revíru

Rezervácie sú rozdelené na:

- `reservations` ako hlavička termínu,
- `reservation_items` ako budúci univerzálny košík,
- `payment_methods` ako zapínateľné spôsoby platby: hotovosť, prevod a budúca brána,
- `rental_bookings` ako termínové blokovanie skladových položiek,
- `lake_closures` a `lake_closure_pegs` pre uzávierky celého venue, jazera alebo konkrétnych miest,
- `season_rules` pre opakované pravidlá typu zima alebo neres.

Tento model zodpovedá aktuálnemu availability engine: dostupnosť sa nemá čítať iba z jednej tabuľky.

## Úlovky a výpravy

- `catch_records` drží druh, váhu, mieru, nástrahu, čas, miesto, počasie pri zábere, viditeľnosť, stav schválenia a review poznámku správcu. Počasie sa zatiaľ generuje cez mock provider, neskôr ho má plniť weather API alebo meteostanica.
- `catch_photos` drží názov súboru, MIME typ, veľkosť, storage cestu, verejnú URL a budúci AI stav.
- `trip_logbooks`, `trip_logbook_members`, `trip_logbook_pegs` a `trip_logbook_entries` pokrývajú skupinové zapisovacie tabuľky výprav.
- `fish_identity_candidates` je pripravené pre budúce porovnávanie opakovaných jedincov.

## Súťaže

Súťažný model obsahuje:

- organizáciu a súťaž,
- sektory a tímy,
- kontrolórov a ich priradenie k sektorom,
- hlásenia tímov,
- kontrolórsky overené úlovky,
- tresty,
- kontroly pravidiel.

Tým je pokrytý scenár, kde tím požiada o príchod kontrolóra, kontrolór váži úlovok, zapíše trest alebo rieši hlásenie porušenia pravidiel. `tournament_catches.verification_client_mutation_id`, `tournament_penalties.client_mutation_id` a `tournament_rule_checks.client_mutation_id` majú unikátne indexy v rámci súťaže, aby offline retry kontrolórskych úkonov nevytváral duplicity.

## RLS princíp

Migrácia zapína RLS na všetkých aplikačných tabuľkách.

Základné pravidlá:

- public číta len verejné a aktívne dáta,
- `owner` a `manager` spravujú venue-scoped dáta,
- `tournament_organizer`, `marshal` a `tournament_team` majú prístup cez súťažné politiky,
- `accountant` číta platobné a rezervačné podklady,
- `worker` číta prevádzkové rezervácie a výbavu potrebnú pri vode,
- rybár vidí vlastné rezervácie, úlovky, zápisníky a push odbery,
- citlivé prevádzkové dáta majú ísť cez server/API alebo service role.

## Audit log

`audit_events` je pripravená tabuľka pre append-only stopu mutácií. Lokálny prototyp už zapisuje rovnaký koncept do `.data/rybolov-cetin/audit-log.json` pri rezerváciách, úlovkoch, zápisníkoch, mapových úpravách, súťažných akciách a systémových backup/restore úkonoch.

## Ďalší krok

Ďalšie implementačné kroky sú:

1. pridať Supabase env premenné, keď bude projekt vytvorený,
2. vytvoriť Supabase client/repository implementáciu vedľa mock/lokálnej repository,
3. nahradiť lokálne mutácie v rezervačných a úlovkových API produkčnými Supabase mutáciami,
4. rozhodnúť, či seed JSON konvertovať na SQL súbor alebo spúšťať cez vlastný import runner.
