# TataDiet 5.0.0

TataDiet è una PWA statica e local-first per gestire un piano alimentare su turni. La release 5.0.0 trasforma il piano base di sei mesi in un planner personale modificabile, mantenendo GitHub Pages come hosting e IndexedDB come archivio locale dei dati personali.

## Funzioni principali

- 6 cicli, 36 varianti, 180 giorni base e 864 occorrenze pasto.
- 130 ingredienti base, con possibilità di creare ingredienti personali completi di valori nutrizionali, stato, fonte e conversioni.
- 306 famiglie di ricette base e 547 versioni effettive; ricette personali versionate con ricalcolo di kcal, proteine, carboidrati, grassi e fibra.
- Planner personale con D1-D5, CUSTOM, OFF e FREE, aderenza, inserimento/rimozione/posticipo, undo/redo.
- Compositore della giornata con ricette base/personali, porzioni, blocco dei pasti, filtri e suggerimenti deterministici locali.
- Resolver unico del piano effettivo per Home, Oggi, Preparazioni 48h, Spesa, Ricerca e ICS.
- Backup JSON `full`, `recipes`, `calendar` e `settings`, con SHA-256, anteprima, import, merge e rollback.
- PWA installabile, cache core atomica, libreria offline opzionale e aggiornamento esplicito senza cancellare IndexedDB.
- Nessun backend e nessun account: i dati personali restano nel browser.

## Architettura dati

```text
Dataset base immutabile
+ IndexedDB personale
+ calendario effettivo
+ versioni ricetta assegnate
+ porzioni della singola occorrenza
= piano effettivo
```

Il dataset base non viene modificato dal browser. Ingredienti e ricette personali usano revisioni/versioni immutabili, così modifiche successive non alterano retroattivamente lo storico.

## Percorsi principali

```text
/oggi/
/calendario/
/calendario/modifica/      Planner personale
/calendario/componi/       Compositore giornata
/preparazioni/
/ingredienti/
/ricette/
/ricette/studio/
/spesa/intervallo/
/cerca/
/strumenti/
```

## Persistenza locale

Database IndexedDB:

```text
tatadiet-v5
DB_VERSION = 1
SCHEMA_VERSION = 1
```

Store:

```text
meta
settings
ingredients
ingredientRevisions
recipes
recipeVersions
planInstances
calendarDays
operations
shoppingChecklists
```

La migrazione stabile `stableReleaseMigrationVersion = 5` non riscrive i record personali creati dalle alpha V5. Aggiorna solo i marker di release dopo le normalizzazioni base già previste.

## Backup e import

Da **Utilità** è possibile esportare:

```text
full
recipes
calendar
settings
```

Ogni backup include:

- versione schema;
- versione applicativa;
- identificativo e SHA-256 del dataset base;
- checksum SHA-256 del contenuto;
- dati personali relativi alla modalità scelta.

I backup alpha V5 con schema 1 e stesso dataset base restano importabili nella 5.0.0; l'interfaccia mostra un avviso di compatibilità.

## PWA e offline

Le risorse essenziali vengono memorizzate dal service worker. La release 5.0.0 rende l'installazione della cache core atomica: se una risorsa essenziale non è disponibile, il nuovo service worker non sostituisce quello funzionante.

La cache core comprende anche Planner e Compositore. Le navigazioni offline con parametri query vengono risolte ignorando la query quando necessario, così URL come:

```text
/calendario/componi/?start=...&focus=...
```

restano utilizzabili offline.

Da **Utilità** si può inoltre scaricare l'intera libreria statica offline. PDF ed Excel pesanti restano esclusi dal pacchetto automatico.

## Fonti autorevoli

```text
source_data/        Excel e PDF del piano base
static/             CSS, JavaScript, PWA, icone e illustrazioni
templates/          template Jinja2
scripts/            build, validazione e QA
schemas/v5/         contratti JSON Schema
v5_data/base/       seed base immutabile
PROJECT_MEMORY.md   memoria tecnica canonica
docs/               output generato pubblicabile
```

Non modificare manualmente `docs/`: viene rigenerata da `build.sh`.

## Build

Requisiti:

- Python 3.11+
- Node.js
- dipendenze in `requirements.txt`
- dipendenze QA in `requirements-dev.txt`

```bash
python3 -m pip install -r requirements.txt
./build.sh
```

## QA stabile

Gate canonico:

```bash
./phase8.sh
```

oppure:

```bash
./qa.sh
```

Il gate esegue build, validazione di link/dati/PWA, contract test delle fasi precedenti, JSON Schema, test di accessibilità statici, stress test del calendario e controlli della release stabile.

QA browser completa:

```bash
python3 scripts/qa_v5_phase8.py --base-url https://MatColombo.github.io/TataDiet
```

La QA browser verifica anche migrazione alpha→stabile, backup/rollback, service worker in un project path, uso offline, pacchetto offline completo, aggiornamento PWA e layout mobile.

## Risultati della release 5.0.0

Build finale verificata:

```text
588 pagine HTML
38.259 link/risorse/frammenti
0 errori
0 warning
639 risorse offline
180 giorni base
864 pasti base
306 ricette base
547 versioni ricetta base
130 ingredienti base
```

Audit accessibilità statico:

```text
588 pagine
1.179 immagini
2.172 pulsanti
18.855 link
2.196 controlli form
0 errori
0 warning
```

Stress calendario:

```text
96 operazioni miste
undo completo: ok
redo completo: ok
date consecutive e ID univoci: ok
```

La QA Chromium della release ha verificato 639/639 risorse nel pacchetto offline, migrazione e backup senza perdita dati, aggiornamento service worker e assenza di overflow sulle viste principali a 390 px.

## Pubblicazione GitHub Pages

Pubblicare il repository e configurare:

```text
Settings → Pages
Deploy from a branch
Branch: main
Folder: /docs
```

Il sito usa percorsi relativi ed è compatibile con un project site come `https://MatColombo.github.io/TataDiet/`.

## Limiti noti

- La persistenza è locale al browser/origine; per trasferire dati usare export/import JSON.
- Non esiste sincronizzazione cloud o account.
- Installazione/standalone su dispositivi iOS e Android reali va verificata manualmente dopo il deploy; la release è stata testata in Chromium desktop con viewport desktop/mobile e service worker reale.
- I valori nutrizionali sono quelli del dataset e degli ingredienti inseriti manualmente; TataDiet non sostituisce valutazioni cliniche o professionali.
