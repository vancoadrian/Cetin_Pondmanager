# Mapy a editor miest

## Cieľ

Mapa je hlavná pracovná plocha revíru. Musí podporovať lovné miesta, chaty, sektory, uzávierky, zákazy, servisné body a editáciu v adminovi.

## Typy máp

- obrázkový podklad z webu,
- nahrateľný podkladový obrázok pre každé jazero,
- SVG mapa pre presné interaktívne body,
- súťažná mapa sektorov,
- interná servisná mapa.
- prevádzková mapa bodov ako WC, sprchy, sklad, drevo, rozvodňa, vjazd a recepcia.

## Prečo SVG

SVG dáva zmysel pre:

- presné značenie lovných miest,
- editáciu bodov v adminovi,
- vrstvy chát, sektorov a blokácií,
- export alebo tlač mapy,
- lepšie správanie na mobile.

Obrázok jazera môže zostať ako podklad, ale body a vrstvy by mali byť štruktúrované.

## Admin editor

Admin má vedieť:

- nahrať alebo vymeniť podkladový obrázok pre aktuálne jazero,
- napasovať podkladový obrázok cez režim zobrazenia, mierku, posun a priehľadnosť,
- pridať lovné miesto,
- posunúť bod na mape,
- kresliť a upravovať SVG tvary,
- kresliť polygon klikmi priamo do mapy,
- zapnúť mriežku a prichytenie bodov na zvolený krok,
- presúvať celé polygonové zóny a samostatné vrcholy,
- pridať servisné body ako WC, sprchy, sklad, drevo, rozvodňu, vjazd alebo recepciu,
- označiť miesto ako chata,
- nastaviť, či je chata povinná pri rezervácii,
- naviazať miesto s chatou na cenníkový produkt chaty,
- vytvoriť súťažné sektory,
- skryť alebo zablokovať miesto,
- naviazať miesto na pravidlá a kapacitu.

## Dátový návrh

| Entita | Účel |
| --- | --- |
| `map_layers` | podklad mapy alebo SVG vrstva |
| `pegs` | lovné miesta a chaty |
| `cabin_products` | cenníkové produkty chát |
| `cabin_product_pegs` | väzba cenníkovej chaty na jedno alebo viac mapových miest |
| `map_facilities` | servisné a prevádzkové body na mape |
| `map_shapes` | sektor, zóna, breh, interný polygon |
| `tournament_sectors` | súťažné sektory |

## Stav v prototype

