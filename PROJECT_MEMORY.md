# TataDiet — memoria tecnica canonica

## Stato corrente

- Versione stabile: **5.1.0**
- Data release: **2 settembre 2026**
- Distribuzione: sito statico/PWA da `docs/`, compatibile con GitHub Pages project site
- Persistenza: IndexedDB `tatadiet-v5`
- DB version: 1
- Schema domain/backup: 1
- Dataset base: `tatadiet-base-v1`
- Fonte autorevole: `source_data/Piano_alimentare_revisionato_6_mesi_fibra_moderata.xlsx`

## Conteggi base

```text
6 cicli
36 varianti
180 giorni base
864 pasti/spuntini base
306 famiglie ricetta
547 versioni ricetta base
130 ingredienti base
```

I conteggi HTML/QA della 5.1 sono prodotti da `./v5_1.sh` e salvati in `qa/v5.1/`.

## Principio architetturale

```text
BASE IMMUTABILE
+ DATI PERSONALI INDEXEDDB
+ CALENDARIO EFFETTIVO
+ VERSIONI RICETTA ASSEGNATE
+ PORZIONI DELLE OCCORRENZE
+ PREFERENZE ALIMENTARI
= PIANO EFFETTIVO
```

Il dataset base non viene modificato dal browser. `docs/` è output generato e non va modificato manualmente.

## Nomenclatura giornate V5.1

Internamente il dataset base conserva D1-D5 per compatibilità. La UI usa sempre:

| Interno | UI | Sigla | CSS | Profilo alimentare |
|---|---|---|---|---|
| D1 | Giornata | G | d1 / ocra | D1 |
| D2 | Notte | N | d2 / blu intenso | D2 |
| D3 | Smonto | SN | d3 / azzurro | D3 |
| D4 | Riposo 1 | R1 | d4 / verde | D4 |
| D5 | Riposo 2 | R2 | d5 / verde | D5 |
| M | Mattino | M | m / giallo tuorlo | D1 |
| P | Pomeriggio | P | p / rosso intenso | D1 |

Colori canonici:

```text
G  #a66a21
N  #173b83
SN #58a9d6
R1 #3e8a59
R2 #3e8a59
M  #e5a700
P  #b6242d
```

M e P sono nuovi tipi effettivi ammessi nel calendario personale. Non hanno orari fissi perché non sono stati forniti; `defaultShift(M/P)` mantiene `startTime/endTime = null`. Il Compositore mappa M/P al profilo D1 per slot, kcal di riferimento e proposta menu.

Il mapping UI autorevole è `static/assets/js/v5-day-types.js`; lato build è replicato da `SHIFT_INFO`/`DAY_UI` in `scripts/build_site.py`.

## Gestisci giornata

Percorso primario: `/calendario/gestisci/`.

È la UX consigliata per il lavoro quotidiano. Contiene:

1. calendario mensile navigabile;
2. selettore G/N/SN/R1/R2/M/P;
3. scelta menu `adapt / keep / personal`;
4. sostituzione dei singoli piatti in modalità personal;
5. aderenza;
6. FREE, postpone, insert, remove;
7. anteprima impatto;
8. una sola conferma finale.

Regola: quando cambia tipo di giornata, `menuMode` passa automaticamente a `adapt`.

Le modifiche restano in memoria finché l'utente non conferma. `v5-plan-store.commitState()` salva lo stato finale come **una singola operationRecord**, quindi undo/redo è atomico rispetto alla modifica composta.

La pagina `/calendario/modifica/` resta come **Gestione avanzata** per CUSTOM e operazioni di basso livello. `/calendario/componi/` resta il Compositore completo.

Bug V5.1 già corretto: entrando in Gestisci giornata su FREE/CUSTOM/OFF, la bozza conserva il tipo reale e non converte implicitamente a Giornata.

## Preferenze alimentari

Percorso: `/preferenze/`.
Setting IndexedDB: `foodPreferencesV1`, schemaVersion 1.

Famiglie iniziali:

```text
eggs        Uova
milkYogurt  Latte e yogurt
cheese      Formaggi
coldCuts    Affettati
fish        Pesce
legumes     Legumi
redMeat     Carne rossa
```

Livelli:

```text
more normal less rare never
```

Ogni gruppo supporta `maxPer7Days` opzionale. Una occasione è un **pasto** che contiene il gruppo. La finestra usa i 3 giorni precedenti e 3 successivi rispetto alla data target; durante la generazione di un menu il contatore viene aggiornato anche per i pasti appena selezionati nello stesso giorno.

Semantica:

