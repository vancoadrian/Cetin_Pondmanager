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

- `/sponzori` je verejná stránka.
- `/admin` zobrazuje súhrn partnerov.
- Dáta sú v `sponsors`.

## Ďalšie kroky

- Samostatná route `/admin/sponzori`.
- Upload loga.
- Väzba na súťaž a sektor.
- Poradie a časová platnosť kampane.
