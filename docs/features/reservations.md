# Rezervácie

## Cieľ

Rezervácie majú byť použiteľné pre bežného rybára aj správcu. Rybár má vedieť vybrať jazero, miesto, chatu, povolenku, požičovňu a doplnky. Správca má vidieť dostupnosť, konflikty, interné poznámky a uzávierky.

## Verejný tok

1. Rybár vyberie jazero.
2. Vyberie lovné miesto alebo chatu.
3. Vyberie povolenku.
4. Pridá požičovňu alebo doplnky.
5. Vyplní kontakt. Prihlásenému rybárovi sa meno a e-mail predvyplnia z účtu, aby sa rezervácia neskôr zobrazila v jeho histórii.
6. Odošle žiadosť.
7. Dostane stav: čaká na potvrdenie, potvrdené, zamietnuté alebo vyžaduje telefonát.
8. Platba prebehne až po potvrdení: hotovosť na mieste alebo bankový prevod. Platobná brána má zostať pripravená ako vypínateľný budúci modul.

Verejné odkazy z informačnej stránky môžu predvybrať službu priamo v rezervácii:

- `vybava=<rental-id>` predvyberie položku požičovne,
- `doplnok=<extra-id>` predvyberie doplnok,
- `chata=<cabin-product-id>&typ=chata` otvorí rezerváciu na prvom mieste viazanom na danú chatu.
- Povinná výbava na informačnej stránke má pri požičateľných položkách priamu akciu `Pridať k rezervácii`, napríklad podberák, podložka alebo základný fish-care kit.

## Interný tok