- `more`: bonus ranking;
- `normal`: neutro;
- `less`: penalità crescente;
- `rare`: penalità maggiore;
- `never`: non eleggibile automaticamente;
- limite raggiunto: non eleggibile automaticamente;
- scelta manuale: sempre possibile, salvo futuri vincoli clinici separati.

Classificazione: `v5-preferences-core.js` usa prima gli ingredienti effettivi della `recipeVersion`; il titolo ricetta è solo fallback quando non esistono righe ingrediente. I nomi arrivano dal catalogo ingredienti caricato in `v5-composer-store.library()`.

Casi espliciti verificati: uovo/albume, yogurt/kefir/skyr, mozzarella/ricotta/grana/feta/fiocchi di latte/primosale; latte di cocco e bevande vegetali nominate come latte non vengono trattate automaticamente come latticini.

Le preferenze influenzano il Compositore completo e il menu adattato da Gestisci giornata.

## IndexedDB e versionamento

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

Regole V5 invarianti:

- record base immutabili;
- ingredienti personali con revisioni immutabili;
- ricette personali con versioni immutabili;
- ogni pasto conserva `recipeVersionId` e `portionMultiplier`;
- lo storico non viene ricalcolato silenziosamente;
- una nuova modifica dopo undo elimina il ramo redo.

V5.1 mantiene DB/schema 1. `currentAppVersion` viene aggiornato a 5.1.0 senza riscrivere record personali.

## Piano effettivo

Tipi ammessi:

```text
D1 D2 D3 D4 D5 M P CUSTOM OFF FREE
```

Aderenza:

```text
planned followed partial not-followed not-applicable
```

`not-followed` non sposta la sequenza. FREE svuota il menu senza spostare il futuro. Insert/remove/postpone restano operazioni strutturali.

Home, Oggi, Preparazioni 48h, Spesa, Ricerca e ICS leggono il piano effettivo. La spesa deriva dalle righe ingrediente della versione ricetta effettiva scalate per porzione; i pasti oltre mezzanotte appartengono alla data civile di consumo.

ICS usa le sigle UI nei SUMMARY/CATEGORIES; M/P senza orario sono eventi all-day.

## Backup

Formati:

```text
full
recipes
calendar
settings
```

Nuovi backup: `appVersion = 5.1.0`. Backup V5.0/schema 1 e stesso dataset base restano importabili con warning. Le preferenze sono presenti in `settings`, quindi nei backup `full` e `settings`.

Import conserva checksum SHA-256, anteprima, controllo dataset, conflitti e rollback.

## PWA/offline

- service worker scope-safe per GitHub Pages;
- cache core atomica;
- query offline gestite con `ignoreSearch`;
- Gestisci giornata e Preferenze sono core offline;
- offline pack completo facoltativo;
- IndexedDB non viene cancellato dagli aggiornamenti SW;
- shortcut manifest del calendario apre Gestisci giornata.

## Build e QA

Build:

```bash
./build.sh
```

Gate V5.1:

```bash
./v5_1.sh
# oppure ./qa.sh
```

QA browser:

```bash
python3 scripts/qa_v5_1.py --base-url <root-pubblicata>
```

Controlli specifici V5.1:

- nessun D1-D5 visibile nelle 590 pagine HTML;
- 7 tipi UI e palette canonica;
- M/P validi nello schema e nel piano;
- M/P usano profilo alimentare Giornata;
- cambio tipo propone menu adattato;
- conferma unica via `commitState`;
- preferenze conteggiate per pasto;
- riconoscimento famiglie dagli ingredienti;
- `never`/limite escludono solo le proposte automatiche;
- backup include preferenze;
- Gestisci/Preferenze funzionano offline;
- nessun overflow mobile.

## Pubblicazione

GitHub Pages:

```text
branch main
folder /docs
```

## Limiti / backlog

- nessuna sincronizzazione cloud/account;
- orari esatti di Mattino/Pomeriggio non definiti: usare CUSTOM quando servono;
- preferenze alimentari non equivalgono a allergie/intolleranze cliniche;
- possibile futuro: preset preferenze, statistiche di frequenza, import turni da calendario, dispensa e batch cooking.

Qualunque V5.2/V6 deve partire da questa memoria e preservare backup/IndexedDB o fornire una migrazione esplicita e testata.

## Gate finale V5.1.0

Release validata il 2 settembre 2026: 590 HTML, 41.327 link/risorse/frammenti, 0 errori e 0 warning; 645 risorse offline (16.664.804 byte). Audit accessibilita: 590 pagine, 1.183 immagini, 2.196 pulsanti, 19.497 link, 2.208 controlli form, 0 errori e 0 warning. Stress: 96 operazioni con undo/redo completo. QA Chromium: 20 controlli V5.1 superati, inclusi palette, M/P, cambio tipo con menu adattato, preferenze, backup, offline e mobile.