- `/mapa` používa SVG canvas s obrázkovým alebo generovaným podkladom.
- Lovné miesta, chaty a verejné servisné body sú kreslené ako SVG body z percentuálnych súradníc.
- `/admin/mapa` má drag editor lovných miest, chát, servisných bodov, polygonových plôch, vrstvy, náhľad exportu modelu a lokálne uloženie zmien.
- Admin vie pridať nové lovné miesto, miesto s chatou, WC/servisný bod, rozvodňu, zákaz/režim a súťažný sektor.
- Admin vie zapnúť režim kreslenia plochy, zvoliť typ a názov, klikmi pridať očíslované vrcholy, vrátiť posledný bod, zrušiť kreslenie alebo polygon dokončiť po aspoň troch bodoch aj dvojklikom.
- Vybraná polygonová plocha má rýchle režimy vodná oblasť, ostrov/porast, zákaz/režim, súťažný sektor a servisná zóna; režim automaticky nastaví farbu, viditeľnosť aj príslušnú mapovú vrstvu.
- Vybrané lovné miesto má rýchle rezervačné režimy: brehové miesto, chata povinná, chata voliteľná, termín na potvrdenie, ručne rezervované a údržba/blokácia. Verejná aj admin rezervácia čítajú živé lovné miesta z mapového store.
- Vybrané miesto s chatou má v adminovi väzbu na cenníkovú chatu. Väzba sa ukladá do samostatného lokálneho store, validuje, že jedno miesto nepatrí do viacerých cenníkových produktov, a public/admin rezervácie podľa nej automaticky doplnia položku chaty.
- Editor má voliteľnú mriežku, snap na krok 1 %, 2.5 %, 5 % alebo 10 % a klávesové ovládanie kreslenia pre rýchle opravy.
- Admin vie nahrať nový JPG/PNG/WebP podklad mapy pre vybrané jazero; súbor sa uloží do `.data/rybolov-cetin/map-assets/` a vrstva dostane URL `/api/map-assets/:id`.
- Admin vie pri obrázkovom podklade meniť `cover`, `contain` alebo `stretch`, mierku, X/Y posun a priehľadnosť; podklad vie posúvať aj priamo ťahaním v SVG mape. Rovnaké nastavenie číta aj verejná mapa.
- `mapLayers`, `mapFacilities` a `mapShapes` sú seednuté v `app/data/pond.ts`.
- Pomocné mapové funkcie sú v `app/utils/map.ts`.
- `GET /api/map` vracia sanitizovaný publikovaný mapový stav z `.data/rybolov-cetin/map-state.json`: public a súťažné vrstvy/tvary/body áno, interné servisné body, interné zóny a interné vrstvy nie.
- `GET /api/admin/map` vracia plný rozpracovaný mapový stav z `.data/rybolov-cetin/map-draft-state.json`; ak draft ešte neexistuje, vychádza z publikovanej mapy.
- Admin mapové odpovede nesú `draftChanges`, teda počet aj názvy pridaných, upravených a odstránených vrstiev, miest, servisných bodov a plôch oproti verejnej mape.
- `PUT /api/admin/map` ukladá validované lovné miesta, servisné body, polygonové tvary a aktívne vrstvy do draftu.
- `POST /api/admin/map/publish` prepíše publikovanú public mapu aktuálnym draftom a zapíše audit stopu.
- `POST /api/admin/map/discard-draft` zahodí rozpracovaný draft, načíta späť publikovanú mapu a zapíše audit stopu.
- `GET /api/cabin-products`, `GET /api/admin/cabin-products` a `PUT /api/admin/cabin-products` držia živý katalóg chát a väzby na mapové miesta v `.data/rybolov-cetin/cabin-catalog-state.json`.
- `POST /api/admin/map/background` ukladá nový podkladový obrázok do draftu mapy; `/api/map-assets/:id` verejne vydá iba assety napojené na public alebo súťažnú vrstvu v publikovanej mape.
- `/sutaze` používa rovnaký mapový podklad a sektorové SVG polygony z `mapShapes`; bodky tímov ostávajú klikateľné nad mapovou vrstvou.
- Sektorové polygony môžu niesť `tournamentId` a `sectorId`, takže admin mapa vie naviazať kreslenú plochu na konkrétny súťažný sektor.
- `/admin/sutaze` vie otvoriť `/admin/mapa?turnaj=<id>&sektor=<id>` priamo z konkrétneho sektora. Editor prepne jazero, otvorí existujúci sektorový polygon alebo pripraví nový neuložený draft polygonu pri bode sektora.
- `/admin/mapa` vie pre aktívnu súťaž hromadne pripraviť neuložené draft polygony pre všetky sektory, ktorým ešte chýba sektorový SVG tvar.
- Seed body sú v `app/data/pond.ts`, runtime úpravy admina sú v lokálnom store.

## Ďalšie kroky

- Doplniť presnejší crop preset podkladu pre rôzne pomery tlače alebo exportu.
- Doplniť pomenovanie alebo typovanie vrcholov pre špeciálne body hranice, ak to správca pri reálnych mapách potrebuje.
- Doplniť hromadné zarovnanie sektorových polygonov podľa brehu alebo nahratého podkladu, ak sa pri reálnych mapách ukáže, že obdĺžnikové návrhy treba rýchlo rozťahovať do línie.
- Neskôr nahradiť lokálny JSON store produkčnou map repository/Supabase mutáciou.
