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
| `place_issues` | nahlásené nedostatky viazané na jazero, lovné miesto alebo servisný bod |
| `tournament_sectors` | súťažné sektory |

## Stav v prototype

- `/mapa` používa SVG canvas s obrázkovým alebo generovaným podkladom.
- `/mapa` drží na mobile výber termínu v kompaktnom súhrne s akciou `Zmeniť`; rýchle rozsahy a presné dátumy sa rozbalia na požiadanie. Mapové plátno nasleduje hneď po jazere a filtri, kým odvodené súhrny a vysvetlenia sú až pod mapou.
- `/mapa` má verejné nahlásenie nedostatku pre aktuálne jazero, lovné miesto alebo verejný servisný bod vrátane offline fronty v zariadení pri slabom signáli.
- Lovné miesta, chaty a verejné servisné body sú kreslené ako SVG body z percentuálnych súradníc.
- `/admin/mapa` má drag editor lovných miest, chát, servisných bodov, polygonových plôch, vrstvy, náhľad exportu modelu a lokálne uloženie zmien.
- Pracovná plocha `/admin/mapa` je rozdelená na URL pohľady `Prvky`, `Vrstvy`, `Publikovanie` a `Export` cez query `sekcia`. SVG mapa ostáva pri všetkých pohľadoch viditeľná a na desktope sa pri dlhšom paneli drží pri hornej hrane; prepínač podporuje šípky, `Home` a `End`.
- Kliknutie na lovné miesto, chatu, servisný bod alebo polygon vždy otvorí pohľad `Prvky`. Súťažný deep-link s `turnaj` a `sektor` zachová svoj kontext a otvorí vybraný polygon v rovnakom pohľade.
- Nález kontroly pred publikovaním otvorí priamo príslušný pracovný pohľad: objekty a polygony v `Prvky`, vrstvy a podkladový obrázok vo `Vrstvy`. Výsledná správa zostane viditeľná nad mapou aj po odchode z kontroly.
- Uloženie draftu, zahodenie draftu a publikovanie sú sústredené v pohľade `Publikovanie`; `Export` drží legendu vrcholov a prehľad pripravených dát bez prevádzkových formulárov.
- Admin vie pridať nové lovné miesto, miesto s chatou, WC/servisný bod, rozvodňu, zákaz/režim a súťažný sektor.
- Karta `Pridať do mapy` má samostatnú paletu servisných bodov pre WC, sprchy, sklad, drevo, elektrickú rozvodňu, vjazd, recepciu, parkovanie, odpad a prvú pomoc.
- Karta `Pridať do mapy` ukazuje pripravenosť vrstiev pre nové brehové miesto, miesto s chatou, servisný bod a aktuálne zvolený typ kreslenej plochy: `aktívna`, `zapne sa` alebo `vytvorí sa`.
- Rovnaká karta ponúka aj rýchle pridanie všetkých základných polygonov: vodná oblasť, ostrov/porast, zákaz/režim, súťažný sektor a servisná zóna.
- Admin vie zapnúť režim kreslenia plochy, zvoliť typ a názov, klikmi pridať očíslované vrcholy, vrátiť posledný bod, zrušiť kreslenie alebo polygon dokončiť po aspoň troch bodoch aj dvojklikom.
- Vybraná polygonová plocha má rýchle režimy vodná oblasť, ostrov/porast, zákaz/režim, súťažný sektor a servisná zóna; režim automaticky nastaví farbu, viditeľnosť aj príslušnú mapovú vrstvu.
- Vybrané lovné miesto má rýchle rezervačné režimy: brehové miesto, chata povinná, chata voliteľná, termín na potvrdenie, ručne rezervované a údržba/blokácia. Verejná aj admin rezervácia čítajú živé lovné miesta z mapového store.
- Stav vybraného miesta v admin editore používa rovnaký ikonový `PegStatusBadge` ako verejná mapa a rezervácie, aby `voľné`, `rezervované`, `víkendovo voľné` a `údržba` nepôsobili v každom module inak.
- Pri zmene typu vybraného miesta editor automaticky pripraví správnu vrstvu a priamo pri poli `Typ` vysvetlí, či je vrstva lovných miest alebo chát aktívna, zapne sa, alebo sa vytvorí. Naviazanie cenníkovej chaty rovnako zapne vrstvu chát.
- Karta `Vybraný prvok` ukazuje vrstvu aktuálneho miesta, servisného bodu alebo polygonu a jej stav. Ak je vrstva vypnutá alebo chýba, správca ju vie zapnúť alebo doplniť cez `Zobraziť vrstvu`.
- Vybrané miesto s chatou má v adminovi väzbu na cenníkovú chatu. Väzba sa ukladá do samostatného lokálneho store, validuje, že jedno miesto nepatrí do viacerých cenníkových produktov, a public/admin rezervácie podľa nej automaticky doplnia položku chaty.
- Editor má voliteľnú mriežku, snap na krok 1 %, 2.5 %, 5 % alebo 10 % a klávesové ovládanie kreslenia pre rýchle opravy.
- Vrcholy polygonov môžu mať voliteľný typ a krátky názov, napríklad breh, hranica, vstup, kotva podkladu alebo servisný bod; pri posune bodov a hromadnom zarovnaní sektorov sa tieto metadáta zachovávajú.
- `/admin/mapa` má pracovnú legendu označených vrcholov pre aktuálne jazero. Riadky legendy vedia vybrať príslušný polygon, legenda sa dá filtrovať podľa typu bodu a viditeľnosti plochy, export modelu obsahuje filtrovaný `shapePointLegend` a správca si vie aktuálny výber vytlačiť alebo stiahnuť ako CSV.
- Admin vie nahrať nový JPG/PNG/WebP podklad mapy pre vybrané jazero; súbor sa uloží do `.data/rybolov-cetin/map-assets/` a vrstva dostane URL `/api/map-assets/:id`.
- Admin vie pri obrázkovom podklade meniť `cover`, `contain` alebo `stretch`, mierku, X/Y posun a priehľadnosť; podklad vie posúvať aj priamo ťahaním v SVG mape. Rovnaké nastavenie číta aj verejná mapa.
- Admin mapa má exportné rámy pre celý viewBox, A4/A3 na šírku, A4 na výšku, štvorec a 16:9. Editor ich ukazuje ako SVG výrez nad mapou a počíta, koľko lovných miest, servisných bodov a vrcholov polygonov ostáva vo vybranom ráme.
- Karta `Vrstvy mapy` má pracovné režimy Podklad, Miesta, Servis, Súťaž a Všetko. Predvoľby zapnú správne vrstvy aktuálneho jazera, zachovajú ostatné jazerá a správne sa počítajú do draft zmien.
- Riadky vrstiev ukazujú počet a skladbu objektov vo vrstve, napríklad lovné miesta, chaty, servisné body alebo plochy. Ak vypnutá alebo chýbajúca vrstva skrýva existujúce objekty, panel vypíše typ vrstvy, stav `chýba vrstva` alebo `vrstva je vypnutá`, počet skrytých objektov a ponúkne akciu `Zobraziť objekty`, ktorá potrebné vrstvy doplní alebo zapne v neuloženom drafte mapy.
- Ak jazero ešte nemá potrebnú vrstvu, editor ju pri prvom použití doplní do draftu. Režim vrstiev ukazuje pomer existujúcich vrstiev, napríklad `2/3`, vypíše chýbajúce vrstvy a tlačidlom `Doplniť vrstvy` vie pripraviť kompletnú sadu pre aktuálne jazero. Napríklad súťažný režim na Kocke vytvorí vrstvu `Súťažné sektory`, miesto s chatou vytvorí vrstvu `Chaty` a servisný bod vytvorí servisnú vrstvu.
- `/admin/mapa` má kontrolu pred publikovaním pre aktuálne jazero. Upozorní na chatu bez produktu, povinnú chatu bez cenníkovej väzby, duplicitné väzby chaty, verejné servisné zóny, zapnutú verejnú servisnú vrstvu s internými bodmi, chýbajúcu alebo vypnutú vrstvu s existujúcimi prvkami, chýbajúcu vodnú oblasť, chýbajúci obrázkový podklad, súťažné polygony mimo súťažnej viditeľnosti, chýbajúce sektory a duplicitné polygony jedného sektora. Kritické nálezy blokujú iba publikovanie, nie uloženie draftu.
- `POST /api/admin/map/publish` používa rovnakú map quality kontrolu aj na serveri. Pred zápisom public mapy číta aktuálny katalóg chát a aktuálny tournament store, takže kritická chyba neprejde ani priamym API volaním mimo admin UI.
- Admin panel ukazuje zvlášť nálezy aktuálneho jazera a nálezy mimo aktuálneho výberu, aby správca videl rovnaké blokovanie, aké použije serverový publish. Nálezy nesú cieľový objekt, takže správca vie z kontroly rovno prepnúť jazero, otvoriť konkrétne lovné miesto, servisný bod, polygon alebo panel vrstiev. Pri vypnutej vrstve ju kontrola vie zapnúť do neuloženého draftu, pri chýbajúcej vodnej oblasti vie pripraviť nový verejný SVG polygon vody a pri chýbajúcom súťažnom sektore vie rovno pripraviť nový neuložený polygon sektora.
- Nálezy chát bez produktu alebo s duplicitnou väzbou vedia správcu preniesť priamo na blok `Cenníková chata` pri vybranom mieste a krátko ho zvýrazniť.
- Publish kontrola prechádza každé jazero samostatne, takže napríklad vodná oblasť na Veľkom Cetíne už nezakryje chýbajúcu vodnú oblasť na Kocke.
- `mapLayers`, `mapFacilities` a `mapShapes` sú seednuté v `app/data/pond.ts`.
- Pomocné mapové funkcie sú v `app/utils/map.ts`.
- `GET /api/map` vracia sanitizovaný publikovaný mapový stav z `.data/rybolov-cetin/map-state.json`: public a súťažné vrstvy/tvary/body áno, interné servisné body, interné zóny a interné vrstvy nie.
- `GET /api/admin/map` vracia plný rozpracovaný mapový stav z `.data/rybolov-cetin/map-draft-state.json`; ak draft ešte neexistuje, vychádza z publikovanej mapy.
- Admin mapové odpovede nesú `draftChanges`, teda počet aj názvy pridaných, upravených a odstránených vrstiev, miest, servisných bodov a plôch oproti verejnej mape.
- `PUT /api/admin/map` ukladá validované lovné miesta, servisné body, polygonové tvary a aktívne vrstvy do draftu. Payload môže pridať aj novú validnú mapovú vrstvu, ak ide o chýbajúcu pracovnú vrstvu konkrétneho jazera.
- `POST /api/admin/map/publish` prepíše publikovanú public mapu aktuálnym draftom a zapíše audit stopu.
- `POST /api/admin/map/discard-draft` zahodí rozpracovaný draft, načíta späť publikovanú mapu a zapíše audit stopu.
- `GET /api/cabin-products`, `GET /api/admin/cabin-products` a `PUT /api/admin/cabin-products` držia živý katalóg chát a väzby na mapové miesta v `.data/rybolov-cetin/cabin-catalog-state.json`.
- `POST /api/admin/map/background` ukladá nový podkladový obrázok do draftu mapy; `/api/map-assets/:id` verejne vydá iba assety napojené na public alebo súťažnú vrstvu v publikovanej mape.
- `/sutaze` používa rovnaký mapový podklad a sektorové SVG polygony z `mapShapes`; bodky tímov ostávajú klikateľné nad mapovou vrstvou.
- Sektorové polygony môžu niesť `tournamentId` a `sectorId`, takže admin mapa vie naviazať kreslenú plochu na konkrétny súťažný sektor.
- `/admin/sutaze` vie otvoriť `/admin/mapa?turnaj=<id>&sektor=<id>` priamo z konkrétneho sektora. Editor prepne jazero, otvorí existujúci sektorový polygon alebo pripraví nový neuložený draft polygonu pri bode sektora.
- `/admin/mapa` vie pre aktívnu súťaž hromadne pripraviť neuložené draft polygony pre všetky sektory, ktorým ešte chýba sektorový SVG tvar.
- `/admin/mapa` vie existujúce sektorové polygony hromadne zarovnať späť okolo uložených bodov sektorov alebo ako pás od najbližšej vodnej plochy, ostrova či všeobecnej súťažnej línie bez konkrétneho sektora. Šírka aj hĺbka návrhu ostávajú nastaviteľné a pri chýbajúcej referenčnej línii editor bezpečne použije bod sektora.
- Seed body sú v `app/data/pond.ts`, runtime úpravy admina sú v lokálnom store.

## Ďalšie kroky

- Neskôr nahradiť lokálny JSON store produkčnou map repository/Supabase mutáciou.
