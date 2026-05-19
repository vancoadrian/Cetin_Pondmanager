# Mapy a editor miest

## Cieľ

Mapa je hlavná pracovná plocha revíru. Musí podporovať lovné miesta, chaty, sektory, uzávierky a neskôr editáciu v adminovi.

## Typy máp

- obrázkový podklad z webu,
- nahrateľný podkladový obrázok pre každé jazero,
- SVG mapa pre presné interaktívne body,
- súťažná mapa sektorov,
- interná servisná mapa.

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

- nahrať alebo vymeniť podkladový obrázok,
- pridať lovné miesto,
- posunúť bod na mape,
- kresliť a upravovať SVG tvary,
- označiť miesto ako chata,
- nastaviť, či je chata povinná pri rezervácii,
- vytvoriť súťažné sektory,
- skryť alebo zablokovať miesto,
- naviazať miesto na pravidlá a kapacitu.

## Dátový návrh

| Entita | Účel |
| --- | --- |
| `map_layers` | podklad mapy alebo SVG vrstva |
| `map_points` | bod na mape |
| `map_shapes` | sektor, zóna, breh, interný polygon |
| `pegs` | lovné miesta a chaty |
| `tournament_sectors` | súťažné sektory |

## Stav v prototype

- `/mapa` používa SVG canvas s obrázkovým alebo generovaným podkladom.
- Lovné miesta a chaty sú kreslené ako SVG body z percentuálnych súradníc.
- `/admin/mapa` má drag editor bodov, vrstvy, náhľad exportu modelu a lokálne uloženie zmien.
- `mapLayers` a `mapShapes` sú seednuté v `app/data/pond.ts`.
- Pomocné mapové funkcie sú v `app/utils/map.ts`.
- `GET /api/map` vracia aktuálny mapový stav z lokálneho JSON store.
- `PUT /api/admin/map` ukladá validované body a aktívne vrstvy do `.data/rybolov-cetin/map-state.json`.
- `/sutaze` používa súťažný obrázok s bodmi sektorov.
- Seed body sú v `app/data/pond.ts`, runtime úpravy admina sú v lokálnom store.

## Ďalšie kroky

- Rozšíriť aktuálny bodový editor na plný SVG editor s podkladovým obrázkom.
- Pridať polygon editor pre sektory, uzávierky a servis.
- Napájať súťažné sektory na rovnaký mapový model.
- Neskôr nahradiť lokálny JSON store produkčnou map repository/Supabase mutáciou.
