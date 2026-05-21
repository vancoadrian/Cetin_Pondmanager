# Rezervácie

## Cieľ

Rezervácie majú byť použiteľné pre bežného rybára aj správcu. Rybár má vedieť vybrať jazero, miesto, chatu, povolenku, požičovňu a doplnky. Správca má vidieť dostupnosť, konflikty, interné poznámky a uzávierky.

## Verejný tok

1. Rybár vyberie jazero.
2. Vyberie lovné miesto alebo chatu.
3. Vyberie povolenku.
4. Pridá požičovňu alebo doplnky.
5. Vyplní kontakt.
6. Odošle žiadosť.
7. Dostane stav: čaká na potvrdenie, potvrdené, zamietnuté alebo vyžaduje telefonát.
8. Platba prebehne až po potvrdení: hotovosť na mieste alebo bankový prevod. Platobná brána má zostať pripravená ako vypínateľný budúci modul.

## Interný tok

1. Správca otvorí admin kalendár.
2. Vidí všetky žiadosti, potvrdené rezervácie a blokácie.
3. Systém upozorní na konflikt s uzávierkou, súťažou, neresom alebo údržbou.
4. Správca schváli, upraví alebo zamietne rezerváciu.
5. Pri schválení sa blokujú aj požičané položky.
6. Správca vie vytvoriť telefonickú alebo osobnú rezerváciu priamo v adminovi ako čakajúcu alebo rovno potvrdenú.
7. Neskôr môže aplikácia poslať potvrdenie cez Resend/e-mail; telefonické potvrdenie zostáva rovnocenný workflow.

## Chata + miesto

Niektoré miesta sú samostatné lovné miesta.
Niektoré miesta sú lovné miesto s chatou.

Admin musí vedieť nastaviť:

- či sa miesto dá rezervovať bez chaty,
- či sa chata dá rezervovať bez lovného miesta,
- minimálnu dĺžku pobytu,
- minimálny počet povoleniek,
- doplnky dostupné iba k chate.

## Availability engine

Dostupnosť sa musí vypočítať z viacerých zdrojov:

- rezervácie,
- uzávierky,
- sezóny,
- neres,
- údržba,
- preteky,
- pravidlá chát,
- kapacita požičovne.

Výsledok má byť vysvetliteľný. Admin aj rybár musia vidieť, prečo miesto nie je dostupné.
Public obrazovka používa sanitizované uzávierky z `/api/closures`, server pri odoslaní opäť číta plný lokálny closure store. Interné blokácie sa rybárovi zobrazujú iba ako blokovaný termín bez internej poznámky, ale stále blokujú rezerváciu.

## Stav v prototype

- `/rezervacie` obsahuje verejný rezervačný formulár.
- `/admin` ukazuje súhrn rezervácií na spracovanie.
- `/admin/rezervacie` má mock schvaľovací detail vybranej rezervácie s kontaktom, povolenkou, chatou, požičovňou, doplnkami, konfliktmi a internou poznámkou.
- `/admin/rezervacie` má týždenný aj mesačný kalendár po miestach a chatách, kde každá bunka ukazuje stav z availability engine a obsadená bunka otvorí detail rezervácie. Na mobile sa kalendár mení na denný súhrn obsadenosti.
- Uloženie rozhodnutia v `/admin/rezervacie` mení lokálny stav rezervácie a výpožičiek, takže sa prepočítajú štatistiky aj kalendár bez reloadu.
- Rozhodovacia logika schváliť/telefonát/zamietnuť je presunutá do `reservationWorkflowService` a composable `useAdminReservationWorkflow`.
- Verejná žiadosť používa `reservationRequestSchema` zo Zod validácií a odosiela sa na `POST /api/reservations`.
- Verejný formulár má klientsku IndexedDB offline frontu. Ak odoslanie zlyhá kvôli výpadku siete, payload žiadosti o miesto, chatu, výbavu a doplnky zostane v zariadení a po návrate internetu sa odošle na `POST /api/reservations`.
- `/offline` zobrazuje čakajúce rezervácie spolu s ostatnými offline položkami, vie ich hromadne odoslať alebo odstrániť zo zariadenia.
- Serverová vrstva používa `reservationApiService`, znovu odvodí dostupnosť miesta, chatu, aktívnej požičovne a doplnkov z lokálne uloženého stavu a netrustuje klientsky stav.
- `GET /api/reservations` vracia aktuálny lokálny stav rezervácií a výpožičiek.
- Admin endpoint `POST /api/admin/reservations/:id/decision` zapisuje rozhodnutie do lokálneho JSON store a má rovnaký tvar ako budúca mutácia schválenia rezervácie.
- Admin endpoint `POST /api/admin/reservations` vytvára telefonickú alebo osobnú rezerváciu cez rovnakú serverovú kontrolu dostupnosti ako public formulár, ale chráni ju admin RBAC guardom.
- Uzávierky sa ukladajú cez `/api/admin/closures` do `.data/rybolov-cetin/closure-state.json` a rezervačný endpoint ich používa pri kontrole dostupnosti.
- `/admin/uzavierky` vie existujúcu uzávierku načítať späť do formulára, upraviť ju a uložiť cez rovnaký API kontrakt.
- Platobné metódy sú pripravené v modeli ako zapínateľný zoznam: hotovosť, prevod a vypnutá budúca brána. `/admin/rezervacie` ich vie zapnúť alebo vypnúť cez lokálny payment store.
- Požičovňa má termínový výpočet dostupnosti cez `rentalBookings` a `getRentalAvailability`.
- `/admin/pozicovna` ukazuje sklad, potvrdené kusy, čakajúce žiadosti a voľné kusy pre vybraný termín; správca vie pridať novú výbavu alebo doplnok, dočasne vypnúť položku, upraviť sklad, odporúčanie a cenníkový text.
- Nepoužitú výbavu alebo doplnok vie správca bezpečne odstrániť. Položky použité v rezerváciách alebo výpožičkách sa nemažú kvôli histórii, UI aj API ich navádzajú radšej vypnúť cez `active`.
- Aktívny katalóg požičovne a doplnkov sa dočasne ukladá do `.data/rybolov-cetin/rental-catalog-state.json`; public rezervácia, info stránka a admin vytváranie rezervácie čítajú iba aktívne položky.
- Dáta sú v `app/data/pond.ts`.

## Ďalšie kroky

- Neskôr nahradiť lokálny JSON store produkčnou repository/Supabase mutáciou.
- Konfliktné pravidlá a vysvetlenie dostupnosti.
- Email/SMS/push potvrdenia cez Resend alebo iného providera podľa rozhodnutia prevádzkovateľa.
- Doriešiť notifikáciu používateľovi, ak offline rezervácia po návrate internetu narazí na konflikt dostupnosti.
