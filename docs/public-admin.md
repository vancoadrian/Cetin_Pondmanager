# Public a interná časť

## Cieľ rozdelenia

Rybolov Cetín má mať jasne oddelené verejné obrazovky pre rybárov a interné obrazovky pre správcu, majiteľa, kontrolórov a súťažné tímy.

Public časť má byť rýchla, zrozumiteľná a použiteľná bez účtu. Interná časť má riešiť prevádzku, rozhodnutia, schvaľovanie a citlivejšie dáta.

## Public routy

| Route | Účel |
| --- | --- |
| `/` | verejný prehľad revíru |
| `/reviry` | jazerá, fotky, základné pravidlá |
| `/mapa` | mapa lovných miest a chát |
| `/rezervacie` | verejná žiadosť o rezerváciu |
| `/ulovky` | verejný alebo komunitný denník úlovkov |
| `/sutaze` | verejný pohľad na súťaž a live stav |
| `/notifikacie` | verejné výstrahy a oznamy |
| `/admin/notifikacie` | interná príprava PWA výstrah, servisných oznamov a mock broadcastov |
| `/info` | pravidlá, cenník, výbava |
| `/kontakt` | kontakt na správcu |
| `/sponzori` | partneri revíru a súťaží |

## Interné routy

| Route | Stav | Účel |
| --- | --- | --- |
| `/login` | mock | výber role bez hesla |
| `/admin` | mock | interný dashboard |
| `/admin/rezervacie` | mock | schvaľovanie a kalendár rezervácií |
| `/admin/ulovky` | mock | oprava a schvaľovanie verejných úlovkov, presun alebo odpojenie zápisníka, poznámky správcu a interný report |
| `/admin/mapa` | mock | SVG editor lovných miest, chát, vrstiev a servisných zón |
| `/admin/uzavierky` | mock | sezóny, neres, údržba, preteky, mimoriadne uzávierky |
| `/admin/pozicovna` | mock | sklad výbavy a priradenie k rezerváciám |
| `/admin/sutaze` | mock | organizácia pretekov, kontrolóri, tresty |
| `/admin/sponzori` | mock | partneri a ich umiestnenia |
| `/admin/audit` | mock | audit log lokálnych rozhodnutí a zmien |

## Mock auth

Aktuálne je interný prístup riešený cez `useMockAuth` a cookie `rybolov_cetin_mock_session`.
Mock admin používa spoločnú access matrix v `app/utils/adminAccess.ts`; z nej sa skladá interná navigácia, dashboard pre aktuálnu rolu a route guard pre `/admin/*`.

Mock roly:

- `owner`,
- `manager`,
- `organizer`,
- `marshal`,
- `team`,
- `accountant`,
- `worker`.

Toto je iba prototyp. Produkčne má byť nahradený Supabase Auth a RLS politikami. Prvá lokálna verzia audit logu už existuje a má sa pri Supabase preniesť do tabuľky `audit_events`.

## Produkčné práva

| Rola | Verejný web | Interné moduly |
| --- | --- | --- |
| `public` | čítanie verejných dát | nič |
| `angler` | vlastné rezervácie a úlovky | vlastný profil |
| `tournament_team` | vlastný sektor a súťaž | hlásenia, vlastné úlovky, námietky |
| `marshal` | súťaže | pridelené sektory, váženia, kontroly, tresty |
| `tournament_organizer` | súťaže | súťaže, sektory, tímy, pravidlá, výsledkovka |
| `accountant` | všetko public | platby, rezervácie, exporty, podklady |
| `worker` | všetko public | nástupy, požičovňa, údržba a prevádzkové úlohy |
| `manager` | všetko public | rezervácie, výstrahy, požičovňa, uzávierky |
| `owner` | všetko public | všetko interné vrátane nastavení a sponzorov |

Access matrix rozlišuje tri mock režimy: `plný`, `prevádzka` a `prehľad`. Produkčne sa táto logika presunie do reálneho RBAC/RLS modelu, ale UX už teraz ukazuje iba moduly patriace zvolenej role.

## Bezpečnostné poznámky

- Public dáta nesmú obsahovať súkromné telefóny rybárov alebo interné poznámky.
- Súťažné tresty môžu byť verejné iba podľa nastavenia organizátora.
- Úlovky od rybárov môžu byť verejné až po schválení správcom.
- Zápisník výpravy môže fungovať cez link alebo kód bez účtu, no osobný účet má odomknúť históriu rybára.
- Interné uzávierky môžu byť neverejné, ale musia blokovať dostupnosť.
- Každé produkčné rozhodnutie správcu má mať audit stopu.