1. Správca otvorí admin kalendár.
2. Vidí všetky žiadosti, potvrdené rezervácie a blokácie.
3. Systém upozorní na konflikt s uzávierkou, súťažou, neresom alebo údržbou.
4. Správca schváli, upraví alebo zamietne rezerváciu.
5. Pri schválení sa blokujú aj požičané položky.
6. Správca vie vytvoriť telefonickú alebo osobnú rezerváciu priamo v adminovi ako čakajúcu alebo rovno potvrdenú.
7. Aplikácia vie po rozhodnutí pripraviť správu pre hosťa; podľa nastavenia provideru ju ponechá ako draft, odošle cez Resend alebo označí doručenie ako vypnuté. Telefonické potvrdenie zostáva rovnocenný workflow.

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
- Úvodná stránka používa rovnaký termínový rozsah ako mapa a rezervácia. Karty dostupnosti vedú priamo na mapu voľných miest, rezerváciu chaty, žiadosť o potvrdenie alebo zmenu termínu.
- Detail revíru má výber termínu, súhrn voľných miest a chát pre zvolený rozsah, 7-dňový prehľad od zvoleného dátumu a prekliky do mapy alebo rezervácie s rovnakými parametrami.
- Prihlásený rybár má v public formulári predvyplnené meno a e-mail účtu. Polia môže prepísať, ale aplikácia mu rozpracovaný kontakt neprepisuje automaticky.
- `/konto` zobrazuje vlastné rezervácie bez interných poznámok, s platobným stavom, pokynmi k zvolenej platobnej metóde a rýchlym telefonátom alebo SMS správcovi s predvyplneným ID rezervácie.
- `/admin` ukazuje súhrn rezervácií na spracovanie.
- `/admin/rezervacie` má mock schvaľovací detail vybranej rezervácie s kontaktom, povolenkou, chatou, požičovňou, doplnkami, konfliktmi a internou poznámkou.
- `/admin/rezervacie` má týždenný aj mesačný kalendár po miestach a chatách, kde každá bunka ukazuje stav z availability engine a obsadená bunka otvorí detail rezervácie. Na mobile sa kalendár mení na denný súhrn obsadenosti.
- Uloženie rozhodnutia v `/admin/rezervacie` mení lokálny stav rezervácie a výpožičiek, takže sa prepočítajú štatistiky aj kalendár bez reloadu. Výsledok zároveň pripraví správu pre hosťa: e-mailový draft, ak má rezervácia e-mail, alebo SMS/telefonický text, ak je dostupný len telefón. Pri e-maili API vracia aj delivery stav `prepared`, `sent`, `skipped` alebo `failed`.
- Rozhodovacia logika schváliť/telefonát/zamietnuť je presunutá do `reservationWorkflowService` a composable `useAdminReservationWorkflow`.
- Verejná žiadosť používa `reservationRequestSchema` zo Zod validácií, nesie povinný telefón a voliteľný e-mail pre potvrdenie rezervácie a odosiela sa na `POST /api/reservations`.
- Po úspešnom `POST /api/reservations` sa vytvorí interný broadcast do okruhu `reservations` pre role owner, manager a worker. Nezobrazí sa ako verejná výstraha; push payload otvára `/admin/rezervacie?rezervacia=<id>`.
- `/admin/rezervacie` číta aj `GET /api/admin/reservations/notifications`, aby detail webovej žiadosti ukázal, či sa interná push notifikácia pripravila, odoslala alebo nemala žiadneho príjemcu. Endpoint je chránený rezervačnými právami a nevracia celý notifikačný modul ani zoznam odberov.
- Verejný formulár má klientsku IndexedDB offline frontu. Ak odoslanie zlyhá kvôli výpadku siete, payload žiadosti o miesto, chatu, výbavu a doplnky zostane v zariadení a po návrate internetu sa odošle na `POST /api/reservations`.
- `/offline` zobrazuje čakajúce rezervácie spolu s ostatnými offline položkami, vie ich hromadne odoslať alebo odstrániť zo zariadenia.
- Serverová vrstva používa `reservationApiService`, znovu odvodí dostupnosť miesta, chatu, aktívnej požičovne a doplnkov z lokálne uloženého stavu a netrustuje klientsky stav.
- `GET /api/reservations` vracia aktuálny lokálny stav rezervácií a výpožičiek.
- `GET /api/admin/reservations/notifications` vracia iba súhrny interných reservation broadcastov podľa `requestId`, delivery počty a posledný pokus doručenia pre detail rezervácie.
- Admin endpoint `POST /api/admin/reservations/:id/decision` zapisuje rozhodnutie do lokálneho JSON store, vracia `communicationDraft` a `communicationDelivery` pre hosťa a má rovnaký tvar ako budúca mutácia schválenia rezervácie.
- Admin endpoint `POST /api/admin/reservations` vytvára telefonickú alebo osobnú rezerváciu cez rovnakú serverovú kontrolu dostupnosti ako public formulár, ale chráni ju admin RBAC guardom.
- Uzávierky sa ukladajú cez `/api/admin/closures` do `.data/rybolov-cetin/closure-state.json` a rezervačný endpoint ich používa pri kontrole dostupnosti.
- `/admin/uzavierky` vie existujúcu uzávierku načítať späť do formulára, upraviť ju a uložiť cez rovnaký API kontrakt.
- Platobné metódy sú pripravené v modeli ako zapínateľný zoznam: hotovosť, prevod a vypnutá budúca brána. `/admin/rezervacie` ich vie zapnúť alebo vypnúť cez lokálny payment store; public info a rezervačný formulár zobrazujú iba zapnuté možnosti.
- Požičovňa má termínový výpočet dostupnosti cez `rentalBookings` a `getRentalAvailability`.
- `/admin/pozicovna` ukazuje sklad, potvrdené kusy, čakajúce žiadosti a voľné kusy pre vybraný termín; správca vie pridať novú výbavu alebo doplnok, dočasne vypnúť položku, upraviť sklad, odporúčanie a cenníkový text.
- Nepoužitú výbavu alebo doplnok vie správca bezpečne odstrániť. Položky použité v rezerváciách alebo výpožičkách sa nemažú kvôli histórii, UI aj API ich navádzajú radšej vypnúť cez `active`.
- Aktívny katalóg požičovne a doplnkov sa dočasne ukladá do `.data/rybolov-cetin/rental-catalog-state.json`; public rezervácia, info stránka a admin vytváranie rezervácie čítajú iba aktívne položky. Informačná stránka posiela aktívne položky do rezervácie cez query predvýber, takže rybár nemusí tú istú službu hľadať druhýkrát.
- Informačná stránka má blok `Pred príchodom k vode`, ktorý spája termín, povinnú výbavu, odporúčané požičovne a potvrdenie správcom do jedného krátkeho toku pred rezerváciou.
- Dáta sú v `app/data/pond.ts`.

## Ďalšie kroky

- Neskôr nahradiť lokálny JSON store produkčnou repository/Supabase mutáciou.
- Konfliktné pravidlá a vysvetlenie dostupnosti.
- Doriešiť SMS/push potvrdenia; e-mail má provider `mock`, `resend` alebo `disabled` cez `RYBOLOV_RESERVATION_DELIVERY_PROVIDER`.
- Doriešiť notifikáciu používateľovi, ak offline rezervácia po návrate internetu narazí na konflikt dostupnosti.
