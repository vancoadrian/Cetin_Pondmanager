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
- Dáta sú seedované zo `sponsors` a prechodovo uložené v `.data/rybolov-cetin/sponsor-state.json`.

## Ďalšie kroky

- Upload loga.
- Produkčná väzba na samostatnú tabuľku umiestnení a assetov.
