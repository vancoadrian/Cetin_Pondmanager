# Používateľské účty

## Prihlásenie

Jednotná obrazovka `/login` používa e-mail a heslo. Mock overenie prechádza cez `POST /api/auth/login`, aby server pred vytvorením klientskych cookies skontroloval aj stav zmazaného účtu. Primárny e-mail a overené aliasy rybára smerujú na rovnakú identitu.

## Registrácia rybára

Verejná obrazovka `/registracia` vytvorí iba účet s rolou `angler`. `POST /api/auth/register`:

- serverovo validuje meno, e-mail a silu hesla,
- odmietne e-mail existujúceho mock účtu, jeho alias aj už registrovaný e-mail,
- normalizuje e-mail na malé písmená,
- uloží iba `scrypt` hash hesla do `.data/rybolov-cetin/account-state.json`,
- vráti verejný profil bez hesla a klient rybára rovno prihlási,
- zapíše neosobnú auditnú udalosť `account.created`.

Po prihlásení používajú rezervácie a zápisníky rovnaké ID a e-mail účtu. Existujúce rezervácie s totožným e-mailom sa preto zobrazia aj novo vytvorenému účtu.

## Obnova hesla

Prihlasovacia obrazovka odkazuje na `/zabudnute-heslo`. `POST /api/auth/password-reset/request` vždy vracia rovnakú verejnú odpoveď bez ohľadu na to, či e-mail existuje. Pre lokálne registrovaný účet:

- vytvorí kryptografický jednorazový token s platnosťou 30 minút,
- do `account-state.json` uloží iba SHA-256 hash tokenu,
- pri providerovi `resend` odošle odkaz na `/obnova-hesla?token=...`,
- pri `mock` alebo `disabled` režime reset odkaz verejne nezobrazí ani neuloží,
- obmedzí opakované vytvorenie aktívneho resetu krátkym cooldownom.

`POST /api/auth/password-reset/confirm` skontroluje token a silu nového hesla, uloží nový `scrypt` hash a reset z lokálneho store odstráni. Rovnaký token sa druhýkrát nedá použiť. Obe úspešné fázy zapisujú neosobnú auditnú stopu bez e-mailu, hesla alebo tokenu.

Provider sa nastavuje cez `RYBOLOV_AUTH_DELIVERY_PROVIDER=mock|resend|disabled`, odosielateľ cez `RYBOLOV_AUTH_EMAIL_FROM` a používa spoločný `RYBOLOV_RESEND_API_KEY`.

## Export vlastných údajov

Prihlásený rybár môže v `/konto` stiahnuť `GET /api/account/export` ako verzovaný JSON súbor. Export obsahuje profil, rezervácie bez interných poznámok, priradené výpravy, záznamy výprav, vlastné úlovky a bezpečné metadata vlastných fotografií.

Pri skupinovej výprave sa zachová obsah dostupný účtu, ale mená ostatných členov sa nahradia označením `Člen výpravy`. Export neobsahuje heslo ani jeho hash, reset tokeny, interné cesty súborov, moderátorské poznámky alebo identitu moderátora. Odpoveď používa `Cache-Control: private, no-store`, názov súboru s dátumom a neosobnú auditnú udalosť `account.data_export.downloaded`.

## Zmazanie rybárskeho účtu

Rybár otvorí nastavenia v `/konto`, zvolí `Zmazať účet`, zadá aktuálne heslo a napíše potvrdzovaciu frázu `ZMAZAŤ`. `POST /api/account/delete` následne:

- overí aktívnu rybársku session a heslo,
- anonymizuje meno, e-mail a telefón v priradených rezerváciách,
- odstráni `ownerUserId` a členské `userId` väzby v zápisníkoch,
- nahradí meno pri zachovaných úlovkoch a zápisoch anonymným označením,
- uloží tombstone do `.data/rybolov-cetin/account-state.json`,
- zruší hlavnú aj kompatibilnú rybársku cookie session,
- vytvorí auditnú udalosť `account.deleted` bez uloženia hesla alebo e-mailu.

Rezervácie, úlovky, merania a fotografie zostávajú pri anonymizovaných prevádzkových záznamoch. UI o tomto výsledku informuje ešte pred potvrdením zmazania.

## Produkčný prechod

Pri zapojení Supabase Auth nahradí lokálny hash registrácia s potvrdením e-mailu, serverovým session registrom a natívnou obnovou hesla. Zmena hesla potom musí zrušiť aj ostatné aktívne sessions používateľa. Mazacia serverová mutácia musí zmazať alebo zablokovať `auth.users` identitu, odstrániť osobné profilové údaje a vykonať anonymizáciu v jednej riadenej operácii. Klient nesmie dostať service-role kľúč ani právo mazať cudzie účty.
