# TataDiet — memoria tecnica canonica

## Stato corrente

- Versione stabile: **5.2.0**
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

I conteggi HTML/QA correnti sono prodotti da `./v5_2.sh` e salvati in `qa/v5.2/`.

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

Gate corrente V5.2:

```bash
./v5_2.sh
# oppure ./qa.sh
```

QA browser corrente:

```bash
python3 scripts/qa_v5_2.py --base-url <root-pubblicata>
```

Controlli specifici V5.1 preservati:

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

Qualunque V5.3/V6 deve partire da questa memoria e preservare backup/IndexedDB o fornire una migrazione esplicita e testata.

## Gate finale V5.1.0

Release validata il 2 settembre 2026: 590 HTML, 41.327 link/risorse/frammenti, 0 errori e 0 warning; 645 risorse offline (16.664.804 byte). Audit accessibilita: 590 pagine, 1.183 immagini, 2.196 pulsanti, 19.497 link, 2.208 controlli form, 0 errori e 0 warning. Stress: 96 operazioni con undo/redo completo. QA Chromium: 20 controlli V5.1 superati, inclusi palette, M/P, cambio tipo con menu adattato, preferenze, backup, offline e mobile.


## Estensione V5.2.0

La V5.2 mantiene `DB_VERSION = 1` e `SCHEMA_VERSION = 1`; non aggiunge object store e non riscrive i record personali esistenti.

### Riequilibrio massivo

Percorso: `/preferenze/`. Il modulo `v5-planning-core.js` espone `buildRebalanceProposal()` e `applyProposals()`. Intervalli supportati: prossima giornata, 7 giorni, 30 giorni, resto del piano. Il motore valuta l'intero periodo, preserva i pasti `locked`, applica i limiti delle preferenze su finestre di 7 giorni e cerca sostituzioni nutrizionalmente vicine. L'utente seleziona le proposte da applicare; `planStore.commitState(..., 'rebalance-preferences')` salva l'insieme come una singola operazione undo/redo. Nessuna giornata passata viene modificata.

### Programmazione ricetta

Percorso: `/ricette/programma/`. Disponibile da ricette base e personali. Intervalli: 7 giorni, 30 giorni, resto del piano. `buildRecipeScheduleProposal()` cerca pasti compatibili, usa date distinte, adegua `portionMultiplier` per mantenere vicino il profilo nutrizionale e produce una preview con turno, pasto sostituito e distanza nutrizionale. Applicazione selettiva tramite una singola operation `schedule-recipe`.

### UX navigazione e pagine operative

- toolbar desktop/mobile: Oggi, Calendario, Ricette, Ingredienti/Alimenti, Spesa, Preferenze, Utilità; Piano rimosso dalla toolbar;
- Piano resta link secondario in fondo a `/calendario/`;
- `/oggi/`: tipo giornata → prossimo pasto → pasti data civile → nutrienti → 48h; rimossa card Calendario attivo;
- `/spesa/`: route primaria per date, default oggi, preset Oggi/Domani/48h/5gg/7gg;
- `/spesa/cicli/`: archivio liste ciclo/variante raggiungibile dal fondo di Spesa.

### Bug V5.2 corretti durante QA

- `v5-planning-core.js` deve essere caricato dopo `v5-composer-core.js`; l'ordine precedente rendeva indisponibile il riequilibrio in browser;
- radio della selezione periodo scheduler ridotti a 1px per evitare overflow documentale su mobile;
- `distance` viene conservato nei candidati dello scheduler per evitare `NaN%` nella descrizione dello scostamento nutrizionale.

## Gate finale V5.2.0

Release validata il 2 settembre 2026: 592 HTML, 44.713 link/risorse/frammenti, 0 errori e 0 warning; 650 risorse offline (17.113.344 byte). Audit accessibilita: 592 pagine, 1.187 immagini, 2.220 pulsanti, 21.033 link, 2.217 controlli form, 0 errori e 0 warning. Stress: 96 operazioni con undo/redo completo. QA Chromium: 23/23 controlli superati, inclusi riequilibrio con selezione parziale, programmazione ricetta con selezione parziale, spesa date/preset, ordine Oggi, offline e mobile senza overflow.
