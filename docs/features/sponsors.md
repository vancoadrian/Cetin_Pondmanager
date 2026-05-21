# Sponzori

## Cieľ

Sponzori majú byť použiteľní pre verejnú prezentáciu revíru aj pre súťaže. Modul má podporiť hlavného partnera, partnerov revíru, partnerov súťaže a sektorové umiestnenia.

## Verejný pohľad

Public stránka `/sponzori` zobrazuje aktívnych partnerov:

- názov,
- tier,
- logo alebo skratku loga,
- popis,
- umiestnenie,
- web partnera.

## Interný pohľad

Admin má vedieť:

- pridať sponzora,
- nahrať logo,
- nastaviť tier,
- nastaviť umiestnenie,
- naviazať sponzora na súťaž alebo sektor,
- zapnúť/vypnúť viditeľnosť.

## Umiestnenia

Možné umiestnenia:

- homepage,
- footer,
- stránka sponzorov,
- súťažná mapa,
- sektor,
- výsledková tabuľa,
- detail súťaže,
- push/oznam ako partnerovaný oznam.

## Stav v prototype

- `/sponzori` je verejná stránka a číta iba aktívnych partnerov zo živého sponsor state.
- `/admin` zobrazuje súhrn partnerov.
- `/admin/sponzori` vie meniť aktívnosť, názov, tier, text loga, web, umiestnenie partnera, typ umiestnenia, poradie, platnosť kampane a voliteľnú väzbu na súťaž alebo sektor.
- Admin vie nahrať logo partnera ako JPG, PNG alebo WebP do 2 MB; verejná stránka a admin dashboard ho zobrazia, text loga ostáva fallback.
- Upload kontroluje rozmery a pomer strán podľa typu umiestnenia: homepage a výsledkovka vyžadujú širšie logo, sektor kompaktnejší formát, bežná stránka sponzorov a footer sú tolerantnejšie.
- Pri každom partnerovi existujú samostatné varianty loga pre `homepage`, `footer`, `sponsors`, `tournament`, `sector` a `scoreboard`. Public UI najprv hľadá variant pre aktuálne umiestnenie, potom všeobecný variant a až potom hlavné logo alebo text.
- Admin vie z jedného zdrojového loga vygenerovať všetky varianty naraz. Generátor používa canvas, cieľové rozmery z validačných pravidiel a režim `celé logo` alebo `vyplniť plochu` s nastaviteľným odsadením.
- Každý variant má vlastné X/Y ohnisko a samostatné prepočítanie orezu. Pri širokých alebo úzkych logách sa tak dá rýchlo posunúť dôležitá časť loga bez ručného exportu v grafickom editore.
- Dáta sú seedované zo `sponsors` a prechodovo uložené v `.data/rybolov-cetin/sponsor-state.json`; logo súbory sú dočasne v `.data/rybolov-cetin/sponsor-assets/` a servujú sa cez `/api/sponsor-assets/:id`.

## Ďalšie kroky

- Produkčný storage bucket pre `sponsor_assets`.
- Vizuálny drag crop editor nad náhľadom, aby správca posúval ohnisko priamo myšou alebo dotykom.
